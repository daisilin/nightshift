import type { ExperimentDesign, PilotMetrics } from './types';
import type { ParadigmDefinition, PersonaDefinition } from './types';
import { INTERN_PROFILES } from './interns';
import type { InternRole } from '../context/types';

// ============================================================
// LOW-LEVEL CLAUDE CALL
// ============================================================

async function callClaude(system: string, user: string, maxTokens = 1200): Promise<string> {
  try {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
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

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ============================================================
// PROPOSE EXPERIMENT DESIGN
// ============================================================

export async function proposeDesign(
  role: InternRole,
  brief: string,
  paradigm: ParadigmDefinition,
  personas: PersonaDefinition[],
): Promise<ExperimentDesign> {
  const intern = INTERN_PROFILES[role];

  const system = `You are ${intern.name}, a research intern designing behavioral experiments.
Your approach: ${intern.description}

You must return ONLY valid JSON matching this schema:
{
  "name": "string — short experiment name",
  "params": ${paradigm.paradigmType === 'behavioral'
    ? '{ "type": "behavioral", "difficulty": 0-1, "nTrials": 20-100, "nConditions": 2-4, "conditionLabels": ["string"...], "withinSubject": true/false, "rtRange": [min_ms, max_ms], "baseAccuracy": 0.5-0.95 }'
    : '{ "type": "survey", "nItems": 10-40, "scalePoints": 2|5|7, "nSubscales": 1-5, "subscaleNames": ["string"...], "reverseCodedIndices": [int...] }'},
  "nParticipantsPerPersona": 15-30,
  "hypotheses": ["string", "string"],
  "rationale": "1-2 sentences explaining your design choice"
}

Paradigm: ${paradigm.name} — ${paradigm.description}
Populations to simulate: ${personas.map(p => `${p.name} (${p.description})`).join(', ')}

${role === 'scout' ? 'Design a standard, well-established version of this paradigm. Prioritize proven approaches.' : ''}
${role === 'analyst' ? 'Design a targeted version that maximizes the effect for the specific research question. Be creative with parameters.' : ''}
${role === 'contrarian' ? 'Design a version that tests an alternative hypothesis or unexpected angle. Challenge the obvious approach.' : ''}

Return ONLY the JSON object, no explanation.`;

  const raw = await callClaude(system, `Research brief: "${brief}"\nParadigm: ${paradigm.name}\nPropose an experiment design.`);

  const parsed = parseJSON(raw, {
    name: `${intern.name}'s ${paradigm.name} design`,
    params: paradigm.defaultParams,
    nParticipantsPerPersona: 20,
    hypotheses: ['Effect of condition on dependent variable'],
    rationale: `Standard ${paradigm.name} design proposed by ${intern.name}.`,
  });

  return {
    id: `design-${role}-${Date.now()}`,
    paradigmId: paradigm.id,
    personaIds: personas.map(p => p.id),
    internRole: role,
    name: parsed.name || `${intern.name}'s design`,
    params: parsed.params?.type ? parsed.params : paradigm.defaultParams,
    nParticipantsPerPersona: parsed.nParticipantsPerPersona || 20,
    hypotheses: parsed.hypotheses || ['Effect of condition on DV'],
    rationale: parsed.rationale || '',
  };
}

// ============================================================
// SYNTHESIZE PILOT RESULTS (interprets computed metrics)
// ============================================================

export async function synthesizePilotResults(
  brief: string,
  designs: ExperimentDesign[],
  allMetrics: PilotMetrics[],
): Promise<string> {
  const system = `You are a research manager interpreting pilot experiment results.
You receive COMPUTED metrics — do not invent numbers. Refer only to the numbers given.
Write 3-4 sentences: which design looks best, any concerns (ceiling effects, low reliability, etc.),
and what to try next. Be specific and cite the metric values.
Keep it under 100 words. Use lowercase, be direct.`;

  const metricsText = allMetrics.map((m, i) => {
    const d = designs[i];
    const personaSummary = m.byPersona.map(p =>
      `${p.personaName}: ${p.metrics.map(met => `${met.name}=${met.value}${met.flag ? ` ⚠${met.flag}` : ''}`).join(', ')}`
    ).join('\n    ');
    return `Design "${d.name}" (${d.internRole}) — score: ${m.overallScore}/100, recommendation: ${m.recommendation}
    ${personaSummary}`;
  }).join('\n\n');

  const raw = await callClaude(system, `Brief: "${brief}"\n\nPilot results:\n${metricsText}\n\nInterpret these results.`, 400);
  return raw || `Three designs were tested. Best overall score: ${Math.max(...allMetrics.map(m => m.overallScore))}/100. Review per-persona metrics below for details.`;
}

// ============================================================
// RUN FULL PIPELINE (propose → simulate → compute → synthesize)
// ============================================================

export interface PipelineResult {
  design: ExperimentDesign;
  metrics: PilotMetrics;
}

export type DispatchStatus = 'proposing' | 'simulating' | 'computing' | 'done' | 'error';
