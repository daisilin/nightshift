import type { CrossTaskAnalysis } from '../context/types';
import { mean, standardDeviation } from './metrics';

/**
 * Compute per-participant summary scores for a dataset.
 * For behavioral: mean RT across all trials.
 * For survey: mean response across all items.
 * Returns a map: participantId -> score
 */
export function participantScores(dataset: SimulatedDataset, isBehavioral: boolean): Map<string, number> {
  const scores = new Map<string, number>();
  for (const p of dataset.participants) {
    if (isBehavioral) {
      const rts = p.trials.filter(t => t.rt !== null).map(t => t.rt!);
      scores.set(p.id, rts.length > 0 ? mean(rts) : 0);
    } else {
      const responses = p.trials.map(t => t.response);
      scores.set(p.id, responses.length > 0 ? mean(responses) : 0);
    }
  }
  return scores;
}

/**
 * Pearson correlation between two arrays.
 */
export function pearsonR(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom > 0 ? Math.round((num / denom) * 100) / 100 : 0;
}

/**
 * Compute cross-task correlation matrix from multiple datasets.
 * Matches participants across tasks by persona + index (assumes same personas, same n).
 */
export function computeCrossTaskAnalysis(
  taskLabels: string[],
  datasets: SimulatedDataset[],
  isBehavioral: boolean[],
): CrossTaskAnalysis {
  // Get participant scores per task
  const allScores: number[][] = datasets.map((ds, i) =>
    [...participantScores(ds, isBehavioral[i]).values()]
  );

  // Correlation matrix
  const correlationMatrix: CrossTaskAnalysis['correlationMatrix'] = [];
  for (let i = 0; i < taskLabels.length; i++) {
    for (let j = i + 1; j < taskLabels.length; j++) {
      const r = pearsonR(allScores[i], allScores[j]);
      correlationMatrix.push({ task1: taskLabels[i], task2: taskLabels[j], r });
    }
  }

  // Simple 2-factor PCA approximation via correlation structure
  // Factor 1: average correlation with all tasks (general ability)
  // Factor 2: deviation from factor 1 (specific ability)
  const factorLoadings: CrossTaskAnalysis['factorLoadings'] = taskLabels.map((task, i) => {
    const corsWithOthers = correlationMatrix
      .filter(c => c.task1 === task || c.task2 === task)
      .map(c => c.r);
    const avgCor = corsWithOthers.length > 0 ? mean(corsWithOthers) : 0;
    // Factor 1 ~ average inter-task correlation (general factor)
    const f1 = Math.round(Math.max(0, Math.min(1, 0.3 + avgCor * 0.7)) * 100) / 100;
    // Factor 2 ~ variance of correlations (specificity)
    const sdCor = corsWithOthers.length > 1 ? standardDeviation(corsWithOthers) : 0;
    const f2 = Math.round(Math.max(0, Math.min(1, sdCor * 2)) * 100) / 100;
    return { task, factor1: f1, factor2: f2 };
  });

  const avgR = correlationMatrix.length > 0
    ? mean(correlationMatrix.map(c => Math.abs(c.r)))
    : 0;

  const summary = avgR > 0.5
    ? `tasks show strong inter-correlations (mean |r| = ${avgR.toFixed(2)}), suggesting a shared cognitive factor.`
    : avgR > 0.25
    ? `tasks show moderate inter-correlations (mean |r| = ${avgR.toFixed(2)}), suggesting partially overlapping cognitive demands.`
    : `tasks show weak inter-correlations (mean |r| = ${avgR.toFixed(2)}), suggesting largely independent cognitive processes.`;

  return { correlationMatrix, factorLoadings, summary };
}
