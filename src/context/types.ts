import type { ExperimentDesign, SimulatedDataset, PilotMetrics } from '../lib/types';

export type InternRole = 'scout' | 'analyst' | 'reviewer';

export interface Intern {
  role: InternRole;
  name: string;
  emoji: string;
  color: string;
  description: string;
  mission: string;
}

export type FindingFeedback = 'useful' | 'shallow' | 'wrong' | 'deeper' | null;

export interface Finding {
  id: string;
  internRole: InternRole;
  text: string;
  confidence: number;
  feedback: FindingFeedback;
}

export interface InternReport {
  role: InternRole;
  summary: string;
  findings: Finding[];
  status: 'pending' | 'working' | 'done' | 'error';
}

export interface DesignReport {
  role: InternRole;
  design: ExperimentDesign | null;
  dataset: SimulatedDataset | null;
  metrics: PilotMetrics | null;
  status: 'pending' | 'proposing' | 'simulating' | 'computing' | 'done' | 'error';
}

// A single task within a multi-paradigm battery
export interface BatteryTask {
  paradigmId: string;
  design: ExperimentDesign | null;
  dataset: SimulatedDataset | null;
  metrics: PilotMetrics | null;
  status: 'pending' | 'proposing' | 'simulating' | 'computing' | 'done' | 'error';
}

// Peer review from the reviewer intern
export interface PeerReview {
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
  verdict: 'accept' | 'minor-revisions' | 'major-revisions' | 'reject';
  confidence: number;
}

// Cross-task analysis results
export interface CrossTaskAnalysis {
  correlationMatrix: { task1: string; task2: string; r: number }[];
  factorLoadings: { task: string; factor1: number; factor2: number }[];
  summary: string;
}

export interface ResearchSession {
  id: string;
  brief: string;
  // Multi-paradigm: array of paradigm IDs (not just one)
  paradigmIds: string[];
  personaIds: string[];
  // Legacy single-paradigm fields
  paradigmId: string;
  missions: Intern[];
  reports: InternReport[];
  designReports: DesignReport[];
  // Multi-paradigm battery
  battery: BatteryTask[];
  // Peer review
  peerReview: PeerReview | null;
  // Cross-task analysis
  crossTaskAnalysis: CrossTaskAnalysis | null;
  synthesis: string | null;
  agreements: string[];
  disagreements: string[];
  openQuestions: string[];
  nextMissions: string[];
  createdAt: number;
  completedAt: number | null;
  round: number;
  previousSessionId: string | null;
  selectedDesignIndex: number;
  analysisResults: any[];
  simulationMode: 'parametric' | 'llm';
}

export interface AppState {
  currentSession: ResearchSession | null;
  sessions: ResearchSession[];
  step: 'landing' | 'brief' | 'dispatch' | 'report' | 'history';
}

export type AppAction =
  | { type: 'START_EXPERIMENT'; payload: { brief: string; paradigmId: string; personaIds: string[] } }
  | { type: 'START_BATTERY'; payload: { brief: string; paradigmIds: string[]; personaIds: string[] } }
  | { type: 'START_SESSION'; payload: { brief: string; missions: Intern[] } }
  | { type: 'SET_STEP'; payload: AppState['step'] }
  | { type: 'UPDATE_REPORT'; payload: { role: InternRole; report: Partial<InternReport> } }
  | { type: 'UPDATE_DESIGN_REPORT'; payload: { role: InternRole; report: Partial<DesignReport> } }
  | { type: 'UPDATE_BATTERY_TASK'; payload: { paradigmId: string; update: Partial<BatteryTask> } }
  | { type: 'SET_PEER_REVIEW'; payload: PeerReview }
  | { type: 'SET_CROSS_TASK_ANALYSIS'; payload: CrossTaskAnalysis }
  | { type: 'SET_SYNTHESIS'; payload: { synthesis: string; agreements: string[]; disagreements: string[]; openQuestions: string[]; nextMissions: string[] } }
  | { type: 'SET_FEEDBACK'; payload: { findingId: string; feedback: FindingFeedback } }
  | { type: 'SELECT_DESIGN'; payload: number }
  | { type: 'SET_ANALYSIS_RESULTS'; payload: any[] }
  | { type: 'ITERATE_SESSION'; payload: { refinedBrief: string; missions: Intern[] } }
  | { type: 'COMPLETE_SESSION' }
  | { type: 'RESET' };
