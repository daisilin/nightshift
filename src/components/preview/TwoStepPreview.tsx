import { useState } from 'react';
import { motion } from 'framer-motion';

// Simplified Two-Step Task (Daw et al., 2011)
// Stage 1: choose left or right spaceship
// Stage 2: choose left or right alien
// Outcome: reward or no reward (probabilities drift)

const COLORS = { a: '#8BACD4', b: '#E8A87C' };

export function TwoStepPreview() {
  const [stage, setStage] = useState<'stage1' | 'stage2' | 'outcome' | 'done'>('stage1');
  const [trial, setTrial] = useState(0);
  const [totalReward, setTotalReward] = useState(0);
  const [stage2State, setStage2State] = useState<'a' | 'b'>('a');
  const [lastOutcome, setLastOutcome] = useState<boolean | null>(null);
  const [commonTransition, setCommonTransition] = useState(true);
  const TOTAL_TRIALS = 10;

  // Reward probabilities (drift slowly)
  const rewardProbs = {
    a: { left: 0.3 + Math.sin(trial * 0.5) * 0.2, right: 0.7 - Math.sin(trial * 0.3) * 0.2 },
    b: { left: 0.6 - Math.cos(trial * 0.4) * 0.2, right: 0.4 + Math.cos(trial * 0.6) * 0.2 },
  };

  const handleStage1 = (choice: 'left' | 'right') => {
    // Common transition: left→a, right→b (70%) or rare (30%)
    const common = Math.random() < 0.7;
    setCommonTransition(common);
    const nextState = (choice === 'left') === common ? 'a' : 'b';
    setStage2State(nextState as 'a' | 'b');
    setStage('stage2');
  };

  const handleStage2 = (choice: 'left' | 'right') => {
    const prob = rewardProbs[stage2State][choice];
    const rewarded = Math.random() < prob;
    setLastOutcome(rewarded);
    if (rewarded) setTotalReward(prev => prev + 1);
    setStage('outcome');
  };

  const nextTrial = () => {
    if (trial + 1 >= TOTAL_TRIALS) { setStage('done'); return; }
    setTrial(prev => prev + 1);
    setStage('stage1');
    setLastOutcome(null);
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-heading text-text">🎲 two-step task</h3>
        <span className="text-xs font-mono text-text-3">
          trial {trial + 1}/{TOTAL_TRIALS} · reward: {totalReward}
        </span>
      </div>

      {stage === 'stage1' && (
        <div className="text-center py-4">
          <p className="text-xs text-text-3 mb-4">stage 1: choose a spaceship</p>
          <div className="flex gap-4 justify-center">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => handleStage1('left')}
              className="w-24 h-24 rounded-2xl text-3xl flex items-center justify-center cursor-pointer border-2"
              style={{ background: `${COLORS.a}20`, borderColor: COLORS.a }}>
              🚀
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => handleStage1('right')}
              className="w-24 h-24 rounded-2xl text-3xl flex items-center justify-center cursor-pointer border-2"
              style={{ background: `${COLORS.b}20`, borderColor: COLORS.b }}>
              🛸
            </motion.button>
          </div>
        </div>
      )}

      {stage === 'stage2' && (
        <div className="text-center py-4">
          <p className="text-xs text-text-3 mb-1">
            {commonTransition ? 'common' : 'rare'} transition → planet {stage2State.toUpperCase()}
          </p>
          <p className="text-xs text-text-3 mb-4">stage 2: choose an alien</p>
          <div className="flex gap-4 justify-center">
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => handleStage2('left')}
              className="w-24 h-24 rounded-2xl text-3xl flex items-center justify-center cursor-pointer border-2"
              style={{ background: `${COLORS[stage2State]}15`, borderColor: COLORS[stage2State] }}>
              👽
            </motion.button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
              onClick={() => handleStage2('right')}
              className="w-24 h-24 rounded-2xl text-3xl flex items-center justify-center cursor-pointer border-2"
              style={{ background: `${COLORS[stage2State]}15`, borderColor: COLORS[stage2State] }}>
              🤖
            </motion.button>
          </div>
        </div>
      )}

      {stage === 'outcome' && (
        <div className="text-center py-6">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}
            className="text-5xl mb-3">
            {lastOutcome ? '🪙' : '❌'}
          </motion.div>
          <p className="text-sm text-text-2 mb-4">{lastOutcome ? 'reward!' : 'no reward'}</p>
          <button onClick={nextTrial} className="text-xs text-orchid hover:underline cursor-pointer">
            next trial →
          </button>
        </div>
      )}

      {stage === 'done' && (
        <div className="text-center py-4">
          <p className="text-sm text-text-2 mb-2">total reward: {totalReward}/{TOTAL_TRIALS}</p>
          <p className="text-xs text-text-3 mb-3">
            model-based strategy: track which planet has better rewards, then choose the spaceship that leads there
          </p>
          <button onClick={() => { setTrial(0); setTotalReward(0); setStage('stage1'); }}
            className="text-xs text-orchid hover:underline cursor-pointer">play again</button>
        </div>
      )}
    </div>
  );
}
