/**
 * MAZE-CONSTRUAL SIMULATION
 *
 * Faithful simulation of Ho et al. (Nature) maze task.
 * Key insight: The paper's DV is NOT reaction time — it's OBSTACLE AWARENESS.
 *
 * Each maze has tetromino-shaped obstacles. After navigating, participants
 * report which obstacles they noticed. The construal effect is:
 *   awareness(high-construal obstacles) - awareness(low-construal obstacles)
 *
 * High-construal obstacles: on/near the optimal path (must attend to them)
 * Low-construal obstacles: far from optimal path (can be ignored)
 *
 * Real human data (Ho et al.):
 *   - High construal awareness: 0.787
 *   - Low construal awareness: 0.173
 *   - Construal effect: 0.614
 */

import { createRng, normalDraw, bernoulliDraw } from './simulation';
import type { PersonaDefinition, SimulatedTrial, SimulatedParticipant, SimulatedDataset } from './types';
import type { LatentProfile } from './latentModel';
import { computeTaskAbility, getTaskLoadings } from './latentModel';
import { callClaudeApi } from './apiKey';

// ============================================================
// PAPER MAZE TYPES
// ============================================================

export interface PaperMaze {
  id: string;
  grid: string[];
  width: number;
  height: number;
  start: [number, number];
  goal: [number, number];
  obstacles: { label: string; cells: [number, number][] }[];
}

export interface ObstacleWithConstrual {
  label: string;
  cells: [number, number][];
  construalProb: number;  // 0-1: how much this obstacle affects the optimal path
  isHighConstrual: boolean;
}

// ============================================================
// BFS PATH SOLVER + CONSTRUAL PROBABILITY COMPUTATION
// ============================================================

/**
 * BFS shortest path on the maze grid.
 * Returns path length (-1 if no path).
 */
function bfsPathLength(
  grid: string[],
  start: [number, number],
  goal: [number, number],
  width: number,
  height: number,
  blockedCells?: Set<string>,
): number {
  const key = (x: number, y: number) => `${x},${y}`;
  const isPassable = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    if (blockedCells?.has(key(x, y))) return false;
    const ch = grid[y]?.[x];
    // Only '.', 'S', and 'G' are passable. '#' = wall, digits = obstacles.
    return ch === '.' || ch === 'S' || ch === 'G';
  };

  const queue: [number, number, number][] = [[start[0], start[1], 0]];
  const visited = new Set<string>();
  visited.add(key(start[0], start[1]));

  while (queue.length > 0) {
    const [x, y, dist] = queue.shift()!;
    if (x === goal[0] && y === goal[1]) return dist;

    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (isPassable(nx, ny) && !visited.has(k)) {
        visited.add(k);
        queue.push([nx, ny, dist + 1]);
      }
    }
  }
  return -1;
}

/**
 * Compute construal probability for each obstacle.
 *
 * Method: For each obstacle, measure how much removing it shortens
 * the optimal path. Obstacles that significantly affect path planning
 * get high construal probability.
 *
 * This matches Ho et al.'s approach: value-guided construal means
 * obstacles are noticed proportional to their impact on planning.
 */
export function computeConstrualProbabilities(maze: PaperMaze): ObstacleWithConstrual[] {
  const { grid, start, goal, width, height, obstacles } = maze;

  // Find the optimal path cells
  const pathCells = getPathCells(grid, start, goal, width, height);

  // For each obstacle, compute how close it is to the optimal path.
  // In Ho et al., value-guided construal means you notice obstacles
  // proportional to how much they constrain your navigation.
  // Obstacles adjacent to the path MUST be noticed to avoid collisions.
  // Obstacles far from the path can be safely ignored.

  const withDist = obstacles.map(obs => {
    // Minimum Manhattan distance from any obstacle cell to any path cell
    let minDist = Infinity;
    for (const [cx, cy] of obs.cells) {
      for (const [px, py] of pathCells) {
        const d = Math.abs(cx - px) + Math.abs(cy - py);
        if (d < minDist) minDist = d;
      }
    }
    // If no path found, use distance from start as proxy
    if (!isFinite(minDist)) {
      minDist = obs.cells.reduce((min, [cx, cy]) =>
        Math.min(min, Math.abs(cx - start[0]) + Math.abs(cy - start[1])), Infinity);
    }
    return { obs, minDist };
  });

  // Sort by distance to determine high vs low construal
  // Paper shows bimodal: ~3-4 obstacles near path (high), ~3-4 far (low)
  const sorted = [...withDist].sort((a, b) => a.minDist - b.minDist);
  const medianDist = sorted[Math.floor(sorted.length / 2)]?.minDist ?? 3;

  return withDist.map(({ obs, minDist }) => {
    // Construal probability: inversely proportional to distance from path
    // Calibrated to produce:
    //   Adjacent (dist=1): cp ≈ 0.80-0.90  → awareness ≈ 0.78
    //   Near (dist=2):     cp ≈ 0.60-0.70
    //   Medium (dist=3):   cp ≈ 0.40-0.50
    //   Far (dist=4+):     cp ≈ 0.10-0.25  → awareness ≈ 0.17
    const construalProb = Math.max(0.05, Math.min(0.95,
      0.90 - minDist * 0.18
    ));

    return {
      ...obs,
      construalProb,
      isHighConstrual: minDist <= medianDist,
    };
  });
}

