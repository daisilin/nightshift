import type { AnalysisStepDef, AnalysisPlan, AnalysisPlanStep, AnalysisInput, AnalysisResult } from './types';
import { descriptiveStats, splitHalfReliability } from './descriptive';
import { ceilingFloorCheck, outlierCheck } from './quality';
import { conditionEffects, personaDifferences } from './effects';
import { correlationMatrix, exploratoryFA } from './multivariate';

// === Step Registry ===

const ALL_STEPS: AnalysisStepDef[] = [
  descriptiveStats,
  splitHalfReliability,
  ceilingFloorCheck,
  outlierCheck,
  conditionEffects,
  personaDifferences,
  correlationMatrix,
  exploratoryFA,
];

const REGISTRY = new Map<string, AnalysisStepDef>(ALL_STEPS.map(s => [s.id, s]));

export function getStep(id: string): AnalysisStepDef | undefined {
  return REGISTRY.get(id);
}

export function getAllSteps(): AnalysisStepDef[] {
  return ALL_STEPS;
}

// === Pipeline Executor ===

export function runAnalysisPipeline(plan: AnalysisPlan, input: AnalysisInput): AnalysisResult[] {
  const results: AnalysisResult[] = [];

  for (const planStep of plan.steps) {
    const stepDef = REGISTRY.get(planStep.id);
    if (!stepDef) continue;

    // Check requirements
    const nTasks = input.datasets.length;
    if (stepDef.requires === 'multi-task' && nTasks < 2) continue;
    if (stepDef.requires === 'single-task' && nTasks !== 1) continue;

    try {
      const result = stepDef.execute({ ...input, params: planStep.params });
      results.push(result);
    } catch {
      results.push({
        stepId: planStep.id,
        type: 'text',
        title: `${stepDef.name} — Error`,
        data: `Analysis step failed. This may be due to insufficient data.`,
      });
    }
  }

  return results;
}

// === Default Plans ===

/** Default plan for single-task pilot */
export function defaultSingleTaskPlan(): AnalysisPlan {
  return {
    steps: [
      { id: 'descriptive-stats' },
      { id: 'split-half-reliability' },
      { id: 'ceiling-floor' },
      { id: 'outlier-detection' },
      { id: 'condition-effects' },
      { id: 'persona-differences' },
    ],
  };
}

/** Default plan for multi-task battery */
export function defaultBatteryPlan(nTasks: number): AnalysisPlan {
  const steps: AnalysisPlanStep[] = [
    { id: 'descriptive-stats' },
    { id: 'split-half-reliability' },
    { id: 'ceiling-floor' },
    { id: 'condition-effects' },
    { id: 'persona-differences' },
    { id: 'correlation-matrix', params: { permutations: 500 } },
  ];

  if (nTasks >= 4) {
    steps.push({ id: 'exploratory-fa', params: { nFactors: Math.min(3, Math.floor(nTasks / 2)) } });
  }

  return { steps };
}
