import type { AnalysisStepDef, AnalysisPlan, AnalysisPlanStep, AnalysisInput, AnalysisResult } from './types';
import { descriptiveStats, splitHalfReliability } from './descriptive';
import { ceilingFloorCheck, outlierCheck } from './quality';
import { conditionEffects, personaDifferences } from './effects';
import { correlationMatrix, exploratoryFA } from './multivariate';
import { construalAnalysis, construalByMaze } from './construal';
import { wcstAnalysis, twoStepAnalysis, tolAnalysis, nbackAnalysis, corsiAnalysis, fiarAnalysis } from './taskSpecific';

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
  construalAnalysis,
  construalByMaze,
  wcstAnalysis,
  twoStepAnalysis,
  tolAnalysis,
  nbackAnalysis,
  corsiAnalysis,
  fiarAnalysis,
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
export function defaultSingleTaskPlan(paradigmId?: string): AnalysisPlan {
  const steps: AnalysisPlanStep[] = [
    { id: 'descriptive-stats' },
    { id: 'split-half-reliability' },
    { id: 'ceiling-floor' },
    { id: 'outlier-detection' },
    { id: 'condition-effects' },
    { id: 'persona-differences' },
  ];

  // Auto-include task-specific analysis when relevant
  if (paradigmId === 'maze-construal') {
    steps.unshift({ id: 'construal-effect' });
    steps.push({ id: 'construal-by-maze' });
  }
  if (paradigmId === 'wcst') steps.unshift({ id: 'wcst-analysis' });
  if (paradigmId === 'two-step') steps.unshift({ id: 'two-step-analysis' });
  if (paradigmId === 'tower-of-london') steps.unshift({ id: 'tol-analysis' });
  if (paradigmId === 'n-back') steps.unshift({ id: 'nback-analysis' });
  if (paradigmId === 'corsi-block') steps.unshift({ id: 'corsi-analysis' });
  if (paradigmId === 'four-in-a-row') steps.unshift({ id: 'fiar-analysis' });

  return { steps };
}

/** Default plan for multi-task battery */
export function defaultBatteryPlan(nTasks: number, paradigmIds?: string[]): AnalysisPlan {
  const steps: AnalysisPlanStep[] = [
    { id: 'descriptive-stats' },
    { id: 'split-half-reliability' },
    { id: 'ceiling-floor' },
    { id: 'condition-effects' },
    { id: 'persona-differences' },
    { id: 'correlation-matrix', params: { permutations: 500 } },
  ];

  // Auto-include task-specific analysis for multi-turn tasks in battery
  if (paradigmIds?.includes('wcst')) steps.push({ id: 'wcst-analysis' });
  if (paradigmIds?.includes('two-step')) steps.push({ id: 'two-step-analysis' });
  if (paradigmIds?.includes('tower-of-london')) steps.push({ id: 'tol-analysis' });
  if (paradigmIds?.includes('n-back')) steps.push({ id: 'nback-analysis' });
  if (paradigmIds?.includes('corsi-block')) steps.push({ id: 'corsi-analysis' });
  if (paradigmIds?.includes('four-in-a-row')) steps.push({ id: 'fiar-analysis' });
  if (paradigmIds?.includes('maze-construal')) {
    steps.push({ id: 'construal-effect' });
    steps.push({ id: 'construal-by-maze' });
  }

  if (nTasks >= 4) {
    steps.push({ id: 'exploratory-fa', params: { nFactors: Math.min(3, Math.floor(nTasks / 2)) } });
  }

  return { steps };
}
