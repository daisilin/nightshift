import { describe, it, expect, beforeEach } from 'vitest';
import { createMissions, parseFindingsFromResponse, getInternSystemPrompt, resetFindingCounter } from '../interns';

beforeEach(() => resetFindingCounter());

describe('createMissions', () => {
  it('creates 3 intern missions from a brief', () => {
    const missions = createMissions('best tools for building a portfolio site');
    expect(missions).toHaveLength(3);
    expect(missions[0].role).toBe('scout');
    expect(missions[1].role).toBe('analyst');
    expect(missions[2].role).toBe('contrarian');
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
    expect(missions[2].name).toBe('Contrarian');
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
    const findings = parseFindingsFromResponse(text, 'contrarian');
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
