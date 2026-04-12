import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';

const GRID_SIZE = 9; // 3x3 grid of blocks
const POSITIONS = Array.from({ length: GRID_SIZE }, (_, i) => i);

export function CorsiPreview() {
  const [sequence, setSequence] = useState<number[]>([]);
  const [showIdx, setShowIdx] = useState(-1);
  const [userInput, setUserInput] = useState<number[]>([]);
  const [phase, setPhase] = useState<'ready' | 'showing' | 'input' | 'result'>('ready');
  const [span, setSpan] = useState(3);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);

  const startTrial = useCallback(() => {
    // Generate random sequence of `span` blocks
    const seq: number[] = [];
    const available = [...POSITIONS];
    for (let i = 0; i < span; i++) {
      const idx = Math.floor(Math.random() * available.length);
      seq.push(available[idx]);
      available.splice(idx, 1);
    }
    setSequence(seq);
    setUserInput([]);
    setShowIdx(0);
    setPhase('showing');
  }, [span]);

  // Animate the sequence display
  useEffect(() => {
    if (phase !== 'showing' || showIdx < 0) return;
    if (showIdx >= sequence.length) {
      setPhase('input');
      setShowIdx(-1);
      return;
    }
    const t = setTimeout(() => setShowIdx(showIdx + 1), 700);
    return () => clearTimeout(t);
  }, [showIdx, phase, sequence]);

  const handleBlockClick = (blockIdx: number) => {
    if (phase !== 'input') return;
    const newInput = [...userInput, blockIdx];
    setUserInput(newInput);

    if (newInput.length === sequence.length) {
      const isCorrect = newInput.every((b, i) => b === sequence[i]);
      setTotal(prev => prev + 1);
      if (isCorrect) {
        setCorrect(prev => prev + 1);
        setSpan(prev => Math.min(prev + 1, 9));
      }
      setPhase('result');
      setTimeout(() => {
        if (isCorrect) startTrial();
        else { setSpan(prev => Math.max(prev - 1, 2)); setPhase('ready'); }
      }, 1200);
    }
  };

  const isHighlighted = phase === 'showing' && showIdx >= 0 && showIdx < sequence.length && sequence[showIdx];

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-heading text-text">🧩 corsi block span</h3>
        <span className="text-xs font-mono text-text-3">
          span: {span} · {correct}/{total} correct
        </span>
      </div>

      {phase === 'ready' && (
        <div className="text-center mb-4">
          <p className="text-sm text-text-2 mb-3">watch the sequence, then tap blocks in the same order</p>
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={startTrial}
            className="px-6 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
            {total === 0 ? 'start' : 'try again'}
          </motion.button>
        </div>
      )}

      {/* Block grid */}
      <div className="grid grid-cols-3 gap-3 max-w-[200px] mx-auto mb-3">
        {POSITIONS.map(i => {
          const isActive = phase === 'showing' && showIdx >= 0 && showIdx < sequence.length && sequence[showIdx] === i;
          const isClicked = userInput.includes(i);
          const clickOrder = userInput.indexOf(i);

          return (
            <motion.button
              key={i}
              whileTap={phase === 'input' ? { scale: 0.9 } : undefined}
              onClick={() => handleBlockClick(i)}
              className={`aspect-square rounded-xl transition-all duration-200 relative ${
                phase === 'input' ? 'cursor-pointer hover:bg-orchid/15' : ''
              }`}
              style={{
                background: isActive ? '#B07CC6' : isClicked ? '#D9B8E8' : 'rgba(176,124,198,0.08)',
                border: `2px solid ${isActive ? '#B07CC6' : isClicked ? '#B07CC6' : 'rgba(176,124,198,0.15)'}`,
              }}
            >
              {isClicked && (
                <span className="absolute inset-0 flex items-center justify-center text-xs font-mono text-orchid">
                  {clickOrder + 1}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {phase === 'showing' && (
        <p className="text-xs text-text-3 text-center italic">watch the sequence...</p>
      )}
      {phase === 'input' && (
        <p className="text-xs text-orchid text-center">tap blocks in the same order ({userInput.length}/{sequence.length})</p>
      )}
      {phase === 'result' && (
        <p className={`text-xs text-center font-semibold ${userInput.every((b, i) => b === sequence[i]) ? 'text-sage' : 'text-peach'}`}>
          {userInput.every((b, i) => b === sequence[i]) ? `correct! span → ${span + 1}` : `wrong — span → ${Math.max(span - 1, 2)}`}
        </p>
      )}
    </div>
  );
}
