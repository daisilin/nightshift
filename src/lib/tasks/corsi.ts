/**
 * CORSI BLOCK-TAPPING TASK
 *
 * Faithful implementation matching Lin & Ma (Nature Communications).
 * 9 blocks in spatial grid, sequences presented one block at a time.
 * Adaptive staircase: span increases on correct, stops after 2 fails at a span.
 *
 * Key DV: Corsi score = block span × number of correctly reproduced sequences
 * Lin & Ma reference: mean = 53.5 (SEM = 1.1)
 * Loaded 0.78 on Factor 2 (working memory).
 *
 * CRITICAL: Blocks have SPATIAL POSITIONS (not just numbers).
 * The LLM must process spatial layout and reproduce sequences in order.
 * Each block highlight is a separate message (temporal + spatial).
 */

import {
  createSession,
  runTrialInSession,
  recordMetadata,
  type TrialOutcome,
} from '../multiTurnSession';

// ============================================================
// SPATIAL GRID
// ============================================================

interface BlockPosition {
  id: number; // 1-9
  row: number;
  col: number;
  label: string; // e.g. "Block 3 (top-right)"
}

/**
 * 9 blocks arranged in a 3×3-ish irregular grid (matching classic Corsi layout).
 * Positions are NOT a regular grid — they're scattered to prevent verbal encoding.
 */
const BLOCKS: BlockPosition[] = [
  { id: 1, row: 0, col: 1, label: 'Block 1 (top-center)' },
  { id: 2, row: 0, col: 4, label: 'Block 2 (top-right)' },
  { id: 3, row: 1, col: 0, label: 'Block 3 (upper-left)' },
  { id: 4, row: 1, col: 3, label: 'Block 4 (upper-right)' },
  { id: 5, row: 2, col: 2, label: 'Block 5 (center)' },
  { id: 6, row: 2, col: 4, label: 'Block 6 (center-right)' },
  { id: 7, row: 3, col: 0, label: 'Block 7 (lower-left)' },
  { id: 8, row: 3, col: 3, label: 'Block 8 (lower-right)' },
  { id: 9, row: 4, col: 1, label: 'Block 9 (bottom-center)' },
];

function renderGrid(): string {
  const grid: string[][] = Array.from({ length: 5 }, () => Array(5).fill('.'));
  for (const b of BLOCKS) {
    grid[b.row][b.col] = String(b.id);
  }
  return grid.map(row => row.join(' ')).join('\n');
}

// ============================================================
// SEQUENCE GENERATION
// ============================================================

function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Generate a sequence of block IDs with no immediate repeats. */
function generateSequence(span: number, rng: () => number): number[] {
  const seq: number[] = [];
  for (let i = 0; i < span; i++) {
    let id: number;
    let attempts = 0;
    do {
      id = Math.floor(rng() * 9) + 1;
      attempts++;
    } while (attempts < 20 && seq.length > 0 && id === seq[seq.length - 1]);
    seq.push(id);
  }
  return seq;
}

// ============================================================
// RUN CORSI
// ============================================================

export interface CorsiResult {
  outcomes: TrialOutcome[];
  corsiScore: number; // span × correct sequences
  maxSpan: number;
  totalCorrect: number;
  trialDetails: CorsiTrialDetail[];
}

export interface CorsiTrialDetail {
  span: number;
  trialAtSpan: number;
  sequence: number[];
  recalled: number[];
  correct: boolean;
}

const CORSI_SYSTEM = `You are doing the Corsi Block-Tapping task in a research study.

You see 9 blocks arranged on screen:
${renderGrid()}

(Dots are empty spaces. Numbers 1-9 are blocks at those positions.)

Blocks will light up ONE AT A TIME in a sequence. After the sequence finishes, you must reproduce the sequence in the SAME ORDER by listing the block numbers.

The sequences get longer as you get them right. The task ends when you make errors.

When asked to recall, return ONLY JSON: { "sequence": [list of block numbers in order] }`;

