import type { AnalysisStepDef, AnalysisInput, AnalysisResult, TableData } from './types';
import { mean, cohensD } from '../metrics';

/** Cohen's d between conditions per task */
export const conditionEffects: AnalysisStepDef = {
  id: 'condition-effects',
  name: 'Condition Effect Sizes',
  category: 'effect',
  requires: 'any',
  execute: (input: AnalysisInput): AnalysisResult => {
    const headers = ['Task', 'Comparison', "Cohen's d", 'Interpretation'];
    const rows: (string | number)[][] = [];

    for (let di = 0; di < input.datasets.length; di++) {
      const ds = input.datasets[di];
      const design = input.designs[di];
      const paradigm = input.paradigms[di];
      if (design.params.type !== 'behavioral') continue;

      const byCondition = new Map<string, number[]>();
      for (const p of ds.participants) {
        for (const t of p.trials) {
          if (t.rt === null) continue;
          const vals = byCondition.get(t.condition) ?? [];
          vals.push(t.rt);
          byCondition.set(t.condition, vals);
        }
      }

      const conditions = [...byCondition.keys()];
      for (let i = 0; i < conditions.length; i++) {
        for (let j = i + 1; j < conditions.length; j++) {
          const d = cohensD(byCondition.get(conditions[i])!, byCondition.get(conditions[j])!);
          rows.push([
            paradigm?.name ?? design.paradigmId,
            `${conditions[i]} vs ${conditions[j]}`,
            d.value,
            d.interpretation,
          ]);
        }
      }
    }

    return {
      stepId: 'condition-effects',
      type: 'table',
      title: 'Condition Effect Sizes (RT)',
      data: { headers, rows } as TableData,
    };
  },
};

/** Between-persona comparison per task */
export const personaDifferences: AnalysisStepDef = {
  id: 'persona-differences',
  name: 'Population Differences',
  category: 'effect',
  requires: 'any',
  execute: (input: AnalysisInput): AnalysisResult => {
    const headers = ['Task', 'Comparison', "Cohen's d", 'Interpretation'];
    const rows: (string | number)[][] = [];

    for (let di = 0; di < input.datasets.length; di++) {
      const ds = input.datasets[di];
      const design = input.designs[di];
      const paradigm = input.paradigms[di];
      const isBehavioral = design.params.type === 'behavioral';

      const byPersona = new Map<string, number[]>();
      for (const p of ds.participants) {
        const persona = input.personas.find(pp => pp.id === p.personaId);
        const key = persona?.name ?? p.personaId;
        const vals = byPersona.get(key) ?? [];
        const pMean = mean(
          isBehavioral
            ? p.trials.filter(t => t.rt !== null).map(t => t.rt!)
            : p.trials.map(t => t.response)
        );
        vals.push(pMean);
        byPersona.set(key, vals);
      }

      const personas = [...byPersona.keys()];
      for (let i = 0; i < personas.length; i++) {
        for (let j = i + 1; j < personas.length; j++) {
          const d = cohensD(byPersona.get(personas[i])!, byPersona.get(personas[j])!);
          rows.push([
            paradigm?.name ?? design.paradigmId,
            `${personas[i]} vs ${personas[j]}`,
            d.value,
            d.interpretation,
          ]);
        }
      }
    }

    return {
      stepId: 'persona-differences',
      type: 'table',
      title: 'Population Differences',
      data: { headers, rows } as TableData,
    };
  },
};
