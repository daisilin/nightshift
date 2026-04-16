/**
 * WISCONSIN CARD SORTING TEST (WCST)
 *
 * Faithful implementation matching Lin & Ma (Nature Communications).
 * 64 trials, rule switches after 10 consecutive correct, feedback per trial.
 *
 * Key DVs:
 * - Perseverative errors: continuing to sort by the old rule after a switch
 * - Categories completed: how many rule switches were successfully navigated
 * - Total errors
 *
 * The WCST measures cognitive flexibility / inhibitory control (Factor 3 in Lin & Ma).
 * It loaded 0.62 on the inhibition factor alongside Two-Step (0.83).
 */

import {
  createSession,
  runTrialInSession,
  recordFeedback,
  recordMetadata,
  type MultiTurnSession,
  type TrialOutcome,
} from '../multiTurnSession';
import { getTaskInstruction } from '../taskInstructions';

// ============================================================
// WCST CARD DEFINITIONS
// ============================================================

/** Possible values for each dimension. */
const COLORS = ['red', 'blue', 'green', 'yellow'] as const;
const SHAPES = ['triangle', 'star', 'cross', 'circle'] as const;
const NUMBERS = [1, 2, 3, 4] as const;

type Color = typeof COLORS[number];
type Shape = typeof SHAPES[number];

interface WCSTCard {
  color: Color;
  shape: Shape;
  number: number;
}

/** The 4 key cards (always visible at top of screen). */
const KEY_CARDS: WCSTCard[] = [
  { color: 'red', shape: 'triangle', number: 1 },
  { color: 'green', shape: 'star', number: 2 },
  { color: 'yellow', shape: 'cross', number: 3 },
  { color: 'blue', shape: 'circle', number: 4 },
];

type SortingRule = 'color' | 'shape' | 'number';
const RULE_ORDER: SortingRule[] = ['color', 'shape', 'number', 'color', 'shape', 'number'];

// ============================================================
// STIMULUS GENERATION
// ============================================================

/**
 * Standard WCST 64-card stimulus deck (Grant & Berg, 1948).
 * All 4×4×4 combinations of color × shape × number.
 * Each card matches one key card by color, a potentially different one by shape,
 * and a potentially different one by number.
 */
const STIMULUS_DECK: WCSTCard[] = (() => {
  const deck: WCSTCard[] = [];
  for (const color of COLORS) {
    for (const shape of SHAPES) {
      for (const number of NUMBERS) {
        deck.push({ color, shape, number });
      }
    }
  }
  return deck;
})();

/** Draw a stimulus card from the shuffled standard deck. */
function generateStimulusCard(rng: () => number): WCSTCard {
  return STIMULUS_DECK[Math.floor(rng() * STIMULUS_DECK.length)];
}

/** Which key card does a stimulus match under a given rule? Returns 1-4. */
function correctMatch(stimulus: WCSTCard, rule: SortingRule): number {
  for (let i = 0; i < KEY_CARDS.length; i++) {
    if (stimulus[rule] === KEY_CARDS[i][rule]) return i + 1;
  }
  return 1; // fallback
}

/** Describe a card in text. */
function describeCard(card: WCSTCard): string {
  return `${card.number} ${card.color} ${card.shape}${card.number > 1 ? 's' : ''}`;
}

/** Seeded PRNG (Mulberry32). */
function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// TASK SYSTEM PROMPT
// ============================================================

const wcstInstr = getTaskInstruction('wcst');
const WCST_SYSTEM_PROMPT = `${wcstInstr.instructions}

After each choice, you'll be told "${wcstInstr.feedbackCorrect}" or "${wcstInstr.feedbackIncorrect}."

Return ONLY JSON: ${wcstInstr.llmResponseFormat}`;

// ============================================================
// RUN WCST
// ============================================================

export interface WCSTResult {
  outcomes: TrialOutcome[];
  perseverativeErrors: number;
  totalErrors: number;
  categoriesCompleted: number;
  trialDetails: WCSTTrialDetail[];
}

export interface WCSTTrialDetail {
  trial: number;
  stimulus: WCSTCard;
  rule: SortingRule;
  correctAnswer: number;
  participantChoice: number;
  correct: boolean;
  perseverative: boolean;
  feedback: string;
}