export async function runCorsi(
  personaPrompt: string,
  startSpan: number = 3,
  maxSpan: number = 9,
  trialsPerSpan: number = 2,
  seed: number = 42,
  onProgress?: (trial: number, total: number) => void,
): Promise<CorsiResult> {
  const rng = createRng(seed);
  const session = createSession(personaPrompt, CORSI_SYSTEM, 16);
  const trialDetails: CorsiTrialDetail[] = [];
  let currentSpan = startSpan;
  let failsAtSpan = 0;
  let totalCorrect = 0;
  let trialCount = 0;
  const estimatedTotal = (maxSpan - startSpan + 1) * trialsPerSpan;

  while (currentSpan <= maxSpan) {
    for (let t = 0; t < trialsPerSpan; t++) {
      trialCount++;
      onProgress?.(trialCount, estimatedTotal);

      const sequence = generateSequence(currentSpan, rng);

      // Present sequence one block at a time
      await runTrialInSession(session, {
        stimulus: `\n--- Span ${currentSpan}, Trial ${t + 1}/${trialsPerSpan} ---\nWatch the blocks light up one at a time:`,
        maxTokens: 30,
      });

      for (let si = 0; si < sequence.length; si++) {
        const block = BLOCKS.find(b => b.id === sequence[si])!;
        await runTrialInSession(session, {
          stimulus: `Block ${sequence[si]} lights up. (${block.label})${si < sequence.length - 1 ? '' : '\n\nSequence complete. Now reproduce the sequence in order.'}`,
          maxTokens: si < sequence.length - 1 ? 30 : 200,
        });
        await new Promise(r => setTimeout(r, 100));
      }

      // Get recall response
      const lastOutcome = session.outcomes[session.outcomes.length - 1];
      let recalled: number[] = [];

      try {
        const resp = lastOutcome?.response;
        if (resp?.sequence && Array.isArray(resp.sequence)) {
          recalled = resp.sequence.map((x: any) => typeof x === 'number' ? x : parseInt(x)).filter((x: number) => !isNaN(x));
        } else {
          // Try parsing from raw text
          const raw = lastOutcome?.rawText || '';
          const nums = raw.match(/\d+/g);
          if (nums) recalled = nums.map(Number).filter(n => n >= 1 && n <= 9);
        }
      } catch {}

      // Check correctness: exact sequence match
      const correct = recalled.length === sequence.length &&
        recalled.every((v, i) => v === sequence[i]);

      if (correct) {
        totalCorrect++;
        failsAtSpan = 0;
        await runTrialInSession(session, { stimulus: 'Correct!', maxTokens: 20 });
      } else {
        failsAtSpan++;
        await runTrialInSession(session, {
          stimulus: `Incorrect. The correct sequence was: ${sequence.join(', ')}`,
          maxTokens: 20,
        });
      }

      trialDetails.push({ span: currentSpan, trialAtSpan: t, sequence, recalled, correct });

      recordMetadata(session, { span: currentSpan, correct, sequence, recalled });

      await new Promise(r => setTimeout(r, 150));
    }

    // Adaptive staircase: stop if 2 failures at this span
    const failsThisSpan = trialDetails.filter(d => d.span === currentSpan && !d.correct).length;
    if (failsThisSpan >= 2) {
      console.log(`    stopped at span ${currentSpan} (2 failures)`);
      break;
    }

    currentSpan++;
    failsAtSpan = 0;
  }

  // Corsi score = max span achieved × total correct sequences
  const maxAchieved = Math.max(...trialDetails.filter(d => d.correct).map(d => d.span), startSpan - 1);

  return {
    outcomes: session.outcomes,
    corsiScore: maxAchieved * totalCorrect,
    maxSpan: maxAchieved,
    totalCorrect,
    trialDetails,
  };
}

export function scoreCorsi(result: CorsiResult): {
  corsiScore: number;
  maxSpan: number;
  totalCorrect: number;
  proportionCorrect: number;
} {
  return {
    corsiScore: result.corsiScore,
    maxSpan: result.maxSpan,
    totalCorrect: result.totalCorrect,
    proportionCorrect: result.trialDetails.length > 0
      ? result.trialDetails.filter(d => d.correct).length / result.trialDetails.length
      : 0,
  };
}
