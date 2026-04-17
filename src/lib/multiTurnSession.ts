/**
 * MULTI-TURN LLM SESSION INFRASTRUCTURE
 *
 * Enables multi-trial experiments where the LLM carries context
 * between trials — just like a real human participant.
 *
 * Key design decisions:
 * - Conversation history threads between trials (humans remember recent trials)
 * - Rolling context window limits simulate bounded working memory
 * - Outcome feedback embeds naturally (humans know what happened last trial)
 * - Each trial adds user (stimulus) + assistant (response) to history
 *
 * Used by: WCST (64 trials with feedback), Two-Step (80 trials with learning),
 * and any future multi-turn task.
 */

import { callClaudeApi } from './apiKey';

// ============================================================
// TYPES
// ============================================================

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MultiTurnSession {
  personaPrompt: string;
  taskSystemPrompt: string;
  history: SessionMessage[];
  /** Max messages to keep in context (rolling window). null = unlimited. */
  maxHistoryMessages: number | null;
  /** Summary of old trials that have been evicted from the rolling window. */
  historySummary: string;
  /** All outcomes for analysis (never evicted). */
  outcomes: TrialOutcome[];
}

export interface TrialOutcome {
  trialIndex: number;
  stimulus: string;
  response: any;
  rawText: string;
  latencyMs: number;
  feedback?: string;
  metadata?: Record<string, any>;
}

export interface MultiTurnTrialInput {
  /** The stimulus for this trial (becomes user message). */
  stimulus: string;
  /** Optional feedback from previous trial to prepend. */
  previousFeedback?: string;
  /** Max tokens for response. */
  maxTokens?: number;
}

export interface MultiTurnTrialOutput {
  response: any;
  rawText: string;
  latencyMs: number;
}

// ============================================================
// SESSION MANAGEMENT
// ============================================================

/**
 * Create a new multi-turn session for one participant on one task.
 */
export function createSession(
  personaPrompt: string,
  taskSystemPrompt: string,
  maxHistoryMessages: number | null = 40,
): MultiTurnSession {
  return {
    personaPrompt,
    taskSystemPrompt,
    history: [],
    maxHistoryMessages,
    historySummary: '',
    outcomes: [],
  };
}

/**
 * Run one trial within an ongoing session.
 * Threads conversation history so the LLM "remembers" recent trials.
 */
export async function runTrialInSession(
  session: MultiTurnSession,
  input: MultiTurnTrialInput,
): Promise<MultiTurnTrialOutput> {
  const start = Date.now();

  // Build the stimulus message, prepending feedback if present
  let userContent = '';
  if (input.previousFeedback) {
    userContent += input.previousFeedback + '\n\n';
  }
  userContent += input.stimulus;

  // Build conversation messages: history + current stimulus
  const messages: SessionMessage[] = [
    ...session.history,
    { role: 'user', content: userContent },
  ];

  // Build system prompt with optional history summary
  let system = `${session.personaPrompt}\n\n${session.taskSystemPrompt}`;
  if (session.historySummary) {
    system += `\n\nSummary of earlier trials:\n${session.historySummary}`;
  }

  try {
    const res = await callClaudeApi({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: input.maxTokens ?? 300,
      system,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? '';
    const latencyMs = Date.now() - start;

    // Parse JSON response
    let response: any;
    try {
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      response = first >= 0 ? JSON.parse(cleaned.slice(first, last + 1)) : { raw: rawText };
    } catch {
      response = { raw: rawText };
    }

    // Append to conversation history
    session.history.push({ role: 'user', content: userContent });
    session.history.push({ role: 'assistant', content: rawText });

    // Enforce rolling window — evict old messages and summarize
    if (session.maxHistoryMessages !== null && session.history.length > session.maxHistoryMessages) {
      const evicted = session.history.splice(0, session.history.length - session.maxHistoryMessages);
      // Compress evicted messages into summary
      const evictedSummary = evicted
        .filter(m => m.role === 'assistant')
        .map((m, i) => `Trial: ${m.content.slice(0, 80)}`)
        .join('\n');
      session.historySummary += (session.historySummary ? '\n' : '') + evictedSummary;
      // Cap summary length
      if (session.historySummary.length > 2000) {
        session.historySummary = session.historySummary.slice(-2000);
      }
    }

    // Record outcome
    session.outcomes.push({
      trialIndex: session.outcomes.length,
      stimulus: input.stimulus,
      response,
      rawText,
      latencyMs,
    });

    return { response, rawText, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errorResult = { response: { error: true }, rawText: '', latencyMs };

    session.outcomes.push({
      trialIndex: session.outcomes.length,
      stimulus: input.stimulus,
      response: { error: true },
      rawText: '',
      latencyMs,
    });

    return errorResult;
  }
}

/**
 * Add feedback to the last outcome (used by tasks that give feedback after response).
 */
export function recordFeedback(session: MultiTurnSession, feedback: string): void {
  const last = session.outcomes[session.outcomes.length - 1];
  if (last) last.feedback = feedback;
}

/**
 * Add metadata to the last outcome.
 */
export function recordMetadata(session: MultiTurnSession, metadata: Record<string, any>): void {
  const last = session.outcomes[session.outcomes.length - 1];
  if (last) last.metadata = { ...last.metadata, ...metadata };
}
