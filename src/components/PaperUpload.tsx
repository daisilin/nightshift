import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export interface ExtractedDesign {
  brief: string;
  paradigmIds: string[];
  paradigmId: string;
  personaIds: string[];
  paperTitle: string;
  keyDetails: string;
}

interface Props {
  onExtracted: (design: ExtractedDesign) => void;
}

const SYSTEM_PROMPT = `You extract experimental designs from academic papers.
Read the paper text carefully. Identify the SPECIFIC experimental paradigm(s) used.

Return ONLY valid JSON:
{
  "paperTitle": "full title of the paper",
  "brief": "one sentence describing the main experiment — be specific about the task",
  "paradigmIds": ["task-id", ...] — ALL tasks used in the paper,
  "personaIds": ["college-student"] by default — add others if the paper studies specific populations,
  "keyDetails": "2-3 sentences about: number of participants, number of trials, conditions, key measures"
}

Available task IDs and what they match:
- "maze-construal" — maze navigation, spatial planning, route planning, obstacle avoidance, mental map tasks
- "tower-of-london" — disc rearrangement, Tower of Hanoi, sequential planning with fixed goals
- "four-in-a-row" — board games, strategic games, adversarial planning, tic-tac-toe variants
- "rush-hour" — sliding puzzles, constraint satisfaction, spatial reasoning puzzles
- "corsi-block" — spatial span, visuospatial working memory, block tapping
- "n-back" — working memory updating, change detection, sustained attention
- "stroop" — cognitive control, inhibition, interference, WCST, go/no-go, flanker
- "chess" — chess puzzles, chess tactics, expert decision-making
- "two-step" — sequential decision-making, model-based vs model-free, reinforcement learning tasks
- "likert-survey" — questionnaires, Likert scales, self-report measures
- "forced-choice" — binary decisions, preference tasks, forced-choice paradigms

IMPORTANT:
- Read the actual methods/procedure, not just the abstract
- A paper about "maze navigation" should map to "maze-construal", NOT "tower-of-london"
- A paper about "value-guided construal" in mazes should map to "maze-construal"
- If the paper uses MULTIPLE tasks, list ALL of them
- If uncertain, pick the task that most closely matches the PROCEDURE described
Return ONLY JSON.`;

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
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: `Extract the experimental design:\n\n${text.slice(0, 10000)}` }],
        }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
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
      const paradigmIds = parsed.paradigmIds ?? (parsed.paradigmId ? [parsed.paradigmId] : []);
      const result: ExtractedDesign = {
        paperTitle: parsed.paperTitle || 'Untitled',
        brief: parsed.brief || text.slice(0, 100),
        paradigmIds,
        paradigmId: paradigmIds[0] || 'tower-of-london',
        personaIds: parsed.personaIds ?? ['college-student'],
        keyDetails: parsed.keyDetails || '',
      };
      setStatus(`✓ ${result.paperTitle} — ${paradigmIds.length} task(s)`);
      onExtracted(result);
    } catch (err) {
      setStatus(`error: ${err instanceof Error ? err.message : 'unknown'}`);
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
