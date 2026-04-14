import type { ExperimentDesign, PilotMetrics } from './types';
import type { ParadigmDefinition, PersonaDefinition } from './types';
import { INTERN_PROFILES } from './interns';
import type { InternRole } from '../context/types';
import { callClaudeApi } from './apiKey';

// ============================================================
// LOW-LEVEL CLAUDE CALL
// ============================================================

async function callClaude(system: string, user: string, maxTokens = 1200): Promise<string> {
  try {
    const res = await callClaudeApi({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
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

  // Extract iteration feedback from brief if present
  const feedbackMatch = brief.match(/\[round \d+ feedback: (.+?)\]/);
  const iterationFeedback = feedbackMatch?.[1] || '';

  const system = `You are ${intern.name}, a research intern designing behavioral experiments.
Your approach: ${intern.description}

You must return ONLY valid JSON matching this schema:
{
  "name": "string — short experiment name",
  "params": ${paradigm.paradigmType === 'behavioral'
    ? '{ "type": "behavioral", "difficulty": 0-1, "nTrials": 20-100, "nConditions": 2-4, "conditionLabels": ["string"...], "withinSubject": true/false, "rtRange": [min_ms, max_ms], "baseAccuracy": 0.5-0.95 }'
    : '{ "type": "survey", "nItems": 10-40, "scalePoints": 2|5|7, "nSubscales": 1-5, "subscaleNames": ["string"...], "reverseCodedIndices": [int...] }'},
  "nParticipantsPerPersona": integer (default 20; if researcher feedback asks for more participants, use that number exactly),
  "hypotheses": ["string", "string"],
  "rationale": "1-2 sentences explaining your design choice"
}

Paradigm: ${paradigm.name} — ${paradigm.description}
Populations to simulate: ${personas.map(p => `${p.name} (${p.description})`).join(', ')}

${iterationFeedback ? `RESEARCHER FEEDBACK FROM PREVIOUS ROUND: "${iterationFeedback}"
Incorporate this feedback directly into your design. If the feedback requests a specific sample size, use it exactly.` : ''}
${role === 'scout' ? 'Design a standard, well-established version of this paradigm. Prioritize proven approaches.' : ''}
${role === 'analyst' ? 'Design a targeted version that maximizes the effect for the specific research question. Be creative with parameters.' : ''}
${role === 'reviewer' ? 'Design a version that tests an alternative hypothesis or unexpected angle. Challenge the obvious approach.' : ''}

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
// PEER REVIEW — simulates actual reviewer behavior
// ============================================================

import type { PeerReview } from '../context/types';

export async function generatePeerReview(
  brief: string,
  designs: ExperimentDesign[],
  allMetrics: PilotMetrics[],
): Promise<PeerReview> {
  const system = `You are Reviewer 2 for a top cognitive science journal (e.g., Nature Communications, Psychological Science).
You are reviewing a pilot study report. Be rigorous but constructive, like a real reviewer.

Consider:
- Is the sample size adequate for the effect sizes observed?
- Are there ceiling/floor effects that compromise the design?
- Is the task appropriate for the research question?
- Are the dependent variables well-chosen?
- Would this design survive a methods review?
- Are there confounds or alternative explanations?

Return ONLY valid JSON:
{
  "strengths": ["2-3 specific strengths"],
  "weaknesses": ["2-3 specific methodological concerns"],
  "suggestions": ["2-3 actionable revision suggestions"],
  "verdict": one of "accept", "minor-revisions", "major-revisions", "reject",
  "confidence": 0.0-1.0 (your confidence in this review)
}

Be specific. Cite the actual metric values you see. Do not be generic.
A good reviewer catches real problems (underpowered study, ceiling effects, wrong task for the question).
Return ONLY JSON.`;

  const metricsText = allMetrics.map((m, i) => {
    const d = designs[i];
    const flags = m.byPersona.flatMap(p => p.metrics.filter(met => met.flag).map(met => `${p.personaName}: ${met.flag}`));
    return `Design: "${d.name}" (${d.paradigmId})
  Score: ${m.overallScore}/100, Recommendation: ${m.recommendation}
  Participants: ${d.nParticipantsPerPersona}/persona × ${d.personaIds.length} personas
  ${d.params.type === 'behavioral' ? `Trials: ${d.params.nTrials}, Conditions: ${d.params.nConditions}, Difficulty: ${d.params.difficulty}` : `Items: ${d.params.nItems}, Scale: ${d.params.scalePoints}-point`}
  Flags: ${flags.length > 0 ? flags.join('; ') : 'none'}
  Per-persona metrics: ${m.byPersona.map(p => `${p.personaName}: ${p.metrics.map(met => `${met.name}=${met.value}`).join(', ')}`).join(' | ')}`;
  }).join('\n\n');

  const raw = await callClaude(system, `Research brief: "${brief}"\n\nPilot results:\n${metricsText}`, 600);

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned) as PeerReview;
  } catch {
    return {
      strengths: ['Study addresses a clear research question'],
      weaknesses: ['Sample size may need justification', 'Consider additional control conditions'],
      suggestions: ['Increase sample size', 'Add manipulation check'],
      verdict: 'major-revisions',
      confidence: 0.5,
    };
  }
}

// ============================================================
// ANALYSIS PLANNING — Claude decides what analyses to run
// ============================================================

import type { AnalysisPlan } from './analysis/types';
import { defaultSingleTaskPlan, defaultBatteryPlan } from './analysis/registry';

export async function planAnalysis(
  brief: string,
  taskNames: string[],
  nTasks: number,
): Promise<AnalysisPlan> {
  const availableSteps = [
    'descriptive-stats', 'split-half-reliability', 'ceiling-floor',
    'outlier-detection', 'condition-effects', 'persona-differences',
    'correlation-matrix', 'exploratory-fa',
  ];

  const system = `You plan statistical analyses for behavioral research.
Given a research brief and task list, return a JSON analysis plan.

Available steps: ${availableSteps.join(', ')}

Rules:
- Always include descriptive-stats and split-half-reliability
- Include correlation-matrix and exploratory-fa ONLY for 2+ tasks
- exploratory-fa needs nFactors param (usually 2-3, max tasks/2)
- correlation-matrix can take permutations param (default 500)
- Include condition-effects for behavioral tasks
- Include ceiling-floor for quality check

Return ONLY JSON: { "steps": [{ "id": "step-id", "params": {} }, ...] }`;

  const raw = await callClaude(system,
    `Brief: "${brief}"\nTasks: ${taskNames.join(', ')} (${nTasks} tasks)\nPlan the analyses.`, 400);

  try {
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as AnalysisPlan;
    if (parsed.steps?.length > 0) return parsed;
  } catch { /* fall through */ }

  // Fallback to default plan
  return nTasks > 1 ? defaultBatteryPlan(nTasks) : defaultSingleTaskPlan();
}

export type DispatchStatus = 'proposing' | 'simulating' | 'computing' | 'done' | 'error';
