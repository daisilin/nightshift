import type { AnalysisStepDef, AnalysisInput, AnalysisResult, MatrixData, FactorData } from './types';
import { mean } from '../metrics';
import { pearsonR, participantScores } from '../crossTaskAnalysis';
import { createRng } from '../simulation';

/** N×N correlation matrix with permutation-tested p-values */
export const correlationMatrix: AnalysisStepDef = {
  id: 'correlation-matrix',
  name: 'Pairwise Correlation Matrix',
  category: 'multivariate',
  requires: 'multi-task',
  execute: (input: AnalysisInput): AnalysisResult => {
    const nTasks = input.datasets.length;
    const nPerms = input.params?.permutations ?? 500;
    const labels = input.paradigms.map(p => p.name);

    // Get participant scores per task
    const scoreArrays: number[][] = input.datasets.map((ds, i) => {
      const isBehavioral = input.designs[i].params.type === 'behavioral';
      return [...participantScores(ds, isBehavioral).values()];
    });

    // Compute observed correlations
    const values: number[][] = Array.from({ length: nTasks }, () => Array(nTasks).fill(0));
    for (let i = 0; i < nTasks; i++) {
      values[i][i] = 1;
      for (let j = i + 1; j < nTasks; j++) {
        const r = pearsonR(scoreArrays[i], scoreArrays[j]);
        values[i][j] = r;
        values[j][i] = r;
      }
    }

    // Permutation test for p-values
    const pValues: number[][] = Array.from({ length: nTasks }, () => Array(nTasks).fill(0));
    const rng = createRng(42);

    for (let i = 0; i < nTasks; i++) {
      for (let j = i + 1; j < nTasks; j++) {
        const observed = Math.abs(values[i][j]);
        let exceedCount = 0;

        for (let p = 0; p < nPerms; p++) {
          // Shuffle one array
          const shuffled = [...scoreArrays[j]];
          for (let k = shuffled.length - 1; k > 0; k--) {
            const swap = Math.floor(rng() * (k + 1));
            [shuffled[k], shuffled[swap]] = [shuffled[swap], shuffled[k]];
          }
          const permR = Math.abs(pearsonR(scoreArrays[i], shuffled));
          if (permR >= observed) exceedCount++;
        }

        const p = Math.round((exceedCount / nPerms) * 1000) / 1000;
        pValues[i][j] = p;
        pValues[j][i] = p;
      }
    }

    return {
      stepId: 'correlation-matrix',
      type: 'matrix',
      title: `Correlation Matrix (${nTasks} tasks, ${nPerms} permutations)`,
      data: {
        labels,
        values,
        pValues,
        significanceThresholds: [
          { symbol: '***', threshold: 0.001 },
          { symbol: '**', threshold: 0.01 },
          { symbol: '*', threshold: 0.05 },
        ],
      } as MatrixData,
    };
  },
};