/**
 * Run the full 64-trial WCST with an LLM participant.
 */
export async function runWCST(
  personaPrompt: string,
  nTrials: number = 64,
  seed: number = 42,
  onProgress?: (trial: number, total: number) => void,
): Promise<WCSTResult> {
  const rng = createRng(seed);
  const session = createSession(personaPrompt, WCST_SYSTEM_PROMPT, 30);

  let currentRuleIdx = 0;
  let currentRule = RULE_ORDER[currentRuleIdx];
  let previousRule: SortingRule | null = null;
  let consecutiveCorrect = 0;
  let categoriesCompleted = 0;
  let perseverativeErrors = 0;
  let totalErrors = 0;
  const trialDetails: WCSTTrialDetail[] = [];

  for (let t = 0; t < nTrials; t++) {
    onProgress?.(t, nTrials);

    const stimulus = generateStimulusCard(rng);
    const correct = correctMatch(stimulus, currentRule);

    // Build stimulus text
    let stimulusText = `Trial ${t + 1}/${nTrials}.\nStimulus card: ${describeCard(stimulus)}.\nWhich key card does it go with? (1, 2, 3, or 4)`;

    // Include feedback from previous trial
    let previousFeedback: string | undefined;
    if (t > 0) {
      const prev = trialDetails[t - 1];
      previousFeedback = prev.correct ? '✓ Correct!' : '✗ Incorrect.';
    }

    const result = await runTrialInSession(session, {
      stimulus: stimulusText,
      previousFeedback,
      maxTokens: 150,
    });

    // Parse choice
    let choice = typeof result.response?.choice === 'number'
      ? result.response.choice
      : parseInt(result.rawText.match(/\d/)?.[0] || '1');
    choice = Math.max(1, Math.min(4, choice));

    const isCorrect = choice === correct;

    // Check if perseverative (sorted by old rule after switch)
    let isPerseverative = false;
    if (!isCorrect && previousRule) {
      const oldRuleAnswer = correctMatch(stimulus, previousRule);
      if (choice === oldRuleAnswer) {
        isPerseverative = true;
        perseverativeErrors++;
      }
    }

    if (!isCorrect) totalErrors++;

    // Build feedback
    const feedback = isCorrect ? 'Correct' : 'Incorrect';
    recordFeedback(session, feedback);
    recordMetadata(session, {
      rule: currentRule,
      correct: isCorrect,
      perseverative: isPerseverative,
      stimulus,
      choice,
    });

    trialDetails.push({
      trial: t,
      stimulus,
      rule: currentRule,
      correctAnswer: correct,
      participantChoice: choice,
      correct: isCorrect,
      perseverative: isPerseverative,
      feedback,
    });

    // Rule switching logic
    if (isCorrect) {
      consecutiveCorrect++;
      if (consecutiveCorrect >= 10) {
        // Switch rule
        previousRule = currentRule;
        currentRuleIdx++;
        if (currentRuleIdx < RULE_ORDER.length) {
          currentRule = RULE_ORDER[currentRuleIdx];
          categoriesCompleted++;
          consecutiveCorrect = 0;
        }
        // If we've exhausted all rules, keep on last one
      }
    } else {
      consecutiveCorrect = 0;
    }

    // Small delay to avoid rate limiting
    if (t < nTrials - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return {
    outcomes: session.outcomes,
    perseverativeErrors,
    totalErrors,
    categoriesCompleted,
    trialDetails,
  };
}

/**
 * Compute WCST summary metrics matching Lin & Ma's scoring.
 * Paper DV: negated perseverative errors (higher = better, for consistency).
 */
export function scoreWCST(result: WCSTResult): {
  perseverativeErrors: number;
  negatedPerseverativeErrors: number;
  totalErrors: number;
  categoriesCompleted: number;
  accuracy: number;
  perseverativeErrorRate: number;
} {
  const nTrials = result.trialDetails.length;
  return {
    perseverativeErrors: result.perseverativeErrors,
    negatedPerseverativeErrors: -result.perseverativeErrors,
    totalErrors: result.totalErrors,
    categoriesCompleted: result.categoriesCompleted,
    accuracy: (nTrials - result.totalErrors) / nTrials,
    perseverativeErrorRate: result.perseverativeErrors / nTrials,
  };
}
