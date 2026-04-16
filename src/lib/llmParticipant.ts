/**
 * LLM-Based Participant Simulation
 *
 * Instead of parametric RT/accuracy, the LLM actually "does" the task:
 * - Sees the stimulus (maze, game board, survey item)
 * - Responds as a specific persona would
 * - Reports what it noticed, remembered, or decided
 *
 * This enables simulation of cognitive phenomena that parametric models can't:
 * - Selective attention (which parts of a scene are noticed)
 * - Strategy (how the agent approaches a problem)
 * - Comprehension (does the agent understand instructions)
 * - Social cognition (how the agent responds to other agents)
 *
 * Trade-offs vs parametric:
 * - Slower (1 API call per trial)
 * - More expensive
 * - Not perfectly reproducible (LLM sampling)
 * - But: captures cognitive phenomena that math can't model
 */

import { callClaudeApi } from './apiKey';

export interface LLMTrialInput {
  taskDescription: string;
  stimulus: string;        // the specific trial (maze layout, game board, etc.)
  personaPrompt: string;   // "you are a 65-year-old retiree..."
  responseFormat: string;  // what to return (JSON schema)
}

export interface LLMTrialOutput {
  response: any;           // the agent's response (parsed JSON)
  rawText: string;         // full LLM output
  latencyMs: number;       // API call time (proxy for "RT")
}

/**
 * Run one trial with an LLM participant.
 */
export async function runLLMTrial(input: LLMTrialInput): Promise<LLMTrialOutput> {
  const start = Date.now();

  try {
    const res = await callClaudeApi({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 300,
        system: `${input.personaPrompt}

Task: ${input.taskDescription}

Response format: ${input.responseFormat}
Return ONLY the JSON response.`,
        messages: [{ role: 'user', content: input.stimulus }],
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

    return { response, rawText, latencyMs };
  } catch {
    return { response: { error: true }, rawText: '', latencyMs: Date.now() - start };
  }
}

/**
 * Run a batch of trials for one LLM participant.
 * Includes conversation history so the agent "remembers" earlier trials.
 */
export async function runLLMSession(
  personaPrompt: string,
  taskDescription: string,
  trials: { stimulus: string; responseFormat: string }[],
  onProgress?: (trialIdx: number, total: number) => void,
): Promise<LLMTrialOutput[]> {
  const results: LLMTrialOutput[] = [];

  for (let i = 0; i < trials.length; i++) {
    onProgress?.(i, trials.length);
    const result = await runLLMTrial({
      taskDescription,
      stimulus: trials[i].stimulus,
      personaPrompt,
      responseFormat: trials[i].responseFormat,
    });
    results.push(result);
  }

  return results;
}

// ============================================================
// MAZE TASK — for reproducing Ho et al. (Nature)
// ============================================================

export interface MazeConfig {
  width: number;
  height: number;
  start: [number, number];
  goal: [number, number];
  obstacles: { position: [number, number]; label: string; relevant: boolean }[];
  walls: [number, number][];
}

/**
 * Generate a maze trial description for the LLM.
 */
export function mazeToText(maze: MazeConfig): string {
  const grid: string[][] = Array.from({ length: maze.height }, () =>
    Array(maze.width).fill('.')
  );

  for (const w of maze.walls) grid[w[1]][w[0]] = '#';
  for (const o of maze.obstacles) grid[o.position[1]][o.position[0]] = o.label;
  grid[maze.start[1]][maze.start[0]] = 'S';
  grid[maze.goal[1]][maze.goal[0]] = 'G';

  return grid.map(row => row.join(' ')).join('\n');
}

/**
 * Generate a sample maze for the Ho et al. paradigm.
 */
export function generateSampleMaze(seed: number): MazeConfig {
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  const width = 7, height = 7;
  const start: [number, number] = [0, Math.floor(rng() * height)];
  const goal: [number, number] = [width - 1, Math.floor(rng() * height)];

  // Center walls (+)
  const walls: [number, number][] = [];
  const mid = Math.floor(width / 2);
  for (let i = 1; i < height - 1; i++) walls.push([mid, i]);
  for (let i = 1; i < width - 1; i++) walls.push([i, Math.floor(height / 2)]);

  // Obstacles — some relevant (on likely path), some irrelevant
  const obstacles: MazeConfig['obstacles'] = [];
  const labels = 'ABCDEFGH';
  for (let i = 0; i < 4; i++) {
    const x = 1 + Math.floor(rng() * (width - 2));
    const y = Math.floor(rng() * height);
    if (grid_empty(x, y, start, goal, walls)) {
      const nearPath = Math.abs(y - start[1]) < 2 || Math.abs(y - goal[1]) < 2;
      obstacles.push({ position: [x, y], label: labels[i], relevant: nearPath });
    }
  }

  return { width, height, start, goal, obstacles, walls };
}

function grid_empty(x: number, y: number, start: [number, number], goal: [number, number], walls: [number, number][]): boolean {
  if (x === start[0] && y === start[1]) return false;
  if (x === goal[0] && y === goal[1]) return false;
  return !walls.some(w => w[0] === x && w[1] === y);
}

/**
 * Run the Ho et al. maze experiment with an LLM participant.
 * After navigation: memory probe (which obstacles were noticed?)
 */
export async function runMazeExperiment(
  personaPrompt: string,
  nTrials: number = 5,
  onProgress?: (trial: number, total: number) => void,
): Promise<{
  trials: { maze: MazeConfig; path: string; memoryProbe: Record<string, number> }[];
  construalEffect: number; // relevance effect on memory (higher = stronger)
}> {
  const trials: any[] = [];

  for (let t = 0; t < nTrials; t++) {
    onProgress?.(t, nTrials);
    const maze = generateSampleMaze(42 + t * 7);
    const mazeText = mazeToText(maze);

    // Step 1: Navigate
    const navResult = await runLLMTrial({
      taskDescription: 'Navigate from S to G in this maze. # are walls, letters are obstacles you cannot pass through.',
      stimulus: `Maze:\n${mazeText}\n\nPlan your route from S to G. Describe your path.`,
      personaPrompt,
      responseFormat: '{ "path": "description of your planned route", "obstacles_noticed": ["A", "B", ...] }',
    });

    // Step 2: Memory probe
    const probeResult = await runLLMTrial({
      taskDescription: 'Memory test: rate how aware you were of each obstacle during navigation (0 = not at all, 1 = fully aware).',
      stimulus: `The maze had these obstacles: ${maze.obstacles.map(o => o.label).join(', ')}.\nRate your awareness of each (0.0 to 1.0).`,
      personaPrompt,
      responseFormat: `{ ${maze.obstacles.map(o => `"${o.label}": 0.0-1.0`).join(', ')} }`,
    });

    trials.push({
      maze,
      path: navResult.response?.path || navResult.rawText,
      memoryProbe: probeResult.response || {},
    });
  }

  // Compute construal effect: difference in memory for relevant vs irrelevant obstacles
  let relevantSum = 0, irrelevantSum = 0, relCount = 0, irrelCount = 0;
  for (const trial of trials) {
    for (const obs of trial.maze.obstacles) {
      const mem = trial.memoryProbe[obs.label] ?? 0.5;
      if (obs.relevant) { relevantSum += mem; relCount++; }
      else { irrelevantSum += mem; irrelCount++; }
    }
  }
  const construalEffect = relCount > 0 && irrelCount > 0
    ? (relevantSum / relCount) - (irrelevantSum / irrelCount)
    : 0;

  return { trials, construalEffect };
}
