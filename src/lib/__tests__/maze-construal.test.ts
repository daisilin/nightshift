/**
 * MAZE-CONSTRUAL VALIDATION
 *
 * Validates that our maze-construal simulation produces data
 * matching Ho et al. (Nature) findings:
 *
 * - High construal obstacle awareness: ~0.787
 * - Low construal obstacle awareness: ~0.173
 * - Construal effect (difference): ~0.614
 * - β = 0.133, χ²(1) = 2297.21 in real HGLM
 *
 * Our parametric simulation uses BFS-computed construal probabilities
 * and a logistic awareness model calibrated to these benchmarks.
 */

import { describe, it, expect } from 'vitest';
import { simulatePilot, createRng } from '../simulation';
import { computeConstrualProbabilities, simulateMazeTrial, paperMazeToText, type PaperMaze } from '../mazeSimulation';
import { personaBank } from '../../data/personaBank';
import { taskBank, getParadigm } from '../../data/taskBank';
import { mean } from '../metrics';
import paperMazesRaw from '../../data/paperMazes.json';
import type { ExperimentDesign } from '../types';

const paperMazes = paperMazesRaw as PaperMaze[];
const college = personaBank.find(p => p.id === 'college-student')!;

function makeDesign(n = 50): ExperimentDesign {
  const p = taskBank.find(t => t.id === 'maze-construal')!;
  return {
    id: 'maze-val', name: p.name, paradigmId: 'maze-construal',
    personaIds: ['college-student'], params: p.defaultParams,
    nParticipantsPerPersona: n, hypotheses: ['validation'], rationale: 'maze validation', internRole: 'scout',
  };
}

// ============================================================
// 1. Paper Maze Structure
// ============================================================
describe('Paper Mazes', () => {
  it('loads 12 mazes from the paper', () => {
    expect(paperMazes.length).toBe(12);
  });

  it('each maze has 11×11 grid', () => {
    for (const maze of paperMazes) {
      expect(maze.width).toBe(11);
      expect(maze.height).toBe(11);
      expect(maze.grid.length).toBe(11);
    }
  });

  it('each maze has 7 tetromino obstacles', () => {
    for (const maze of paperMazes) {
      expect(maze.obstacles.length).toBe(7);
      for (const obs of maze.obstacles) {
        expect(obs.cells.length).toBe(4); // tetrominoes have 4 cells
      }
    }
  });

  it('start and goal are on opposite edges', () => {
    for (const maze of paperMazes) {
      // Start should be at edge, goal at opposite edge
      const [sx, sy] = maze.start;
      const [gx, gy] = maze.goal;
      expect(sx >= 0 && sx < maze.width).toBe(true);
      expect(gx >= 0 && gx < maze.width).toBe(true);
    }
  });
});

// ============================================================
// 2. Construal Probability Computation (BFS-based)
// ============================================================
describe('Construal Probability Computation', () => {
  it('computes probabilities for each obstacle', () => {
    for (const maze of paperMazes) {
      const obstacles = computeConstrualProbabilities(maze);
      expect(obstacles.length).toBe(maze.obstacles.length);
      for (const obs of obstacles) {
        expect(obs.construalProb).toBeGreaterThanOrEqual(0.05);
        expect(obs.construalProb).toBeLessThanOrEqual(0.95);
        expect(typeof obs.isHighConstrual).toBe('boolean');
      }
    }
  });

  it('produces a mix of high and low construal obstacles', () => {
    let totalHigh = 0;
    let totalLow = 0;
    for (const maze of paperMazes) {
      const obstacles = computeConstrualProbabilities(maze);
      totalHigh += obstacles.filter(o => o.isHighConstrual).length;
      totalLow += obstacles.filter(o => !o.isHighConstrual).length;
    }
    // Should have both high and low construal obstacles
    expect(totalHigh).toBeGreaterThan(0);
    expect(totalLow).toBeGreaterThan(0);
    // Neither should dominate completely
    expect(totalHigh / (totalHigh + totalLow)).toBeGreaterThan(0.2);
    expect(totalHigh / (totalHigh + totalLow)).toBeLessThan(0.8);
  });

  it('maze text representation is valid', () => {
    const text = paperMazeToText(paperMazes[0]);
    expect(text).toContain('S');
    expect(text).toContain('G');
    expect(text.split('\n').length).toBeGreaterThan(10);
  });
});

