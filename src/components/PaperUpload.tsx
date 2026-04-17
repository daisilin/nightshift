import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import * as pdfjsLib from 'pdfjs-dist';
import { callClaudeApi } from '../lib/apiKey';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export type Confidence = 'high' | 'medium' | 'low';

export interface FieldExtraction<T> {
  value: T;
  confidence: Confidence;
  evidence: string; // short quote from the paper (empty string if none)
}

export interface ExtractedDesign {
  brief: string;
  paradigmIds: string[];
  rawText: string;  // full paper text for analysis agent context
  paradigmId: string;
  personaIds: string[];
  paperTitle: string;
  keyDetails: string;
  // Per-field confidence (undefined on legacy payloads)
  confidence?: {
    paperTitle: Confidence;
    paradigmIds: Confidence;
    personaIds: Confidence;
    brief: Confidence;
  };
  evidence?: {
    paperTitle: string;
    paradigmIds: string;
    personaIds: string;
    brief: string;
  };
}

interface Props {
  onExtracted: (design: ExtractedDesign) => void;
}

const SYSTEM_PROMPT = `You extract experimental designs from academic papers.
Read the paper carefully — focus on the METHODS section to identify what tasks participants ACTUALLY PERFORMED.

IMPORTANT: Only include tasks that participants DID in the experiment. Do NOT include tasks that are merely discussed, cited, or compared to. Look for phrases like "participants completed", "we administered", "the task required", "each trial consisted of".

For EVERY field, also report:
- confidence: "high" if the paper states it explicitly, "medium" if inferred from context, "low" if guessed
- evidence: a short direct quote (<= 20 words) from the paper that supports your extraction. Empty string if none found.

Return ONLY valid JSON:
{
  "paperTitle": { "value": "full title", "confidence": "high|medium|low", "evidence": "quote" },
  "brief": { "value": "one sentence: what was studied and how", "confidence": "...", "evidence": "quote" },
  "paradigmIds": { "value": ["id", ...], "confidence": "...", "evidence": "quote naming the task(s)" },
  "personaIds": { "value": ["college-student"], "confidence": "...", "evidence": "quote about participants" },
  "keyDetails": "N participants, N trials, conditions, key DVs"
}

Available paradigm IDs: maze-construal, tower-of-london, four-in-a-row, rush-hour, corsi-block, n-back, stroop, wcst, chess, two-step, likert-survey, forced-choice

Available persona IDs: college-student, mturk-worker, older-adult, child, expert, clinical-patient

Task mapping:
- maze-construal: maze navigation + awareness/memory probes for obstacles
- tower-of-london: rearrange balls/discs on pegs to match goal
- four-in-a-row: strategic board game (4×9 grid, get 4 in a row)
- wcst: Wisconsin Card Sorting (sort cards by hidden rule that changes)
- two-step: sequential decision with common/rare state transitions
- corsi-block: spatial sequence memory (blocks light up, reproduce order)
- n-back: working memory (is current item same as N items back?)
- stroop: name ink color while ignoring word
- likert-survey: questionnaire with rating scales

Calibrate confidence honestly:
- If the paper names the task explicitly ("Tower of London"), paradigmIds confidence = high
- If you\'re matching by description only ("participants planned ball moves across pegs"), confidence = medium
- If you\'re guessing because the methods section is ambiguous, confidence = low
- Never return confidence=high without an evidence quote.

Return ONLY JSON.`;

/**
 * Normalize extractor output — accepts both the new per-field format and
 * the legacy flat format. Returns a uniform ExtractedDesign with confidence.
 */