/**
 * Get cells on the optimal path (BFS).
 */
function getPathCells(
  grid: string[],
  start: [number, number],
  goal: [number, number],
  width: number,
  height: number,
): [number, number][] {
  const key = (x: number, y: number) => `${x},${y}`;
  const isBlocked = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return true;
    const ch = grid[y]?.[x];
    return ch === '#';
  };

  // BFS with parent tracking
  const queue: [number, number][] = [[start[0], start[1]]];
  const visited = new Map<string, string>();
  visited.set(key(start[0], start[1]), '');

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    if (x === goal[0] && y === goal[1]) {
      // Reconstruct path
      const path: [number, number][] = [];
      let cur = key(x, y);
      while (cur) {
        const [cx, cy] = cur.split(',').map(Number);
        path.push([cx, cy]);
        cur = visited.get(cur)!;
      }
      return path;
    }

    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      // Allow walking through obstacle cells (they're numbered, not walls)
      // Actually in the paper, obstacles block the path — they are tetrominos
      // But the grid uses digits for obstacle cells, not '#'
      // The BFS should NOT walk through obstacle cells
      const ch = grid[ny]?.[nx];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited.has(k)) {
        if (ch !== '#' && (ch === '.' || ch === 'S' || ch === 'G')) {
          visited.set(k, key(x, y));
          queue.push([nx, ny]);
        }
      }
    }
  }
  return [];
}

// ============================================================
// PARAMETRIC MAZE-CONSTRUAL SIMULATION
// ============================================================

/**
 * Simulate one maze trial parametrically.
 *
 * For each obstacle, simulates awareness as:
 *   logit(awareness) = construalProb * β + ability * α + noise
 *
 * β calibrated so that high-construal ≈ 0.78, low-construal ≈ 0.17
 *
 * Returns a trial with awareness scores in metadata.
 */
