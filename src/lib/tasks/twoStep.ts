/**
 * TWO-STEP TASK
 *
 * Faithful implementation matching Lin & Ma (Nature Communications).
 * 80 trials (4 blocks × 20), drifting reward probabilities,
 * 70/30 common/rare transitions.
 *
 * The task reveals model-based vs model-free decision strategies:
 * - Model-based: uses knowledge of transition structure
 *   (after rare transition + reward, should SWITCH first-stage choice)
 * - Model-free: repeats recently rewarded actions regardless of transition
 *   (after any reward, should STAY with first-stage choice)
 *
 * Key DV: model-based weight from RL model fitting.
 * Loaded 0.83 on Factor 3 (inhibition) in Lin & Ma.
 *
 * Reward probabilities drift via Gaussian random walk (bounded 0.25-0.75).
 * Source: Daw et al. (2011), Nussenbaum et al. (2020).
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
// TASK PARAMETERS
// ============================================================

const N_TRIALS = 80;
const COMMON_PROB = 0.7;          // common transition probability
const REWARD_DRIFT_SD = 0.025;    // Gaussian random walk step size
const REWARD_LOWER = 0.25;        // reward probability floor
const REWARD_UPPER = 0.75;        // reward probability ceiling

// Themed names (matching Nussenbaum et al. space theme)
const STAGE1_OPTIONS = ['Spaceship A', 'Spaceship B'];
const PLANETS = ['Red Planet', 'Purple Planet'];
const STAGE2_OPTIONS = [
  ['Alien Alpha', 'Alien Beta'],    // Red Planet aliens
  ['Alien Gamma', 'Alien Delta'],   // Purple Planet aliens
];

// ============================================================
// REWARD PROBABILITY GENERATION
// ============================================================

function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalDraw(rng: () => number): number {
  const u1 = rng(), u2 = rng();
  return Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
}

/** Generate drifting reward probabilities for 4 second-stage options. */
function generateRewardSchedule(nTrials: number, seed: number): number[][] {
  const rng = createRng(seed);
  // 4 aliens' reward probabilities, one per trial
  const schedule: number[][] = [];
  let probs = [0.4, 0.6, 0.6, 0.4]; // initial values (staggered)

  for (let t = 0; t < nTrials; t++) {
    schedule.push([...probs]);
    // Gaussian random walk with reflecting boundaries
    for (let i = 0; i < 4; i++) {
      probs[i] += normalDraw(rng) * REWARD_DRIFT_SD;
      probs[i] = Math.max(REWARD_LOWER, Math.min(REWARD_UPPER, probs[i]));
    }
  }
  return schedule;
}

// ============================================================
// TASK SYSTEM PROMPT
// ============================================================

const tsInstr = getTaskInstruction('two-step');
const TWO_STEP_SYSTEM_PROMPT = `${tsInstr.instructions}

After each trial you'll see what happened. Use that information to make better choices.

Return ONLY JSON: ${tsInstr.llmResponseFormat}`;

// ============================================================
// RUN TWO-STEP
// ============================================================

export interface TwoStepTrialDetail {
  trial: number;
  stage1Choice: 'A' | 'B';     // participant's spaceship choice
  transition: 'common' | 'rare';
  planet: number;                // 0 = Red, 1 = Purple
  stage2Choice: number;          // 0 or 1 (which alien on the planet)
  rewarded: boolean;
  rewardProbs: number[];         // all 4 alien probs this trial
}

export interface TwoStepResult {
  outcomes: TrialOutcome[];
  trialDetails: TwoStepTrialDetail[];
  modelBasedIndex: number;       // simple behavioral index of model-based control
  stayAfterCommonReward: number;
  stayAfterCommonNoReward: number;
  stayAfterRareReward: number;
  stayAfterRareNoReward: number;
}

/**
 * Run the full 80-trial Two-Step task with an LLM participant.
 */