function normalize(parsed: any, rawText: string): ExtractedDesign {
  const pick = <T,>(v: any, fallback: T): FieldExtraction<T> => {
    if (v && typeof v === 'object' && 'value' in v) {
      return {
        value: v.value as T,
        confidence: (v.confidence as Confidence) || 'medium',
        evidence: typeof v.evidence === 'string' ? v.evidence : '',
      };
    }
    // Legacy flat field — no confidence reported
    return { value: (v ?? fallback) as T, confidence: 'medium', evidence: '' };
  };

  const title = pick<string>(parsed.paperTitle, 'Untitled');
  const brief = pick<string>(parsed.brief, rawText.slice(0, 100));
  const paradigmIds = pick<string[]>(
    parsed.paradigmIds ?? (parsed.paradigmId ? { value: [parsed.paradigmId] } : undefined),
    [],
  );
  const personaIds = pick<string[]>(parsed.personaIds, ['college-student']);

  return {
    paperTitle: title.value,
    brief: brief.value,
    paradigmIds: paradigmIds.value,
    paradigmId: paradigmIds.value[0] || 'tower-of-london',
    personaIds: personaIds.value,
    keyDetails: parsed.keyDetails || '',
    rawText: rawText.slice(0, 15000),
    confidence: {
      paperTitle: title.confidence,
      brief: brief.confidence,
      paradigmIds: paradigmIds.confidence,
      personaIds: personaIds.confidence,
    },
    evidence: {
      paperTitle: title.evidence,
      brief: brief.evidence,
      paradigmIds: paradigmIds.evidence,
      personaIds: personaIds.evidence,
    },
  };
}

/** Extract text from PDF using PDF.js (the real library, not a hack) */
async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];

  // Extract text from first 15 pages (enough for abstract + methods)
  const maxPages = Math.min(pdf.numPages, 15);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push(text);
  }

  return pages.join('\n\n');
}

export function PaperUpload({ onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const callClaude = async (text: string) => {
    if (text.trim().length < 30) {
      setStatus('need more text — paste at least a few sentences');
      return;
    }
    setLoading(true);
    setStatus('analyzing paper...');
    try {
      const res = await callClaudeApi({
          model: 'claude-sonnet-4-5-20250929',
          max_tokens: 800,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Extract the experimental design:\n\n${text.slice(0, 10000)}` }],
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = (errBody as any)?.error?.message || `status ${res.status}`;
        throw new Error(`API error (${res.status}): ${errMsg}`);
      }
      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';
      if (!raw) throw new Error('empty response');

      let jsonStr = raw;
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(jsonStr);
      const result = normalize(parsed, text);
      setStatus(`✓ ${result.paperTitle} — ${result.paradigmIds.length} task(s)`);
      onExtracted(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      if (msg.includes('429') || msg.includes('529')) {
        setStatus('API rate limit — wait 30 seconds and try again');
      } else {
        setStatus(`error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
      // Plain text file
      const text = await file.text();
      await callClaude(text);
      return;
    }

    setLoading(true);
    setStatus('reading PDF...');
    try {
      const text = await extractPdfText(file);
      if (text.trim().length < 50) {
        setStatus('could not extract text from this PDF — paste the abstract below');
        setLoading(false);
        return;
      }
      setStatus(`extracted ${text.length} chars from ${file.name} — analyzing...`);
      setPasteText(text.slice(0, 3000)); // show extracted text so user can see it worked
      await callClaude(text);
    } catch (err) {
      setStatus(`PDF error: ${err instanceof Error ? err.message : 'unknown'} — paste text below`);
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-xs font-mono text-text-3 uppercase tracking-wider block">
        reproduce a paper
      </label>

      {/* PDF drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileRef.current?.click()}
        className={`card p-4 text-center cursor-pointer transition-all border-2 border-dashed ${
          dragging ? 'border-orchid/40 bg-orchid/5' : 'border-orchid/15 hover:border-orchid/25'
        }`}
      >
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        {loading ? (
          <div className="flex items-center justify-center gap-2">
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-4 h-4 rounded-full border-2 border-orchid/30 border-t-orchid" />
            <span className="text-sm text-text-2">{status}</span>
          </div>
        ) : (
          <div>
            <span className="text-lg">📄</span>
            <span className="text-sm text-text-2 ml-2">drop a PDF or click to upload</span>
          </div>
        )}
      </div>

      {/* Paste area */}
      <textarea
        value={pasteText}
        onChange={e => setPasteText(e.target.value)}
        className="w-full card p-3 text-sm text-text resize-none focus:outline-none min-h-[70px]"
        placeholder="or paste abstract / methods section here..."
      />
      <div className="flex items-center gap-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => callClaude(pasteText)}
          disabled={pasteText.trim().length < 30 || loading}
          className="px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer disabled:opacity-30"
          style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
        >
          {loading ? 'analyzing...' : 'extract design'}
        </motion.button>
        {status && !loading && <span className="text-xs text-orchid">{status}</span>}
      </div>
    </div>
  );
}