/** Exploratory Factor Analysis: eigendecomposition + Varimax rotation */
export const exploratoryFA: AnalysisStepDef = {
  id: 'exploratory-fa',
  name: 'Exploratory Factor Analysis',
  category: 'multivariate',
  requires: 'multi-task',
  execute: (input: AnalysisInput): AnalysisResult => {
    const nFactors = input.params?.nFactors ?? Math.min(3, Math.floor(input.datasets.length / 2));
    const labels = input.paradigms.map(p => p.name);
    const n = labels.length;

    // Build correlation matrix
    const scoreArrays: number[][] = input.datasets.map((ds, i) => {
      const isBehavioral = input.designs[i].params.type === 'behavioral';
      return [...participantScores(ds, isBehavioral).values()];
    });

    const R: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      R[i][i] = 1;
      for (let j = i + 1; j < n; j++) {
        const r = pearsonR(scoreArrays[i], scoreArrays[j]);
        R[i][j] = r;
        R[j][i] = r;
      }
    }

    // Power iteration for eigenvalues/eigenvectors (simplified for small matrices)
    const { eigenvalues, eigenvectors } = powerIteration(R, nFactors);

    // Unrotated loadings: eigenvector * sqrt(eigenvalue)
    const loadings: number[][] = Array.from({ length: n }, (_, i) =>
      Array.from({ length: nFactors }, (_, f) =>
        Math.round(eigenvectors[i][f] * Math.sqrt(Math.max(0, eigenvalues[f])) * 100) / 100
      )
    );

    // Varimax rotation
    const rotated = varimaxRotation(loadings, nFactors);

    const totalVar = eigenvalues.reduce((a, b) => a + b, 0);
    const varianceExplained = eigenvalues.slice(0, nFactors).map(e =>
      Math.round((e / Math.max(totalVar, 0.01)) * 1000) / 10
    );

    const factorNames = Array.from({ length: nFactors }, (_, i) => `Factor ${i + 1}`);

    return {
      stepId: 'exploratory-fa',
      type: 'factor-loadings',
      title: `Exploratory Factor Analysis (${nFactors} factors, Varimax)`,
      data: {
        tasks: labels,
        factorNames,
        loadings: rotated,
        varianceExplained,
        totalVariance: Math.round(varianceExplained.reduce((a, b) => a + b, 0) * 10) / 10,
      } as FactorData,
    };
  },
};

// === HELPER: Simplified power iteration for small symmetric matrices ===

function powerIteration(matrix: number[][], nComponents: number): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = matrix.length;
  const eigenvalues: number[] = [];
  const eigenvectors: number[][] = Array.from({ length: n }, () => []);
  const A = matrix.map(row => [...row]);

  for (let comp = 0; comp < nComponents; comp++) {
    // Initialize random vector
    let v = Array.from({ length: n }, (_, i) => (i === comp ? 1 : 0.1));
    let eigenvalue = 0;

    // Power iteration (50 iterations is plenty for n < 20)
    for (let iter = 0; iter < 50; iter++) {
      // Multiply A * v
      const Av = A.map(row => row.reduce((sum, val, j) => sum + val * v[j], 0));
      // Eigenvalue estimate
      eigenvalue = Math.sqrt(Av.reduce((sum, val) => sum + val * val, 0));
      if (eigenvalue < 1e-10) break;
      // Normalize
      v = Av.map(val => val / eigenvalue);
    }

    eigenvalues.push(eigenvalue);
    for (let i = 0; i < n; i++) eigenvectors[i].push(v[i]);

    // Deflate: remove this component from A
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        A[i][j] -= eigenvalue * v[i] * v[j];
      }
    }
  }

  return { eigenvalues, eigenvectors };
}

// === HELPER: Varimax rotation ===

function varimaxRotation(loadings: number[][], nFactors: number, maxIter: number = 20): number[][] {
  const n = loadings.length;
  const L = loadings.map(row => [...row]);

  for (let iter = 0; iter < maxIter; iter++) {
    for (let p = 0; p < nFactors; p++) {
      for (let q = p + 1; q < nFactors; q++) {
        // Compute rotation angle
        let A = 0, B = 0, C = 0, D = 0;
        for (let i = 0; i < n; i++) {
          const u = L[i][p] * L[i][p] - L[i][q] * L[i][q];
          const v = 2 * L[i][p] * L[i][q];
          A += u;
          B += v;
          C += u * u - v * v;
          D += 2 * u * v;
        }
        const angle = 0.25 * Math.atan2(D - 2 * A * B / n, C - (A * A - B * B) / n);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        // Rotate columns p and q
        for (let i = 0; i < n; i++) {
          const lp = L[i][p];
          const lq = L[i][q];
          L[i][p] = lp * cos + lq * sin;
          L[i][q] = -lp * sin + lq * cos;
        }
      }
    }
  }

  return L.map(row => row.map(v => Math.round(v * 100) / 100));
}
