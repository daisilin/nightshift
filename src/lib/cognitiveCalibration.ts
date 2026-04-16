/**
 * COGNITIVE CALIBRATION: Persona → Structural Parameters
 *
 * Maps population characteristics to context window size and temperature,
 * based on empirical findings from our research:
 *
 * - Context window ≈ working memory capacity (r=0.99 on Corsi, n=20)
 * - Temperature ≈ cognitive noise / exploration (modulates Two-Step switching)
 * - Model tier ≈ capability level (Opus > Sonnet > Haiku on WCST)
 *
 * Calibration targets:
 * - ctx=10-12 → Corsi span 6-7 (human mean)
 * - ctx=6-8 → low WM populations (children, ADHD, distracted)
 * - ctx=14-16 → high WM populations (experts, young adults, focused)
 * - temp=0.7-0.9 → moderate noise (typical adult)
 * - temp=0.3-0.5 → low noise (careful, analytical)
 * - temp=0.9-1.0 → high noise (impulsive, inattentive)
 */

export interface CognitiveParams {
  contextWindow: number;   // messages to keep in conversation history (6-16)
  temperature: number;     // sampling temperature (0.3-1.0)
  modelTier: 'low' | 'medium' | 'high';  // maps to model selection
}

export interface CalibrationProfile {
  label: string;
  description: string;
  params: CognitiveParams;
}

/**
 * Pre-built calibration profiles for common population types.
 * Based on empirical mapping: ctx → Corsi span, temp → Two-Step exploration.
 */
export const CALIBRATION_PROFILES: Record<string, CalibrationProfile> = {
  'college-student': {
    label: 'College student',
    description: 'Young adult, moderate WM, somewhat impulsive',
    params: { contextWindow: 10, temperature: 0.8, modelTier: 'medium' },
  },
  'mturk-worker': {
    label: 'MTurk / Prolific worker',
    description: 'Experienced, moderate engagement, some satisficing',
    params: { contextWindow: 9, temperature: 0.85, modelTier: 'medium' },
  },
  'older-adult': {
    label: 'Older adult (65+)',
    description: 'Slower but careful, moderate WM with compensation',
    params: { contextWindow: 10, temperature: 0.65, modelTier: 'medium' },
  },
  'child': {
    label: 'Child (8-12)',
    description: 'High variability, short attention, impulsive',
    params: { contextWindow: 7, temperature: 0.95, modelTier: 'low' },
  },
  'clinical-adhd': {
    label: 'ADHD profile',
    description: 'Variable attention, impulsive, creative',
    params: { contextWindow: 7, temperature: 0.95, modelTier: 'medium' },
  },
  'expert': {
    label: 'Expert / high performer',
    description: 'High WM, focused, analytical, low noise',
    params: { contextWindow: 14, temperature: 0.45, modelTier: 'high' },
  },
  'average-adult': {
    label: 'Average adult',
    description: 'Moderate WM and noise — closest to population mean',
    params: { contextWindow: 11, temperature: 0.7, modelTier: 'medium' },
  },
};

/**
 * Model pool configurations for multi-model diversity.
 */
export type ModelPoolType = 'sonnet' | 'diverse' | 'capability-spread' | 'custom';

export interface ModelPoolConfig {
  label: string;
  description: string;
  models: { id: string; weight: number; tier: 'low' | 'medium' | 'high' }[];
}

export const MODEL_POOLS: Record<ModelPoolType, ModelPoolConfig> = {
  'sonnet': {
    label: 'Sonnet 4.6 (standard)',
    description: 'Single model, persona-driven diversity only',
    models: [{ id: 'us.anthropic.claude-sonnet-4-6', weight: 1.0, tier: 'medium' }],
  },
  'diverse': {
    label: 'Multi-model diverse',
    description: '5 model families for genuine architectural diversity',
    models: [
      { id: 'us.anthropic.claude-sonnet-4-6', weight: 0.34, tier: 'medium' },
      { id: 'us.anthropic.claude-opus-4-6-v1', weight: 0.16, tier: 'high' },
      { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', weight: 0.16, tier: 'low' },
      { id: 'qwen.qwen3-235b-a22b-2507-v1:0', weight: 0.17, tier: 'medium' },
      { id: 'mistral.mistral-large-3-675b-instruct', weight: 0.17, tier: 'medium' },
    ],
  },
  'capability-spread': {
    label: 'Capability spread',
    description: 'Haiku (low) + Sonnet (mid) + Opus (high) — maps to ability levels',
    models: [
      { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', weight: 0.33, tier: 'low' },
      { id: 'us.anthropic.claude-sonnet-4-6', weight: 0.34, tier: 'medium' },
      { id: 'us.anthropic.claude-opus-4-6-v1', weight: 0.33, tier: 'high' },
    ],
  },
  'custom': {
    label: 'Custom',
    description: 'Choose your own model mix',
    models: [{ id: 'us.anthropic.claude-sonnet-4-6', weight: 1.0, tier: 'medium' }],
  },
};

/**
 * Generate N calibrated participants from a population description.
 * Each participant gets:
 * - A persona prompt (from population type)
 * - Calibrated ctx and temp (with individual variation)
 * - A model assignment (from pool)
 */
export function generateCalibratedPool(
  populationType: string,
  n: number,
  modelPool: ModelPoolType = 'sonnet',
): {
  id: string;
  modelId: string;
  contextWindow: number;
  temperature: number;
  personaPrompt: string;
}[] {
  const profile = CALIBRATION_PROFILES[populationType] ?? CALIBRATION_PROFILES['average-adult'];
  const pool = MODEL_POOLS[modelPool];
  const baseCtx = profile.params.contextWindow;
  const baseTemp = profile.params.temperature;

  const participants = [];
  for (let i = 0; i < n; i++) {
    // Add individual variation (±2 ctx, ±0.1 temp)
    const variation = (i / (n - 1 || 1)) * 2 - 1; // -1 to +1 spread
    const ctx = Math.round(Math.max(6, Math.min(16, baseCtx + variation * 2)));
    const temp = Math.max(0.3, Math.min(1.0, baseTemp + variation * 0.1));

    // Assign model based on pool weights
    let modelId = pool.models[0].id;
    let cumWeight = 0;
    const roll = (i / n); // deterministic spread across models
    for (const m of pool.models) {
      cumWeight += m.weight;
      if (roll < cumWeight) { modelId = m.id; break; }
    }

    participants.push({
      id: `p${String(i + 1).padStart(2, '0')}`,
      modelId,
      contextWindow: ctx,
      temperature: temp,
      personaPrompt: profile.description,
    });
  }

  return participants;
}

/**
 * Get the Bedrock API format for a model ID.
 */
export function getModelApiType(modelId: string): 'anthropic' | 'converse' {
  return modelId.includes('anthropic') ? 'anthropic' : 'converse';
}
