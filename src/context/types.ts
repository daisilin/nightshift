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
  confidence: number; // 0-1
  feedback: FindingFeedback;
}

export interface InternReport {
  role: InternRole;
  summary: string;
  findings: Finding[];
  status: 'pending' | 'working' | 'done' | 'error';
}

export interface ResearchSession {
  id: string;
  brief: string;
  missions: Intern[];
  reports: InternReport[];
  synthesis: string | null;
  agreements: string[];
  disagreements: string[];
  openQuestions: string[];
  nextMissions: string[];
  createdAt: number;
  completedAt: number | null;
  round: number;
  previousSessionId: string | null;
}

export interface AppState {
  currentSession: ResearchSession | null;
  sessions: ResearchSession[];
  step: 'landing' | 'brief' | 'dispatch' | 'report' | 'history';
}

export type AppAction =
  | { type: 'START_SESSION'; payload: { brief: string; missions: Intern[] } }
  | { type: 'SET_STEP'; payload: AppState['step'] }
  | { type: 'UPDATE_REPORT'; payload: { role: InternRole; report: Partial<InternReport> } }
  | { type: 'SET_SYNTHESIS'; payload: { synthesis: string; agreements: string[]; disagreements: string[]; openQuestions: string[]; nextMissions: string[] } }
  | { type: 'SET_FEEDBACK'; payload: { findingId: string; feedback: FindingFeedback } }
  | { type: 'ITERATE_SESSION'; payload: { refinedBrief: string; missions: Intern[] } }
  | { type: 'COMPLETE_SESSION' }
  | { type: 'RESET' };
