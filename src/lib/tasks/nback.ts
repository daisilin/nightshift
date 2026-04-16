/**
 * N-BACK TASK (Sequential)
 *
 * Faithful implementation matching Lin & Ma (Nature Communications).
 * Letters presented ONE AT A TIME via separate API calls.
 * 2-back and 3-back blocks.
 *
 * Key DV: d' (signal detection sensitivity) = z(hit rate) - z(false alarm rate)
 * Lin & Ma reference: mean d' = 1.798 (SEM = 0.037) for Change Detection
 * N-back loaded 0.70 on Factor 2 (working memory).
 *
 * CRITICAL: Each letter is a separate API call. The LLM must respond
 * "match" or "no match" for each letter, and can only see the current
 * letter plus conversation history (simulating temporal presentation).
 */

import {
  createSession,
  runTrialInSession,
  recordMetadata,
  type TrialOutcome,
} from '../multiTurnSession';

// ============================================================
// SEQUENCE GENERATION
// ============================================================

function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const LETTERS = 'BCDFGHJKLMNPQRSTVWXZ'.split(''); // consonants only (easier to distinguish)

interface NBackTrial {
  letter: string;
  position: number; // 0-indexed position in sequence
  isTarget: boolean; // true if matches N-back
  nBack: number;
}

/**
 * Generate an N-back sequence with ~30% targets.
 * Ensures no letter repeats in adjacent positions (except for targets).
 */
function generateSequence(nBack: number, length: number, rng: () => number): NBackTrial[] {
  const targetRate = 0.3;
  const sequence: string[] = [];
  const trials: NBackTrial[] = [];

  for (let i = 0; i < length; i++) {
    let letter: string;
    let isTarget = false;

    if (i >= nBack && rng() < targetRate) {
      // Make this a target (match N-back)
      letter = sequence[i - nBack];
      isTarget = true;
    } else {
      // Non-target: pick a letter that doesn't match N-back
      let attempts = 0;
      do {
        letter = LETTERS[Math.floor(rng() * LETTERS.length)];
        attempts++;
      } while (
        attempts < 20 &&
        ((i >= nBack && letter === sequence[i - nBack]) || // avoid accidental target
         (i > 0 && letter === sequence[i - 1])) // avoid immediate repeats
      );
    }

    sequence.push(letter);
    trials.push({ letter, position: i, isTarget, nBack });
  }

  return trials;
}

// ============================================================
// RUN N-BACK
// ============================================================

export interface NBackResult {
  outcomes: TrialOutcome[];
  blocks: NBackBlockResult[];
  overallDPrime: number;
  overallHitRate: number;
  overallFalseAlarmRate: number;
}

export interface NBackBlockResult {
  nBack: number;
  hits: number;
  misses: number;
  falseAlarms: number;
  correctRejections: number;
  hitRate: number;
  falseAlarmRate: number;
  dPrime: number;
  accuracy: number;
}

/** Compute d' with Hautus (1995) correction for extreme rates. */
function computeDPrime(hitRate: number, faRate: number, nTargets: number, nNonTargets: number): number {
  // Log-linear correction: add 0.5 to hits and FAs, add 1 to totals
  const adjHR = (hitRate * nTargets + 0.5) / (nTargets + 1);
  const adjFAR = (faRate * nNonTargets + 0.5) / (nNonTargets + 1);
  // Inverse normal (approximation)
  const zInv = (p: number) => {
    // Rational approximation of probit function
    const a = [0, -3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [0, -5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [0, -7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [0, 7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pLow = 0.02425, pHigh = 1 - pLow;
    let q: number, r: number;
    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) / ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
    } else if (p <= pHigh) {
      q = p - 0.5; r = q * q;
      return (((((a[1]*r+a[2])*r+a[3])*r+a[4])*r+a[5])*r+a[6])*q / (((((b[1]*r+b[2])*r+b[3])*r+b[4])*r+b[5])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[1]*q+c[2])*q+c[3])*q+c[4])*q+c[5])*q+c[6]) / ((((d[1]*q+d[2])*q+d[3])*q+d[4])*q+1);
    }
  };
  return zInv(adjHR) - zInv(adjFAR);
}

const NBACK_SYSTEM = `You are doing an N-back working memory task in a research study.

Letters appear ONE AT A TIME. For each letter, you must decide:
- "match" if the current letter is the SAME as the letter shown N positions back
- "no match" if it is DIFFERENT

You must respond to EVERY letter (starting from position N+1).
In the first N letters, just observe — no response needed.

Return ONLY JSON: { "response": "match" or "no match" }`;

