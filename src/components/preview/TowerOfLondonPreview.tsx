import { useState } from 'react';
import { motion } from 'framer-motion';

// Simplified Tower of London: 3 pegs, 3 colored discs
// Goal: rearrange discs to match the target configuration
type Disc = 'red' | 'blue' | 'green';
type Peg = Disc[];
type State = [Peg, Peg, Peg];

const DISC_COLORS: Record<Disc, string> = { red: '#E57373', blue: '#64B5F6', green: '#81C784' };

const PUZZLES: { start: State; goal: State; optimalMoves: number }[] = [
  { start: [['red', 'blue', 'green'], [], []], goal: [['green'], ['red'], ['blue']], optimalMoves: 3 },
  { start: [['red'], ['blue'], ['green']], goal: [[], [], ['red', 'blue', 'green']], optimalMoves: 3 },
  { start: [['red', 'blue'], ['green'], []], goal: [['green'], [], ['blue', 'red']], optimalMoves: 4 },
  { start: [['blue', 'red', 'green'], [], []], goal: [[], ['green', 'blue'], ['red']], optimalMoves: 5 },
];

function statesEqual(a: State, b: State): boolean {
  return a.every((peg, i) => peg.length === b[i].length && peg.every((d, j) => d === b[i][j]));
}

export function TowerOfLondonPreview() {
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [state, setState] = useState<State>(JSON.parse(JSON.stringify(PUZZLES[0].start)));
  const [selectedPeg, setSelectedPeg] = useState<number | null>(null);
  const [moves, setMoves] = useState(0);
  const [startTime] = useState(Date.now());
  const [solved, setSolved] = useState(false);

  const puzzle = PUZZLES[puzzleIdx];

  const handlePegClick = (pegIdx: number) => {
    if (solved) return;

    if (selectedPeg === null) {
      if (state[pegIdx].length > 0) setSelectedPeg(pegIdx);
    } else {
      if (pegIdx !== selectedPeg && state[pegIdx].length < 3) {
        const newState: State = state.map(p => [...p]) as State;
        const disc = newState[selectedPeg].pop()!;
        newState[pegIdx].push(disc);
        setState(newState);
        setMoves(m => m + 1);
        setSelectedPeg(null);

        if (statesEqual(newState, puzzle.goal)) {
          setSolved(true);
        }
      } else {
        setSelectedPeg(pegIdx === selectedPeg ? null : pegIdx);
      }
    }
  };

  const reset = () => {
    setState(JSON.parse(JSON.stringify(puzzle.start)));
    setSelectedPeg(null);
    setMoves(0);
    setSolved(false);
  };

  const nextPuzzle = () => {
    const next = (puzzleIdx + 1) % PUZZLES.length;
    setPuzzleIdx(next);
    setState(JSON.parse(JSON.stringify(PUZZLES[next].start)));
    setSelectedPeg(null);
    setMoves(0);
    setSolved(false);
  };

  const renderPeg = (pegs: State, pegIdx: number, label: string, isGoal: boolean = false) => (
    <div className="flex flex-col items-center" onClick={() => !isGoal && handlePegClick(pegIdx)}>
      <div className={`w-20 flex flex-col-reverse items-center gap-0.5 min-h-[80px] pb-1 cursor-pointer rounded-xl transition-all ${
        !isGoal && selectedPeg === pegIdx ? 'bg-orchid/10 ring-2 ring-orchid/30' : !isGoal ? 'hover:bg-orchid/5' : ''
      }`}>
        {pegs[pegIdx].map((disc, di) => (
          <motion.div key={`${disc}-${di}`} layout
            className="rounded-md h-5 flex items-center justify-center text-[9px] text-white font-semibold"
            style={{ background: DISC_COLORS[disc], width: `${40 + di * 12}px` }}>
            {disc[0].toUpperCase()}
          </motion.div>
        ))}
      </div>
      <div className="w-16 h-1 bg-orchid/10 rounded-full mt-1" />
      <span className="text-[10px] text-text-4 mt-1">{label}</span>
    </div>
  );

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-heading text-text">🏗 tower of london preview</h3>
        <span className="text-xs font-mono text-text-3">puzzle {puzzleIdx + 1}/{PUZZLES.length} · {moves} moves</span>
      </div>

      {/* Goal */}
      <div className="mb-3">
        <span className="text-[10px] text-text-3 uppercase tracking-wider">goal</span>
        <div className="flex justify-center gap-6 mt-1 opacity-60">
          {[0, 1, 2].map(i => renderPeg(puzzle.goal, i, '', true))}
        </div>
      </div>

      {/* Current state */}
      <div className="mb-4">
        <span className="text-[10px] text-text-3 uppercase tracking-wider">your board — click a peg to move the top disc</span>
        <div className="flex justify-center gap-6 mt-1">
          {[0, 1, 2].map(i => renderPeg(state, i, `peg ${i + 1}`))}
        </div>
      </div>

      {solved && (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="text-center p-3 rounded-xl bg-sage/10 border border-sage/20 mb-3">
          <p className="text-sm text-sage font-semibold">solved in {moves} moves!</p>
          <p className="text-xs text-text-3">optimal: {puzzle.optimalMoves} · time: {Math.round((Date.now() - startTime) / 1000)}s</p>
        </motion.div>
      )}

      <div className="flex gap-2 justify-center">
        <button onClick={reset} className="text-xs text-text-3 hover:text-text cursor-pointer">reset</button>
        <span className="text-text-4">·</span>
        <button onClick={nextPuzzle} className="text-xs text-orchid hover:underline cursor-pointer">next puzzle</button>
      </div>
    </div>
  );
}
