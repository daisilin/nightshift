import type { AnalysisStepDef, AnalysisInput, AnalysisResult, TableData } from './types';
import { mean, ceilingCheck, floorCheck, outlierDetection } from '../metrics';

/** Ceiling/floor check per task × persona */
export const ceilingFloorCheck: AnalysisStepDef = {
  id: 'ceiling-floor',
  name: 'Ceiling & Floor Effects',
  category: 'quality',
  requires: 'any',
  execute: (input: AnalysisInput): AnalysisResult => {
    const headers = ['Task', 'Persona', 'Ceiling %', 'Floor %', 'Flag'];
    const rows: (string | number)[][] = [];

    for (let di = 0; di < input.datasets.length; di++) {
      const ds = input.datasets[di];
      const design = input.designs[di];
      const paradigm = input.paradigms[di];
      const isBehavioral = design.params.type === 'behavioral';

      const byPersona = new Map<string, number[]>();
      for (const p of ds.participants) {
        const vals = byPersona.get(p.personaId) ?? [];
        for (const t of p.trials) {
          vals.push(isBehavioral ? (t.correct ? 1 : 0) : t.response);
        }
        byPersona.set(p.personaId, vals);
      }

      const range: [number, number] = isBehavioral ? [0, 1] : [1, design.params.type === 'survey' ? design.params.scalePoints : 5];

      for (const [pid, vals] of byPersona) {
        const persona = input.personas.find(p => p.id === pid);
        const ceil = ceilingCheck(vals, range);
        const floor = floorCheck(vals, range);
        const flags = [ceil.flag, floor.flag].filter(Boolean).join(', ') || 'clean';

        rows.push([
          paradigm?.name ?? design.paradigmId,
          persona?.name ?? pid,
          ceil.value,
          floor.value,
          flags,
        ]);
      }
    }

    return {
      stepId: 'ceiling-floor',
      type: 'table',
      title: 'Ceiling & Floor Analysis',
      data: { headers, rows } as TableData,
    };
  },
};

/** Outlier detection per task */
export const outlierCheck: AnalysisStepDef = {
  id: 'outlier-detection',
  name: 'Outlier Detection',
  category: 'quality',
  requires: 'any',
  execute: (input: AnalysisInput): AnalysisResult => {
    const headers = ['Task', 'Outlier %', 'Flag'];
    const rows: (string | number)[][] = [];

    for (let di = 0; di < input.datasets.length; di++) {
      const ds = input.datasets[di];
      const design = input.designs[di];
      const paradigm = input.paradigms[di];
      const isBehavioral = design.params.type === 'behavioral';

      const pMeans = ds.participants.map(p => {
        const vals = isBehavioral
          ? p.trials.filter(t => t.rt !== null).map(t => t.rt!)
          : p.trials.map(t => t.response);
        return mean(vals);
      });

      const result = outlierDetection(pMeans);
      rows.push([paradigm?.name ?? design.paradigmId, result.value, result.flag || 'clean']);
    }

    return {
      stepId: 'outlier-detection',
      type: 'table',
      title: 'Outlier Detection (MAD-based)',
      data: { headers, rows } as TableData,
    };
  },
};
