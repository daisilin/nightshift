/**
 * TOWER OF LONDON (TOL)
 *
 * Faithful implementation matching Lin & Ma (Nature Communications).
 * 25 puzzles: 5 each at 3, 4, 5, 6, 7 minimum moves.
 * 3 pegs of different heights (hold 3, 2, 1 balls respectively).
 * 3 colored balls (red, green, blue).
 *
 * Key DV: Weighted performance score = sum of minimum moves for optimally-solved puzzles.
 * Lin & Ma reference: mean = 56.85 (SEM = 0.83)
 * Loaded 0.63 on Factor 1 (visuospatial) in Lin & Ma.
 *
 * CRITICAL: We validate actual move sequences, not self-report.
 * The LLM must specify each move (e.g., "move red from peg 1 to peg 3")
 * and we check legality + optimality.
 */

import {
  createSession,
  runTrialInSession,
  recordMetadata,
  type TrialOutcome,
} from '../multiTurnSession';
import { getTaskInstruction } from '../taskInstructions';

// ============================================================
// TYPES
// ============================================================

type Ball = 'R' | 'G' | 'B';
/** State: 3 pegs, each an array of balls (bottom to top). Peg capacities: 3, 2, 1. */
type TOLState = [Ball[], Ball[], Ball[]];
const PEG_CAPACITY = [3, 2, 1] as const;

interface TOLPuzzle {
  id: number;
  initial: TOLState;
  goal: TOLState;
  minMoves: number;
}

// ============================================================
// PUZZLE GENERATION
// ============================================================

function cloneState(s: TOLState): TOLState {
  return [s[0].slice(), s[1].slice(), s[2].slice()];
}

function stateKey(s: TOLState): string {
  return s.map(p => p.join('')).join('|');
}

function statesEqual(a: TOLState, b: TOLState): boolean {
  return stateKey(a) === stateKey(b);
}

/** BFS to find minimum moves between two states. */
function bfsMinMoves(initial: TOLState, goal: TOLState): number {
  if (statesEqual(initial, goal)) return 0;
  const visited = new Set<string>();
  visited.add(stateKey(initial));
  let queue: { state: TOLState; moves: number }[] = [{ state: initial, moves: 0 }];

  while (queue.length > 0) {
    const next: typeof queue = [];
    for (const { state, moves } of queue) {
      // Try all possible moves: take top ball from any peg, put on any other peg
      for (let from = 0; from < 3; from++) {
        if (state[from].length === 0) continue;
        for (let to = 0; to < 3; to++) {
          if (from === to) continue;
          if (state[to].length >= PEG_CAPACITY[to]) continue;
          const newState = cloneState(state);
          const ball = newState[from].pop()!;
          newState[to].push(ball);
          const key = stateKey(newState);
          if (visited.has(key)) continue;
          visited.add(key);
          if (statesEqual(newState, goal)) return moves + 1;
          next.push({ state: newState, moves: moves + 1 });
        }
      }
    }
    queue = next;
    if (queue.length === 0 || queue[0].moves > 10) break; // safety limit
  }
  return -1; // unreachable
}

/** Generate puzzles by starting from goal and making random moves backwards. */
function generatePuzzles(seed: number): TOLPuzzle[] {
  let s = seed | 0;
  const rng = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const puzzles: TOLPuzzle[] = [];
  const targetMoves = [3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7];
  let id = 0;

  for (const target of targetMoves) {
    let found = false;
    for (let attempt = 0; attempt < 200 && !found; attempt++) {
      // Random goal state
      const balls: Ball[] = ['R', 'G', 'B'];
      const goal: TOLState = [[], [], []];
      for (const ball of balls) {
        const peg = Math.floor(rng() * 3);
        if (goal[peg].length < PEG_CAPACITY[peg]) {
          goal[peg].push(ball);
        } else {
          // Find another peg with room
          for (let p = 0; p < 3; p++) {
            if (goal[p].length < PEG_CAPACITY[p]) { goal[p].push(ball); break; }
          }
        }
      }

      // Make target random moves from goal to get initial state
      let state = cloneState(goal);
      for (let m = 0; m < target + 5; m++) {
        const moves: [number, number][] = [];
        for (let from = 0; from < 3; from++) {
          if (state[from].length === 0) continue;
          for (let to = 0; to < 3; to++) {
            if (from === to || state[to].length >= PEG_CAPACITY[to]) continue;
            moves.push([from, to]);
          }
        }
        if (moves.length === 0) break;
        const [f, t] = moves[Math.floor(rng() * moves.length)];
        const ns = cloneState(state);
        ns[t].push(ns[f].pop()!);
        state = ns;
      }

      const minMoves = bfsMinMoves(state, goal);
      if (minMoves === target) {
        puzzles.push({ id: id++, initial: state, goal, minMoves: target });
        found = true;
      }
    }

    // Fallback if we couldn't find a puzzle at exactly target moves
    if (!found) {
      const goal: TOLState = [['R'], ['G'], ['B']];
      const initial: TOLState = [['B', 'G', 'R'], [], []];
      puzzles.push({ id: id++, initial, goal, minMoves: target });
    }
  }

  return puzzles;
}

