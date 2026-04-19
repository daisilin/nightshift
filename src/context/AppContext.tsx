import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { AppState, AppAction, InternRole } from './types';

const STORAGE_KEY = 'nightshift-state';
const ROLES: InternRole[] = ['scout', 'analyst', 'reviewer'];

export const initialState: AppState = {
  currentSession: null,
  sessions: [],
  step: 'landing',
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'START_EXPERIMENT': {
      const session = {
        id: `s-${Date.now()}`,
        brief: action.payload.brief,
        paradigmId: action.payload.paradigmId,
        paradigmIds: [action.payload.paradigmId],
        personaIds: action.payload.personaIds,
        missions: [],
        reports: [],
        designReports: ROLES.map(role => ({
          role, design: null, dataset: null, metrics: null, status: 'pending' as const,
        })),
        battery: [],
        peerReview: null,
        crossTaskAnalysis: null,
        synthesis: null, agreements: [], disagreements: [], openQuestions: [], nextMissions: [],
        createdAt: Date.now(), completedAt: null,
        round: state.sessions.length + 1, previousSessionId: null, selectedDesignIndex: 0, analysisResults: [], simulationMode: 'parametric' as const, paperContext: null,
        nParticipants: action.payload.nParticipants ?? 20,
      };
      return { ...state, currentSession: session, step: 'dispatch' };
    }

    case 'START_BATTERY': {
      const session = {
        id: `s-${Date.now()}`,
        brief: action.payload.brief,
        paradigmId: action.payload.paradigmIds[0],
        paradigmIds: action.payload.paradigmIds,
        personaIds: action.payload.personaIds,
        missions: [], reports: [],
        designReports: [],
        battery: action.payload.paradigmIds.map(pid => ({
          paradigmId: pid, design: null, dataset: null, metrics: null, status: 'pending' as const,
        })),
        peerReview: null, crossTaskAnalysis: null,
        synthesis: null, agreements: [], disagreements: [], openQuestions: [], nextMissions: [],
        createdAt: Date.now(), completedAt: null,
        round: state.sessions.length + 1, previousSessionId: null, selectedDesignIndex: 0, analysisResults: [], simulationMode: 'parametric' as const, paperContext: null,
        nParticipants: action.payload.nParticipants ?? 20,
      };
      return { ...state, currentSession: session, step: 'dispatch' };
    }

    case 'START_SESSION': {
      const session = {
        id: `s-${Date.now()}`,
        brief: action.payload.brief,
        paradigmId: '', paradigmIds: [],
        personaIds: [],
        missions: action.payload.missions,
        reports: action.payload.missions.map(m => ({ role: m.role, summary: '', findings: [], status: 'pending' as const })),
        designReports: [], battery: [],
        peerReview: null, crossTaskAnalysis: null,
        synthesis: null, agreements: [], disagreements: [], openQuestions: [], nextMissions: [],
        createdAt: Date.now(), completedAt: null,
        round: state.sessions.length + 1, previousSessionId: null, selectedDesignIndex: 0, analysisResults: [], simulationMode: 'parametric' as const, paperContext: null,
        nParticipants: 20,
      };
      return { ...state, currentSession: session, step: 'dispatch' };
    }

    case 'SET_STEP':
      return { ...state, step: action.payload };

    case 'SET_PAPER_CONTEXT': {
      if (!state.currentSession) return state;
      return { ...state, currentSession: { ...state.currentSession, paperContext: action.payload } };
    }

    case 'UPDATE_REPORT': {
      if (!state.currentSession) return state;
      const reports = state.currentSession.reports.map(r =>
        r.role === action.payload.role ? { ...r, ...action.payload.report } : r
      );
      return { ...state, currentSession: { ...state.currentSession, reports } };
    }

    case 'UPDATE_DESIGN_REPORT': {
      if (!state.currentSession) return state;
      const designReports = state.currentSession.designReports.map(r =>
        r.role === action.payload.role ? { ...r, ...action.payload.report } : r
      );
      return { ...state, currentSession: { ...state.currentSession, designReports } };
    }

    case 'SET_SYNTHESIS': {
      if (!state.currentSession) return state;
      return { ...state, currentSession: { ...state.currentSession, ...action.payload } };
    }

    case 'SET_FEEDBACK': {
      if (!state.currentSession) return state;
      const reports = state.currentSession.reports.map(r => ({
        ...r, findings: r.findings.map(f => f.id === action.payload.findingId ? { ...f, feedback: action.payload.feedback } : f),
      }));
      return { ...state, currentSession: { ...state.currentSession, reports } };
    }

    case 'UPDATE_BATTERY_TASK': {
      if (!state.currentSession) return state;
      const battery = state.currentSession.battery.map(t =>
        t.paradigmId === action.payload.paradigmId ? { ...t, ...action.payload.update } : t
      );
      return { ...state, currentSession: { ...state.currentSession, battery } };
    }

    case 'SET_PEER_REVIEW': {
      if (!state.currentSession) return state;
      return { ...state, currentSession: { ...state.currentSession, peerReview: action.payload } };
    }

    case 'SET_CROSS_TASK_ANALYSIS': {
      if (!state.currentSession) return state;
      return { ...state, currentSession: { ...state.currentSession, crossTaskAnalysis: action.payload } };
    }

    case 'SET_ANALYSIS_RESULTS': {
      if (!state.currentSession) return state;
      return { ...state, currentSession: { ...state.currentSession, analysisResults: action.payload } };
    }

    case 'SELECT_DESIGN': {
      if (!state.currentSession) return state;
      return { ...state, currentSession: { ...state.currentSession, selectedDesignIndex: action.payload } };
    }

    case 'ITERATE_SESSION': {
      if (!state.currentSession) return state;
      const archived = { ...state.currentSession, completedAt: Date.now() };
      const newSession = {
        ...archived,
        id: `s-${Date.now()}`,
        brief: action.payload.refinedBrief,
        missions: action.payload.missions,
        reports: action.payload.missions.map(m => ({ role: m.role, summary: '', findings: [], status: 'pending' as const })),
        designReports: ROLES.map(role => ({ role, design: null, dataset: null, metrics: null, status: 'pending' as const })),
        battery: archived.battery.map(t => ({ ...t, design: null, dataset: null, metrics: null, status: 'pending' as const })),
        peerReview: null, crossTaskAnalysis: null,
        synthesis: null, agreements: [], disagreements: [], openQuestions: [], nextMissions: [],
        createdAt: Date.now(), completedAt: null,
        round: archived.round + 1, previousSessionId: archived.id, selectedDesignIndex: 0, analysisResults: [], simulationMode: 'parametric' as const, paperContext: null,
      };
      return { ...state, sessions: [...state.sessions, archived], currentSession: newSession, step: 'dispatch' };
    }

    case 'COMPLETE_SESSION': {
      if (!state.currentSession) return state;
      const completed = { ...state.currentSession, completedAt: Date.now() };
      return { ...state, sessions: [...state.sessions, completed], currentSession: null, step: 'landing' };
    }

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

/**
 * Drop the heaviest per-session fields — raw simulated datasets and full
 * paper text — so the session becomes a small summary record. Used when
 * localStorage quota is exceeded and we need to shrink past sessions.
 */
export function stripHeavy<T extends { battery?: any[]; designReports?: any[]; paperContext?: any }>(s: T): T {
  return {
    ...s,
    paperContext: null,
    battery: (s.battery ?? []).map((b: any) => ({ ...b, dataset: null })),
    designReports: (s.designReports ?? []).map((d: any) => ({ ...d, dataset: null })),
  };
}

/**
 * Trim paper-context rawText while keeping the extracted summary. Used on
 * the current session so analysis agents still have a short reference
 * without the whole PDF in memory.
 */
export function stripPaperContext<T extends { paperContext?: any }>(s: T): T {
  if (!s.paperContext || typeof s.paperContext !== 'string') return s;
  const MAX = 2000;
  return s.paperContext.length <= MAX ? s : { ...s, paperContext: s.paperContext.slice(0, MAX) + '\n...[truncated for storage]' };
}

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as any;
        // Migrate old sessions missing new fields
        const migrate = (s: any) => ({
          ...s,
          paradigmIds: s.paradigmIds ?? [],
          battery: s.battery ?? [],
          peerReview: s.peerReview ?? null,
          crossTaskAnalysis: s.crossTaskAnalysis ?? null,
          designReports: s.designReports ?? [],
          selectedDesignIndex: s.selectedDesignIndex ?? 0,
          paradigmId: s.paradigmId ?? '', analysisResults: s.analysisResults ?? [], simulationMode: s.simulationMode ?? 'parametric', paperContext: s.paperContext ?? null,
          personaIds: s.personaIds ?? [],
          nParticipants: s.nParticipants ?? 20,
        });
        return {
          ...parsed,
          currentSession: parsed.currentSession ? migrate(parsed.currentSession) : null,
          sessions: (parsed.sessions ?? []).map(migrate),
        } as AppState;
      }
    } catch { /* ignore */ }
    return initialState;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      // Quota exceeded — drop the heaviest bits (raw datasets, paper text) from
      // past sessions and retry. Keep the current session's datasets so the
      // analysis pipeline still has data to work with.
      try {
        const compact: AppState = {
          ...state,
          sessions: state.sessions.map(s => stripHeavy(s)),
          currentSession: state.currentSession ? stripPaperContext(state.currentSession) : null,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(compact));
      } catch (err2) {
        // Still too big. Drop past sessions entirely as a last resort.
        try {
          const minimal: AppState = { ...state, sessions: [] };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
        } catch {
          console.warn('nightshift: localStorage quota exceeded, state not persisted', err2);
        }
      }
    }
  }, [state]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