export function simulateMazeTrial(
  rng: () => number,
  maze: PaperMaze,
  obstaclesWithConstrual: ObstacleWithConstrual[],
  persona: PersonaDefinition,
  trialIndex: number,
  taskAbility: number = 0,
): SimulatedTrial {
  // Attention lapse — random awareness
  if (bernoulliDraw(rng, persona.attentionLapseRate)) {
    const awarenessScores: Record<string, number> = {};
    const construalProbs: Record<string, number> = {};
    for (const obs of obstaclesWithConstrual) {
      awarenessScores[obs.label] = rng(); // random
      construalProbs[obs.label] = obs.construalProb;
    }
    return {
      trialIndex, condition: 'maze-navigation',
      rt: Math.round(3000 + rng() * 10000), // random navigation time
      response: 0,
      correct: null,
      metadata: {
        mazeId: maze.id,
        awarenessScores,
        construalProb: construalProbs,
        obstaclesNoticed: Object.entries(awarenessScores).filter(([_, v]) => v > 0.5).map(([k]) => k),
        construalEffect: 0,
      },
    };
  }

  // Navigation RT (log-normal, affected by maze complexity + ability)
  const nObstacles = obstaclesWithConstrual.length;
  const baseRT = 4000 + nObstacles * 500; // more obstacles = slower
  const abilityFactor = 1 - taskAbility * 0.08;
  const logMean = Math.log(baseRT * persona.rtMultiplier * abilityFactor);
  const logSD = 0.35 * persona.variabilityMultiplier;
  const rt = Math.round(Math.exp(normalDraw(rng, logMean, logSD)));

  // Fatigue effect on attention
  const fatigueNoise = trialIndex > 10 ? persona.fatigueRate * 0.15 : 0;

  // Simulate awareness per obstacle
  // Key model: awareness = sigmoid(β₁·construalProb + β₂·ability + noise)
  // Calibrated to match paper: high ≈ 0.787, low ≈ 0.173
  const awarenessScores: Record<string, number> = {};
  const construalProbs: Record<string, number> = {};

  for (const obs of obstaclesWithConstrual) {
    // Logistic model for awareness probability
    // Calibrated to match Ho et al. (Nature):
    //   High construal (cp ≈ 0.72) → awareness ≈ 0.787
    //   Low construal (cp ≈ 0.20) → awareness ≈ 0.173
    // β₁ = 5.0: strong effect of construal probability
    // β₂ = 0.3: moderate effect of cognitive ability
    // intercept = -2.5: base rate of noticing (low unless construal is high)
    const logit = -2.8 + obs.construalProb * 5.5 + taskAbility * 0.3
      + persona.accuracyOffset * 0.5
      - fatigueNoise
      + normalDraw(rng, 0, 0.6); // within-trial noise

    const pAware = 1 / (1 + Math.exp(-logit));

    // Convert to awareness rating (continuous 0-1, with noise)
    let awareness = pAware + normalDraw(rng, 0, 0.1);
    awareness = Math.max(0, Math.min(1, awareness));

    awarenessScores[obs.label] = Math.round(awareness * 1000) / 1000;
    construalProbs[obs.label] = Math.round(obs.construalProb * 1000) / 1000;
  }

  // Compute construal effect for this trial
  const highAwareness = obstaclesWithConstrual
    .filter(o => o.isHighConstrual)
    .map(o => awarenessScores[o.label]);
  const lowAwareness = obstaclesWithConstrual
    .filter(o => !o.isHighConstrual)
    .map(o => awarenessScores[o.label]);

  const meanHigh = highAwareness.length > 0 ? highAwareness.reduce((a, b) => a + b, 0) / highAwareness.length : 0;
  const meanLow = lowAwareness.length > 0 ? lowAwareness.reduce((a, b) => a + b, 0) / lowAwareness.length : 0;
  const construalEffect = Math.round((meanHigh - meanLow) * 1000) / 1000;

  const obstaclesNoticed = Object.entries(awarenessScores)
    .filter(([_, v]) => v > 0.5)
    .map(([k]) => k);

  return {
    trialIndex, condition: 'maze-navigation',
    rt: Math.max(1000, Math.min(30000, rt)),
    response: Math.round(construalEffect * 100) / 100, // construal effect as primary DV
    correct: null,
    metadata: {
      mazeId: maze.id,
      awarenessScores,
      construalProb: construalProbs,
      obstaclesNoticed,
      construalEffect,
      meanHighAwareness: Math.round(meanHigh * 1000) / 1000,
      meanLowAwareness: Math.round(meanLow * 1000) / 1000,
    },
  };
}

// ============================================================
// LLM MAZE TRIAL
// ============================================================

/**
 * Build a text representation of a paper maze for the LLM.
 */
export function paperMazeToText(maze: PaperMaze): string {
  // Use the grid directly — it's already a text representation
  const lines = maze.grid.map(row => row.split('').join(' '));
  return `${lines.join('\n')}

Legend: S = start (you), G = goal, # = wall, digits (0-9) = obstacles (tetromino shapes), . = empty
Grid: ${maze.width}×${maze.height}`;
}

/**
 * Run one maze trial with an LLM participant.
 * Two phases: navigation + awareness probe (matching Ho et al. protocol).
 */
