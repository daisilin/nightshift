import { describe, it, expect } from 'vitest';
import { validatePlan, validateProbe, extractJson } from '../agentSchema';

describe('extractJson', () => {
  it('extracts from ```json fenced block', () => {
    const out = extractJson('here is a plan\n```json\n{"a":1}\n```\n');
    expect(out).toEqual({ a: 1 });
  });

  it('extracts from bare braces when no fence present', () => {
    const out = extractJson('prose before {"a":1} prose after');
    expect(out).toEqual({ a: 1 });
  });

  it('returns null for empty input', () => {
    expect(extractJson('')).toBeNull();
  });

  it('returns null when no json can be found', () => {
    expect(extractJson('just prose with no braces')).toBeNull();
  });

  it('returns null for malformed json', () => {
    expect(extractJson('```json\n{not valid}\n```')).toBeNull();
  });
});

describe('validatePlan', () => {
  it('returns null for non-objects', () => {
    expect(validatePlan(null)).toBeNull();
    expect(validatePlan('string')).toBeNull();
    expect(validatePlan(42)).toBeNull();
  });

  it('returns null for empty plans with no changes', () => {
    expect(validatePlan({})).toBeNull();
    expect(validatePlan({ notes: 'only notes, no changes' })).toBeNull();
  });

  it('accepts valid plan with tasks', () => {
    const p = validatePlan({ addTasks: ['wcst'], notes: 'add inhibition' });
    expect(p).toEqual({ addTasks: ['wcst'], notes: 'add inhibition' });
  });

  it('rejects non-string-array task fields', () => {
    const p = validatePlan({ addTasks: 'wcst', brief: 'valid' });
    expect(p?.addTasks).toBeUndefined();
    expect(p?.brief).toBe('valid');
  });

  it('rejects invalid modelPool values', () => {
    const p = validatePlan({ brief: 'x', modelPool: 'gpt-4' });
    expect(p?.modelPool).toBeUndefined();
  });

  it('accepts valid modelPool values', () => {
    for (const pool of ['sonnet', 'diverse', 'capability-spread'] as const) {
      const p = validatePlan({ brief: 'x', modelPool: pool });
      expect(p?.modelPool).toBe(pool);
    }
  });

  it('rejects non-positive nParticipants', () => {
    expect(validatePlan({ brief: 'x', nParticipants: 0 })?.nParticipants).toBeUndefined();
    expect(validatePlan({ brief: 'x', nParticipants: -5 })?.nParticipants).toBeUndefined();
    expect(validatePlan({ brief: 'x', nParticipants: 'twenty' })?.nParticipants).toBeUndefined();
  });
});

describe('validateProbe', () => {
  it('returns null when mode is not probe', () => {
    expect(validateProbe({ mode: 'plan', probes: [] })).toBeNull();
  });

  it('returns null when probes is not an array', () => {
    expect(validateProbe({ mode: 'probe', probes: 'not an array' })).toBeNull();
  });

  it('returns null when no valid probes remain after filtering', () => {
    expect(validateProbe({ mode: 'probe', probes: [{ wrong: 'shape' }] })).toBeNull();
  });

  it('accepts valid probes and drops malformed entries', () => {
    const p = validateProbe({
      mode: 'probe',
      probes: [
        { id: 'q1', question: 'real question', why: 'matters', options: ['a', 'b'] },
        { id: 'q2' /* missing question */ },
        { question: 'no id' },
      ],
    });
    expect(p?.probes).toHaveLength(1);
    expect(p?.probes[0].id).toBe('q1');
    expect(p?.probes[0].options).toEqual(['a', 'b']);
  });

  it('normalizes flag severity to warning or info', () => {
    const p = validateProbe({
      mode: 'probe',
      probes: [{ id: 'q1', question: 'ok' }],
      flags: [
        { severity: 'warning', message: 'warn' },
        { severity: 'critical', message: 'falls back to info' },
        { message: 'no severity' },
      ],
    });
    expect(p?.flags).toHaveLength(3);
    expect(p?.flags?.[0].severity).toBe('warning');
    expect(p?.flags?.[1].severity).toBe('info');
    expect(p?.flags?.[2].severity).toBe('info');
  });

  it('drops flags without a message string', () => {
    const p = validateProbe({
      mode: 'probe',
      probes: [{ id: 'q1', question: 'ok' }],
      flags: [{ severity: 'warning' }, null, 'not an object'],
    });
    expect(p?.flags).toBeUndefined();
  });
});
