import { useState } from 'react';
import { motion } from 'framer-motion';

export interface ProbeQuestion {
  id: string;
  question: string;
  why?: string;
  options?: string[];
}

export interface ProbeFlag {
  severity: 'warning' | 'info';
  message: string;
}

export interface AgentProbe {
  mode: 'probe';
  probes: ProbeQuestion[];
  flags?: ProbeFlag[];
}

interface Props {
  probe: AgentProbe;
  onAnswer: (answers: Record<string, string>) => void;
  onSkip: () => void;
}

export function ProbeCard({ probe, onAnswer, onSkip }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const setAnswer = (id: string, value: string) =>
    setAnswers(prev => ({ ...prev, [id]: value }));

  const allAnswered = probe.probes.every(p => answers[p.id]?.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-orchid/20 bg-gradient-to-br from-orchid/5 to-peach/5 p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono font-semibold text-orchid uppercase tracking-wider">
          decisions to make
        </span>
        <span className="text-[9px] text-text-4">{probe.probes.length} probe(s) before dispatch</span>
      </div>

      {probe.flags && probe.flags.length > 0 && (
        <div className="space-y-1">
          {probe.flags.map((f, i) => (
            <div
              key={i}
              className={`text-[11px] px-2 py-1 rounded border-l-2 ${
                f.severity === 'warning'
                  ? 'border-amber-400 bg-amber-50/50 text-amber-800'
                  : 'border-orchid/30 bg-orchid/5 text-text-2'
              }`}
            >
              {f.severity === 'warning' ? '⚠ ' : 'ℹ '}
              {f.message}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {probe.probes.map(p => (
          <div key={p.id} className="space-y-1.5">
            <p className="text-sm text-text leading-snug">{p.question}</p>
            {p.why && (
              <p className="text-[10px] text-text-4 italic">why it matters: {p.why}</p>
            )}
            {p.options && p.options.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {p.options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setAnswer(p.id, opt)}
                    className={`px-2 py-1 rounded-lg text-[11px] cursor-pointer border transition-colors ${
                      answers[p.id] === opt
                        ? 'bg-orchid/15 border-orchid/40 text-text'
                        : 'border-orchid/10 text-text-3 hover:bg-orchid/5'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
                <input
                  value={p.options.includes(answers[p.id] || '') ? '' : (answers[p.id] || '')}
                  onChange={e => setAnswer(p.id, e.target.value)}
                  placeholder="or type..."
                  className="px-2 py-1 rounded-lg text-[11px] border border-orchid/10 bg-white text-text focus:outline-none focus:border-orchid/30 min-w-[120px]"
                />
              </div>
            ) : (
              <input
                value={answers[p.id] || ''}
                onChange={e => setAnswer(p.id, e.target.value)}
                placeholder="your answer..."
                className="w-full px-2 py-1.5 rounded-lg text-xs border border-orchid/10 bg-white text-text focus:outline-none focus:border-orchid/30"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onAnswer(answers)}
          disabled={!allAnswered}
          className="flex-1 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer disabled:opacity-30"
          style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}
        >
          answer → propose plan
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onSkip}
          className="px-3 py-2 rounded-lg text-[11px] text-text-3 cursor-pointer hover:text-text-2 border border-orchid/10"
        >
          skip probes
        </motion.button>
      </div>
    </motion.div>
  );
}
