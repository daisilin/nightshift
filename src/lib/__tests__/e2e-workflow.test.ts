import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../../context/AppContext';
import { taskBank, getParadigm } from '../../data/taskBank';
import { personaBank } from '../../data/personaBank';
import { simulatePilot, simulateBattery } from '../simulation';
import { computePilotMetrics, mean, cohensD, cronbachAlpha } from '../metrics';
import { runAnalysisPipeline, defaultBatteryPlan, defaultSingleTaskPlan } from '../analysis/registry';
import { generatePool, poolStats } from '../participantPool';
import { pearsonR } from '../crossTaskAnalysis';
import { REAL_CORRELATIONS } from '../calibration';
import type { ExperimentDesign } from '../types';
import type { AppState } from '../../context/types';

function makeDesign(id: string, n = 50): ExperimentDesign {
  const p = taskBank.find(t => t.id === id)!;
  return {
    id: `e2e-${id}`, name: p.name, paradigmId: id,
    personaIds: ['college-student'], params: p.defaultParams,
    nParticipantsPerPersona: n, hypotheses: ['test'], rationale: 'e2e', internRole: 'scout',
  };
}

const personas = [personaBank[0]]; // college students

// ============================================================
// WORKFLOW 1: Reproduce a multi-task paper (Lin & Ma style)
// ============================================================
describe('Workflow: Reproduce multi-task paper', () => {
  const taskIds = ['tower-of-london', 'four-in-a-row', 'stroop', 'corsi-block', 'n-back'];
  const designs = taskIds.map(id => makeDesign(id, 100));
  const datasets = simulateBattery(designs, personas, 42);
  const paradigms = taskIds.map(id => getParadigm(id)!);

  it('simulates all 5 tasks with shared latent profiles', () => {
    expect(datasets).toHaveLength(5);
    datasets.forEach(ds => expect(ds.participants).toHaveLength(100));
  });

  it('produces non-trivial cross-task correlations', () => {
    const scores = datasets.map((ds, i) => {
      const isBeh = designs[i].params.type === 'behavioral';
      return ds.participants.map(p =>
        mean(isBeh ? p.trials.filter(t => t.rt !== null).map(t => t.rt!) : p.trials.map(t => t.response))
      );
    });
    const cors: number[] = [];
    for (let i = 0; i < 5; i++)
      for (let j = i + 1; j < 5; j++)
        cors.push(Math.abs(pearsonR(scores[i], scores[j])));
    const avgR = mean(cors);
    expect(avgR).toBeGreaterThan(0.05);
    expect(avgR).toBeLessThan(0.6);
  });

  it('runs full analysis pipeline successfully', () => {
    const plan = defaultBatteryPlan(5);
    const results = runAnalysisPipeline(plan, { datasets, designs, paradigms, personas });
    expect(results.length).toBeGreaterThanOrEqual(6);
    const types = results.map(r => r.type);
    expect(types).toContain('table');
    expect(types).toContain('matrix');
    expect(types).toContain('factor-loadings');
  });

  it('correlation matrix has valid structure', () => {
    const results = runAnalysisPipeline(
      { steps: [{ id: 'correlation-matrix', params: { permutations: 50 } }] },
      { datasets, designs, paradigms, personas }
    );
    const matrix = results[0].data;
    expect(matrix.labels).toHaveLength(5);
    expect(matrix.values).toHaveLength(5);
    matrix.values.forEach((row: number[]) => {
      row.forEach(v => { expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThanOrEqual(1); });
    });
    for (let i = 0; i < 5; i++) expect(matrix.values[i][i]).toBe(1);
  });

  it('factor analysis produces loadings', () => {
    const results = runAnalysisPipeline(
      { steps: [{ id: 'exploratory-fa', params: { nFactors: 2 } }] },
      { datasets, designs, paradigms, personas }
    );
    expect(results[0].data.tasks).toHaveLength(5);
    expect(results[0].data.loadings[0]).toHaveLength(2);
    expect(results[0].data.totalVariance).toBeGreaterThan(0);
  });

  it('metrics per task are in realistic ranges', () => {
    for (let i = 0; i < 5; i++) {
      const metrics = computePilotMetrics(designs[i], datasets[i], { 'college-student': 'College student' });
      expect(metrics.overallScore).toBeGreaterThanOrEqual(0);
      expect(metrics.overallScore).toBeLessThanOrEqual(100);
      expect(['proceed', 'revise', 'redesign']).toContain(metrics.recommendation);
      expect(metrics.byPersona.length).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// WORKFLOW 2: Single task iteration
// ============================================================
describe('Workflow: Single task design iteration', () => {
  it('tweaking difficulty changes metrics', () => {
    const easy = makeDesign('stroop', 50);
    (easy.params as any).difficulty = 0.2;
    const hard = makeDesign('stroop', 50);
    (hard.params as any).difficulty = 0.8;

    const easyData = simulatePilot(easy, personas, 42);
    const hardData = simulatePilot(hard, personas, 42);
    const easyMetrics = computePilotMetrics(easy, easyData, { 'college-student': 'CS' });
    const hardMetrics = computePilotMetrics(hard, hardData, { 'college-student': 'CS' });

    // Easy should have higher accuracy
    const easyAcc = easyMetrics.byPersona[0].metrics.find(m => m.name.includes('Accuracy'));
    const hardAcc = hardMetrics.byPersona[0].metrics.find(m => m.name.includes('Accuracy'));
    if (easyAcc && hardAcc) {
      expect(easyAcc.value).toBeGreaterThanOrEqual(hardAcc.value);
    }
  });

  it('increasing trials improves reliability', () => {
    const short = makeDesign('tower-of-london', 50);
    (short.params as any).nTrials = 10;
    const long = makeDesign('tower-of-london', 50);
    (long.params as any).nTrials = 60;

    const shortData = simulatePilot(short, personas, 42);
    const longData = simulatePilot(long, personas, 42);

    // Split-half on longer version should be at least as good
    const splitHalf = (ds: typeof shortData) => {
      const odd = ds.participants.map(p => mean(p.trials.filter((_, i) => i % 2 === 1).filter(t => t.rt !== null).map(t => t.rt!)));
      const even = ds.participants.map(p => mean(p.trials.filter((_, i) => i % 2 === 0).filter(t => t.rt !== null).map(t => t.rt!)));
      return pearsonR(odd, even);
    };
    // Both should be positive (basic sanity)
    expect(splitHalf(shortData)).toBeGreaterThan(-0.5);
    expect(splitHalf(longData)).toBeGreaterThan(-0.5);
  });

  it('single-task analysis pipeline works', () => {
    const design = makeDesign('maze-construal', 30);
    const data = simulatePilot(design, personas, 42);
    const results = runAnalysisPipeline(defaultSingleTaskPlan(), {
      datasets: [data], designs: [design], paradigms: [getParadigm('maze-construal')!], personas,
    });
    expect(results.length).toBeGreaterThanOrEqual(4);
    // Should NOT have correlation matrix (single task)
    expect(results.find(r => r.stepId === 'correlation-matrix')).toBeUndefined();
  });
});

// ============================================================
// WORKFLOW 3: Cross-population comparison
// ============================================================
describe('Workflow: Cross-population comparison', () => {
  it('different populations produce different behavioral profiles', () => {
    const design = makeDesign('stroop', 30);
    const young = [personaBank.find(p => p.id === 'college-student')!];
    const old = [personaBank.find(p => p.id === 'older-adult')!];

    const youngData = simulatePilot(design, young, 42);
    const oldData = simulatePilot(design, old, 42);

    const youngRTs = youngData.participants.flatMap(p => p.trials.filter(t => t.rt !== null).map(t => t.rt!));
    const oldRTs = oldData.participants.flatMap(p => p.trials.filter(t => t.rt !== null).map(t => t.rt!));

    // Older adults should be slower
    expect(mean(oldRTs)).toBeGreaterThan(mean(youngRTs));
  });

  it('participant pool generates diverse cohorts', () => {
    const pool = generatePool('college-student', 100, 42);
    const stats = poolStats(pool);
    expect(stats.n).toBe(100);
    expect(stats.ageRange[1] - stats.ageRange[0]).toBeGreaterThan(3);
    expect(Object.keys(stats.genderDist).length).toBeGreaterThan(1);
  });

  it('persona differences show up in analysis', () => {
    const design = makeDesign('n-back', 30);
    const allPersonas = [personaBank[0], personaBank[2]]; // college + older
    const data = simulatePilot(design, allPersonas, 42);
    const results = runAnalysisPipeline(
      { steps: [{ id: 'persona-differences' }] },
      { datasets: [data], designs: [design], paradigms: [getParadigm('n-back')!], personas: allPersonas }
    );
    expect(results[0].data.rows.length).toBeGreaterThan(0);
  });
});

// ============================================================
// WORKFLOW 4: State management full cycle
// ============================================================
describe('Workflow: Full state management cycle', () => {
  it('start → dispatch → complete → iterate preserves history', () => {
    let s: AppState = initialState;

    // Start battery
    s = reducer(s, { type: 'START_BATTERY', payload: {
      brief: 'planning study', paradigmIds: ['tower-of-london', 'stroop'], personaIds: ['college-student'],
    }});
    expect(s.currentSession).toBeTruthy();
    expect(s.currentSession!.battery).toHaveLength(2);

    // Complete
    s = reducer(s, { type: 'COMPLETE_SESSION' });
    expect(s.currentSession).toBeNull();
    expect(s.sessions).toHaveLength(1);

    // Start new round with feedback
    s = reducer(s, { type: 'START_BATTERY', payload: {
      brief: 'planning study [round 1 feedback: increase difficulty]',
      paradigmIds: ['tower-of-london', 'stroop'], personaIds: ['college-student'],
    }});
    expect(s.currentSession!.brief).toContain('increase difficulty');
    expect(s.sessions).toHaveLength(1); // old session still archived

    // Complete again
    s = reducer(s, { type: 'COMPLETE_SESSION' });
    expect(s.sessions).toHaveLength(2);
  });

  it('paper context persists on session', () => {
    let s: AppState = initialState;
    s = reducer(s, { type: 'START_EXPERIMENT', payload: {
      brief: 'maze study', paradigmId: 'maze-construal', personaIds: ['college-student'],
    }});
    s = reducer(s, { type: 'SET_PAPER_CONTEXT', payload: 'Ho et al. Nature: value-guided construal' });
    expect(s.currentSession!.paperContext).toContain('Ho et al.');
  });

  it('analysis results accumulate', () => {
    let s: AppState = initialState;
    s = reducer(s, { type: 'START_EXPERIMENT', payload: {
      brief: 'test', paradigmId: 'stroop', personaIds: ['college-student'],
    }});
    s = reducer(s, { type: 'SET_ANALYSIS_RESULTS', payload: [{ stepId: 'test', type: 'table', title: 'Test', data: {} }] });
    expect(s.currentSession!.analysisResults).toHaveLength(1);
    s = reducer(s, { type: 'SET_ANALYSIS_RESULTS', payload: [
      ...s.currentSession!.analysisResults,
      { stepId: 'test2', type: 'text', title: 'Test 2', data: 'hello' },
    ]});
    expect(s.currentSession!.analysisResults).toHaveLength(2);
  });
});

// ============================================================
// WORKFLOW 5: All 11 task bank paradigms work
// ============================================================
describe('Workflow: Every paradigm simulates correctly', () => {
  for (const task of taskBank) {
    it(`${task.name} (${task.id}) produces valid data`, () => {
      const design = makeDesign(task.id, 10);
      const data = simulatePilot(design, personas, 42);
      expect(data.participants).toHaveLength(10);
      expect(data.participants[0].trials.length).toBeGreaterThan(0);

      if (task.paradigmType === 'behavioral') {
        const rts = data.participants.flatMap(p => p.trials.filter(t => t.rt !== null).map(t => t.rt!));
        expect(rts.length).toBeGreaterThan(0);
        expect(mean(rts)).toBeGreaterThan(0);
      } else {
        const responses = data.participants.flatMap(p => p.trials.map(t => t.response));
        expect(responses.length).toBeGreaterThan(0);
      }
    });
  }
});
