import { useState } from 'react';
import { motion } from 'framer-motion';

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
Given paper text, return ONLY valid JSON:
{
  "paperTitle": "string",
  "brief": "one sentence describing the main experiment to reproduce",
  "paradigmIds": ["task-id", ...] — ALL tasks used in the paper,
  "personaIds": ["college-student"] by default,
  "keyDetails": "2-3 sentences about parameters"
}

Available task IDs: tower-of-london, four-in-a-row, rush-hour, corsi-block, n-back, stroop, chess, two-step, likert-survey, forced-choice

Map tasks to closest ID:
- "Corsi span" → "corsi-block"
- "change detection" or "working memory" → "n-back"
- "WCST" or "Wisconsin Card Sort" → "stroop"
- "Raven's" or "SPM" → "n-back"
- "mental rotation" → "rush-hour"
- "pattern detection" → "stroop"

IMPORTANT: List ALL tasks in paradigmIds if the paper uses multiple.
Return ONLY JSON.`;

export function PaperUpload({ onExtracted }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [pasteText, setPasteText] = useState('');

  const callClaude = async (text: string) => {
    if (text.trim().length < 30) {
      setStatus('paste at least a few sentences');
      return;
    }
    setLoading(true);
    setStatus('extracting...');
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

      // Extract JSON from response
      let jsonStr = raw;
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }

      let parsed: any;
      try { parsed = JSON.parse(jsonStr); } catch {
        setStatus(`Claude couldn't produce JSON. Try pasting a cleaner section.`);
        setLoading(false);
        return;
      }

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

  return (
    <div className="space-y-2">
      <label className="text-xs font-mono text-text-3 uppercase tracking-wider block">
        reproduce a paper
      </label>
      <textarea
        value={pasteText}
        onChange={e => setPasteText(e.target.value)}
        className="w-full card p-3 text-sm text-text resize-none focus:outline-none min-h-[80px]"
        placeholder="paste abstract or methods section here..."
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
          {loading ? 'extracting...' : 'extract design'}
        </motion.button>
        {status && <span className="text-xs text-orchid">{status}</span>}
      </div>
    </div>
  );
}
