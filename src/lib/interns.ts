import type { Intern, InternRole, Finding, ResearchSession } from '../context/types';

export const INTERN_PROFILES: Record<InternRole, Omit<Intern, 'mission'>> = {
  scout: {
    role: 'scout',
    name: 'Scout',
    emoji: '🔭',
    color: '#8BACD4',
    description: 'Broad sweep — maps the landscape, finds patterns and key players',
  },
  analyst: {
    role: 'analyst',
    name: 'Analyst',
    emoji: '🔬',
    color: '#B07CC6',
    description: 'Deep dive — picks the strongest angle and goes deep',
  },
  reviewer: {
    role: 'reviewer',
    name: 'Reviewer',
    emoji: '📝',
    color: '#E8A87C',
    description: 'Simulated peer reviewer — critiques design, methods, and statistical power',
  },
};

export function createMissions(brief: string): Intern[] {
  return [
    { ...INTERN_PROFILES.scout, mission: `Survey the landscape around: "${brief}". Map key players, trends, and options. Focus on breadth.` },
    { ...INTERN_PROFILES.analyst, mission: `Deep-dive into the most promising angle of: "${brief}". Find specific data, examples, and actionable details.` },
    { ...INTERN_PROFILES.reviewer, mission: `Review the experimental approach for: "${brief}". Identify methodological issues, suggest improvements, evaluate statistical power.` },
  ];
}

export function getInternSystemPrompt(intern: Intern): string {
  return `You are ${intern.name}, a research intern with a specific approach: ${intern.description}.

Your mission: ${intern.mission}

Instructions:
- Research this thoroughly from your specific angle (${intern.role})
- Return 3-5 key findings as a numbered list
- For each finding, include a confidence level in brackets: [high], [medium], or [low]
- Be specific and cite examples, data, or trends when possible
- Keep your total response under 300 words
- Write in a clear, professional but friendly tone
- Start with a one-sentence summary of your overall finding`;
}

let findingCounter = 0;

export function parseFindingsFromResponse(text: string, role: InternRole): Finding[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const findings: Finding[] = [];

  for (const line of lines) {
    const match = line.match(/^\d+[.)]\s+(.+)/);
    if (!match) continue;

    let findingText = match[1].replace(/\*\*/g, '').trim();
    let confidence = 0.6;

    const confMatch = findingText.match(/\[(high|medium|low)\]/i);
    if (confMatch) {
      const level = confMatch[1].toLowerCase();
      confidence = level === 'high' ? 0.9 : level === 'medium' ? 0.65 : 0.35;
      findingText = findingText.replace(/\[(high|medium|low)\]/i, '').trim();
    }

    if (findingText.length >= 10) {
      findings.push({
        id: `f-${++findingCounter}-${Date.now()}`,
        internRole: role,
        text: findingText,
        confidence,
        feedback: null,
      });
    }
  }

  return findings;
}

export function resetFindingCounter(): void {
  findingCounter = 0;
}

/** Build a refined brief from a session's feedback. Pure function. */
export function buildRefinedBrief(session: ResearchSession): string {
  const allFindings = session.reports.flatMap(r => r.findings);
  const useful = allFindings.filter(f => f.feedback === 'useful').map(f => f.text);
  const deeper = allFindings.filter(f => f.feedback === 'deeper').map(f => f.text);
  const wrong = allFindings.filter(f => f.feedback === 'wrong').map(f => f.text);

  const parts: string[] = [`Original question: "${session.brief}"`];

  if (useful.length > 0) {
    parts.push(`\nKEEP — these were useful:\n${useful.map(t => `- ${t}`).join('\n')}`);
  }
  if (deeper.length > 0) {
    parts.push(`\nGO DEEPER on:\n${deeper.map(t => `- ${t}`).join('\n')}`);
  }
  if (wrong.length > 0) {
    parts.push(`\nAVOID — wrong direction:\n${wrong.map(t => `- ${t}`).join('\n')}`);
  }
  if (session.openQuestions.length > 0) {
    parts.push(`\nOpen questions to prioritize:\n${session.openQuestions.map(q => `- ${q}`).join('\n')}`);
  }

  parts.push('\nBased on this feedback, investigate further. Focus on what was useful, go deeper where requested, and avoid wrong directions.');

  return parts.join('\n');
}
