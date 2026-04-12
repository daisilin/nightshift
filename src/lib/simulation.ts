import type {
  ExperimentDesign, PersonaDefinition, BehavioralParams, SurveyParams,
  SimulatedTrial, SimulatedParticipant, SimulatedDataset,
} from './types';

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

  // RT: base + difficulty effect + condition effect + individual noise
  const baseMean = rtRange[0] + difficulty * (rtRange[1] - rtRange[0]);
  const conditionShift = conditionIndex * (rtRange[1] - rtRange[0]) * 0.08;
  const sd = baseMean * 0.2 * persona.variabilityMultiplier;

  // Practice effect (slight speedup over trials)
  const practiceEffect = -(trialIndex / nTrials) * baseMean * 0.08;

  // Fatigue effect (slowdown in last 30% of trials)
  const fatigueEffect = trialIndex > nTrials * 0.7
    ? persona.fatigueRate * (trialIndex - nTrials * 0.7) * 15
    : 0;

  const rt = normalDraw(rng, baseMean + conditionShift + practiceEffect + fatigueEffect, sd)
    * persona.rtMultiplier;
  const clampedRt = clamp(Math.round(rt), rtRange[0] * 0.5, rtRange[1] * 2);

  // Accuracy: base - difficulty effect - condition effect
  const baseP = baseAccuracy - difficulty * 0.35 + persona.accuracyOffset;
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
): SimulatedParticipant {
  const seed = masterSeed + participantIndex * 7919 + persona.id.length * 31;
  const rng = createRng(seed);
  const params = design.params;
  const trials: SimulatedTrial[] = [];

  if (params.type === 'behavioral') {
    // Individual speed/accuracy offset
    const _speedOffset = normalDraw(rng, 0, 60); // unused for now, captured in persona
    const trialsPerCondition = Math.floor(params.nTrials / params.nConditions);

    if (params.withinSubject) {
      // Within-subject: each participant sees all conditions
      for (let c = 0; c < params.nConditions; c++) {
        for (let t = 0; t < trialsPerCondition; t++) {
          const globalIdx = c * trialsPerCondition + t;
          trials.push(simulateBehavioralTrial(rng, params, persona, c, globalIdx));
        }
      }
    } else {
      // Between-subject: participant sees one condition
      const assignedCondition = participantIndex % params.nConditions;
      for (let t = 0; t < params.nTrials; t++) {
        trials.push(simulateBehavioralTrial(rng, params, persona, assignedCondition, t));
      }
    }
  } else {
    // Survey: one response per item
    const latentTrait = normalDraw(rng, 0, 1);
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

export function simulatePilot(
  design: ExperimentDesign,
  personas: PersonaDefinition[],
  masterSeed?: number,
): SimulatedDataset {
  const seed = masterSeed ?? hashString(design.id);
  const participants: SimulatedParticipant[] = [];

  for (const persona of personas) {
    for (let i = 0; i < design.nParticipantsPerPersona; i++) {
      participants.push(simulateParticipant(design, persona, i, seed));
    }
  }

  return { designId: design.id, participants, masterSeed: seed, generatedAt: Date.now() };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
