import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';

const ROWS = 4, COLS = 9, K = 4;
type Player = 1 | -1;
type Cell = 0 | 1 | -1;
type Board = Cell[][];

function createBoard(): Board { return Array.from({ length: ROWS }, () => Array(COLS).fill(0)); }

function makeMove(board: Board, r: number, c: number, player: Player): Board {
  const b = board.map(row => [...row]);
  b[r][c] = player;
  return b;
}

function checkWinner(board: Board): number {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const p of [1, -1] as Player[]) {
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== p) continue;
      for (const [dr, dc] of dirs) {
        let count = 1;
        for (let s = 1; s < K; s++) {
          const nr = r+dr*s, nc = c+dc*s;
          if (nr<0||nr>=ROWS||nc<0||nc>=COLS||board[nr][nc]!==p) break;
          count++;
        }
        if (count >= K) return p;
      }
    }
  }
  return board.some(row => row.some(c => c === 0)) ? 0 : 0.0001;
}

// Simple AI: minimax depth 3
function evaluate(board: Board): number {
  const w = checkWinner(board);
  if (w === 1) return 1000; if (w === -1) return -1000;
  return 0;
}

function minimax(board: Board, depth: number, alpha: number, beta: number, max: boolean): number {
  const w = checkWinner(board);
  if (w !== 0 || depth === 0) return evaluate(board);
  if (max) {
    let v = -Infinity;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0) continue;
      v = Math.max(v, minimax(makeMove(board,r,c,1), depth-1, alpha, beta, false));
      alpha = Math.max(alpha, v); if (beta <= alpha) return v;
    }
    return v;
  } else {
    let v = Infinity;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (board[r][c] !== 0) continue;
      v = Math.min(v, minimax(makeMove(board,r,c,-1), depth-1, alpha, beta, true));
      beta = Math.min(beta, v); if (beta <= alpha) return v;
    }
    return v;
  }
}

function aiMove(board: Board): [number, number] {
  let best: [number, number] = [0, 0], bestScore = Infinity;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (board[r][c] !== 0) continue;
    const s = minimax(makeMove(board,r,c,-1), 3, -Infinity, Infinity, true);
    if (s < bestScore) { bestScore = s; best = [r,c]; }
  }
  return best;
}

export function FourInARowPreview() {
  const [board, setBoard] = useState(createBoard);
  const [turn, setTurn] = useState<Player>(1);
  const [winner, setWinner] = useState(0);
  const [moves, setMoves] = useState(0);
  const [thinking, setThinking] = useState(false);

  const reset = useCallback(() => { setBoard(createBoard()); setTurn(1); setWinner(0); setMoves(0); }, []);

  const handleClick = (r: number, c: number) => {
    if (board[r][c] !== 0 || winner !== 0 || turn !== 1 || thinking) return;
    const nb = makeMove(board, r, c, 1);
    setBoard(nb); setMoves(m => m+1);
    const w = checkWinner(nb);
    if (w !== 0) { setWinner(w); return; }
    setTurn(-1); setThinking(true);
  };

  useEffect(() => {
    if (turn !== -1 || winner !== 0 || !thinking) return;
    const t = setTimeout(() => {
      const [ar, ac] = aiMove(board);
      const nb = makeMove(board, ar, ac, -1);
      setBoard(nb); setMoves(m => m+1); setThinking(false);
      const w = checkWinner(nb);
      if (w !== 0) setWinner(w); else setTurn(1);
    }, 300);
    return () => clearTimeout(t);
  }, [turn, winner, thinking, board]);

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-heading text-text">🎯 four-in-a-row (4×9)</h3>
        <span className="text-xs font-mono text-text-3">{moves} moves · {winner === 1 ? 'you won!' : winner === -1 ? 'AI won' : winner === 0.0001 ? 'draw' : turn === 1 ? 'your turn' : 'AI thinking...'}</span>
      </div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)` }}>
        {Array.from({ length: ROWS }).map((_, r) =>
          Array.from({ length: COLS }).map((_, c) => {
            const cell = board[r][c];
            return (
              <motion.button key={`${r}-${c}`} onClick={() => handleClick(r, c)}
                whileHover={cell === 0 && !winner && turn === 1 ? { scale: 1.1 } : undefined}
                className="aspect-square rounded-lg transition-all text-xs font-bold"
                style={{
                  background: cell === 0 ? 'rgba(176,124,198,0.04)' : cell === 1 ? '#8BACD4' : '#E8A87C',
                  border: `1px solid ${cell === 0 ? 'rgba(176,124,198,0.1)' : cell === 1 ? '#8BACD4' : '#E8A87C'}`,
                  cursor: cell === 0 && !winner && turn === 1 ? 'pointer' : 'default',
                  color: 'white',
                }}>
                {cell === 1 ? 'X' : cell === -1 ? 'O' : ''}
              </motion.button>
            );
          })
        )}
      </div>
      <div className="flex gap-3 justify-center mt-3 text-xs">
        <button onClick={reset} className="text-orchid hover:underline cursor-pointer">reset</button>
        <span className="text-text-4">4×9 board · free placement · connect 4 to win</span>
      </div>
    </div>
  );
}
