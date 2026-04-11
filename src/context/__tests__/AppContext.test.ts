import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../AppContext';
import { createMissions } from '../../lib/interns';
import type { AppState, AppAction } from '../types';

const r = (s: AppState, a: AppAction) => reducer(s, a);

describe('reducer', () => {
  it('START_SESSION creates a session with 3 pending reports', () => {
    const missions = createMissions('test');
    const s = r(initialState, { type: 'START_SESSION', payload: { brief: 'test', missions } });
    expect(s.currentSession).toBeTruthy();
    expect(s.currentSession!.reports).toHaveLength(3);
    expect(s.currentSession!.reports.every(r => r.status === 'pending')).toBe(true);
    expect(s.step).toBe('dispatch');
  });

  it('UPDATE_REPORT updates a specific intern report', () => {
    const missions = createMissions('test');
    let s = r(initialState, { type: 'START_SESSION', payload: { brief: 'test', missions } });
    s = r(s, { type: 'UPDATE_REPORT', payload: { role: 'scout', report: { status: 'working' } } });
    expect(s.currentSession!.reports.find(r => r.role === 'scout')!.status).toBe('working');
    expect(s.currentSession!.reports.find(r => r.role === 'analyst')!.status).toBe('pending');
  });

  it('SET_SYNTHESIS sets synthesis data', () => {
    const missions = createMissions('test');
    let s = r(initialState, { type: 'START_SESSION', payload: { brief: 'test', missions } });
    s = r(s, { type: 'SET_SYNTHESIS', payload: {
      synthesis: 'summary', agreements: ['a'], disagreements: ['d'], openQuestions: ['q'], nextMissions: ['n'],
    }});
    expect(s.currentSession!.synthesis).toBe('summary');
    expect(s.currentSession!.agreements).toEqual(['a']);
  });

  it('SET_FEEDBACK updates a finding', () => {
    const missions = createMissions('test');
    let s = r(initialState, { type: 'START_SESSION', payload: { brief: 'test', missions } });
    s = r(s, { type: 'UPDATE_REPORT', payload: {
      role: 'scout', report: { findings: [{ id: 'f1', internRole: 'scout', text: 'x', confidence: 0.8, feedback: null }] },
    }});
    s = r(s, { type: 'SET_FEEDBACK', payload: { findingId: 'f1', feedback: 'useful' } });
    const f = s.currentSession!.reports[0].findings[0];
    expect(f.feedback).toBe('useful');
  });

  it('COMPLETE_SESSION archives and clears current session', () => {
    const missions = createMissions('test');
    let s = r(initialState, { type: 'START_SESSION', payload: { brief: 'test', missions } });
    s = r(s, { type: 'COMPLETE_SESSION' });
    expect(s.currentSession).toBeNull();
    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].completedAt).toBeTypeOf('number');
  });

  it('RESET returns initial state', () => {
    const missions = createMissions('test');
    let s = r(initialState, { type: 'START_SESSION', payload: { brief: 'test', missions } });
    s = r(s, { type: 'RESET' });
    expect(s).toEqual(initialState);
  });

  it('ITERATE_SESSION archives current and creates new session with higher round', () => {
    const missions = createMissions('test');
    let s = r(initialState, { type: 'START_SESSION', payload: { brief: 'test', missions } });
    const prevId = s.currentSession!.id;
    const newMissions = createMissions('refined test');
    s = r(s, { type: 'ITERATE_SESSION', payload: { refinedBrief: 'refined test', missions: newMissions } });

    expect(s.sessions).toHaveLength(1);
    expect(s.sessions[0].id).toBe(prevId);
    expect(s.sessions[0].completedAt).toBeTypeOf('number');
    expect(s.currentSession).toBeTruthy();
    expect(s.currentSession!.brief).toBe('refined test');
    expect(s.currentSession!.round).toBe(2);
    expect(s.currentSession!.previousSessionId).toBe(prevId);
    expect(s.step).toBe('dispatch');
  });

  it('does not mutate previous state', () => {
    const before = { ...initialState };
    r(before, { type: 'SET_STEP', payload: 'brief' });
    expect(before.step).toBe('landing');
  });
});
