/**
 * FOUR-IN-A-ROW (FIAR)
 *
 * Faithful implementation matching Lin & Ma (Nature Communications).
 * Full games on 4×9 board against AI opponents of varying skill.
 * FREE placement (not gravity-based like Connect 4).
 *
 * Key DV: Elo-like performance score from multiple games
 * Lin & Ma reference: mean Elo = -2.79 (SEM = 4.9)
 * Loaded 0.67 on Factor 2 (working memory).
 *
 * AI opponent plays at adjustable skill level.
 * Multi-turn: each move is a separate API call within a game.
 */

import {
  createSession,
  runTrialInSession,
  recordMetadata,
  type TrialOutcome,
} from '../multiTurnSession';

// ============================================================
// BOARD
// ============================================================

type Cell = '.' | 'X' | 'O';
type Board = Cell[][];

function createBoard(): Board {
  return Array.from({ length: 4 }, () => Array(9).fill('.'));
}

function cloneBoard(b: Board): Board {
  return b.map(row => [...row]);
}

function boardToText(b: Board): string {
  const colNums = '  ' + Array.from({ length: 9 }, (_, i) => i + 1).join(' ');
  const rows = b.map((row, i) => `${i + 1} ${row.join(' ')}`);
  return colNums + '\n' + rows.join('\n');
}

function checkWin(b: Board, player: Cell): boolean {
  const rows = b.length, cols = b[0].length;
  // Horizontal, vertical, diagonal (both directions)
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (b[r][c] !== player) continue;
      for (const [dr, dc] of dirs) {
        let count = 0;
        for (let k = 0; k < 4; k++) {
          const nr = r + dr * k, nc = c + dc * k;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && b[nr][nc] === player) count++;
          else break;
        }
        if (count >= 4) return true;
      }
    }
  }
  return false;
}

function boardFull(b: Board): boolean {
  return b.every(row => row.every(c => c !== '.'));
}

function getEmptyCells(b: Board): [number, number][] {
  const cells: [number, number][] = [];
  for (let r = 0; r < b.length; r++)
    for (let c = 0; c < b[0].length; c++)
      if (b[r][c] === '.') cells.push([r, c]);
  return cells;
}

// ============================================================
// AI OPPONENT
// ============================================================

function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Simple heuristic AI with adjustable skill.
 * skill 0-1: probability of making the "best" move vs random.
 */
function aiMove(board: Board, skill: number, rng: () => number): [number, number] {
  const empty = getEmptyCells(board);
  if (empty.length === 0) return [-1, -1];

  // Check if AI can win immediately
  for (const [r, c] of empty) {
    const test = cloneBoard(board);
    test[r][c] = 'O';
    if (checkWin(test, 'O')) return [r, c];
  }

  // Check if we need to block player
  for (const [r, c] of empty) {
    const test = cloneBoard(board);
    test[r][c] = 'X';
    if (checkWin(test, 'X')) {
      if (rng() < skill) return [r, c]; // block with probability = skill
    }
  }

  // Score cells by adjacency to existing O pieces
  if (rng() < skill) {
    let bestScore = -1;
    let bestMove = empty[0];
    for (const [r, c] of empty) {
      let score = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < 4 && nc >= 0 && nc < 9) {
            if (board[nr][nc] === 'O') score += 2;
            if (board[nr][nc] === '.') score += 1;
          }
        }
      }
      // Prefer center columns
      score += (4 - Math.abs(c - 4)) * 0.5;
      if (score > bestScore) { bestScore = score; bestMove = [r, c]; }
    }
    return bestMove;
  }

  // Random move
  return empty[Math.floor(rng() * empty.length)];
}

// ============================================================
// RUN FIAR
// ============================================================

export interface FIARResult {
  outcomes: TrialOutcome[];
  wins: number;
  losses: number;
  draws: number;
  totalGames: number;
  winRate: number;
  performanceScore: number; // simplified Elo-like score
  gameDetails: FIARGameDetail[];
}

export interface FIARGameDetail {
  gameId: number;
  opponentSkill: number;
  result: 'win' | 'loss' | 'draw';
  totalMoves: number;
  playerMoves: number;
}

const FIAR_SYSTEM = `You are playing Four-in-a-Row in a research study.

RULES:
- 4 rows × 9 columns board
- You are X, opponent is O
- You can place your piece on ANY empty cell (free placement, not gravity)
- Get 4 in a row (horizontal, vertical, or diagonal) to win

Return ONLY JSON: { "row": 1-4, "col": 1-9 }`;

