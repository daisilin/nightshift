import type { AnalysisStepDef, AnalysisInput, AnalysisResult, TableData } from './types';
import { mean, standardDeviation, confidenceInterval } from '../metrics';
import { pearsonR } from '../crossTaskAnalysis';

/** Descriptive stats: mean, SD, CI, n per task × persona × condition */
export const descriptiveStats: AnalysisStepDef = {
  id: 'descriptive-stats',
  name: 'Descriptive Statistics',
  category: 'descriptive',
  requires: 'any',
  execute: (input: AnalysisInput): AnalysisResult => {
    const headers = ['Task', 'Persona', 'Condition', 'N', 'Mean', 'SD', '95% CI'];
    const rows: (string | number)[][] = [];

    for (let di = 0; di < input.datasets.length; di++) {
      const ds = input.datasets[di];
      const design = input.designs[di];
      const paradigm = input.paradigms[di];
      const isBehavioral = design.params.type === 'behavioral';

      // Group by persona × condition
      const groups = new Map<string, number[]>();
      for (const p of ds.participants) {
        const persona = input.personas.find(pp => pp.id === p.personaId);
        for (const t of p.trials) {
          const key = `${persona?.name ?? p.personaId}|||${t.condition}`;
          const vals = groups.get(key) ?? [];
          vals.push(isBehavioral ? (t.rt ?? 0) : t.response);
          groups.set(key, vals);
        }
      }

      for (const [key, vals] of groups) {
        const [personaName, condition] = key.split('|||');
        const ci = confidenceInterval(vals);
        rows.push([
          paradigm?.name ?? design.paradigmId,
          personaName,
          condition,
          vals.length,
          Math.round(mean(vals) * 100) / 100,
          Math.round(standardDeviation(vals) * 100) / 100,
          `[${ci[0]}, ${ci[1]}]`,
        ]);
      }
    }

    return {
      stepId: 'descriptive-stats',
      type: 'table',
      title: 'Descriptive Statistics',
      data: { headers, rows } as TableData,
    };
  },
};

/** Split-half reliability: odd/even trial split → Pearson r → Spearman-Brown */
export const splitHalfReliability: AnalysisStepDef = {
  id: 'split-half-reliability',
  name: 'Split-Half Reliability',
  category: 'reliability',
  requires: 'any',
  execute: (input: AnalysisInput): AnalysisResult => {
    const headers = ['Task', 'Split-Half r', 'Spearman-Brown', 'Interpretation'];
    const rows: (string | number)[][] = [];

    for (let di = 0; di < input.datasets.length; di++) {
      const ds = input.datasets[di];
      const design = input.designs[di];
      const paradigm = input.paradigms[di];
      const isBehavioral = design.params.type === 'behavioral';

      // Per participant: compute odd-trial and even-trial means
      const oddMeans: number[] = [];
      const evenMeans: number[] = [];

      for (const p of ds.participants) {
        const odd = p.trials.filter((_, i) => i % 2 === 1);
        const even = p.trials.filter((_, i) => i % 2 === 0);

        const extract = (trials: typeof p.trials) =>
          isBehavioral
            ? mean(trials.filter(t => t.rt !== null).map(t => t.rt!))
            : mean(trials.map(t => t.response));

        oddMeans.push(extract(odd));
        evenMeans.push(extract(even));
      }

      const r = pearsonR(oddMeans, evenMeans);
      const sb = (2 * r) / (1 + r); // Spearman-Brown correction
      const interp = sb >= 0.8 ? 'good' : sb >= 0.6 ? 'acceptable' : 'poor';

      rows.push([
        paradigm?.name ?? design.paradigmId,
        Math.round(r * 100) / 100,
        Math.round(sb * 100) / 100,
        interp,
      ]);
    }

    return {
      stepId: 'split-half-reliability',
      type: 'table',
      title: 'Split-Half Reliability (Spearman-Brown Corrected)',
      data: { headers, rows } as TableData,
    };
  },
};