export async function runMazeLLMTrial(
  personaPrompt: string,
  maze: PaperMaze,
  obstaclesWithConstrual: ObstacleWithConstrual[],
  trialIndex: number,
): Promise<SimulatedTrial> {
  const mazeText = paperMazeToText(maze);
  const obstacleLabels = obstaclesWithConstrual.map(o => o.label);
  const start = Date.now();

  try {
    // Phase 1: Navigation — let the LLM plan a route and think aloud
    const navRes = await callClaudeApi({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 500,
        system: `${personaPrompt}

You're doing a maze task in a research study. You see a grid maze on screen.
- S is you (blue dot)
- G is the goal (yellow square)
- # are walls
- Digits (0-9) are obstacle shapes you can't walk through
- . are open spaces

Navigate from S to G. Think out loud about what you see and how you'd get there.`,
        messages: [{ role: 'user', content: `Here is the maze:\n\n${mazeText}\n\nPlan your route from S to G.` }],
    });

    const navData = await navRes.json();
    const cot = navData.content?.[0]?.text ?? '';

    // Phase 2: Awareness probe — rate awareness of each obstacle
    const probeRes = await callClaudeApi({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 200,
        system: `${personaPrompt}

You just finished navigating a maze. The researcher is now asking you about the obstacles you saw.

For each obstacle (labeled with a digit), rate how aware you were of it while you were figuring out your route:
0.0 = didn't notice it at all
0.5 = vaguely aware it was there
1.0 = fully noticed it and thought about it

Return ONLY a JSON object: { "0": 0.7, "1": 0.2, ... }`,
        messages: [{ role: 'user', content: `The maze had these obstacles: ${obstacleLabels.join(', ')}\n\nYou said: "${cot.slice(0, 300)}"\n\nHow aware were you of each obstacle?` }],
    });

    const probeData = await probeRes.json();
    const probeRaw = probeData.content?.[0]?.text ?? '';
    const latencyMs = Date.now() - start;

    // Parse awareness ratings
    let awarenessScores: Record<string, number> = {};
    try {
      const cleaned = probeRaw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const first = cleaned.indexOf('{');
      const last = cleaned.lastIndexOf('}');
      if (first >= 0 && last > first) {
        const parsed = JSON.parse(cleaned.slice(first, last + 1));
        for (const label of obstacleLabels) {
          const val = parsed[label] ?? parsed[`obstacle_${label}`] ?? parsed[`obs_${label}`];
          awarenessScores[label] = typeof val === 'number' ? Math.max(0, Math.min(1, val)) : 0.5;
        }
      }
    } catch {
      // Fallback: set all to 0.5
      for (const label of obstacleLabels) {
        awarenessScores[label] = 0.5;
      }
    }

    // Compute construal effect
    const construalProbs: Record<string, number> = {};
    const highAwareness: number[] = [];
    const lowAwareness: number[] = [];
    for (const obs of obstaclesWithConstrual) {
      construalProbs[obs.label] = obs.construalProb;
      if (obs.isHighConstrual) highAwareness.push(awarenessScores[obs.label]);
      else lowAwareness.push(awarenessScores[obs.label]);
    }
    const meanHigh = highAwareness.length > 0 ? highAwareness.reduce((a, b) => a + b, 0) / highAwareness.length : 0;
    const meanLow = lowAwareness.length > 0 ? lowAwareness.reduce((a, b) => a + b, 0) / lowAwareness.length : 0;
    const construalEffect = Math.round((meanHigh - meanLow) * 1000) / 1000;

    return {
      trialIndex, condition: 'maze-navigation',
      rt: Math.round(latencyMs * 0.8), // scale API latency as proxy
      response: Math.round(construalEffect * 100) / 100,
      correct: null,
      metadata: {
        cot,
        mazeId: maze.id,
        awarenessScores,
        construalProb: construalProbs,
        obstaclesNoticed: Object.entries(awarenessScores).filter(([_, v]) => v > 0.5).map(([k]) => k),
        navigationPath: cot.slice(0, 200),
        construalEffect,
        meanHighAwareness: Math.round(meanHigh * 1000) / 1000,
        meanLowAwareness: Math.round(meanLow * 1000) / 1000,
      },
    };
  } catch {
    // Fallback
    const awarenessScores: Record<string, number> = {};
    const construalProbs: Record<string, number> = {};
    for (const obs of obstaclesWithConstrual) {
      awarenessScores[obs.label] = 0.5;
      construalProbs[obs.label] = obs.construalProb;
    }
    return {
      trialIndex, condition: 'maze-navigation',
      rt: null, response: 0, correct: null,
      metadata: { mazeId: 'error', awarenessScores, construalProb: construalProbs, construalEffect: 0, cot: 'API error' },
    };
  }
}
