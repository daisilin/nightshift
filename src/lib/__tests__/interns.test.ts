import { describe, it, expect, beforeEach } from 'vitest';
import { createMissions, parseFindingsFromResponse, getInternSystemPrompt, resetFindingCounter, buildRefinedBrief } from '../interns';
import type { ResearchSession } from '../../context/types';

beforeEach(() => resetFindingCounter());

describe('createMissions', () => {
  it('creates 3 intern missions from a brief', () => {
    const missions = createMissions('best tools for building a portfolio site');
    expect(missions).toHaveLength(3);
    expect(missions[0].role).toBe('scout');
    expect(missions[1].role).toBe('analyst');
    expect(missions[2].role).toBe('reviewer');
  });

  it('includes the brief in each mission', () => {
    const brief = 'AI market trends 2026';
    const missions = createMissions(brief);
    for (const m of missions) {
      expect(m.mission).toContain(brief);
    }
  });

  it('assigns correct colors and emojis', () => {
    const missions = createMissions('test');
    expect(missions[0].emoji).toBe('🔭');
    expect(missions[1].color).toBe('#B07CC6');
    expect(missions[2].name).toBe('Reviewer');
  });
});

describe('parseFindingsFromResponse', () => {
  it('extracts numbered findings with confidence', () => {
    const text = `Overall, the market is growing fast.

1. React dominates the frontend market [high]
2. Astro is gaining traction for content sites [medium]
3. Svelte has passionate fans but lower adoption [low]`;

    const findings = parseFindingsFromResponse(text, 'scout');
    expect(findings).toHaveLength(3);
    expect(findings[0].text).toContain('React dominates');
    expect(findings[0].confidence).toBe(0.9);
    expect(findings[1].confidence).toBe(0.65);
    expect(findings[2].confidence).toBe(0.35);
  });

  it('handles missing confidence brackets with default', () => {
    const text = '1. This finding has no confidence bracket and is quite detailed';
    const findings = parseFindingsFromResponse(text, 'analyst');
    expect(findings).toHaveLength(1);
    expect(findings[0].confidence).toBe(0.6);
  });

  it('skips short or non-numbered lines', () => {
    const text = `Some intro text.
Short.
1. A real finding with enough content to matter
Not numbered but long enough`;
    const findings = parseFindingsFromResponse(text, 'reviewer');
    expect(findings).toHaveLength(1);
  });

  it('assigns unique IDs', () => {
    const text = '1. First finding here is long enough\n2. Second finding here is long enough';
    const findings = parseFindingsFromResponse(text, 'scout');
    expect(findings[0].id).not.toBe(findings[1].id);
  });

  it('returns empty for conversational text', () => {
    const findings = parseFindingsFromResponse('Just a casual response with no structure.', 'analyst');
    expect(findings).toHaveLength(0);
  });

  it('strips markdown bold', () => {
    const text = '1. **Bold finding** with some detail here enough length';
    const findings = parseFindingsFromResponse(text, 'scout');
    expect(findings[0].text).toBe('Bold finding with some detail here enough length');
  });
});

describe('getInternSystemPrompt', () => {
  it('includes the intern role and mission', () => {
    const missions = createMissions('test brief');
    const prompt = getInternSystemPrompt(missions[0]);
    expect(prompt).toContain('Scout');
    expect(prompt).toContain('scout');
    expect(prompt).toContain('test brief');
  });
});

describe('buildRefinedBrief', () => {
  const makeSession = (findings: { text: string; feedback: string | null }[]): ResearchSession => ({
    id: 's1', brief: 'test question', paradigmId: 'stroop', personaIds: ['test'],
    missions: [], reports: [{
      role: 'scout', summary: '', status: 'done',
      findings: findings.map((f, i) => ({
        id: `f${i}`, internRole: 'scout' as const, text: f.text, confidence: 0.8,
        feedback: f.feedback as any,
      })),
    }],
    designReports: [], selectedDesignIndex: 0, paradigmIds: [], battery: [], peerReview: null, crossTaskAnalysis: null, analysisResults: [],
    synthesis: null, agreements: [], disagreements: [],
    openQuestions: ['what about X?'], nextMissions: [],
    createdAt: 0, completedAt: null, round: 1, previousSessionId: null,
  });

  it('includes useful findings in KEEP section', () => {
    const brief = buildRefinedBrief(makeSession([
      { text: 'React is popular', feedback: 'useful' },
      { text: 'Vue is niche', feedback: 'shallow' },
    ]));
    expect(brief).toContain('KEEP');
    expect(brief).toContain('React is popular');
    expect(brief).not.toContain('Vue is niche');
  });

  it('includes deeper findings in GO DEEPER section', () => {
    const brief = buildRefinedBrief(makeSession([
      { text: 'Astro performance', feedback: 'deeper' },
    ]));
    expect(brief).toContain('GO DEEPER');
    expect(brief).toContain('Astro performance');
  });

  it('includes wrong findings in AVOID section', () => {
    const brief = buildRefinedBrief(makeSession([
      { text: 'jQuery is the future', feedback: 'wrong' },
    ]));
    expect(brief).toContain('AVOID');
    expect(brief).toContain('jQuery is the future');
  });

  it('includes open questions', () => {
    const brief = buildRefinedBrief(makeSession([]));
    expect(brief).toContain('what about X?');
  });

  it('handles session with no feedback gracefully', () => {
    const brief = buildRefinedBrief(makeSession([
      { text: 'unfeedback finding', feedback: null },
    ]));
    expect(brief).toContain('test question');
    expect(brief).not.toContain('KEEP');
    expect(brief).not.toContain('GO DEEPER');
    expect(brief).not.toContain('AVOID');
  });
});
