// ============================================================
// PARADIGM DEFINITIONS
// ============================================================

export type ParadigmType = 'behavioral' | 'survey';
export type TaskCategory = 'planning' | 'memory' | 'control' | 'learning' | 'survey';

export interface DependentVariable {
  name: string;
  type: 'continuous' | 'binary' | 'ordinal';
  unit: string;
  expectedRange: [number, number];
  higherIsBetter: boolean;
}

export interface BehavioralParams {
  type: 'behavioral';
  difficulty: number;        // 0-1 normalized
  nTrials: number;
  nConditions: number;
  conditionLabels: string[];
  withinSubject: boolean;
  rtRange: [number, number]; // plausible RT range in ms
  baseAccuracy: number;      // accuracy at difficulty=0
}

export interface SurveyParams {
  type: 'survey';
  nItems: number;
  scalePoints: number;       // 5 for likert-5, 7 for likert-7, 2 for forced-choice
  nSubscales: number;
  subscaleNames: string[];
  reverseCodedIndices: number[];
}

export type ExperimentParams = BehavioralParams | SurveyParams;

export interface ParadigmDefinition {
  id: string;
  name: string;
  emoji: string;
  category: TaskCategory;
  paradigmType: ParadigmType;
  description: string;
  defaultParams: ExperimentParams;
  dependentVariables: DependentVariable[];
}

// ============================================================
// PERSONA DEFINITIONS
// ============================================================

export interface PersonaDefinition {
  id: string;
  name: string;
  emoji: string;
  description: string;
  // Behavioral modifiers
  rtMultiplier: number;          // 1.0 = baseline
  accuracyOffset: number;        // 0.0 = baseline
  variabilityMultiplier: number; // 1.0 = baseline
  fatigueRate: number;           // 0 = none, 1 = severe
  attentionLapseRate: number;    // probability of random response per trial
  // Survey modifiers
  acquiescenceBias: number;      // 0-1, tendency to agree
  extremeResponseStyle: number;  // 0-1, tendency to use endpoints
}

// ============================================================
// EXPERIMENT DESIGN (Claude proposes this as JSON)
// ============================================================

export interface ExperimentDesign {
  id: string;
  name: string;
  paradigmId: string;
  personaIds: string[];
  params: ExperimentParams;
  nParticipantsPerPersona: number;
  hypotheses: string[];
  rationale: string;
  internRole: string;
}

// ============================================================
// SIMULATED DATA
// ============================================================

export interface SimulatedTrial {
  trialIndex: number;
  condition: string;
  rt: number | null;         // null for surveys
  response: number;          // 0/1 for accuracy, 1-7 for Likert, etc.
  correct: boolean | null;   // null for surveys
}

export interface SimulatedParticipant {
  id: string;
  personaId: string;
  condition: string | null;  // null for within-subject
  trials: SimulatedTrial[];
  seed: number;
}

export interface SimulatedDataset {
  designId: string;
  participants: SimulatedParticipant[];
  masterSeed: number;
  generatedAt: number;
}

// ============================================================
// METRICS
// ============================================================

export type MetricInterpretation = 'excellent' | 'good' | 'acceptable' | 'poor' | 'problematic';

export interface MetricResult {
  name: string;
  value: number;
  unit: string;
  interpretation: MetricInterpretation;
  ci: [number, number] | null;
  flag: string | null;
}

export interface PersonaMetrics {
  personaId: string;
  personaName: string;
  metrics: MetricResult[];
}

export interface PilotMetrics {
  designId: string;
  byPersona: PersonaMetrics[];
  overall: MetricResult[];
  overallScore: number;      // 0-100, heuristic composite
  recommendation: 'proceed' | 'revise' | 'redesign';
}
