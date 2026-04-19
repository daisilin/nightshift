import { describe, it, expect } from 'vitest';
import { stripHeavy, stripPaperContext } from '../../context/AppContext';

describe('stripHeavy', () => {
  it('removes dataset from battery tasks but keeps design + metrics', () => {
    const session = {
      id: 's1',
      battery: [
        { paradigmId: 'wcst', design: { x: 1 }, dataset: { big: 'data' }, metrics: { score: 80 }, status: 'done' },
      ],
      designReports: [],
      paperContext: 'some text',
    };
    const stripped = stripHeavy(session);
    expect(stripped.battery[0].dataset).toBeNull();
    expect(stripped.battery[0].design).toEqual({ x: 1 });
    expect(stripped.battery[0].metrics).toEqual({ score: 80 });
    expect(stripped.paperContext).toBeNull();
  });

  it('removes dataset from designReports', () => {
    const session = {
      id: 's1',
      battery: [],
      designReports: [
        { role: 'scout', design: { y: 2 }, dataset: { raw: 'big' }, metrics: null, status: 'done' },
      ],
      paperContext: null,
    };
    const stripped = stripHeavy(session);
    expect(stripped.designReports[0].dataset).toBeNull();
    expect(stripped.designReports[0].design).toEqual({ y: 2 });
  });

  it('handles undefined battery/designReports gracefully', () => {
    const session: { id: string; paperContext: string | null; battery?: any[]; designReports?: any[] } = { id: 's1', paperContext: 'x' };
    const stripped = stripHeavy(session);
    expect(stripped.battery).toEqual([]);
    expect(stripped.designReports).toEqual([]);
  });
});

describe('stripPaperContext', () => {
  it('truncates paperContext over 2000 chars', () => {
    const session = { paperContext: 'x'.repeat(5000) };
    const stripped = stripPaperContext(session);
    expect(stripped.paperContext!.length).toBeLessThan(5000);
    expect(stripped.paperContext).toContain('[truncated for storage]');
  });

  it('leaves short paperContext unchanged', () => {
    const session = { paperContext: 'short' };
    const stripped = stripPaperContext(session);
    expect(stripped.paperContext).toBe('short');
  });

  it('leaves null paperContext alone', () => {
    const session = { paperContext: null };
    const stripped = stripPaperContext(session);
    expect(stripped.paperContext).toBeNull();
  });
});
