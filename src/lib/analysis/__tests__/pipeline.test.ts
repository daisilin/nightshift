import { describe, it, expect } from 'vitest';
import { runAnalysisPipeline, defaultSingleTaskPlan, defaultBatteryPlan, getStep } from '../registry';
import { simulatePilot } from '../../simulation';
import { taskBank } from '../../../data/taskBank';
import { personaBank } from '../../../data/personaBank';
import type { ExperimentDesign } from '../../types';
import type { AnalysisInput } from '../types';

function makeDesign(paradigmId: string, overrides?: Partial<ExperimentDesign>): ExperimentDesign {
  const paradigm = taskBank.find(t => t.id === paradigmId)!;
  return {
    id: `test-${paradigmId}`,
    name: `Test ${paradigm.name}`,
    paradigmId,
    personaIds: ['college-student', 'mturk-worker'],
    params: paradigm.defaultParams,
    nParticipantsPerPersona: 15,
    hypotheses: ['test'],
    rationale: 'test',
    internRole: 'scout',
    ...overrides,
  };
}

const personas = personaBank.filter(p => ['college-student', 'mturk-worker'].includes(p.id));

describe('Analysis Pipeline', () => {
  describe('registry', () => {
    it('getStep returns defined steps', () => {
      expect(getStep('descriptive-stats')).toBeTruthy();
      expect(getStep('correlation-matrix')).toBeTruthy();
      expect(getStep('exploratory-fa')).toBeTruthy();
      expect(getStep('nonexistent')).toBeUndefined();
    });
  });

  describe('single-task plan', () => {
    const design = makeDesign('stroop');
    const dataset = simulatePilot(design, personas, 42);
    const paradigm = taskBank.find(t => t.id === 'stroop')!;
    const input: AnalysisInput = {
      datasets: [dataset], designs: [design], paradigms: [paradigm], personas,
    };

    it('runs all single-task steps', () => {
      const results = runAnalysisPipeline(defaultSingleTaskPlan(), input);
      expect(results.length).toBeGreaterThanOrEqual(4);
    });

    it('descriptive-stats produces a table', () => {
      const results = runAnalysisPipeline({ steps: [{ id: 'descriptive-stats' }] }, input);
      expect(results[0].type).toBe('table');
      expect(results[0].data.headers).toContain('Mean');
      expect(results[0].data.rows.length).toBeGreaterThan(0);
    });

    it('split-half-reliability produces a table', () => {
      const results = runAnalysisPipeline({ steps: [{ id: 'split-half-reliability' }] }, input);
      expect(results[0].type).toBe('table');
      expect(results[0].data.rows.length).toBe(1); // one task
    });

    it('skips multi-task steps for single task', () => {
      const results = runAnalysisPipeline({ steps: [{ id: 'correlation-matrix' }] }, input);
      expect(results.length).toBe(0); // skipped
    });

    it('condition-effects returns effect sizes', () => {
      const results = runAnalysisPipeline({ steps: [{ id: 'condition-effects' }] }, input);
      expect(results[0].data.rows.length).toBeGreaterThan(0);
    });
  });

  describe('battery plan', () => {
    const paradigmIds = ['stroop', 'tower-of-london', 'n-back', 'corsi-block'];
    const designs = paradigmIds.map(id => makeDesign(id));
    const paradigms = paradigmIds.map(id => taskBank.find(t => t.id === id)!);
    const datasets = designs.map(d => simulatePilot(d, personas, 42));
    const input: AnalysisInput = { datasets, designs, paradigms, personas };

    it('runs battery plan including multivariate', () => {
      const plan = defaultBatteryPlan(4);
      const results = runAnalysisPipeline(plan, input);
      const stepIds = results.map(r => r.stepId);
      expect(stepIds).toContain('correlation-matrix');
      expect(stepIds).toContain('exploratory-fa');
    });

    it('correlation-matrix returns NxN matrix', () => {
      const results = runAnalysisPipeline({ steps: [{ id: 'correlation-matrix', params: { permutations: 50 } }] }, input);
      expect(results[0].type).toBe('matrix');
      expect(results[0].data.labels.length).toBe(4);
      expect(results[0].data.values.length).toBe(4);
      expect(results[0].data.pValues.length).toBe(4);
    });

    it('correlation values are between -1 and 1', () => {
      const results = runAnalysisPipeline({ steps: [{ id: 'correlation-matrix', params: { permutations: 50 } }] }, input);
      for (const row of results[0].data.values) {
        for (const val of row) {
          expect(val).toBeGreaterThanOrEqual(-1);
          expect(val).toBeLessThanOrEqual(1);
        }
      }
    });

    it('exploratory-fa returns factor loadings', () => {
      const results = runAnalysisPipeline({ steps: [{ id: 'exploratory-fa', params: { nFactors: 2 } }] }, input);
      expect(results[0].type).toBe('factor-loadings');
      expect(results[0].data.tasks.length).toBe(4);
      expect(results[0].data.loadings.length).toBe(4);
      expect(results[0].data.loadings[0].length).toBe(2);
    });

    it('descriptive-stats covers all tasks and personas', () => {
      const results = runAnalysisPipeline({ steps: [{ id: 'descriptive-stats' }] }, input);
      expect(results[0].data.rows.length).toBeGreaterThan(8); // 4 tasks × 2+ conditions × 2 personas
    });
  });
});
