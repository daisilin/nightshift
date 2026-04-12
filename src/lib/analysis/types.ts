import type { SimulatedDataset, ExperimentDesign, ParadigmDefinition, PersonaDefinition } from '../types';

// === Analysis Pipeline Types ===

export interface AnalysisInput {
  datasets: SimulatedDataset[];
  designs: ExperimentDesign[];
  paradigms: ParadigmDefinition[];
  personas: PersonaDefinition[];
  params?: Record<string, any>;
}

export type ResultType = 'table' | 'matrix' | 'factor-loadings' | 'regression' | 'chart' | 'text';

export interface AnalysisResult {
  stepId: string;
  type: ResultType;
  title: string;
  data: any;
  interpretation?: string;
}

export interface TableData {
  headers: string[];
  rows: (string | number)[][];
  highlights?: { row: number; col: number; color: string }[];
}

export interface MatrixData {
  labels: string[];
  values: number[][];
  pValues?: number[][];
  significanceThresholds?: { symbol: string; threshold: number }[];
}

export interface FactorData {
  tasks: string[];
  factorNames: string[];
  loadings: number[][];       // tasks × factors
  varianceExplained: number[];
  totalVariance: number;
}

export interface RegressionData {
  outcomes: string[];
  predictors: string[];
  coefficients: number[][];   // outcomes × predictors
  rSquared: number[];
}

export interface ChartData {
  type: 'bar' | 'line';
  labels: string[];
  series: { name: string; values: number[]; color?: string }[];
  yLabel?: string;
  xLabel?: string;
}

export interface AnalysisStepDef {
  id: string;
  name: string;
  category: 'descriptive' | 'reliability' | 'effect' | 'multivariate' | 'regression' | 'quality' | 'temporal';
  requires: 'single-task' | 'multi-task' | 'any';
  execute: (input: AnalysisInput) => AnalysisResult;
}

export interface AnalysisPlanStep {
  id: string;
  params?: Record<string, any>;
}

export interface AnalysisPlan {
  steps: AnalysisPlanStep[];
}