export async function runTwoStep(
  personaPrompt: string,
  nTrials: number = N_TRIALS,
  seed: number = 42,
  onProgress?: (trial: number, total: number) => void,
): Promise<TwoStepResult> {
  const rng = createRng(seed + 1000);
  const rewardSchedule = generateRewardSchedule(nTrials, seed);

  // Multi-turn session with moderate history (last 20 exchanges = 10 full trials)
  const session = createSession(personaPrompt, TWO_STEP_SYSTEM_PROMPT, 20);
  const trialDetails: TwoStepTrialDetail[] = [];

  for (let t = 0; t < nTrials; t++) {
    onProgress?.(t, nTrials);

    // === STAGE 1: Spaceship choice ===
    let stage1Stimulus = `Trial ${t + 1}/${nTrials}. Choose a spaceship: A or B.`;

    // Include previous trial outcome as feedback
    let previousFeedback: string | undefined;
    if (t > 0) {
      const prev = trialDetails[t - 1];
      const planet = prev.planet === 0 ? 'Red Planet' : 'Purple Planet';
      const alien = STAGE2_OPTIONS[prev.planet][prev.stage2Choice];
      const rewardStr = prev.rewarded ? 'You found treasure!' : 'No treasure this time.';
      // NO transition labels — humans never see "common" or "rare", they must infer structure
      previousFeedback = `Last trial: ${STAGE1_OPTIONS[prev.stage1Choice === 'A' ? 0 : 1]} → ${planet} → ${alien} → ${rewardStr}`;
    }

    const stage1Result = await runTrialInSession(session, {
      stimulus: stage1Stimulus,
      previousFeedback,
      maxTokens: 150,
    });

    // Parse stage 1 choice
    let s1Choice: 'A' | 'B' = 'A';
    const choiceRaw = stage1Result.response?.choice;
    if (typeof choiceRaw === 'string') {
      s1Choice = choiceRaw.toUpperCase().includes('B') ? 'B' : 'A';
    }

    // Determine transition
    const s1Idx = s1Choice === 'A' ? 0 : 1;
    const isCommon = rng() < COMMON_PROB;
    const planet = isCommon ? s1Idx : (1 - s1Idx); // common: A→0, B→1; rare: A→1, B→0
    const transition = isCommon ? 'common' : 'rare';

    // === STAGE 2: Alien choice ===
    const planetName = PLANETS[planet];
    const aliens = STAGE2_OPTIONS[planet];
    // NO transition label — just which planet they arrived at
    const stage2Stimulus = `You arrived at ${planetName}. Choose an alien: "${aliens[0]}" or "${aliens[1]}".`;

    const stage2Result = await runTrialInSession(session, {
      stimulus: stage2Stimulus,
      maxTokens: 150,
    });

    // Parse stage 2 choice
    let s2Choice = 0;
    const s2Raw = stage2Result.response?.choice || stage2Result.rawText || '';
    const s2Str = typeof s2Raw === 'string' ? s2Raw.toLowerCase() : '';
    if (s2Str.includes(aliens[1].toLowerCase()) || s2Str.includes('beta') || s2Str.includes('delta') || s2Str.includes('2') || s2Str.includes('b')) {
      // Heuristic: if it mentions the second alien
      if (!s2Str.includes(aliens[0].toLowerCase())) {
        s2Choice = 1;
      }
    }

    // Determine reward
    const alienGlobalIdx = planet * 2 + s2Choice; // 0-3 index into reward schedule
    const rewardProb = rewardSchedule[t][alienGlobalIdx];
    const rewarded = rng() < rewardProb;

    // Give reward feedback
    const rewardFeedback = rewarded
      ? `${aliens[s2Choice]} gives you treasure! 🪙`
      : `${aliens[s2Choice]} has nothing for you this time.`;
    recordFeedback(session, rewardFeedback);
    recordMetadata(session, { transition, planet, rewarded, stage1Choice: s1Choice, stage2Choice: s2Choice });

    trialDetails.push({
      trial: t,
      stage1Choice: s1Choice,
      transition,
      planet,
      stage2Choice: s2Choice,
      rewarded,
      rewardProbs: rewardSchedule[t],
    });

    // Delay to avoid rate limiting
    if (t < nTrials - 1) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Compute model-based behavioral index
  const mbMetrics = computeModelBasedIndex(trialDetails);

  return {
    outcomes: session.outcomes,
    trialDetails,
    ...mbMetrics,
  };
}

// ============================================================
// SCORING: Model-Based Index
// ============================================================

/**
 * Compute a simple behavioral index of model-based control.
 *
 * Model-based agents should show an interaction between reward and transition:
 * - Common + reward → stay (both MB and MF agree)
 * - Common + no reward → switch (both agree)
 * - Rare + reward → SWITCH (MB says the good alien is on the other planet's side)
 * - Rare + no reward → STAY (MB says try again, the reward was unlucky)
 *
 * Model-free agents just repeat rewarded actions regardless of transition:
 * - Reward → stay
 * - No reward → switch
 *
 * MB index = (stay|common,reward - stay|common,no_reward) - (stay|rare,reward - stay|rare,no_reward)
 * Positive = model-based; 0 = model-free; negative = confused.
 */
function computeModelBasedIndex(trials: TwoStepTrialDetail[]): {
  modelBasedIndex: number;
  stayAfterCommonReward: number;
  stayAfterCommonNoReward: number;
  stayAfterRareReward: number;
  stayAfterRareNoReward: number;
} {
  const counts = { cr: 0, crStay: 0, cn: 0, cnStay: 0, rr: 0, rrStay: 0, rn: 0, rnStay: 0 };

  for (let t = 1; t < trials.length; t++) {
    const prev = trials[t - 1];
    const curr = trials[t];
    const stayed = curr.stage1Choice === prev.stage1Choice;

    if (prev.transition === 'common' && prev.rewarded) { counts.cr++; if (stayed) counts.crStay++; }
    else if (prev.transition === 'common' && !prev.rewarded) { counts.cn++; if (stayed) counts.cnStay++; }
    else if (prev.transition === 'rare' && prev.rewarded) { counts.rr++; if (stayed) counts.rrStay++; }
    else if (prev.transition === 'rare' && !prev.rewarded) { counts.rn++; if (stayed) counts.rnStay++; }
  }

  const sCR = counts.cr > 0 ? counts.crStay / counts.cr : 0.5;
  const sCN = counts.cn > 0 ? counts.cnStay / counts.cn : 0.5;
  const sRR = counts.rr > 0 ? counts.rrStay / counts.rr : 0.5;
  const sRN = counts.rn > 0 ? counts.rnStay / counts.rn : 0.5;

  return {
    modelBasedIndex: (sCR - sCN) - (sRR - sRN),
    stayAfterCommonReward: sCR,
    stayAfterCommonNoReward: sCN,
    stayAfterRareReward: sRR,
    stayAfterRareNoReward: sRN,
  };
}

/**
 * Score Two-Step results matching Lin & Ma's DV.
 */
export function scoreTwoStep(result: TwoStepResult): {
  modelBasedIndex: number;
  stayProbabilities: { cr: number; cn: number; rr: number; rn: number };
  totalRewards: number;
  rewardRate: number;
} {
  const totalRewards = result.trialDetails.filter(t => t.rewarded).length;
  return {
    modelBasedIndex: result.modelBasedIndex,
    stayProbabilities: {
      cr: result.stayAfterCommonReward,
      cn: result.stayAfterCommonNoReward,
      rr: result.stayAfterRareReward,
      rn: result.stayAfterRareNoReward,
    },
    totalRewards,
    rewardRate: totalRewards / result.trialDetails.length,
  };
}
