import type {
  ExperimentDesign, PersonaDefinition, BehavioralParams, SurveyParams,
  SimulatedTrial, SimulatedParticipant, SimulatedDataset,
} from './types';
import { generateCohort, getTaskLoadings, computeTaskAbility, type LatentProfile } from './latentModel';

// ============================================================
// SEEDED PRNG — Mulberry32
// ============================================================

export function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalDraw(rng: () => number, mean: number, sd: number): number {
  // Box-Muller transform
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);
  return mean + z * sd;
}

export function bernoulliDraw(rng: () => number, p: number): boolean {
  return rng() < Math.max(0.001, Math.min(0.999, p));
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ============================================================
// BEHAVIORAL TRIAL SIMULATION
// ============================================================

export function simulateBehavioralTrial(
  rng: () => number,
  params: BehavioralParams,
  persona: PersonaDefinition,
  conditionIndex: number,
  trialIndex: number,
  taskAbility: number = 0, // latent ability score for this task
): SimulatedTrial {
  const { difficulty, nTrials, rtRange, baseAccuracy, conditionLabels } = params;
  const condition = conditionLabels[conditionIndex] || `cond-${conditionIndex}`;

  // Attention lapse — random response
  if (bernoulliDraw(rng, persona.attentionLapseRate)) {
    const randomRt = rtRange[0] + rng() * (rtRange[1] - rtRange[0]);
    return {
      trialIndex, condition,
      rt: Math.round(randomRt * persona.rtMultiplier),
      response: rng() < 0.5 ? 1 : 0,
      correct: rng() < 0.5,
    };
  }

  // Ability effect: CALIBRATED against Lin & Ma Table 1 (target avg r ≈ 0.27)
  // In real data, individual differences explain ~5-15% of trial variance.
  // The rest is within-person noise (trial difficulty, attention fluctuations, etc.)
  // CALIBRATED against Lin & Ma Table 1 (target avg inter-task r ≈ 0.27)
  // Tuned: 0.06 RT, 0.03 accuracy → produces avg r ≈ 0.25-0.30
  const abilityRtFactor = 1 - taskAbility * 0.06;
  const abilityAccBonus = taskAbility * 0.03;

  // RT: LOG-NORMAL distribution (realistic heavy right tail)
  const baseMean = rtRange[0] + difficulty * (rtRange[1] - rtRange[0]);
  const conditionShift = conditionIndex * (rtRange[1] - rtRange[0]) * 0.08;
  const sd = baseMean * 0.2 * persona.variabilityMultiplier;

  // Practice effect (slight speedup over trials)
  const practiceEffect = -(trialIndex / nTrials) * baseMean * 0.08;

  // Fatigue effect (slowdown in last 30% of trials)
  const fatigueEffect = trialIndex > nTrials * 0.7
    ? persona.fatigueRate * (trialIndex - nTrials * 0.7) * 15
    : 0;

  // Log-normal RT: exp(normal) produces realistic heavy right tail
  const logMean = Math.log(Math.max(50, baseMean + conditionShift + practiceEffect + fatigueEffect));
  const logSd = 0.45 * persona.variabilityMultiplier; // CV ~45%, high within-person noise
  const rt = Math.exp(normalDraw(rng, logMean, logSd)) * persona.rtMultiplier * abilityRtFactor;
  const clampedRt = clamp(Math.round(rt), rtRange[0] * 0.3, rtRange[1] * 3);

  // Accuracy: base - difficulty + ability bonus + persona offset
  const baseP = baseAccuracy - difficulty * 0.35 + persona.accuracyOffset + abilityAccBonus;
  const condAccShift = -conditionIndex * 0.04;
  const fatigueAccEffect = trialIndex > nTrials * 0.7 ? -persona.fatigueRate * 0.04 : 0;
  const p = clamp(baseP + condAccShift + fatigueAccEffect, 0.05, 0.99);
  const correct = bernoulliDraw(rng, p);

  return {
    trialIndex, condition,
    rt: clampedRt,
    response: correct ? 1 : 0,
    correct,
  };
}

// ============================================================
// SURVEY RESPONSE SIMULATION
// ============================================================

export function simulateSurveyResponse(
  rng: () => number,
  params: SurveyParams,
  persona: PersonaDefinition,
  itemIndex: number,
  latentTrait: number, // per-participant theta ~ N(0,1)
): SimulatedTrial {
  const { scalePoints, reverseCodedIndices } = params;
  const isReverseCoded = reverseCodedIndices.includes(itemIndex);

  // Attention lapse — random response
  if (bernoulliDraw(rng, persona.attentionLapseRate)) {
    const randomResponse = Math.floor(rng() * scalePoints) + 1;
    return { trialIndex: itemIndex, condition: 'survey', rt: null, response: randomResponse, correct: null };
  }

  // Item difficulty: spread across items
  const itemDifficulty = -2 + (itemIndex / Math.max(params.nItems - 1, 1)) * 4; // range [-2, 2]

  // Logistic model: P(endorse high) = logistic(theta - itemDifficulty)
  let logit = latentTrait - itemDifficulty;
  if (isReverseCoded) logit = -logit;

  // Acquiescence: shift logit toward endorsing
  logit += persona.acquiescenceBias * 1.0;

  const pHigh = 1 / (1 + Math.exp(-logit));

  let response: number;

  if (scalePoints === 2) {
    // Forced choice: binary
    response = bernoulliDraw(rng, pHigh) ? 2 : 1;
  } else {
    // Likert: map probability to ordinal scale
    // Extreme response style: snap to endpoints
    if (bernoulliDraw(rng, persona.extremeResponseStyle)) {
      response = pHigh > 0.5 ? scalePoints : 1;
    } else {
      // Distribute across scale based on pHigh
      const continuous = pHigh * (scalePoints - 1) + 1;
      const noise = normalDraw(rng, 0, 0.6);
      response = clamp(Math.round(continuous + noise), 1, scalePoints);
    }
  }

  return { trialIndex: itemIndex, condition: 'survey', rt: null, response, correct: null };
}

// ============================================================
// PARTICIPANT SIMULATION
// ============================================================

export function simulateParticipant(
  design: ExperimentDesign,
  persona: PersonaDefinition,
  participantIndex: number,
  masterSeed: number,
  latentProfile?: LatentProfile,
): SimulatedParticipant {
  // Seed includes paradigmId hash so each task gets INDEPENDENT randomness
  // (Without this, same seed offset → correlated RT across tasks → inflated correlations)
  const taskHash = hashString(design.paradigmId);
  const seed = masterSeed + participantIndex * 7919 + persona.id.length * 31 + taskHash;
  const rng = createRng(seed);
  const params = design.params;
  const trials: SimulatedTrial[] = [];

  // Compute task-specific ability from latent profile
  const loadings = getTaskLoadings(design.paradigmId);
  const taskAbility = latentProfile ? computeTaskAbility(latentProfile, loadings) : 0;

  if (params.type === 'behavioral') {
    const trialsPerCondition = Math.floor(params.nTrials / params.nConditions);

    if (params.withinSubject) {
      for (let c = 0; c < params.nConditions; c++) {
        for (let t = 0; t < trialsPerCondition; t++) {
          const globalIdx = c * trialsPerCondition + t;
          trials.push(simulateBehavioralTrial(rng, params, persona, c, globalIdx, taskAbility));
        }
      }
    } else {
      const assignedCondition = participantIndex % params.nConditions;
      for (let t = 0; t < params.nTrials; t++) {
        trials.push(simulateBehavioralTrial(rng, params, persona, assignedCondition, t, taskAbility));
      }
    }
  } else {
    // Survey: use latent profile's g as the latent trait (if available)
    const latentTrait = latentProfile ? latentProfile.g * 0.5 + normalDraw(rng, 0, 0.7) : normalDraw(rng, 0, 1);
    for (let i = 0; i < params.nItems; i++) {
      trials.push(simulateSurveyResponse(rng, params, persona, i, latentTrait));
    }
  }

  return {
    id: `p-${persona.id}-${participantIndex}`,
    personaId: persona.id,
    condition: params.type === 'behavioral' && !params.withinSubject
      ? params.conditionLabels[participantIndex % params.nConditions]
      : null,
    trials,
    seed,
  };
}

// ============================================================
// PILOT SIMULATION
// ============================================================

/**
 * Simulate a full pilot dataset.
 * If a shared cohort is provided, uses those latent profiles.
 * Otherwise generates independent profiles (single-task mode).
 * Shared cohort = realistic cross-task correlations.
 */
export function simulatePilot(
  design: ExperimentDesign,
  personas: PersonaDefinition[],
  masterSeed?: number,
  sharedCohort?: Map<string, LatentProfile[]>,
): SimulatedDataset {
  const seed = masterSeed ?? hashString(design.id);
  const participants: SimulatedParticipant[] = [];

  for (const persona of personas) {
    // Get or generate latent profiles for this persona's participants
    const cohortKey = `${persona.id}-${design.nParticipantsPerPersona}`;
    const profiles = sharedCohort?.get(cohortKey)
      ?? generateCohort(design.nParticipantsPerPersona, seed + hashString(persona.id));

    for (let i = 0; i < design.nParticipantsPerPersona; i++) {
      participants.push(simulateParticipant(design, persona, i, seed, profiles[i]));
    }
  }

  return { designId: design.id, participants, masterSeed: seed, generatedAt: Date.now() };
}

/**
 * Simulate a full battery with SHARED latent profiles.
 * The same participants take all tasks — their cognitive abilities
 * are consistent across tasks, producing realistic cross-task correlations.
 */
export function simulateBattery(
  designs: ExperimentDesign[],
  personas: PersonaDefinition[],
  masterSeed: number = 42,
): SimulatedDataset[] {
  // Generate shared cohort: same latent profiles used across all tasks
  const sharedCohort = new Map<string, LatentProfile[]>();
  for (const persona of personas) {
    const n = designs[0]?.nParticipantsPerPersona ?? 20;
    const key = `${persona.id}-${n}`;
    sharedCohort.set(key, generateCohort(n, masterSeed + hashString(persona.id)));
  }

  return designs.map(design => simulatePilot(design, personas, masterSeed, sharedCohort));
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
