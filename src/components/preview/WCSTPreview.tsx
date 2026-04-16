import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
const SHAPES = ['triangle', 'star', 'cross', 'circle'] as const;
const SHAPE_EMOJI: Record<string, string> = { triangle: '\u25B2', star: '\u2605', cross: '\u271A', circle: '\u25CF' };
const COLOR_HEX: Record<string, string> = { red: '#E57373', green: '#81C784', yellow: '#FFD54F', blue: '#64B5F6' };

interface Card { color: typeof COLORS[number]; shape: typeof SHAPES[number]; number: number }

const KEY_CARDS: Card[] = [
  { color: 'red', shape: 'triangle', number: 1 },
  { color: 'green', shape: 'star', number: 2 },
  { color: 'yellow', shape: 'cross', number: 3 },
  { color: 'blue', shape: 'circle', number: 4 },
];

type Rule = 'color' | 'shape' | 'number';
const RULES: Rule[] = ['color', 'shape', 'number', 'color', 'shape', 'number'];

function randomCard(): Card {
  return {
    color: COLORS[Math.floor(Math.random() * 4)],
    shape: SHAPES[Math.floor(Math.random() * 4)],
    number: (Math.floor(Math.random() * 4) + 1) as 1 | 2 | 3 | 4,
  };
}

function renderCard(card: Card, size: 'sm' | 'lg' = 'sm') {
  const w = size === 'lg' ? 'w-20 h-24' : 'w-14 h-18';
  return (
    <div className={`${w} rounded-lg border border-orchid/15 bg-white flex flex-col items-center justify-center gap-1`}>
      {Array.from({ length: card.number }).map((_, i) => (
        <span key={i} style={{ color: COLOR_HEX[card.color], fontSize: size === 'lg' ? 18 : 13 }}>
          {SHAPE_EMOJI[card.shape]}
        </span>
      ))}
    </div>
  );
}

export function WCSTPreview({ nTrials = 20 }: { nTrials?: number }) {
  const [trialIdx, setTrialIdx] = useState(0);
  const [stimulus, setStimulus] = useState<Card>(randomCard);
  const [ruleIdx, setRuleIdx] = useState(0);
  const [consecutive, setConsecutive] = useState(0);
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [persErrors, setPersErrors] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [categories, setCategories] = useState(0);
  const [prevRule, setPrevRule] = useState<Rule | null>(null);
  const [phase, setPhase] = useState<'playing' | 'done'>('playing');

  const currentRule = RULES[ruleIdx] ?? RULES[RULES.length - 1];

  const handleChoice = useCallback((keyIdx: number) => {
    const keyCard = KEY_CARDS[keyIdx];
    const correct = stimulus[currentRule] === keyCard[currentRule];

    if (!correct) {
      setTotalErrors(e => e + 1);
      if (prevRule && stimulus[prevRule] === keyCard[prevRule]) {
        setPersErrors(e => e + 1);
      }
    }

    setFeedback(correct ? 'correct' : 'incorrect');

    setTimeout(() => {
      setFeedback(null);
      const newConsec = correct ? consecutive + 1 : 0;
      setConsecutive(newConsec);

      if (newConsec >= 10 && ruleIdx < RULES.length - 1) {
        setPrevRule(currentRule);
        setRuleIdx(r => r + 1);
        setCategories(c => c + 1);
        setConsecutive(0);
      }

      const next = trialIdx + 1;
      if (next >= nTrials) {
        setPhase('done');
      } else {
        setTrialIdx(next);
        setStimulus(randomCard());
      }
    }, 600);
  }, [stimulus, currentRule, consecutive, ruleIdx, prevRule, trialIdx, nTrials]);

  if (phase === 'done') {
    return (
      <div className="card p-4 text-center space-y-2">
        <h3 className="text-sm font-heading text-text">WCST Complete</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="card p-2"><div className="text-lg font-bold text-orchid">{persErrors}</div><div className="text-text-3">perseverative errors</div></div>
          <div className="card p-2"><div className="text-lg font-bold text-orchid">{categories}</div><div className="text-text-3">categories</div></div>
          <div className="card p-2"><div className="text-lg font-bold text-orchid">{Math.round(((nTrials - totalErrors) / nTrials) * 100)}%</div><div className="text-text-3">accuracy</div></div>
        </div>
        <button onClick={() => { setTrialIdx(0); setRuleIdx(0); setConsecutive(0); setPersErrors(0); setTotalErrors(0); setCategories(0); setPrevRule(null); setStimulus(randomCard()); setPhase('playing'); }}
          className="text-xs text-orchid cursor-pointer hover:underline">try again</button>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-text-3 font-mono">WCST trial {trialIdx + 1}/{nTrials}</span>
        <span className="text-[10px] text-text-4">perseverative errors: {persErrors} | categories: {categories}</span>
      </div>

      {/* Key cards */}
      <div className="flex justify-center gap-2">
        {KEY_CARDS.map((card, i) => (
          <motion.button key={i} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={() => !feedback && handleChoice(i)}
            className="cursor-pointer transition-all hover:ring-2 hover:ring-orchid/30 rounded-lg">
            {renderCard(card)}
            <div className="text-[9px] text-text-4 text-center mt-0.5">{i + 1}</div>
          </motion.button>
        ))}
      </div>

      {/* Stimulus card */}
      <div className="flex justify-center">
        <div className="relative">
          {renderCard(stimulus, 'lg')}
          <AnimatePresence>
            {feedback && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-semibold px-2 py-0.5 rounded ${feedback === 'correct' ? 'text-sage bg-sage/10' : 'text-red-500 bg-red-50'}`}>
                {feedback === 'correct' ? 'Correct' : 'Incorrect'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <p className="text-[10px] text-text-4 text-center">click the key card that matches the stimulus — the rule is hidden</p>
    </div>
  );
}
