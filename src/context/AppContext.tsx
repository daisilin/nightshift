import { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react';
import type { AppState, AppAction, InternRole } from './types';

const STORAGE_KEY = 'nightshift-state';
const ROLES: InternRole[] = ['scout', 'analyst', 'contrarian'];

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
        personaIds: action.payload.personaIds,
        missions: [],
        reports: [],
        designReports: ROLES.map(role => ({
          role,
          design: null,
          dataset: null,
          metrics: null,
          status: 'pending' as const,
        })),
        synthesis: null,
        agreements: [],
        disagreements: [],
        openQuestions: [],
        nextMissions: [],
        createdAt: Date.now(),
        completedAt: null,
        round: state.sessions.length + 1,
        previousSessionId: null,
        selectedDesignIndex: 0,
      };
      return { ...state, currentSession: session, step: 'dispatch' };
    }

    case 'START_SESSION': {
      const session = {
        id: `s-${Date.now()}`,
        brief: action.payload.brief,
        paradigmId: '',
        personaIds: [],
        missions: action.payload.missions,
        reports: action.payload.missions.map(m => ({ role: m.role, summary: '', findings: [], status: 'pending' as const })),
        designReports: [],
        synthesis: null, agreements: [], disagreements: [], openQuestions: [], nextMissions: [],
        createdAt: Date.now(), completedAt: null,
        round: state.sessions.length + 1, previousSessionId: null, selectedDesignIndex: 0,
      };
      return { ...state, currentSession: session, step: 'dispatch' };
    }

    case 'SET_STEP':
      return { ...state, step: action.payload };

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
        synthesis: null, agreements: [], disagreements: [], openQuestions: [], nextMissions: [],
        createdAt: Date.now(), completedAt: null,
        round: archived.round + 1, previousSessionId: archived.id, selectedDesignIndex: 0,
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

const AppContext = createContext<{ state: AppState; dispatch: React.Dispatch<AppAction> } | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState, () => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s) return JSON.parse(s) as AppState;
    } catch { /* ignore */ }
    return initialState;
  });

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
