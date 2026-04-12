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

export function PaperUpload({ onExtracted }: Props) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const extractFromPaper = async (text: string) => {
    setLoading(true);
    setStatus('reading paper...');

    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: `You extract experimental designs from academic papers.
Given paper text, return ONLY valid JSON:
{
  "paperTitle": "string",
  "brief": "one sentence describing the main experiment to reproduce",
  "paradigmId": one of: "tower-of-london", "four-in-a-row", "rush-hour", "corsi-block", "n-back", "stroop", "chess", "two-step", "likert-survey", "forced-choice",
  "personaIds": ["college-student"] (default) — add "older-adult", "child", "mturk-worker", "clinical-adhd" if the paper studies those populations,
  "keyDetails": "2-3 sentences about the specific parameters: number of trials, conditions, difficulty levels, measures"
}
Pick the closest paradigmId. If the paper uses multiple tasks, pick the primary one.
Return ONLY JSON.`,
          messages: [{
            role: 'user',
            content: `Extract the experimental design from this paper:\n\n${text.slice(0, 8000)}`,
          }],
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      const raw = data.content?.[0]?.text ?? '';
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);

      setStatus(`found: ${parsed.paperTitle}`);
      onExtracted(parsed);
    } catch (err) {
      setStatus('could not extract design — try pasting the abstract instead');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    if (file.type === 'application/pdf') {
      // For PDF: read as text (basic extraction)
      // In production, use a proper PDF parser. For now, read as arraybuffer
      // and send to Claude which can handle raw text from PDFs
      setStatus('reading PDF...');
      const text = await file.text();
      // If text extraction fails (binary PDF), fall back to name-based extraction
      if (text.length < 100) {
        setStatus('PDF text extraction limited — paste the abstract below instead');
        return;
      }
      await extractFromPaper(text);
    } else if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const text = await file.text();
      await extractFromPaper(text);
    } else {
      setStatus('drop a PDF or text file, or paste the abstract');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handlePaste = async (text: string) => {
    if (text.trim().length > 50) {
      await extractFromPaper(text.trim());
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`card p-6 text-center cursor-pointer transition-all border-2 border-dashed ${
          dragging ? 'border-orchid/40 bg-orchid/5' : 'border-orchid/15 hover:border-orchid/25'
        }`}
      >
        <input ref={fileRef} type="file" accept=".pdf,.txt,.md" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

        {loading ? (
          <div>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="w-8 h-8 mx-auto mb-2 rounded-full border-2 border-orchid/30 border-t-orchid" />
            <p className="text-sm text-text-2">{status}</p>
          </div>
        ) : (
          <div>
            <p className="text-2xl mb-2">📄</p>
            <p className="text-sm text-text-2 font-semibold">drop a paper to reproduce</p>
            <p className="text-xs text-text-3 mt-1">PDF or text — we'll extract the experimental design</p>
          </div>
        )}
      </div>

      {/* Or paste abstract */}
      <details className="text-xs text-text-3">
        <summary className="cursor-pointer hover:text-text-2">or paste abstract / methods section</summary>
        <textarea
          className="w-full mt-2 card p-3 text-sm text-text resize-none focus:outline-none min-h-[80px]"
          placeholder="paste paper text here..."
          onBlur={e => handlePaste(e.target.value)}
        />
      </details>

      {/* Status */}
      {status && !loading && (
        <p className="text-xs text-orchid">{status}</p>
      )}
    </div>
  );
}
