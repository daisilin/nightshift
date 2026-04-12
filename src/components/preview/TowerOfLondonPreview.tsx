import { useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';

// Tower of London: 3 pegs, 3 colored discs, peg capacities [3, 2, 1]
type Disc = 'R' | 'B' | 'G';
type Peg = Disc[];
type State = [Peg, Peg, Peg];

const PEG_CAPACITY = [3, 2, 1]; // standard Shallice version
const DISC_COLORS: Record<Disc, string> = { R: '#E57373', B: '#64B5F6', G: '#81C784' };
const DISC_LABELS: Record<Disc, string> = { R: 'red', B: 'blue', G: 'green' };

// BFS solver — finds true optimal move count
function stateKey(s: State): string {
  return s.map(p => p.join('')).join('|');
}

function solve(start: State, goal: State): number {
  const goalKey = stateKey(goal);
  if (stateKey(start) === goalKey) return 0;

  const visited = new Set<string>();
  visited.add(stateKey(start));
  let queue: { state: State; moves: number }[] = [{ state: start, moves: 0 }];

  while (queue.length > 0) {
    const next: typeof queue = [];
    for (const { state, moves } of queue) {
      for (let from = 0; from < 3; from++) {
        if (state[from].length === 0) continue;
        for (let to = 0; to < 3; to++) {
          if (from === to) continue;
          if (state[to].length >= PEG_CAPACITY[to]) continue;
          const newState: State = [
            [...state[0]], [...state[1]], [...state[2]],
          ];
          const disc = newState[from].pop()!;
          newState[to].push(disc);
          const key = stateKey(newState);
          if (key === goalKey) return moves + 1;
          if (!visited.has(key)) {
            visited.add(key);
            next.push({ state: newState, moves: moves + 1 });
          }
        }
      }
    }
    queue = next;
  }
  return -1; // unsolvable
}

// Puzzles with BFS-verified optimal moves
const PUZZLE_DEFS: { start: State; goal: State }[] = [
  { start: [['R', 'B', 'G'], [], []], goal: [['R'], ['B'], ['G']] },
  { start: [['R', 'B', 'G'], [], []], goal: [['B'], ['G'], ['R']] },
  { start: [['R'], ['B'], ['G']], goal: [['G', 'B', 'R'], [], []] },
  { start: [['R', 'B'], ['G'], []], goal: [['G'], ['R'], ['B']] },
  { start: [['R', 'B', 'G'], [], []], goal: [['G', 'R'], ['B'], []] },
];

function statesEqual(a: State, b: State): boolean {
  return a.every((peg, i) => peg.length === b[i].length && peg.every((d, j) => d === b[i][j]));
}

export function TowerOfLondonPreview() {
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const puzzle = PUZZLE_DEFS[puzzleIdx];

  // BFS-compute optimal on mount (instant for 3 discs)
  const optimal = useMemo(() => solve(puzzle.start, puzzle.goal), [puzzle]);

  const [state, setState] = useState<State>(
    () => [puzzle.start[0].slice(), puzzle.start[1].slice(), puzzle.start[2].slice()] as State
  );
  const [selectedPeg, setSelectedPeg] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [solved, setSolved] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());

  const reset = useCallback(() => {
    setState([puzzle.start[0].slice(), puzzle.start[1].slice(), puzzle.start[2].slice()] as State);
    setSelectedPeg(null);
    setMoves(0);
    setSolved(false);
    setStartTime(Date.now());
  }, [puzzle]);

  const nextPuzzle = useCallback(() => {
    const next = (puzzleIdx + 1) % PUZZLE_DEFS.length;
    setPuzzleIdx(next);
    const p = PUZZLE_DEFS[next];
    setState([p.start[0].slice(), p.start[1].slice(), p.start[2].slice()] as State);
    setSelectedPeg(null);
    setMoves(0);
    setSolved(false);
    setStartTime(Date.now());
  }, [puzzleIdx]);

  const handlePegClick = (pegIdx: number) => {
    if (solved) return;
    if (selectedPeg === null) {
      if (state[pegIdx].length > 0) setSelectedPeg(pegIdx);
    } else {
      if (pegIdx !== selectedPeg && state[pegIdx].length < PEG_CAPACITY[pegIdx]) {
        const newState: State = [state[0].slice(), state[1].slice(), state[2].slice()];
        const disc = newState[selectedPeg].pop()!;
        newState[pegIdx].push(disc);
        setState(newState);
        setMoves(m => m + 1);
        setSelectedPeg(null);
        if (statesEqual(newState, puzzle.goal)) setSolved(true);
      } else {
        setSelectedPeg(pegIdx === selectedPeg ? null : pegIdx);
      }
    }
  };

  const renderPeg = (pegs: State, pegIdx: number, isGoal: boolean = false) => {
    const cap = PEG_CAPACITY[pegIdx];
    return (
      <div
        className={`flex flex-col items-center ${!isGoal ? 'cursor-pointer' : ''}`}
        onClick={() => !isGoal && handlePegClick(pegIdx)}
      >
        <div className="text-[9px] text-text-4 mb-1">cap: {cap}</div>
        <div className={`w-20 flex flex-col-reverse items-center gap-0.5 min-h-[72px] pb-1 rounded-xl transition-all ${
          !isGoal && selectedPeg === pegIdx ? 'bg-orchid/10 ring-2 ring-orchid/30' : !isGoal ? 'hover:bg-orchid/5' : ''
        }`}>
          {pegs[pegIdx].map((disc, di) => (
            <motion.div key={`${disc}-${di}`} layout
              className="rounded-md h-5 flex items-center justify-center text-[9px] text-white font-semibold"
              style={{ background: DISC_COLORS[disc], width: `${36 + di * 10}px` }}>
              {DISC_LABELS[disc]}
            </motion.div>
          ))}
        </div>
        <div className="w-14 h-1 bg-orchid/10 rounded-full mt-1" />
        <span className="text-[10px] text-text-4 mt-0.5">peg {pegIdx + 1}</span>
      </div>
    );
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-heading text-text">🏗 tower of london</h3>
        <span className="text-xs font-mono text-text-3">
          puzzle {puzzleIdx + 1}/{PUZZLE_DEFS.length} · {moves} moves · optimal: {optimal}
        </span>
      </div>

      {/* Goal */}
      <div className="mb-2">
        <span className="text-[10px] text-text-3 uppercase tracking-wider">goal configuration</span>
        <div className="flex justify-center gap-4 mt-1 opacity-60 scale-90">
          {[0, 1, 2].map(i => renderPeg(puzzle.goal, i, true))}
        </div>
      </div>

      {/* Current */}
      <div className="mb-3">
        <span className="text-[10px] text-text-3 uppercase tracking-wider">your board — click peg to select, click another to move</span>
        <div className="flex justify-center gap-4 mt-1">
          {[0, 1, 2].map(i => renderPeg(state, i))}
        </div>
      </div>

      {solved && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center p-3 rounded-xl bg-sage/10 border border-sage/20 mb-3">
          <p className="text-sm text-sage font-semibold">
            solved in {moves} move{moves !== 1 ? 's' : ''}!
            {moves === optimal ? ' — optimal! ✨' : ` (optimal: ${optimal})`}
          </p>
          <p className="text-xs text-text-3">time: {Math.round((Date.now() - startTime) / 1000)}s</p>
        </motion.div>
      )}

      <div className="flex gap-3 justify-center text-xs">
        <button onClick={reset} className="text-text-3 hover:text-text cursor-pointer">reset</button>
        <span className="text-text-4">·</span>
        <button onClick={nextPuzzle} className="text-orchid hover:underline cursor-pointer">next puzzle →</button>
      </div>
    </div>
  );
}