export async function runNBack(
  personaPrompt: string,
  blocks: { nBack: number; length: number }[] = [
    { nBack: 2, length: 25 },
    { nBack: 2, length: 25 },
    { nBack: 3, length: 25 },
    { nBack: 3, length: 25 },
  ],
  seed: number = 42,
  onProgress?: (trial: number, total: number) => void,
): Promise<NBackResult> {
  const rng = createRng(seed);
  const blockResults: NBackBlockResult[] = [];
  let totalTrials = 0;
  const totalAllTrials = blocks.reduce((s, b) => s + b.length, 0);

  // Use limited context window — this IS the working memory constraint
  const session = createSession(personaPrompt, NBACK_SYSTEM, 12);

  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const sequence = generateSequence(block.nBack, block.length, rng);
    let hits = 0, misses = 0, fas = 0, crs = 0;

    // Announce block
    await runTrialInSession(session, {
      stimulus: `\n--- Block ${bi + 1}/${blocks.length}: ${block.nBack}-back ---\nFor each letter, respond "match" if it's the same as ${block.nBack} letters ago, "no match" otherwise.\nFirst ${block.nBack} letters are just for observation.\n\nReady? Here comes the first letter.`,
      maxTokens: 50,
    });

    for (let ti = 0; ti < sequence.length; ti++) {
      const trial = sequence[ti];
      totalTrials++;
      onProgress?.(totalTrials, totalAllTrials);

      const isResponseTrial = ti >= block.nBack;

      let stimulus: string;
      if (!isResponseTrial) {
        stimulus = `Letter ${ti + 1}: ${trial.letter}  [observe — no response needed yet]`;
      } else {
        stimulus = `Letter ${ti + 1}: ${trial.letter}  — match or no match?`;
      }

      const result = await runTrialInSession(session, { stimulus, maxTokens: 80 });

      if (isResponseTrial) {
        // Parse response
        const raw = (result.response?.response || result.rawText || '').toLowerCase();
        const saidMatch = raw.includes('match') && !raw.includes('no match') && !raw.includes('no_match') && !raw.includes('not');
        const saidNoMatch = raw.includes('no') || raw.includes('not') || raw.includes('no_match');

        // Determine if they said "match"
        let responded = false;
        if (raw.includes('no match') || raw.includes('no_match') || raw.includes('not a match')) {
          responded = false; // no match
        } else if (raw.includes('match')) {
          responded = true; // match
        }
        // else: ambiguous, treat as no-match

        if (trial.isTarget) {
          if (responded) hits++;
          else misses++;
        } else {
          if (responded) fas++;
          else crs++;
        }

        recordMetadata(session, {
          letter: trial.letter, position: ti, nBack: block.nBack,
          isTarget: trial.isTarget, responded, correct: responded === trial.isTarget,
        });
      }

      await new Promise(r => setTimeout(r, 150));
    }

    const nTargets = hits + misses;
    const nNonTargets = fas + crs;
    const hr = nTargets > 0 ? hits / nTargets : 0;
    const far = nNonTargets > 0 ? fas / nNonTargets : 0;

    blockResults.push({
      nBack: block.nBack,
      hits, misses, falseAlarms: fas, correctRejections: crs,
      hitRate: hr, falseAlarmRate: far,
      dPrime: computeDPrime(hr, far, nTargets, nNonTargets),
      accuracy: (nTargets + nNonTargets) > 0 ? (hits + crs) / (nTargets + nNonTargets) : 0,
    });

    console.log(`    block ${bi + 1} (${block.nBack}-back): hr=${hr.toFixed(2)}, far=${far.toFixed(2)}, d'=${blockResults[blockResults.length - 1].dPrime.toFixed(2)}`);
  }

  // Overall d'
  const allHits = blockResults.reduce((s, b) => s + b.hits, 0);
  const allMisses = blockResults.reduce((s, b) => s + b.misses, 0);
  const allFAs = blockResults.reduce((s, b) => s + b.falseAlarms, 0);
  const allCRs = blockResults.reduce((s, b) => s + b.correctRejections, 0);
  const overallHR = (allHits + allMisses) > 0 ? allHits / (allHits + allMisses) : 0;
  const overallFAR = (allFAs + allCRs) > 0 ? allFAs / (allFAs + allCRs) : 0;

  return {
    outcomes: session.outcomes,
    blocks: blockResults,
    overallDPrime: computeDPrime(overallHR, overallFAR, allHits + allMisses, allFAs + allCRs),
    overallHitRate: overallHR,
    overallFalseAlarmRate: overallFAR,
  };
}

export function scoreNBack(result: NBackResult): {
  dPrime: number;
  hitRate: number;
  falseAlarmRate: number;
  accuracy: number;
  twoBackDPrime: number;
  threeBackDPrime: number;
} {
  const twoBacks = result.blocks.filter(b => b.nBack === 2);
  const threeBacks = result.blocks.filter(b => b.nBack === 3);
  return {
    dPrime: result.overallDPrime,
    hitRate: result.overallHitRate,
    falseAlarmRate: result.overallFalseAlarmRate,
    accuracy: result.blocks.reduce((s, b) => s + b.accuracy, 0) / result.blocks.length,
    twoBackDPrime: twoBacks.length > 0 ? twoBacks.reduce((s, b) => s + b.dPrime, 0) / twoBacks.length : 0,
    threeBackDPrime: threeBacks.length > 0 ? threeBacks.reduce((s, b) => s + b.dPrime, 0) / threeBacks.length : 0,
  };
}
