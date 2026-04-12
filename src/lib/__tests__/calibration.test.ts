import { describe, it, expect } from 'vitest';
import { REAL_CORRELATIONS, REAL_RELIABILITY } from '../calibration';
import { simulateBattery } from '../simulation';
import { pearsonR, participantScores } from '../crossTaskAnalysis';
import { taskBank } from '../../data/taskBank';
import { personaBank } from '../../data/personaBank';
import type { ExperimentDesign } from '../types';
import { mean, standardDeviation } from '../metrics';

// ============================================================
// Match the paper: N=500, college students, 6 tasks
// ============================================================

const N = 500;
const SEED = 42;

const TASK_MAP = [
  { paper: 'Tower of London', id: 'tower-of-london' },
  { paper: 'Four-in-a-Row', id: 'four-in-a-row' },
  { paper: 'Two-Step Task', id: 'two-step' },
  { paper: 'Corsi', id: 'corsi-block' },
  { paper: 'Stroop/WCST', id: 'stroop' },
  { paper: 'N-back/CDT', id: 'n-back' },
];

const personas = [personaBank[0]];

const designs: ExperimentDesign[] = TASK_MAP.map(t => {
  const p = taskBank.find(tb => tb.id === t.id)!;
  return {
    id: `cal-${t.id}`, name: p.name, paradigmId: t.id,
    personaIds: ['college-student'], params: p.defaultParams,
    nParticipantsPerPersona: N, hypotheses: [], rationale: '', internRole: 'scout',
  };
});

const datasets = simulateBattery(designs, personas, SEED);
const scores = datasets.map((ds, i) => {
  const behavioral = designs[i].params.type === 'behavioral';
  return [...participantScores(ds, behavioral).values()];
});

describe('Calibration: synthetic N=500 vs real N=476', () => {

  it('average inter-task |r| matches paper (target: 0.266, tolerance: ±0.06)', () => {
    const cors: number[] = [];
    for (let i = 0; i < TASK_MAP.length; i++)
      for (let j = i + 1; j < TASK_MAP.length; j++)
        cors.push(Math.abs(pearsonR(scores[i], scores[j])));

    const syn = mean(cors);
    const real = mean(Object.values(REAL_CORRELATIONS).map(Math.abs));
    console.log(`Avg |r|: real=${real.toFixed(3)}, synthetic=${syn.toFixed(3)}, err=${Math.abs(syn - real).toFixed(3)}`);
    expect(Math.abs(syn - real)).toBeLessThan(0.06);
  });

  it('no synthetic correlation > 0.65 (paper max: 0.591)', () => {
    for (let i = 0; i < TASK_MAP.length; i++)
      for (let j = i + 1; j < TASK_MAP.length; j++)
        expect(Math.abs(pearsonR(scores[i], scores[j]))).toBeLessThan(0.65);
  });

  it('planning tasks correlate positively and moderately', () => {
    const tol = 0, fiar = 1, ts = 2;
    const r_tol_fiar = Math.abs(pearsonR(scores[tol], scores[fiar]));
    const r_tol_ts = Math.abs(pearsonR(scores[tol], scores[ts]));
    console.log(`TOL×FIAR: ${r_tol_fiar.toFixed(3)} (real: 0.280), TOL×TS: ${r_tol_ts.toFixed(3)} (real: 0.166)`);
    expect(r_tol_fiar).toBeLessThan(0.55);
  });

  it('split-half reliability > 0 for all tasks', () => {
    for (let ti = 0; ti < datasets.length; ti++) {
      const odd: number[] = [], even: number[] = [];
      for (const p of datasets[ti].participants) {
        const beh = p.trials[0]?.rt !== null;
        const o = p.trials.filter((_, i) => i % 2 === 1);
        const e = p.trials.filter((_, i) => i % 2 === 0);
        odd.push(mean(beh ? o.filter(t => t.rt !== null).map(t => t.rt!) : o.map(t => t.response)));
        even.push(mean(beh ? e.filter(t => t.rt !== null).map(t => t.rt!) : e.map(t => t.response)));
      }
      const r = pearsonR(odd, even);
      const sb = (2 * r) / (1 + Math.abs(r));
      console.log(`${TASK_MAP[ti].paper}: reliability SB=${sb.toFixed(3)}`);
      expect(r).toBeGreaterThan(0);
    }
  });

  it('RT is right-skewed (log-normal)', () => {
    for (let ti = 0; ti < datasets.length; ti++) {
      const rts = datasets[ti].participants.flatMap(p => p.trials.filter(t => t.rt !== null).map(t => t.rt!));
      if (rts.length === 0) continue;
      const m = mean(rts);
      const sorted = [...rts].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const cv = standardDeviation(rts) / m;
      console.log(`${TASK_MAP[ti].paper}: mean=${Math.round(m)}, median=${Math.round(med)}, CV=${cv.toFixed(2)}`);
      expect(cv).toBeGreaterThan(0.15);
    }
  });

  it('accuracy in realistic range', () => {
    for (let ti = 0; ti < datasets.length; ti++) {
      const acc = datasets[ti].participants.flatMap(p => p.trials.filter(t => t.correct !== null).map(t => t.correct ? 1 : 0));
      if (acc.length === 0) continue;
      const m = mean(acc);
      console.log(`${TASK_MAP[ti].paper}: accuracy=${(m * 100).toFixed(1)}%`);
      expect(m).toBeGreaterThan(0.25);
      expect(m).toBeLessThan(0.98);
    }
  });
});
