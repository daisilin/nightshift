import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

const COLORS = ['red', 'blue', 'green', 'yellow'];
const COLOR_HEX: Record<string, string> = { red: '#E57373', blue: '#64B5F6', green: '#81C784', yellow: '#FFD54F' };

interface Trial { word: string; inkColor: string; congruent: boolean }

function generateTrial(congruent: boolean): Trial {
  const inkColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  const word = congruent ? inkColor : COLORS.filter(c => c !== inkColor)[Math.floor(Math.random() * 3)];
  return { word, inkColor, congruent };
}

export function StroopPreview({ nTrials = 10, proportionCongruent = 0.5 }: { nTrials?: number; proportionCongruent?: number }) {
  const [trialIdx, setTrialIdx] = useState(0);
  const [trial, setTrial] = useState<Trial | null>(null);
  const [results, setResults] = useState<{ rt: number; correct: boolean; congruent: boolean }[]>([]);
  const [startTime, setStartTime] = useState(0);
  const [phase, setPhase] = useState<'ready' | 'stimulus' | 'done'>('ready');

  const nextTrial = useCallback(() => {
    if (trialIdx >= nTrials) { setPhase('done'); return; }
    const cong = Math.random() < proportionCongruent;
    setTrial(generateTrial(cong));
    setStartTime(Date.now());
    setPhase('stimulus');
  }, [trialIdx, nTrials, proportionCongruent]);

  const respond = (color: string) => {
    if (!trial || phase !== 'stimulus') return;
    const rt = Date.now() - startTime;
    const correct = color === trial.inkColor;
    setResults(prev => [...prev, { rt, correct, congruent: trial.congruent }]);
    setTrialIdx(prev => prev + 1);
    setTrial(null);
    setTimeout(() => nextTrial(), 300);
  };

  const congResults = results.filter(r => r.congruent);
  const incongResults = results.filter(r => !r.congruent);
  const avgCong = congResults.length > 0 ? Math.round(congResults.reduce((a, r) => a + r.rt, 0) / congResults.length) : 0;
  const avgIncong = incongResults.length > 0 ? Math.round(incongResults.reduce((a, r) => a + r.rt, 0) / incongResults.length) : 0;

  return (
    <div className="card p-6 text-center">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading text-text">🎨 stroop task preview</h3>
        <span className="text-xs font-mono text-text-3">{trialIdx}/{nTrials}</span>
      </div>

      {phase === 'ready' && (
        <div>
          <p className="text-sm text-text-2 mb-4">name the <strong>ink color</strong>, ignore the word</p>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={nextTrial}
            className="px-6 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
            start
          </motion.button>
        </div>
      )}

      {phase === 'stimulus' && trial && (
        <div>
          <div className="text-5xl font-bold my-8 select-none" style={{ color: COLOR_HEX[trial.inkColor] }}>
            {trial.word.toUpperCase()}
          </div>
          <div className="flex gap-3 justify-center">
            {COLORS.map(c => (
              <motion.button key={c} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                onClick={() => respond(c)}
                className="w-16 h-10 rounded-xl text-xs font-semibold text-white cursor-pointer border-2 border-white/20"
                style={{ background: COLOR_HEX[c] }}>
                {c}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-3">
          <p className="text-sm text-text-2">nice! here are your results:</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="card p-3">
              <div className="text-xs text-text-3">accuracy</div>
              <div className="text-lg font-heading text-text">{Math.round(results.filter(r => r.correct).length / results.length * 100)}%</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-text-3">congruent RT</div>
              <div className="text-lg font-heading text-blue">{avgCong}ms</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-text-3">incongruent RT</div>
              <div className="text-lg font-heading text-peach">{avgIncong}ms</div>
            </div>
          </div>
          {avgIncong > avgCong && (
            <p className="text-xs text-text-3 italic">
              stroop effect: {avgIncong - avgCong}ms slower on incongruent trials
            </p>
          )}
          <button onClick={() => { setTrialIdx(0); setResults([]); setPhase('ready'); }}
            className="text-xs text-orchid cursor-pointer hover:underline">play again</button>
        </div>
      )}
    </div>
  );
}
