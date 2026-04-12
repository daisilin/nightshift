import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface ExtractedDesign {
  brief: string;
  paradigmId: string;
  personaIds: string[];
  paperTitle: string;
  keyDetails: string;
}

interface Props {
  onExtracted: (design: ExtractedDesign) => void;
}

const SYSTEM_PROMPT = `You extract experimental designs from academic papers.
Given paper text, return ONLY valid JSON:
{
  "paperTitle": "string",
  "brief": "one sentence describing the main experiment to reproduce",
  "paradigmId": one of: "tower-of-london", "four-in-a-row", "rush-hour", "corsi-block", "n-back", "stroop", "chess", "two-step", "likert-survey", "forced-choice",
  "personaIds": ["college-student"] by default — add "older-adult", "child", "mturk-worker", "clinical-adhd" if the paper studies those populations,
  "keyDetails": "2-3 sentences about specific parameters: n participants, trials, conditions, measures"
}
If the paper uses MULTIPLE tasks, pick the primary one for paradigmId.
Return ONLY JSON.`;

/**
 * Extract readable text from a PDF ArrayBuffer.
 * Simple heuristic: find text between BT/ET operators and decode.
 * Not perfect, but gets abstracts and methods from most PDFs.
 */
function extractTextFromPdf(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const text: string[] = [];

  // Decode the buffer as latin1 to preserve all bytes
  let raw = '';
  for (let i = 0; i < bytes.length; i++) {
    raw += String.fromCharCode(bytes[i]);
  }

  // Strategy 1: Find text in parentheses within BT...ET blocks (PDF text objects)
  const btEtPattern = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtPattern.exec(raw)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
    const tjPattern = /\(([^)]*)\)\s*Tj/g;
    let tj;
    while ((tj = tjPattern.exec(block)) !== null) {
      const decoded = tj[1].replace(/\\n/g, '\n').replace(/\\r/g, '').replace(/\\\(/g, '(').replace(/\\\)/g, ')');
      if (decoded.trim().length > 1) text.push(decoded);
    }
  }

  // Strategy 2: Find any readable ASCII sequences (fallback)
  if (text.join(' ').length < 200) {
    const asciiPattern = /[\x20-\x7E]{20,}/g;
    let ascii;
    while ((ascii = asciiPattern.exec(raw)) !== null) {
      text.push(ascii[0]);
    }
  }

  return text.join(' ').replace(/\s+/g, ' ').trim();
}

export function PaperUpload({ onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(true); // default open
  const fileRef = useRef<HTMLInputElement>(null);

  const callClaude = async (text: string) => {
    setLoading(true);
    setStatus('extracting experimental design...');
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
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned) as ExtractedDesign;
      setStatus(`✓ ${parsed.paperTitle}`);
      onExtracted(parsed);
    } catch {
      setStatus('could not parse — try pasting a longer section');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    if (file.type === 'application/pdf') {
      setLoading(true);
      setStatus('extracting text from PDF...');
      try {
        const buffer = await file.arrayBuffer();
        const text = extractTextFromPdf(buffer);
        if (text.length < 100) {
          setStatus('could not extract enough text from this PDF — paste the abstract below');
          setShowPaste(true);
          setLoading(false);
          return;
        }
        setStatus(`extracted ${text.length} characters — analyzing...`);
        await callClaude(text);
      } catch {
        setStatus('PDF reading failed — paste the abstract below');
        setShowPaste(true);
        setLoading(false);
      }
    } else {
      const text = await file.text();
      await callClaude(text);
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileRef.current?.click()}
        className="card p-4 text-center cursor-pointer transition-all border-2 border-dashed border-orchid/15 hover:border-orchid/25"
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
            <span className="text-sm text-text-2 ml-2">drop a paper or click to upload</span>
          </div>
        )}
      </div>

      {/* Paste area — always visible */}
      <div>
        <textarea
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          className="w-full card p-3 text-sm text-text resize-none focus:outline-none min-h-[80px]"
          placeholder="paste abstract, methods section, or describe the experiment you want to reproduce..."
        />
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => callClaude(pasteText)}
          disabled={pasteText.trim().length < 30 || loading}
          className="mt-2 px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer disabled:opacity-30"
          style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
        >
          extract design
        </motion.button>
      </div>

      {status && !loading && <p className="text-xs text-orchid">{status}</p>}
    </div>
  );
}
