import { describe, it, expect } from 'vitest';
import { reducer, initialState } from '../AppContext';

describe('Iteration flow', () => {
  it('COMPLETE_SESSION + START_BATTERY creates fresh session with feedback', () => {
    let s = reducer(initialState, { type: 'START_BATTERY', payload: {
      brief: 'planning study', paradigmIds: ['tower-of-london', 'stroop'], personaIds: ['college-student'],
    }});
    expect(s.currentSession).toBeTruthy();

    s = reducer(s, { type: 'COMPLETE_SESSION' });
    expect(s.currentSession).toBeNull();
    expect(s.sessions).toHaveLength(1);

    const newBrief = 'planning study [round 1 feedback: increase trials to 60]';
    s = reducer(s, { type: 'START_BATTERY', payload: {
      brief: newBrief, paradigmIds: ['tower-of-london', 'stroop'], personaIds: ['college-student'],
    }});

    expect(s.currentSession).toBeTruthy();
    expect(s.currentSession!.brief).toContain('increase trials to 60');
    expect(s.currentSession!.battery).toHaveLength(2);
    expect(s.sessions).toHaveLength(1);
  });

  it('feedback regex extracts correctly', () => {
    const brief = 'study [round 1 feedback: more trials and higher difficulty]';
    const match = brief.match(/\[round \d+ feedback: (.+?)\]/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe('more trials and higher difficulty');
  });

  it('no feedback when brief has no feedback tag', () => {
    const brief = 'simple planning study';
    const match = brief.match(/\[round \d+ feedback: (.+?)\]/);
    expect(match).toBeNull();
  });
});
