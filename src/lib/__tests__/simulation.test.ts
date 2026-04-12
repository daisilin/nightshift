import { describe, it, expect } from 'vitest';
import { createRng, normalDraw, bernoulliDraw, simulateBehavioralTrial, simulateSurveyResponse, simulateParticipant, simulatePilot } from '../simulation';
import type { BehavioralParams, SurveyParams, ExperimentDesign, PersonaDefinition } from '../types';

const basePersona: PersonaDefinition = {
  id: 'test', name: 'Test', emoji: '🧪', description: 'test',
  rtMultiplier: 1.0, accuracyOffset: 0, variabilityMultiplier: 1.0,
  fatigueRate: 0.1, attentionLapseRate: 0.0,
  acquiescenceBias: 0, extremeResponseStyle: 0,
};

const behavioralParams: BehavioralParams = {
  type: 'behavioral', difficulty: 0.5, nTrials: 30, nConditions: 2,
  conditionLabels: ['easy', 'hard'], withinSubject: true,
  rtRange: [400, 1200], baseAccuracy: 0.85,
};

const surveyParams: SurveyParams = {
  type: 'survey', nItems: 10, scalePoints: 5, nSubscales: 2,
  subscaleNames: ['A', 'B'], reverseCodedIndices: [2, 7],
};

// === RNG ===
describe('createRng', () => {
  it('same seed produces same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('different seeds produce different sequences', () => {
    const a = createRng(42);
    const b = createRng(99);
    let same = 0;
    for (let i = 0; i < 100; i++) if (a() === b()) same++;
    expect(same).toBeLessThan(5);
  });

  it('output is in [0, 1)', () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('normalDraw', () => {
  it('mean is approximately correct over many draws', () => {
    const rng = createRng(42);
    const draws = Array.from({ length: 5000 }, () => normalDraw(rng, 500, 100));
    const avg = draws.reduce((a, b) => a + b) / draws.length;
    expect(avg).toBeCloseTo(500, -1); // within ~10
  });
});

describe('bernoulliDraw', () => {
  it('proportion approximates p', () => {
    const rng = createRng(42);
    const draws = Array.from({ length: 5000 }, () => bernoulliDraw(rng, 0.7));
    const prop = draws.filter(Boolean).length / draws.length;
    expect(prop).toBeCloseTo(0.7, 1);
  });
});

// === BEHAVIORAL TRIAL ===
describe('simulateBehavioralTrial', () => {
  it('returns RT within plausible range', () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const trial = simulateBehavioralTrial(rng, behavioralParams, basePersona, 0, i);
      expect(trial.rt).toBeGreaterThan(0);
      expect(trial.rt).toBeLessThan(5000);
    }
  });

  it('harder conditions produce higher RT on average', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const easy = Array.from({ length: 500 }, (_, i) => simulateBehavioralTrial(rng1, behavioralParams, basePersona, 0, i).rt!);
    const hard = Array.from({ length: 500 }, (_, i) => simulateBehavioralTrial(rng2, behavioralParams, basePersona, 1, i).rt!);
    const easyMean = easy.reduce((a, b) => a + b) / easy.length;
    const hardMean = hard.reduce((a, b) => a + b) / hard.length;
    expect(hardMean).toBeGreaterThan(easyMean);
  });

  it('correct is boolean', () => {
    const rng = createRng(42);
    const trial = simulateBehavioralTrial(rng, behavioralParams, basePersona, 0, 0);
    expect(typeof trial.correct).toBe('boolean');
  });
});

// === SURVEY RESPONSE ===
describe('simulateSurveyResponse', () => {
  it('response is within scale range', () => {
    const rng = createRng(42);
    for (let i = 0; i < 100; i++) {
      const trial = simulateSurveyResponse(rng, surveyParams, basePersona, i % 10, 0);
      expect(trial.response).toBeGreaterThanOrEqual(1);
      expect(trial.response).toBeLessThanOrEqual(surveyParams.scalePoints);
    }
  });

  it('rt is null for survey', () => {
    const rng = createRng(42);
    const trial = simulateSurveyResponse(rng, surveyParams, basePersona, 0, 0);
    expect(trial.rt).toBeNull();
  });

  it('high acquiescence shifts responses higher', () => {
    const highAcq: PersonaDefinition = { ...basePersona, acquiescenceBias: 0.8 };
    const rng1 = createRng(42);
    const rng2 = createRng(42);
    const normal = Array.from({ length: 500 }, (_, i) => simulateSurveyResponse(rng1, surveyParams, basePersona, i % 10, 0).response);
    const biased = Array.from({ length: 500 }, (_, i) => simulateSurveyResponse(rng2, surveyParams, highAcq, i % 10, 0).response);
    const normalMean = normal.reduce((a, b) => a + b) / normal.length;
    const biasedMean = biased.reduce((a, b) => a + b) / biased.length;
    expect(biasedMean).toBeGreaterThan(normalMean);
  });
});

// === PARTICIPANT ===
describe('simulateParticipant', () => {
  const design: ExperimentDesign = {
    id: 'test', name: 'Test', paradigmId: 'stroop', personaIds: ['test'],
    params: behavioralParams, nParticipantsPerPersona: 20,
    hypotheses: [], rationale: '', internRole: 'scout',
  };

  it('within-subject: trials contain all conditions', () => {
    const p = simulateParticipant(design, basePersona, 0, 42);
    const conditions = new Set(p.trials.map(t => t.condition));
    expect(conditions.size).toBe(2);
    expect(conditions.has('easy')).toBe(true);
    expect(conditions.has('hard')).toBe(true);
  });

  it('correct number of trials', () => {
    const p = simulateParticipant(design, basePersona, 0, 42);
    expect(p.trials.length).toBe(30); // 15 per condition * 2
  });

  it('deterministic with same seed', () => {
    const a = simulateParticipant(design, basePersona, 0, 42);
    const b = simulateParticipant(design, basePersona, 0, 42);
    expect(a.trials.length).toBe(b.trials.length);
    for (let i = 0; i < a.trials.length; i++) {
      expect(a.trials[i].rt).toBe(b.trials[i].rt);
    }
  });
});

// === PILOT ===
describe('simulatePilot', () => {
  const design: ExperimentDesign = {
    id: 'pilot-test', name: 'Test', paradigmId: 'stroop', personaIds: ['test'],
    params: behavioralParams, nParticipantsPerPersona: 10,
    hypotheses: [], rationale: '', internRole: 'scout',
  };

  it('correct number of participants', () => {
    const dataset = simulatePilot(design, [basePersona], 42);
    expect(dataset.participants.length).toBe(10);
  });

  it('multiple personas multiply participants', () => {
    const persona2: PersonaDefinition = { ...basePersona, id: 'test2', name: 'Test 2' };
    const dataset = simulatePilot(design, [basePersona, persona2], 42);
    expect(dataset.participants.length).toBe(20);
  });

  it('deterministic with same seed', () => {
    const a = simulatePilot(design, [basePersona], 42);
    const b = simulatePilot(design, [basePersona], 42);
    expect(a.participants[0].trials[0].rt).toBe(b.participants[0].trials[0].rt);
  });

  it('different seeds produce different data', () => {
    const a = simulatePilot(design, [basePersona], 42);
    const b = simulatePilot(design, [basePersona], 99);
    const sameRt = a.participants[0].trials.filter((t, i) => t.rt === b.participants[0].trials[i].rt).length;
    expect(sameRt).toBeLessThan(a.participants[0].trials.length / 2);
  });
});
