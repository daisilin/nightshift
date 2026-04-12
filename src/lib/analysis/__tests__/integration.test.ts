import { describe, it, expect } from 'vitest';
import { runAnalysisPipeline, defaultBatteryPlan, defaultSingleTaskPlan } from '../registry';
import { simulatePilot } from '../../simulation';
import { taskBank } from '../../../data/taskBank';
import { personaBank } from '../../../data/personaBank';
import type { ExperimentDesign } from '../../types';
import type { AnalysisInput } from '../types';

// Simulate what DispatchPage does: create designs, simulate, run pipeline

function makeDesign(paradigmId: string): ExperimentDesign {
  const p = taskBank.find(t => t.id === paradigmId)!;
  return {
    id: `test-${paradigmId}`, name: p.name, paradigmId,
    personaIds: ['college-student', 'mturk-worker', 'older-adult'],
    params: p.defaultParams, nParticipantsPerPersona: 15,
    hypotheses: ['test'], rationale: 'test', internRole: 'scout',
  };
}

const personas = personaBank.filter(p => ['college-student', 'mturk-worker', 'older-adult'].includes(p.id));

describe('Full integration: reproducing a multi-task battery', () => {
  // Like the "Correlates of Planning" paper: multiple tasks, same participants
  const paradigmIds = ['tower-of-london', 'four-in-a-row', 'stroop', 'corsi-block', 'n-back'];
  const designs = paradigmIds.map(makeDesign);
  const paradigms = paradigmIds.map(id => taskBank.find(t => t.id === id)!);
  const datasets = designs.map(d => simulatePilot(d, personas, 42));

  const input: AnalysisInput = { datasets, designs, paradigms, personas };

  it('battery plan includes correlation matrix and factor analysis', () => {
    const plan = defaultBatteryPlan(5);
    const stepIds = plan.steps.map(s => s.id);
    expect(stepIds).toContain('correlation-matrix');
    expect(stepIds).toContain('exploratory-fa');
    expect(stepIds).toContain('descriptive-stats');
    expect(stepIds).toContain('split-half-reliability');
  });

  it('pipeline produces non-empty results for every step', () => {
    const plan = defaultBatteryPlan(5);
    const results = runAnalysisPipeline(plan, input);
    expect(results.length).toBeGreaterThanOrEqual(6);
    for (const r of results) {
      expect(r.stepId).toBeTruthy();
      expect(r.type).toBeTruthy();
      expect(r.data).toBeTruthy();
    }
  });

  it('descriptive stats has rows for every task × persona × condition', () => {
    const results = runAnalysisPipeline({ steps: [{ id: 'descriptive-stats' }] }, input);
    const table = results[0].data;
    // 5 tasks × 3 personas × 2+ conditions each = many rows
    expect(table.rows.length).toBeGreaterThan(20);
    // Every row has a non-zero mean
    for (const row of table.rows) {
      expect(row[4]).not.toBe(0); // mean column
    }
  });

  it('correlation matrix is 5×5 with values in [-1, 1]', () => {
    const results = runAnalysisPipeline(
      { steps: [{ id: 'correlation-matrix', params: { permutations: 50 } }] }, input
    );
    const matrix = results[0].data;
    expect(matrix.labels.length).toBe(5);
    expect(matrix.values.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(matrix.values[i][i]).toBe(1); // diagonal
      for (let j = 0; j < 5; j++) {
        expect(matrix.values[i][j]).toBeGreaterThanOrEqual(-1);
        expect(matrix.values[i][j]).toBeLessThanOrEqual(1);
      }
    }
    // p-values exist
    expect(matrix.pValues.length).toBe(5);
  });

  it('factor analysis produces loadings for all 5 tasks × 2 factors', () => {
    const results = runAnalysisPipeline(
      { steps: [{ id: 'exploratory-fa', params: { nFactors: 2 } }] }, input
    );
    const fa = results[0].data;
    expect(fa.tasks.length).toBe(5);
    expect(fa.loadings.length).toBe(5);
    expect(fa.loadings[0].length).toBe(2);
    expect(fa.varianceExplained.length).toBe(2);
    expect(fa.totalVariance).toBeGreaterThan(0);
  });

  it('split-half reliability returns values for all 5 tasks', () => {
    const results = runAnalysisPipeline({ steps: [{ id: 'split-half-reliability' }] }, input);
    expect(results[0].data.rows.length).toBe(5);
    for (const row of results[0].data.rows) {
      // Spearman-Brown corrected r should be between 0 and 1
      expect(row[2]).toBeGreaterThanOrEqual(0);
      expect(row[2]).toBeLessThanOrEqual(1);
    }
  });

  it('single-task plan works and produces results', () => {
    const singleInput: AnalysisInput = {
      datasets: [datasets[0]], designs: [designs[0]], paradigms: [paradigms[0]], personas,
    };
    const results = runAnalysisPipeline(defaultSingleTaskPlan(), singleInput);
    expect(results.length).toBeGreaterThanOrEqual(4);
    // Should NOT have correlation matrix (single task)
    expect(results.find(r => r.stepId === 'correlation-matrix')).toBeUndefined();
  });
});
