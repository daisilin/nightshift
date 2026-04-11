import type { Intern, InternRole, Finding } from '../context/types';

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
  contrarian: {
    role: 'contrarian',
    name: 'Contrarian',
    emoji: '🪞',
    color: '#E8A87C',
    description: 'Devil\'s advocate — finds risks, blind spots, and opposing views',
  },
};

export function createMissions(brief: string): Intern[] {
  return [
    { ...INTERN_PROFILES.scout, mission: `Survey the landscape around: "${brief}". Map key players, trends, and options. Focus on breadth.` },
    { ...INTERN_PROFILES.analyst, mission: `Deep-dive into the most promising angle of: "${brief}". Find specific data, examples, and actionable details.` },
    { ...INTERN_PROFILES.contrarian, mission: `Challenge the assumptions in: "${brief}". Find risks, counterexamples, and what people get wrong about this.` },
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
