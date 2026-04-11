import type { Intern, InternRole } from '../context/types';
import { getInternSystemPrompt, parseFindingsFromResponse } from './interns';

async function callClaude(system: string, user: string): Promise<string> {
  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text ?? '';
  } catch {
    return '';
  }
}

export interface InternResult {
  role: InternRole;
  summary: string;
  findings: ReturnType<typeof parseFindingsFromResponse>;
  raw: string;
}

export async function runIntern(intern: Intern): Promise<InternResult> {
  const system = getInternSystemPrompt(intern);
  const raw = await callClaude(system, `Research this: ${intern.mission}`);

  if (!raw) {
    return { role: intern.role, summary: 'Failed to complete research', findings: [], raw: '' };
  }

  const lines = raw.split('\n').filter(l => l.trim());
  const summary = lines[0] || 'Research complete';
  const findings = parseFindingsFromResponse(raw, intern.role);

  return { role: intern.role, summary, findings, raw };
}

export async function runAllInterns(
  interns: Intern[],
  onProgress: (role: InternRole, status: 'working' | 'done') => void,
): Promise<InternResult[]> {
  onProgress(interns[0].role, 'working');
  onProgress(interns[1].role, 'working');
  onProgress(interns[2].role, 'working');

  const results = await Promise.all(
    interns.map(async (intern) => {
      const result = await runIntern(intern);
      onProgress(intern.role, 'done');
      return result;
    })
  );

  return results;
}

export async function synthesizeReports(brief: string, results: InternResult[]): Promise<{
  synthesis: string;
  agreements: string[];
  disagreements: string[];
  openQuestions: string[];
  nextMissions: string[];
}> {
  const system = `You are a research manager synthesizing reports from 3 research interns.
Return a JSON object with these keys:
- "synthesis": 2-3 sentence executive summary
- "agreements": array of 2-3 points where all interns agree
- "disagreements": array of 1-2 points where they disagree
- "openQuestions": array of 2-3 unresolved questions
- "nextMissions": array of 2-3 suggested follow-up research directions

Return ONLY valid JSON, no markdown code fences.`;

  const user = `Research brief: "${brief}"

Scout's report:
${results.find(r => r.role === 'scout')?.raw || 'No data'}

Analyst's report:
${results.find(r => r.role === 'analyst')?.raw || 'No data'}

Contrarian's report:
${results.find(r => r.role === 'contrarian')?.raw || 'No data'}

Synthesize these into a manager-quality briefing.`;

  const raw = await callClaude(system, user);

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      synthesis: 'Research complete. Review individual intern reports below.',
      agreements: ['Multiple interns found relevant information'],
      disagreements: ['Approaches varied across interns'],
      openQuestions: ['Further research may be needed'],
      nextMissions: ['Consider deeper investigation into key findings'],
    };
  }
}