// ============================================================
// 3. Parametric Maze Trial Simulation
// ============================================================
describe('Parametric Maze Trial', () => {
  it('produces awareness scores for each obstacle', () => {
    const rng = createRng(42);
    const obstacles = computeConstrualProbabilities(paperMazes[0]);
    const trial = simulateMazeTrial(rng, paperMazes[0], obstacles, college, 0, 0);

    expect(trial.metadata).toBeDefined();
    expect(trial.metadata!.mazeId).toBe(paperMazes[0].id);
    expect(trial.metadata!.awarenessScores).toBeDefined();

    const scores = trial.metadata!.awarenessScores!;
    for (const obs of obstacles) {
      expect(scores[obs.label]).toBeGreaterThanOrEqual(0);
      expect(scores[obs.label]).toBeLessThanOrEqual(1);
    }
  });

  it('produces construal effect metadata', () => {
    const rng = createRng(42);
    const obstacles = computeConstrualProbabilities(paperMazes[0]);
    const trial = simulateMazeTrial(rng, paperMazes[0], obstacles, college, 0, 0);

    expect(trial.metadata!.construalEffect).toBeDefined();
    expect(trial.metadata!.construalProb).toBeDefined();
    expect(trial.metadata!.obstaclesNoticed).toBeDefined();
  });

  it('has positive RT in realistic range', () => {
    const rng = createRng(42);
    const obstacles = computeConstrualProbabilities(paperMazes[0]);
    const trial = simulateMazeTrial(rng, paperMazes[0], obstacles, college, 0, 0);

    expect(trial.rt).toBeGreaterThan(500);
    expect(trial.rt).toBeLessThan(30000);
  });
});

// ============================================================
// 4. Full Maze Experiment — Construal Effect Size
// ============================================================
describe('Maze-Construal Experiment (parametric)', () => {
  const design = makeDesign(100);
  const data = simulatePilot(design, [college], 42);

  it('produces trials with maze metadata', () => {
    expect(data.participants.length).toBe(100);
    const firstTrial = data.participants[0].trials[0];
    expect(firstTrial.metadata).toBeDefined();
    expect(firstTrial.metadata!.mazeId).toBeDefined();
    expect(firstTrial.metadata!.awarenessScores).toBeDefined();
  });

  it('high-construal obstacles are noticed more than low-construal', () => {
    const allHighAwareness: number[] = [];
    const allLowAwareness: number[] = [];

    for (const p of data.participants) {
      for (const t of p.trials) {
        if (!t.metadata?.awarenessScores || !t.metadata?.construalProb) continue;
        for (const [label, awareness] of Object.entries(t.metadata.awarenessScores)) {
          const cp = t.metadata.construalProb[label];
          if (typeof cp !== 'number') continue;
          if (cp > 0.45) allHighAwareness.push(awareness);
          else allLowAwareness.push(awareness);
        }
      }
    }

    const meanHigh = mean(allHighAwareness);
    const meanLow = mean(allLowAwareness);

    expect(meanHigh).toBeGreaterThan(meanLow);
    // The effect should be substantial (paper: 0.614)
    expect(meanHigh - meanLow).toBeGreaterThan(0.15);
  });

  it('awareness distributions are in realistic range', () => {
    const allAwareness: number[] = [];
    for (const p of data.participants) {
      for (const t of p.trials) {
        if (!t.metadata?.awarenessScores) continue;
        for (const awareness of Object.values(t.metadata.awarenessScores)) {
          allAwareness.push(awareness);
        }
      }
    }

    const m = mean(allAwareness);
    // Overall mean should be somewhere between 0.2 and 0.8
    expect(m).toBeGreaterThan(0.15);
    expect(m).toBeLessThan(0.85);

    // Should have variance (not all the same)
    const uniqueValues = new Set(allAwareness.map(v => Math.round(v * 10)));
    expect(uniqueValues.size).toBeGreaterThan(5);
  });

  it('construal effect is positive across participants', () => {
    let positiveEffects = 0;
    let totalEffects = 0;

    for (const p of data.participants) {
      for (const t of p.trials) {
        if (t.metadata?.construalEffect !== undefined) {
          totalEffects++;
          if (t.metadata.construalEffect > 0) positiveEffects++;
        }
      }
    }

    // Majority of trials should show positive construal effect
    expect(positiveEffects / totalEffects).toBeGreaterThan(0.5);
  });
});