export async function runFIAR(
  personaPrompt: string,
  nGames: number = 10,
  seed: number = 42,
  onProgress?: (game: number, total: number) => void,
): Promise<FIARResult> {
  const rng = createRng(seed);
  const session = createSession(personaPrompt, FIAR_SYSTEM, 20);
  const gameDetails: FIARGameDetail[] = [];
  let wins = 0, losses = 0, draws = 0;

  // Varying opponent skill across games (easier early, harder later)
  const skills = Array.from({ length: nGames }, (_, i) => 0.3 + (i / nGames) * 0.5);

  for (let gi = 0; gi < nGames; gi++) {
    onProgress?.(gi, nGames);
    const skill = skills[gi];
    let board = createBoard();
    let totalMoves = 0;
    let playerMoves = 0;
    let result: 'win' | 'loss' | 'draw' = 'draw';
    const maxTurns = 18; // 36 cells / 2 players = 18 turns max

    // Alternate who goes first
    const playerFirst = gi % 2 === 0;
    let isPlayerTurn = playerFirst;

    // If AI goes first, make their move
    if (!playerFirst) {
      const [ar, ac] = aiMove(board, skill, rng);
      if (ar >= 0) { board[ar][ac] = 'O'; totalMoves++; }
    }

    for (let turn = 0; turn < maxTurns; turn++) {
      if (boardFull(board)) { result = 'draw'; break; }

      if (isPlayerTurn) {
        // Player's turn
        const stimulus = turn === 0 && playerFirst
          ? `Game ${gi + 1}/${nGames}. You are X.\n\n${boardToText(board)}\n\nYour move (row 1-4, col 1-9):`
          : `${boardToText(board)}\n\nYour turn (X). Place your piece:`;

        const moveResult = await runTrialInSession(session, { stimulus, maxTokens: 100 });

        // Parse move
        let row = -1, col = -1;
        try {
          const resp = moveResult.response;
          if (resp && typeof resp.row === 'number' && typeof resp.col === 'number') {
            row = resp.row - 1; col = resp.col - 1;
          } else {
            const nums = moveResult.rawText.match(/\d+/g);
            if (nums && nums.length >= 2) { row = parseInt(nums[0]) - 1; col = parseInt(nums[1]) - 1; }
          }
        } catch {}

        // Validate and apply
        if (row >= 0 && row < 4 && col >= 0 && col < 9 && board[row][col] === '.') {
          board[row][col] = 'X';
          playerMoves++;
          totalMoves++;

          if (checkWin(board, 'X')) { result = 'win'; wins++; break; }
        } else {
          // Invalid move — pick random valid cell
          const empty = getEmptyCells(board);
          if (empty.length > 0) {
            const [er, ec] = empty[Math.floor(rng() * empty.length)];
            board[er][ec] = 'X';
            playerMoves++;
            totalMoves++;
            if (checkWin(board, 'X')) { result = 'win'; wins++; break; }
          }
        }
      } else {
        // AI's turn
        const [ar, ac] = aiMove(board, skill, rng);
        if (ar >= 0) {
          board[ar][ac] = 'O';
          totalMoves++;

          if (checkWin(board, 'O')) {
            result = 'loss'; losses++;
            // Show the losing board
            await runTrialInSession(session, {
              stimulus: `${boardToText(board)}\n\nOpponent wins!`,
              maxTokens: 30,
            });
            break;
          }
        }
      }

      isPlayerTurn = !isPlayerTurn;
      if (boardFull(board)) { result = 'draw'; draws++; break; }

      await new Promise(r => setTimeout(r, 150));
    }

    if (result === 'win') {
      await runTrialInSession(session, {
        stimulus: `${boardToText(board)}\n\nYou win!`,
        maxTokens: 30,
      });
    } else if (result === 'draw' && !boardFull(board)) {
      draws++; // game ended without resolution
    }

    gameDetails.push({ gameId: gi, opponentSkill: skill, result, totalMoves, playerMoves });
    recordMetadata(session, { gameId: gi, result, skill, playerMoves });

    console.log(`    game ${gi + 1}: ${result} (skill=${skill.toFixed(2)}, moves=${totalMoves})`);
    await new Promise(r => setTimeout(r, 200));
  }

  // Simple performance score: wins weighted by opponent skill
  const perfScore = gameDetails.reduce((s, g) => {
    if (g.result === 'win') return s + 100 * g.opponentSkill;
    if (g.result === 'draw') return s + 30 * g.opponentSkill;
    return s - 50 * g.opponentSkill;
  }, 0) / nGames;

  return {
    outcomes: session.outcomes,
    wins, losses, draws,
    totalGames: nGames,
    winRate: wins / nGames,
    performanceScore: perfScore,
    gameDetails,
  };
}

export function scoreFIAR(result: FIARResult): {
  winRate: number;
  performanceScore: number;
  wins: number;
  losses: number;
  draws: number;
} {
  return {
    winRate: result.winRate,
    performanceScore: result.performanceScore,
    wins: result.wins,
    losses: result.losses,
    draws: result.draws,
  };
}