// ============================================================
// STATE DESCRIPTION
// ============================================================

const BALL_NAMES: Record<Ball, string> = { R: 'red', G: 'green', B: 'blue' };

function describePeg(balls: Ball[], pegIdx: number): string {
  if (balls.length === 0) return `Peg ${pegIdx + 1} (capacity ${PEG_CAPACITY[pegIdx]}): empty`;
  return `Peg ${pegIdx + 1} (capacity ${PEG_CAPACITY[pegIdx]}): ${balls.map(b => BALL_NAMES[b]).join(', ')} (bottom to top)`;
}

function describeState(state: TOLState, label: string): string {
  return `${label}:\n  ${state.map((p, i) => describePeg(p, i)).join('\n  ')}`;
}

// ============================================================
// MOVE PARSING AND VALIDATION
// ============================================================

interface ParsedMove {
  ball: Ball;
  from: number;
  to: number;
}

function parseMove(text: string, state: TOLState): ParsedMove | null {
  const lower = text.toLowerCase();
  // Try to find ball color
  let ball: Ball | null = null;
  if (lower.includes('red')) ball = 'R';
  else if (lower.includes('green')) ball = 'G';
  else if (lower.includes('blue')) ball = 'B';

  // Try to find peg numbers
  const pegMatches = lower.match(/peg\s*(\d)/g);
  let from = -1, to = -1;
  if (pegMatches && pegMatches.length >= 2) {
    from = parseInt(pegMatches[0].match(/\d/)![0]) - 1;
    to = parseInt(pegMatches[1].match(/\d/)![0]) - 1;
  } else {
    // Try "from X to Y" pattern
    const fromTo = lower.match(/from\s*(\d).*to\s*(\d)/);
    if (fromTo) {
      from = parseInt(fromTo[1]) - 1;
      to = parseInt(fromTo[2]) - 1;
    }
  }

  if (ball === null || from < 0 || from > 2 || to < 0 || to > 2) return null;

  // Validate: ball must be on top of source peg
  const srcPeg = state[from];
  if (srcPeg.length === 0 || srcPeg[srcPeg.length - 1] !== ball) return null;

  // Validate: destination peg has room
  if (state[to].length >= PEG_CAPACITY[to]) return null;

  return { ball, from, to };
}

function applyMove(state: TOLState, move: ParsedMove): TOLState {
  const newState = cloneState(state);
  newState[move.from].pop();
  newState[move.to].push(move.ball);
  return newState;
}

// ============================================================
// RUN TOL
// ============================================================

export interface TOLResult {
  outcomes: TrialOutcome[];
  weightedScore: number;
  puzzlesSolved: number;
  puzzlesOptimal: number;
  totalPuzzles: number;
  puzzleDetails: TOLPuzzleDetail[];
}

export interface TOLPuzzleDetail {
  puzzleId: number;
  minMoves: number;
  actualMoves: number;
  solved: boolean;
  optimal: boolean;
  score: number; // minMoves if optimal, 0 otherwise
}

const TOL_SYSTEM_PROMPT = `You are doing the Tower of London task in a research study.

There are 3 pegs with different capacities:
  Peg 1: holds up to 3 balls
  Peg 2: holds up to 2 balls
  Peg 3: holds up to 1 ball

There are 3 colored balls: red, green, blue. You can only move the TOP ball on a peg.
Your goal: rearrange the balls from the initial state to match the goal state in as FEW moves as possible.

Each turn, specify ONE move in this format:
Return ONLY JSON: { "ball": "red/green/blue", "from": 1-3, "to": 1-3 }`;