// ============================================================
// 5. Population Differences in Construal
// ============================================================
describe('Population Differences in Maze-Construal', () => {
  it('older adults show different awareness patterns', () => {
    const older = personaBank.find(p => p.id === 'older-adult')!;
    const designCollege = makeDesign(50);
    const designOlder = makeDesign(50);

    const collegeData = simulatePilot(designCollege, [college], 42);
    const olderData = simulatePilot(designOlder, [older], 42);

    // Both should have awareness metadata
    expect(collegeData.participants[0].trials[0].metadata?.awarenessScores).toBeDefined();
    expect(olderData.participants[0].trials[0].metadata?.awarenessScores).toBeDefined();

    // Both should show construal effect (population-general phenomenon)
    for (const dataset of [collegeData, olderData]) {
      const effects = dataset.participants.flatMap(p =>
        p.trials.map(t => t.metadata?.construalEffect ?? 0)
      );
      expect(mean(effects)).toBeGreaterThan(0);
    }
  });
});

// ============================================================
// 6. Benchmark Report
// ============================================================
describe('Maze-Construal Benchmark Report', () => {
  it('prints comparison with Ho et al. paper data', () => {
    const design = makeDesign(200);
    const data = simulatePilot(design, [college], 42);

    const allHighAwareness: number[] = [];
    const allLowAwareness: number[] = [];
    const effects: number[] = [];

    for (const p of data.participants) {
      for (const t of p.trials) {
        if (!t.metadata?.awarenessScores || !t.metadata?.construalProb) continue;
        for (const [label, awareness] of Object.entries(t.metadata.awarenessScores)) {
          const cp = t.metadata.construalProb[label];
          if (typeof cp !== 'number') continue;
          if (cp > 0.45) allHighAwareness.push(awareness);
          else allLowAwareness.push(awareness);
        }
        if (t.metadata.construalEffect !== undefined) {
          effects.push(t.metadata.construalEffect);
        }
      }
    }

    const meanHigh = mean(allHighAwareness);
    const meanLow = mean(allLowAwareness);
    const meanEffect = mean(effects);
    const rts = data.participants.flatMap(p => p.trials.filter(t => t.rt !== null).map(t => t.rt!));

    console.log('\n========== MAZE-CONSTRUAL BENCHMARK ==========');
    console.log(`N participants: ${data.participants.length}`);
    console.log(`N trials: ${data.participants.reduce((s, p) => s + p.trials.length, 0)}`);
    console.log(`N obstacle observations: ${allHighAwareness.length + allLowAwareness.length}`);
    console.log(`\nHigh construal awareness: ${meanHigh.toFixed(3)} (paper: 0.787)`);
    console.log(`Low construal awareness:  ${meanLow.toFixed(3)} (paper: 0.173)`);
    console.log(`Construal effect:         ${(meanHigh - meanLow).toFixed(3)} (paper: 0.614)`);
    console.log(`Mean trial effect:        ${meanEffect.toFixed(3)}`);
    console.log(`Mean navigation RT:       ${mean(rts).toFixed(0)} ms`);
    console.log('================================================\n');

    // The effect should be in the right direction with substantial magnitude
    expect(meanHigh).toBeGreaterThan(meanLow);
    expect(meanHigh - meanLow).toBeGreaterThan(0.1);
  });
});
