import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

const LETTERS = 'BCDFGHJKLMNPQRSTVWXYZ';
const STIM_DURATION = 1500;
const ISI = 500;

interface Trial { letter: string; isTarget: boolean }

function generateSequence(n: number, length: number, targetRate: number = 0.3): Trial[] {
  const trials: Trial[] = [];
  for (let i = 0; i < length; i++) {
    const canBeTarget = i >= n;
    const isTarget = canBeTarget && Math.random() < targetRate;
    const letter = isTarget
      ? trials[i - n].letter
      : LETTERS[Math.floor(Math.random() * LETTERS.length)];
    trials.push({ letter, isTarget });
  }
  return trials;
}

export function NBackPreview({ nLevel = 2 }: { nLevel?: number }) {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [trialIdx, setTrialIdx] = useState(-1);
  const [showStim, setShowStim] = useState(false);
  const [responses, setResponses] = useState<{ hit: boolean; fa: boolean; miss: boolean; cr: boolean }[]>([]);
  const [responded, setResponded] = useState(false);
  const [phase, setPhase] = useState<'ready' | 'running' | 'done'>('ready');
  const TOTAL = 15;

  const start = useCallback(() => {
    setTrials(generateSequence(nLevel, TOTAL));
    setTrialIdx(0);
    setResponses([]);
    setPhase('running');
  }, [nLevel]);

  useEffect(() => {
    if (phase !== 'running' || trialIdx < 0 || trialIdx >= TOTAL) return;
    setShowStim(true);
    setResponded(false);
    const t1 = setTimeout(() => setShowStim(false), STIM_DURATION);
    const t2 = setTimeout(() => {
      // Record miss or correct rejection if no response
      if (!responded) {
        const trial = trials[trialIdx];
        setResponses(prev => [...prev, {
          hit: false, fa: false, miss: trial.isTarget, cr: !trial.isTarget,
        }]);
      }
      if (trialIdx + 1 >= TOTAL) { setPhase('done'); } else { setTrialIdx(trialIdx + 1); }
    }, STIM_DURATION + ISI);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [trialIdx, phase, trials, responded]);

  const respond = (isMatch: boolean) => {
    if (responded || !showStim || trialIdx < 0) return;
    setResponded(true);
    const trial = trials[trialIdx];
    setResponses(prev => [...prev, {
      hit: isMatch && trial.isTarget,
      fa: isMatch && !trial.isTarget,
      miss: !isMatch && trial.isTarget,
      cr: !isMatch && !trial.isTarget,
    }]);
  };

  const hits = responses.filter(r => r.hit).length;
  const fas = responses.filter(r => r.fa).length;
  const misses = responses.filter(r => r.miss).length;
  const targets = trials.filter(t => t.isTarget).length;
  const hitRate = targets > 0 ? hits / targets : 0;
  const faRate = (TOTAL - targets) > 0 ? fas / (TOTAL - targets) : 0;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-heading text-text">🔢 {nLevel}-back task</h3>
        <span className="text-xs font-mono text-text-3">
          {phase === 'running' ? `${trialIdx + 1}/${TOTAL}` : phase}
        </span>
      </div>

      {phase === 'ready' && (
        <div className="text-center py-6">
          <p className="text-sm text-text-2 mb-2">press "match" when the current letter matches the one from <strong>{nLevel} steps ago</strong></p>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={start}
            className="px-6 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
            start
          </motion.button>
        </div>
      )}

      {phase === 'running' && (
        <div className="text-center py-4">
          <div className={`text-6xl font-mono font-bold mb-6 h-20 flex items-center justify-center transition-opacity ${showStim ? 'opacity-100' : 'opacity-10'}`}
            style={{ color: '#2D2438' }}>
            {showStim ? trials[trialIdx]?.letter : '·'}
          </div>
          <div className="flex gap-3 justify-center">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => respond(true)}
              disabled={responded || !showStim}
              className="px-6 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
              style={{ background: '#8FB89A' }}>
              match
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => respond(false)}
              disabled={responded || !showStim}
              className="px-6 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
              style={{ background: '#E8A87C' }}>
              no match
            </motion.button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-3 text-center">
          <p className="text-sm text-text-2">results:</p>
          <div className="grid grid-cols-4 gap-2">
            <div className="card p-2"><div className="text-[10px] text-text-3">hits</div><div className="text-lg font-heading text-sage">{hits}</div></div>
            <div className="card p-2"><div className="text-[10px] text-text-3">misses</div><div className="text-lg font-heading text-peach">{misses}</div></div>
            <div className="card p-2"><div className="text-[10px] text-text-3">false alarms</div><div className="text-lg font-heading text-peach">{fas}</div></div>
            <div className="card p-2"><div className="text-[10px] text-text-3">hit rate</div><div className="text-lg font-heading text-orchid">{(hitRate * 100).toFixed(0)}%</div></div>
          </div>
          <button onClick={() => { setPhase('ready'); setTrialIdx(-1); }} className="text-xs text-orchid hover:underline cursor-pointer">play again</button>
        </div>
      )}
    </div>
  );
}