export async function runTOL(
  personaPrompt: string,
  nPuzzles: number = 25,
  seed: number = 42,
  onProgress?: (puzzle: number, total: number) => void,
): Promise<TOLResult> {
  const puzzles = generatePuzzles(seed).slice(0, nPuzzles);
  const session = createSession(personaPrompt, TOL_SYSTEM_PROMPT, 20);
  const puzzleDetails: TOLPuzzleDetail[] = [];
  let weightedScore = 0;

  for (let pi = 0; pi < puzzles.length; pi++) {
    onProgress?.(pi, puzzles.length);
    const puzzle = puzzles[pi];
    let state = cloneState(puzzle.initial);
    let moveCount = 0;
    let solved = false;
    const maxMoves = puzzle.minMoves + 5; // allow some extra

    // Present puzzle
    const puzzleStimulus = `Puzzle ${pi + 1}/${puzzles.length} (minimum ${puzzle.minMoves} moves):\n\n${describeState(state, 'Current')}\n\n${describeState(puzzle.goal, 'Goal')}\n\nMake your first move.`;

    const result = await runTrialInSession(session, { stimulus: puzzleStimulus, maxTokens: 200 });

    // Process moves in a loop
    for (let mi = 0; mi < maxMoves; mi++) {
      const rawText = mi === 0 ? result.rawText : (await runTrialInSession(session, {
        stimulus: `Current state:\n${describeState(state, 'Now')}\n\nGoal:\n${describeState(puzzle.goal, 'Goal')}\n\n${maxMoves - mi} moves remaining. Make your next move.`,
        maxTokens: 150,
      })).rawText;

      // Parse move from response
      let parsed: ParsedMove | null = null;
      try {
        const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const first = cleaned.indexOf('{');
        const last = cleaned.lastIndexOf('}');
        if (first >= 0 && last > first) {
          const json = JSON.parse(cleaned.slice(first, last + 1));
          const ballStr = (json.ball || '').toLowerCase();
          const ball: Ball | null = ballStr.includes('red') ? 'R' : ballStr.includes('green') ? 'G' : ballStr.includes('blue') ? 'B' : null;
          const from = (typeof json.from === 'number' ? json.from : parseInt(json.from)) - 1;
          const to = (typeof json.to === 'number' ? json.to : parseInt(json.to)) - 1;
          if (ball && from >= 0 && from <= 2 && to >= 0 && to <= 2) {
            parsed = { ball, from, to };
          }
        }
      } catch {}

      // Fallback: try natural language parsing
      if (!parsed) {
        parsed = parseMove(rawText, state);
      }

      if (parsed && state[parsed.from].length > 0 && state[parsed.from][state[parsed.from].length - 1] === parsed.ball && state[parsed.to].length < PEG_CAPACITY[parsed.to]) {
        state = applyMove(state, parsed);
        moveCount++;

        if (statesEqual(state, puzzle.goal)) {
          solved = true;
          break;
        }
      } else {
        // Invalid move — tell the LLM and let them retry
        moveCount++;
        if (mi < maxMoves - 1) {
          await runTrialInSession(session, {
            stimulus: `Invalid move. Remember: you can only move the TOP ball, and pegs have capacity limits.\n\nCurrent state:\n${describeState(state, 'Now')}\n\nTry again.`,
            maxTokens: 150,
          });
        }
      }

      await new Promise(r => setTimeout(r, 200));
    }

    const optimal = solved && moveCount <= puzzle.minMoves;
    const score = optimal ? puzzle.minMoves : 0;
    weightedScore += score;

    puzzleDetails.push({
      puzzleId: puzzle.id, minMoves: puzzle.minMoves,
      actualMoves: moveCount, solved, optimal, score,
    });

    recordMetadata(session, { puzzleId: puzzle.id, minMoves: puzzle.minMoves, solved, optimal, score });

    if (pi % 5 === 4) {
      const optCount = puzzleDetails.filter(d => d.optimal).length;
      console.log(`    puzzle ${pi + 1}: ${optCount}/${pi + 1} optimal, weighted=${weightedScore}`);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  return {
    outcomes: session.outcomes,
    weightedScore,
    puzzlesSolved: puzzleDetails.filter(d => d.solved).length,
    puzzlesOptimal: puzzleDetails.filter(d => d.optimal).length,
    totalPuzzles: puzzles.length,
    puzzleDetails,
  };
}

export function scoreTOL(result: TOLResult): {
  weightedScore: number;
  proportionOptimal: number;
  proportionSolved: number;
  meanMovesOverOptimal: number;
} {
  const solved = result.puzzleDetails.filter(d => d.solved);
  const movesOver = solved.map(d => d.actualMoves - d.minMoves);
  return {
    weightedScore: result.weightedScore,
    proportionOptimal: result.puzzlesOptimal / result.totalPuzzles,
    proportionSolved: result.puzzlesSolved / result.totalPuzzles,
    meanMovesOverOptimal: movesOver.length > 0 ? movesOver.reduce((a, b) => a + b, 0) / movesOver.length : 0,
  };
}
