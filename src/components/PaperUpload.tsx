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
Given paper text (or description), return ONLY valid JSON:
{
  "paperTitle": "string",
  "brief": "one sentence describing the main experiment to reproduce",
  "paradigmId": one of: "tower-of-london", "four-in-a-row", "rush-hour", "corsi-block", "n-back", "stroop", "chess", "two-step", "likert-survey", "forced-choice",
  "personaIds": ["college-student"] (default) — add "older-adult", "child", "mturk-worker", "clinical-adhd" if the paper studies those populations,
  "keyDetails": "2-3 sentences about the specific parameters: number of trials, conditions, difficulty levels, measures, sample size"
}
Pick the closest paradigmId. If the paper uses multiple tasks, pick the PRIMARY one.
Return ONLY JSON, no explanation.`;

export function PaperUpload({ onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const callClaude = async (userContent: string) => {
    setLoading(true);
    setStatus('extracting experimental design...');
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
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
      setStatus('could not parse — try pasting more text or a different section');
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    if (file.type === 'application/pdf') {
      // Read PDF as base64 and send to Claude with document type
      setStatus('reading PDF...');
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

      setLoading(true);
      setStatus('sending to Claude for analysis...');
      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            system: SYSTEM_PROMPT,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                },
                {
                  type: 'text',
                  text: 'Extract the experimental design from this paper. Return JSON only.',
                },
              ],
            }],
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          // If PDF too large or not supported, ask user to paste
          if (errText.includes('too large') || errText.includes('size')) {
            setStatus('PDF too large — paste the abstract or methods section below');
            setShowPaste(true);
            setLoading(false);
            return;
          }
          throw new Error(errText);
        }
        const data = await res.json();
        const raw = data.content?.[0]?.text ?? '';
        const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned) as ExtractedDesign;
        setStatus(`✓ ${parsed.paperTitle}`);
        onExtracted(parsed);
      } catch {
        setStatus('PDF parsing failed — paste the abstract below instead');
        setShowPaste(true);
      } finally {
        setLoading(false);
      }
    } else {
      const text = await file.text();
      await callClaude(`Extract the experimental design from this paper:\n\n${text.slice(0, 12000)}`);
    }
  };

  const handlePasteSubmit = () => {
    if (pasteText.trim().length > 30) {
      callClaude(`Extract the experimental design from this paper text:\n\n${pasteText.trim()}`);
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        onClick={() => fileRef.current?.click()}
        className="card p-5 text-center cursor-pointer transition-all border-2 border-dashed border-orchid/15 hover:border-orchid/25"
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
            <p className="text-xl mb-1">📄</p>
            <p className="text-sm text-text-2 font-semibold">drop a paper to reproduce</p>
            <p className="text-xs text-text-3 mt-1">PDF, text, or paste below</p>
          </div>
        )}
      </div>

      {/* Paste area — always visible */}
      <div>
        <div className="flex items-center gap-2 mb-1 cursor-pointer" onClick={() => setShowPaste(!showPaste)}>
          <span className="text-xs text-text-3">{showPaste ? '▾' : '▸'} paste abstract or methods</span>
        </div>
        {showPaste && (
          <div className="space-y-2">
            <textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              className="w-full card p-3 text-sm text-text resize-none focus:outline-none min-h-[100px]"
              placeholder="paste the abstract, methods section, or just describe the experiment..."
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handlePasteSubmit}
              disabled={pasteText.trim().length < 30 || loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white cursor-pointer disabled:opacity-30"
              style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
            >
              extract design
            </motion.button>
          </div>
        )}
      </div>

      {status && !loading && <p className="text-xs text-orchid">{status}</p>}
    </div>
  );
}
