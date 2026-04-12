import { createRng, normalDraw } from './simulation';

// ============================================================
// LATENT COGNITIVE ABILITY MODEL
// Based on factor structure from Lin & Ma (Nature Communications)
// ============================================================

/** Latent cognitive factors for each simulated participant */
export interface LatentProfile {
  g: number;           // general ability (fluid intelligence)
  spatial: number;     // visuospatial processing
  workingMemory: number; // working memory capacity
  inhibition: number;  // inhibitory control
}

/** How much each task loads on each latent factor */
export interface TaskLoadings {
  g: number;
  spatial: number;
  workingMemory: number;
  inhibition: number;
}

/**
 * Factor loadings per task.
 * Values derived from Table 2 of Lin & Ma (Nature Communications):
 * Varimax-rotated factor loadings for the three-factor solution.
 * Factor 1 ≈ spatial/g, Factor 2 ≈ working memory, Factor 3 ≈ inhibition.
 * g loading estimated from Raven's SPM correlations (Table 1).
 */
export const TASK_LOADINGS: Record<string, TaskLoadings> = {
  'tower-of-london': { g: 0.39, spatial: 0.63, workingMemory: 0.13, inhibition: 0.19 },
  'four-in-a-row':   { g: 0.34, spatial: 0.20, workingMemory: 0.67, inhibition: 0.15 },
  'two-step':        { g: 0.23, spatial: 0.00, workingMemory: 0.18, inhibition: 0.83 },
  'corsi-block':     { g: 0.33, spatial: 0.14, workingMemory: 0.78, inhibition: 0.05 },
  'n-back':          { g: 0.32, spatial: 0.21, workingMemory: 0.70, inhibition: 0.09 },
  'stroop':          { g: 0.30, spatial: 0.32, workingMemory: 0.03, inhibition: 0.62 },
  'rush-hour':       { g: 0.35, spatial: 0.50, workingMemory: 0.30, inhibition: 0.20 },
  'chess':           { g: 0.40, spatial: 0.55, workingMemory: 0.35, inhibition: 0.10 },
  // Surveys load primarily on g (conscientiousness, self-report accuracy)
  'likert-survey':   { g: 0.15, spatial: 0.00, workingMemory: 0.10, inhibition: 0.05 },
  'forced-choice':   { g: 0.15, spatial: 0.00, workingMemory: 0.10, inhibition: 0.05 },
};

/** Default loadings for unknown tasks */
const DEFAULT_LOADINGS: TaskLoadings = { g: 0.30, spatial: 0.20, workingMemory: 0.20, inhibition: 0.20 };

export function getTaskLoadings(paradigmId: string): TaskLoadings {
  return TASK_LOADINGS[paradigmId] ?? DEFAULT_LOADINGS;
}

/**
 * Generate a latent cognitive profile for one participant.
 * Factors are correlated through g:
 *   spatial = 0.5*g + 0.87*e_spatial   (r with g ≈ 0.5)
 *   wm      = 0.4*g + 0.92*e_wm       (r with g ≈ 0.4)
 *   inhib   = 0.3*g + 0.95*e_inhib     (r with g ≈ 0.3)
 * This produces realistic inter-factor correlations.
 */
export function generateLatentProfile(rng: () => number): LatentProfile {
  const g = normalDraw(rng, 0, 1);
  const eSpatial = normalDraw(rng, 0, 1);
  const eWM = normalDraw(rng, 0, 1);
  const eInhib = normalDraw(rng, 0, 1);

  return {
    g,
    spatial:       0.50 * g + 0.87 * eSpatial,
    workingMemory: 0.40 * g + 0.92 * eWM,
    inhibition:    0.30 * g + 0.95 * eInhib,
  };
}

/**
 * Compute a participant's ability score for a specific task.
 * ability = sum(loading_i * factor_i) normalized to roughly [-2, 2]
 * Higher = better performance (faster RT, higher accuracy)
 */
export function computeTaskAbility(profile: LatentProfile, loadings: TaskLoadings): number {
  return (
    loadings.g * profile.g +
    loadings.spatial * profile.spatial +
    loadings.workingMemory * profile.workingMemory +
    loadings.inhibition * profile.inhibition
  );
}

/**
 * Generate latent profiles for N participants, all sharing the same profiles
 * across tasks. This is what creates realistic cross-task correlations.
 */
export function generateCohort(n: number, seed: number): LatentProfile[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => generateLatentProfile(rng));
}
