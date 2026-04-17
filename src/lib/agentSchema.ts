/**
 * Schema validators for agent JSON output.
 *
 * Agents return free-form text that *should* contain a JSON block. These
 * helpers take parsed JSON and return a typed value or null — never throw.
 * Downstream code can then rely on array-ness, string-ness, etc.
 */

import type { AgentPlan } from '../components/PlanConfirmation';
import type { AgentProbe, ProbeQuestion, ProbeFlag } from '../components/ProbeCard';

const isString = (v: unknown): v is string => typeof v === 'string';
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every(isString);

export function validatePlan(raw: unknown): AgentPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  const plan: AgentPlan = {};
  if (isString(u.brief)) plan.brief = u.brief;
  if (isStringArray(u.addTasks)) plan.addTasks = u.addTasks;
  if (isStringArray(u.removeTasks)) plan.removeTasks = u.removeTasks;
  if (isStringArray(u.addPersonas)) plan.addPersonas = u.addPersonas;
  if (isStringArray(u.removePersonas)) plan.removePersonas = u.removePersonas;
  if (typeof u.nParticipants === 'number' && u.nParticipants > 0) plan.nParticipants = u.nParticipants;
  if (u.modelPool === 'sonnet' || u.modelPool === 'diverse' || u.modelPool === 'capability-spread') {
    plan.modelPool = u.modelPool;
  }
  if (isString(u.notes)) plan.notes = u.notes;

  // A plan must make at least one change to be meaningful.
  const hasAnything =
    plan.brief || plan.addTasks || plan.removeTasks || plan.addPersonas ||
    plan.removePersonas || plan.nParticipants || plan.modelPool;
  return hasAnything ? plan : null;
}

export function validateProbe(raw: unknown): AgentProbe | null {
  if (!raw || typeof raw !== 'object') return null;
  const u = raw as Record<string, unknown>;
  if (u.mode !== 'probe') return null;
  if (!Array.isArray(u.probes)) return null;

  const probes: ProbeQuestion[] = [];
  for (const p of u.probes) {
    if (!p || typeof p !== 'object') continue;
    const q = p as Record<string, unknown>;
    if (!isString(q.id) || !isString(q.question)) continue;
    probes.push({
      id: q.id,
      question: q.question,
      why: isString(q.why) ? q.why : undefined,
      options: isStringArray(q.options) ? q.options : undefined,
    });
  }
  if (probes.length === 0) return null;

  const flags: ProbeFlag[] = [];
  if (Array.isArray(u.flags)) {
    for (const f of u.flags) {
      if (!f || typeof f !== 'object') continue;
      const g = f as Record<string, unknown>;
      if (!isString(g.message)) continue;
      flags.push({
        severity: g.severity === 'warning' ? 'warning' : 'info',
        message: g.message,
      });
    }
  }

  return { mode: 'probe', probes, flags: flags.length > 0 ? flags : undefined };
}

/**
 * Try to extract a JSON object from free-form agent text. Returns the parsed
 * value or null. Handles both ```json fenced blocks and bare {...} bodies.
 */
export function extractJson(raw: string): unknown {
  if (!raw) return null;
  const fence = raw.match(/```json\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : raw;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first < 0 || last <= first) return null;
    try {
      return JSON.parse(candidate.slice(first, last + 1));
    } catch {
      return null;
    }
  }
}
