import type { ExperimentDesign, SimulatedDataset, PilotMetrics } from '../lib/types';

export type InternRole = 'scout' | 'analyst' | 'contrarian';

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

// NEW: Experiment-aware intern report
export interface DesignReport {
  role: InternRole;
  design: ExperimentDesign | null;
  dataset: SimulatedDataset | null;
  metrics: PilotMetrics | null;
  status: 'pending' | 'proposing' | 'simulating' | 'computing' | 'done' | 'error';
}

export interface ResearchSession {
  id: string;
  brief: string;
  paradigmId: string;
  personaIds: string[];
  // Old text-based reports (kept for iteration feedback)
  missions: Intern[];
  reports: InternReport[];
  // NEW: experiment-based reports
  designReports: DesignReport[];
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
}

export interface AppState {
  currentSession: ResearchSession | null;
  sessions: ResearchSession[];
  step: 'landing' | 'brief' | 'dispatch' | 'report' | 'history';
}

export type AppAction =
  | { type: 'START_EXPERIMENT'; payload: { brief: string; paradigmId: string; personaIds: string[] } }
  | { type: 'START_SESSION'; payload: { brief: string; missions: Intern[] } }
  | { type: 'SET_STEP'; payload: AppState['step'] }
  | { type: 'UPDATE_REPORT'; payload: { role: InternRole; report: Partial<InternReport> } }
  | { type: 'UPDATE_DESIGN_REPORT'; payload: { role: InternRole; report: Partial<DesignReport> } }
  | { type: 'SET_SYNTHESIS'; payload: { synthesis: string; agreements: string[]; disagreements: string[]; openQuestions: string[]; nextMissions: string[] } }
  | { type: 'SET_FEEDBACK'; payload: { findingId: string; feedback: FindingFeedback } }
  | { type: 'SELECT_DESIGN'; payload: number }
  | { type: 'ITERATE_SESSION'; payload: { refinedBrief: string; missions: Intern[] } }
  | { type: 'COMPLETE_SESSION' }
  | { type: 'RESET' };
