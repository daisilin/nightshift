import { useState } from 'react';
import { motion } from 'framer-motion';

// Simple chess puzzle: given a position, find the best move
// Uses Claude to play as different skill-level personas

interface Puzzle {
  description: string;
  board: string; // simplified text representation
  correctMove: string;
  difficulty: string;
}

const PUZZLES: Puzzle[] = [
  {
    description: 'White to move. Can you find checkmate in one?',
    board: '♜·♝·♚··♜\n♟♟♟·♟♟♟♟\n····♗···\n··♗·····\n····♙···\n·····♘··\n♙♙♙♙·♙♙♙\n♖·♗♕♔··♖',
    correctMove: 'Qxf7#',
    difficulty: '1-move',
  },
  {
    description: 'White to move. Find the fork!',
    board: '♜·♝♛♚♝·♜\n♟♟♟·♟♟♟♟\n··♞·····\n····♙···\n····♘···\n········\n♙♙♙♙·♙♙♙\n♖·♗♕♔♗·♖',
    correctMove: 'Nd6+',
    difficulty: '1-move',
  },
  {
    description: 'White to move. Set up a discovered attack.',
    board: '♜·♝♛♚♝♞♜\n♟♟♟♟·♟♟♟\n········\n····♟···\n··♗·♙···\n·····♘··\n♙♙♙♙·♙♙♙\n♖♞♗♕♔··♖',
    correctMove: 'Bxf7+',
    difficulty: '2-move',
  },
];

export function ChessPreview() {
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [userGuess, setUserGuess] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  const puzzle = PUZZLES[puzzleIdx];

  const checkAnswer = () => {
    const guess = userGuess.trim().toLowerCase().replace(/[^a-z0-9#+]/g, '');
    const correct = puzzle.correctMove.toLowerCase().replace(/[^a-z0-9#+]/g, '');
    if (guess === correct || guess.includes(correct.slice(0, -1))) {
      setFeedback('correct! ✓');
      setSolved(true);
    } else {
      setFeedback(`not quite — the answer is ${puzzle.correctMove}. try the next one!`);
    }
  };

  const next = () => {
    setPuzzleIdx((puzzleIdx + 1) % PUZZLES.length);
    setUserGuess('');
    setFeedback(null);
    setSolved(false);
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-heading text-text">♟ chess puzzle</h3>
        <span className="text-xs font-mono text-text-3">puzzle {puzzleIdx + 1}/{PUZZLES.length} · {puzzle.difficulty}</span>
      </div>

      <p className="text-sm text-text-2 mb-3">{puzzle.description}</p>

      {/* Board display */}
      <pre className="text-center font-mono text-lg leading-relaxed mb-4 p-3 rounded-xl bg-surface/50 border border-orchid/5 select-none">
        {puzzle.board}
      </pre>

      {/* Input */}
      {!solved ? (
        <div className="flex gap-2 mb-2">
          <input
            value={userGuess}
            onChange={e => setUserGuess(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') checkAnswer(); }}
            placeholder="your move (e.g., Qxf7#)"
            className="flex-1 px-3 py-2 rounded-xl text-sm border border-orchid/15 bg-white text-text focus:outline-none"
          />
          <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            onClick={checkAnswer} disabled={!userGuess.trim()}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-30"
            style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
            check
          </motion.button>
        </div>
      ) : null}

      {feedback && (
        <p className={`text-sm mb-3 ${solved ? 'text-sage' : 'text-peach'}`}>{feedback}</p>
      )}

      <div className="flex gap-3 justify-center text-xs">
        <button onClick={next} className="text-orchid hover:underline cursor-pointer">
          {solved ? 'next puzzle →' : 'skip →'}
        </button>
      </div>
    </div>
  );
}
