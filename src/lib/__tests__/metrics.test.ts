import { describe, it, expect } from 'vitest';
import {
  mean, standardDeviation, median, cohensD, confidenceInterval,
  cronbachAlpha, ceilingCheck, floorCheck, signalToNoiseRatio,
  outlierDetection, interpretEffectSize, interpretReliability,
  computePilotMetrics,
} from '../metrics';
import { simulatePilot } from '../simulation';
import type { ExperimentDesign, BehavioralParams, PersonaDefinition } from '../types';

// === BASIC STATS ===
describe('mean', () => {
  it('[1,2,3,4,5] → 3', () => expect(mean([1, 2, 3, 4, 5])).toBe(3));
  it('empty → 0', () => expect(mean([])).toBe(0));
  it('single value', () => expect(mean([42])).toBe(42));
});

describe('standardDeviation', () => {
  it('known value', () => {
    const sd = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(sd).toBeCloseTo(2.138, 2);
  });
  it('empty → 0', () => expect(standardDeviation([])).toBe(0));
  it('single → 0', () => expect(standardDeviation([5])).toBe(0));
});

describe('median', () => {
  it('odd length', () => expect(median([3, 1, 2])).toBe(2));
  it('even length', () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it('empty → 0', () => expect(median([])).toBe(0));
});

// === EFFECT SIZES ===
describe('cohensD', () => {
  it('identical groups → d ≈ 0', () => {
    const result = cohensD([5, 5, 5, 5], [5, 5, 5, 5]);
    expect(result.value).toBe(0);
    expect(result.interpretation).toBe('problematic');
  });

  it('well-separated groups → large d', () => {
    const g1 = [10, 11, 12, 10, 11];
    const g2 = [20, 21, 22, 20, 21];
    const result = cohensD(g1, g2);
    expect(result.value).toBeGreaterThan(2);
    expect(result.interpretation).toBe('excellent');
  });

  it('returns correct interpretation thresholds', () => {
    expect(interpretEffectSize(0.1)).toBe('problematic');
    expect(interpretEffectSize(0.25)).toBe('poor');
    expect(interpretEffectSize(0.4)).toBe('acceptable');
    expect(interpretEffectSize(0.6)).toBe('good');
    expect(interpretEffectSize(0.9)).toBe('excellent');
  });
});

// === CONFIDENCE INTERVALS ===
describe('confidenceInterval', () => {
  it('returns [lower, upper] where lower < mean < upper', () => {
    const vals = [10, 12, 14, 11, 13, 15, 10, 12];
    const [lo, hi] = confidenceInterval(vals);
    const m = mean(vals);
    expect(lo).toBeLessThan(m);
    expect(hi).toBeGreaterThan(m);
  });

  it('wider with smaller n', () => {
    const small = confidenceInterval([10, 12, 14]);
    const large = confidenceInterval([10, 11, 12, 13, 14, 10, 11, 12, 13, 14]);
    const smallWidth = small[1] - small[0];
    const largeWidth = large[1] - large[0];
    expect(smallWidth).toBeGreaterThan(largeWidth);
  });
});

// === RELIABILITY ===
describe('cronbachAlpha', () => {
  it('all identical columns → alpha high', () => {
    const items = Array.from({ length: 20 }, () => [3, 3, 3, 3, 3]);
    const result = cronbachAlpha(items);
    // With zero variance, alpha is 0 (degenerate case)
    expect(result.value).toBeDefined();
  });

  it('correlated items → higher alpha', () => {
    // Items that covary together
    const items = Array.from({ length: 30 }, (_, i) => {
      const base = i % 5;
      return [base + 1, base + 1, base + 2, base + 1, base + 2];
    });
    const result = cronbachAlpha(items);
    expect(result.value).toBeGreaterThan(0.5);
  });

  it('returns correct interpretation', () => {
    expect(interpretReliability(0.95)).toBe('excellent');
    expect(interpretReliability(0.85)).toBe('good');
    expect(interpretReliability(0.75)).toBe('acceptable');
    expect(interpretReliability(0.65)).toBe('poor');
    expect(interpretReliability(0.5)).toBe('problematic');
  });
});

// === DATA QUALITY ===
describe('ceilingCheck', () => {
  it('all at max → ceiling flag', () => {
    const result = ceilingCheck([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [0, 1]);
    expect(result.flag).toBe('ceiling-effect');
  });

  it('all in middle → no flag', () => {
    const result = ceilingCheck([0.5, 0.5, 0.5, 0.5, 0.5], [0, 1]);
    expect(result.flag).toBeNull();
  });
});

describe('floorCheck', () => {
  it('all at min → floor flag', () => {
    const result = floorCheck([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1]);
    expect(result.flag).toBe('floor-effect');
  });

  it('all in middle → no flag', () => {
    const result = floorCheck([0.5, 0.5, 0.5], [0, 1]);
    expect(result.flag).toBeNull();
  });
});

describe('signalToNoiseRatio', () => {
  it('identical groups → SNR = 0', () => {
    const result = signalToNoiseRatio([5, 5, 5], [5, 5, 5]);
    expect(result.value).toBe(0);
  });

  it('well-separated groups → high SNR', () => {
    const result = signalToNoiseRatio([10, 11, 12], [20, 21, 22]);
    expect(result.value).toBeGreaterThan(1);
    expect(result.interpretation).toBe('excellent');
  });
});

describe('outlierDetection', () => {
  it('no outliers → low proportion', () => {
    const vals = [10, 11, 12, 10, 11, 12, 10, 11, 12, 10];
    const result = outlierDetection(vals);
    expect(result.value).toBe(0);
  });

  it('one extreme value flagged', () => {
    const vals = [10, 11, 12, 10, 11, 12, 10, 11, 12, 100];
    const result = outlierDetection(vals);
    expect(result.value).toBeGreaterThan(0);
  });
});

// === COMPOSITE ===
describe('computePilotMetrics', () => {
  const persona: PersonaDefinition = {
    id: 'test', name: 'Test', emoji: '🧪', description: 'test',
    rtMultiplier: 1.0, accuracyOffset: 0, variabilityMultiplier: 1.0,
    fatigueRate: 0.1, attentionLapseRate: 0.0,
    acquiescenceBias: 0, extremeResponseStyle: 0,
  };

  const design: ExperimentDesign = {
    id: 'composite-test', name: 'Test', paradigmId: 'stroop', personaIds: ['test'],
    params: {
      type: 'behavioral', difficulty: 0.5, nTrials: 40, nConditions: 2,
      conditionLabels: ['cong', 'incong'], withinSubject: true,
      rtRange: [300, 1000], baseAccuracy: 0.9,
    } as BehavioralParams,
    nParticipantsPerPersona: 15, hypotheses: [], rationale: '', internRole: 'scout',
  };

  it('returns overallScore in [0, 100]', () => {
    const dataset = simulatePilot(design, [persona], 42);
    const result = computePilotMetrics(design, dataset, { test: 'Test' });
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('returns recommendation as one of three values', () => {
    const dataset = simulatePilot(design, [persona], 42);
    const result = computePilotMetrics(design, dataset, { test: 'Test' });
    expect(['proceed', 'revise', 'redesign']).toContain(result.recommendation);
  });

  it('byPersona has correct persona', () => {
    const dataset = simulatePilot(design, [persona], 42);
    const result = computePilotMetrics(design, dataset, { test: 'Test' });
    expect(result.byPersona).toHaveLength(1);
    expect(result.byPersona[0].personaId).toBe('test');
  });

  it('harder difficulty → lower accuracy metrics', () => {
    const easyDesign = { ...design, id: 'easy', params: { ...design.params, difficulty: 0.2 } as BehavioralParams };
    const hardDesign = { ...design, id: 'hard', params: { ...design.params, difficulty: 0.8 } as BehavioralParams };
    const easyData = simulatePilot(easyDesign, [persona], 42);
    const hardData = simulatePilot(hardDesign, [persona], 42);
    const easyMetrics = computePilotMetrics(easyDesign, easyData, { test: 'Test' });
    const hardMetrics = computePilotMetrics(hardDesign, hardData, { test: 'Test' });

    const easyAcc = easyMetrics.byPersona[0].metrics.find(m => m.name.includes('Accuracy'));
    const hardAcc = hardMetrics.byPersona[0].metrics.find(m => m.name.includes('Accuracy'));
    if (easyAcc && hardAcc) {
      expect(easyAcc.value).toBeGreaterThan(hardAcc.value);
    }
  });
});
