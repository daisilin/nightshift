/**
 * CALIBRATION MODULE
 *
 * Ground truth from Lin & Ma (Nature Communications, under review)
 * "Correlates of Human Planning Ability"
 * N = 476 college students
 *
 * This module provides the REAL human data targets that our simulation
 * should approximate. It's the "gold benchmark" — the honesty backbone.
 */

// === Table 1: Correlation Matrix (9 tasks) ===
// Order: SPM, Corsi, Rotation, WCST, CDT, Pattern, TOL, Two-Step, FIAR

export const PAPER_TASK_ORDER = [
  'Raven\'s SPM', 'Corsi', 'Mental Rotation', 'WCST',
  'Change Detection', 'Pattern Detection',
  'Tower of London', 'Two-Step Task', 'Four-in-a-Row',
];

export const PAPER_TASK_IDS = [
  'n-back',           // SPM → closest g-loaded task
  'corsi-block',      // Corsi → direct match
  'rush-hour',        // Mental Rotation → closest spatial
  'stroop',           // WCST → closest inhibition
  'n-back',           // CDT → WM task (shares slot with SPM)
  'stroop',           // Pattern Detection → visual task
  'tower-of-london',  // direct match
  'two-step',         // direct match
  'four-in-a-row',    // direct match
];

// Upper triangle of the 9x9 correlation matrix from Table 1
export const REAL_CORRELATIONS: Record<string, number> = {
  'SPM-Corsi': 0.325,
  'SPM-Rotation': 0.591,
  'SPM-WCST': 0.295,
  'SPM-CDT': 0.323,
  'SPM-Pattern': 0.409,
  'SPM-TOL': 0.394,
  'SPM-TwoStep': 0.233,
  'SPM-FIAR': 0.344,
  'Corsi-Rotation': 0.269,
  'Corsi-WCST': 0.156,
  'Corsi-CDT': 0.416,
  'Corsi-Pattern': 0.242,
  'Corsi-TOL': 0.215,
  'Corsi-TwoStep': 0.141,
  'Corsi-FIAR': 0.355,
  'Rotation-WCST': 0.252,
  'Rotation-CDT': 0.324,
  'Rotation-Pattern': 0.325,
  'Rotation-TOL': 0.392,
  'Rotation-TwoStep': 0.184,
  'Rotation-FIAR': 0.213,
  'WCST-CDT': 0.181,
  'WCST-Pattern': 0.136,
  'WCST-TOL': 0.221,
  'WCST-TwoStep': 0.179,
  'WCST-FIAR': 0.187,
  'CDT-Pattern': 0.234,
  'CDT-TOL': 0.249,
  'CDT-TwoStep': 0.153,
  'CDT-FIAR': 0.321,
  'Pattern-TOL': 0.230,
  'Pattern-TwoStep': 0.136,
  'Pattern-FIAR': 0.328,
  'TOL-TwoStep': 0.166,
  'TOL-FIAR': 0.280,
  'TwoStep-FIAR': 0.185,
};

// === Table 2: Factor Loadings (Varimax-rotated, 3 factors) ===
// Factor 1 = Visuospatial/g, Factor 2 = Working Memory, Factor 3 = Inhibition

export const REAL_FACTOR_LOADINGS: Record<string, [number, number, number]> = {
  'Four-in-a-Row':     [0.20, 0.67, 0.15],
  'Two-Step Task':     [0.00, 0.18, 0.83],
  'Tower of London':   [0.63, 0.13, 0.19],
  'Change Detection':  [0.21, 0.70, 0.09],
  'Mental Rotation':   [0.80, 0.13, 0.13],
  'WCST':              [0.32, 0.03, 0.62],
  'Corsi':             [0.14, 0.78, 0.05],
  'Pattern Detection': [0.55, 0.35, -0.10],
  'Raven\'s SPM':      [0.76, 0.26, 0.19],
};

export const REAL_VARIANCE_EXPLAINED = [23.7, 20.1, 13.4]; // total: 57.2%

// === Split-half reliability from text ===
export const REAL_RELIABILITY: Record<string, number> = {
  'Raven\'s SPM': 0.86,
  'Corsi': 0.72,
  'Mental Rotation': 0.78,
  'WCST': 0.65,
  'Change Detection': 0.75,
  'Pattern Detection': 0.80,
  'Tower of London': 0.72,
  'Two-Step Task': 0.30,
  'Four-in-a-Row': 0.50,
};

// === Descriptive Stats ===
export const REAL_DESCRIPTIVES: Record<string, { mean: number; sem: number; unit: string }> = {
  'Raven\'s SPM': { mean: 46.09, sem: 0.38, unit: 'correct' },
  'Corsi': { mean: 53.5, sem: 1.1, unit: 'score' },
  'Mental Rotation': { mean: 2.162, sem: 0.055, unit: 'd\'' },
  'WCST': { mean: -2.45, sem: 0.17, unit: 'neg. persev. errors' },
  'Change Detection': { mean: 1.798, sem: 0.037, unit: 'd\'' },
  'Pattern Detection': { mean: 2.781, sem: 0.031, unit: 'd\'' },
  'Tower of London': { mean: 56.85, sem: 0.83, unit: 'weighted score' },
  'Two-Step Task': { mean: 2.162, sem: 0.046, unit: 'model-based weight' },
  'Four-in-a-Row': { mean: -2.79, sem: 4.9, unit: 'Elo rating' },
};

/**
 * Compare synthetic correlations to real correlations.
 * Returns mean absolute error (MAE) — lower is better.
 */
export function validateCorrelations(
  syntheticMatrix: { task1: string; task2: string; r: number }[],
): { mae: number; maxError: number; comparisons: { pair: string; real: number; synthetic: number; error: number }[] } {
  const comparisons: { pair: string; real: number; synthetic: number; error: number }[] = [];

  for (const [pairKey, realR] of Object.entries(REAL_CORRELATIONS)) {
    // Try to find matching pair in synthetic (approximate name matching)
    const [t1Short, t2Short] = pairKey.split('-');
    const synPair = syntheticMatrix.find(s => {
      const s1 = s.task1.toLowerCase();
      const s2 = s.task2.toLowerCase();
      const match1 = s1.includes(t1Short.toLowerCase()) || s2.includes(t1Short.toLowerCase());
      const match2 = s1.includes(t2Short.toLowerCase()) || s2.includes(t2Short.toLowerCase());
      return match1 && match2;
    });

    if (synPair) {
      const error = Math.abs(synPair.r - realR);
      comparisons.push({ pair: pairKey, real: realR, synthetic: synPair.r, error });
    }
  }

  const errors = comparisons.map(c => c.error);
  return {
    mae: errors.length > 0 ? errors.reduce((a, b) => a + b, 0) / errors.length : 1,
    maxError: errors.length > 0 ? Math.max(...errors) : 1,
    comparisons,
  };
}
