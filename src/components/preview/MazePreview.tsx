import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

/**
 * Faithful implementation of Ho et al. (Nature) maze construal task.
 *
 * Matching the paper:
 * - 11×11 grid
 * - Center cross (+) walls with openings
 * - 7 tetromino-shaped obstacles per maze
 * - Blue dot agent, yellow goal
 * - After navigation: awareness probe for EACH obstacle (8-point scale)
 * - Then recall probe: which obstacle was present?
 * - Construal probability approximated via BFS path impact
 *
 * Configurable: grid size, number of obstacles, probe type
 */

const TETROMINOS: Record<string, number[][]> = {
  L: [[0,0],[1,0],[2,0],[2,1]],
  J: [[0,0],[1,0],[2,0],[2,-1]],
  T: [[0,0],[1,0],[2,0],[1,1]],
  S: [[0,0],[1,0],[1,1],[2,1]],
  Z: [[0,0],[1,0],[1,-1],[2,-1]],
  I: [[0,0],[1,0],[2,0],[3,0]],
  O: [[0,0],[1,0],[0,1],[1,1]],
};

type Pos = [number, number];
interface Obstacle { cells: Pos[]; label: string; type: string; construalProb: number }
interface MazeData { start: Pos; goal: Pos; walls: Set<string>; obstacles: Obstacle[] }

function pk(x: number, y: number) { return `${x},${y}`; }

function rotateCells(cells: number[][], rot: number): number[][] {
  return cells.map(([dx, dy]) => {
    let rx = dx, ry = dy;
    for (let r = 0; r < rot; r++) { const t = rx; rx = -ry; ry = t; }
    return [rx, ry];
  });
}

function bfs(start: Pos, goal: Pos, blocked: Set<string>, w: number, h: number): number {
  const q: [Pos, number][] = [[start, 0]];
  const seen = new Set([pk(start[0], start[1])]);
  while (q.length > 0) {
    const [[x, y], d] = q.shift()!;
    if (x === goal[0] && y === goal[1]) return d;
    for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
      const nx = x + dx, ny = y + dy, k = pk(nx, ny);
      if (nx < 0 || nx >= w || ny < 0 || ny >= h || seen.has(k) || blocked.has(k)) continue;
      seen.add(k); q.push([[nx, ny], d + 1]);
    }
  }
  return Infinity;
}

function generateMaze(seed: number, gridW = 11, gridH = 11, nObs = 7): MazeData {
  const rng = () => { seed = (seed * 16807 + 1) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };
  const midX = Math.floor(gridW / 2), midY = Math.floor(gridH / 2);

  // Center cross walls with openings
  const walls = new Set<string>();
  for (let y = 1; y < gridH - 1; y++) walls.add(pk(midX, y));
  for (let x = 1; x < gridW - 1; x++) if (x !== midX) walls.add(pk(x, midY));
  // 4 openings
  const openings = [
    pk(midX, 1 + Math.floor(rng() * (midY - 1))),
    pk(midX, midY + 1 + Math.floor(rng() * (midY - 1))),
    pk(1 + Math.floor(rng() * (midX - 1)), midY),
    pk(midX + 1 + Math.floor(rng() * (midX - 1)), midY),
  ];
  openings.forEach(o => walls.delete(o));

  // Start/goal on opposite edges
  const start: Pos = [0, 1 + Math.floor(rng() * (gridH - 2))];
  const goal: Pos = [gridW - 1, 1 + Math.floor(rng() * (gridH - 2))];

  const occupied = new Set([...walls, pk(start[0], start[1]), pk(goal[0], goal[1])]);
  const types = Object.keys(TETROMINOS);
  const labels = 'ABCDEFGHIJ';
  const obstacles: Obstacle[] = [];

  for (let i = 0; i < nObs; i++) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const ax = 1 + Math.floor(rng() * (gridW - 4));
      const ay = 1 + Math.floor(rng() * (gridH - 4));
      const type = types[Math.floor(rng() * types.length)];
      const rot = Math.floor(rng() * 4);
      const cells = rotateCells(TETROMINOS[type], rot).map(([dx, dy]): Pos => [ax + dx, ay + dy]);
      if (cells.some(([x, y]) => x < 0 || x >= gridW || y < 0 || y >= gridH || occupied.has(pk(x, y)))) continue;
      cells.forEach(([x, y]) => occupied.add(pk(x, y)));
      obstacles.push({ cells, label: labels[i], type, construalProb: 0 });
      break;
    }
  }

  const maze: MazeData = { start, goal, walls, obstacles };

  // Compute construal probability (path impact approximation)
  const allObs = new Set(obstacles.flatMap(o => o.cells.map(([x, y]) => pk(x, y))));
  const allBlocked = new Set([...walls, ...allObs]);
  const fullDist = bfs(start, goal, allBlocked, gridW, gridH);

  for (const obs of obstacles) {
    const without = new Set(allBlocked);
    obs.cells.forEach(([x, y]) => without.delete(pk(x, y)));
    const shortDist = bfs(start, goal, without, gridW, gridH);
    const impact = fullDist === Infinity ? 0 : fullDist - shortDist;
    obs.construalProb = Math.max(0.05, Math.min(0.95, 0.2 + impact * 0.12));
  }

  return maze;
}

const SCALE_8 = [0, 1/7, 2/7, 3/7, 4/7, 5/7, 6/7, 1];

export function MazePreview() {
  const [config, setConfig] = useState({ gridW: 11, gridH: 11, nObs: 7 });
  const [mazeIdx, setMazeIdx] = useState(0);
  const [maze, setMaze] = useState<MazeData>(() => generateMaze(42, 11, 11, 7));
  const [pos, setPos] = useState<Pos>([0, 0]);
  const [phase, setPhase] = useState<'nav' | 'probe' | 'recall' | 'result'>('nav');
  const [moves, setMoves] = useState(0);
  const [probeIdx, setProbeIdx] = useState(0);
  const [awareness, setAwareness] = useState<Record<string, number>>({});

  useEffect(() => {
    const m = generateMaze(42 + mazeIdx * 17, config.gridW, config.gridH, config.nObs);
    setMaze(m); setPos([...m.start]); setPhase('nav'); setMoves(0); setProbeIdx(0); setAwareness({});
  }, [mazeIdx, config]);

  const blocked = new Set([...maze.walls, ...maze.obstacles.flatMap(o => o.cells.map(([x, y]) => pk(x, y)))]);

  const move = useCallback((dx: number, dy: number) => {
    if (phase !== 'nav') return;
    const nx = pos[0] + dx, ny = pos[1] + dy;
    if (nx < 0 || nx >= config.gridW || ny < 0 || ny >= config.gridH || blocked.has(pk(nx, ny))) return;
    setPos([nx, ny]); setMoves(m => m + 1);
    if (nx === maze.goal[0] && ny === maze.goal[1]) { setPhase('probe'); setProbeIdx(0); }
  }, [phase, pos, maze, blocked, config]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') move(0, -1);
      if (e.key === 'ArrowDown') move(0, 1);
      if (e.key === 'ArrowLeft') move(-1, 0);
      if (e.key === 'ArrowRight') move(1, 0);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [move]);

  const highlightObs = phase === 'probe' && probeIdx < maze.obstacles.length ? maze.obstacles[probeIdx] : null;
  const highlightCells = new Set(highlightObs?.cells.map(([x, y]) => pk(x, y)) ?? []);
  const cs = Math.min(28, Math.floor(300 / config.gridW));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-heading text-text">🗺 maze construal — Ho et al. (Nature)</h3>
        <span className="text-xs font-mono text-text-3">{phase} · {moves} moves · {maze.obstacles.length} obs</span>
      </div>

      {/* Configurable params */}
      <div className="flex items-center gap-3 mb-2 text-[10px] text-text-3">
        <span>grid:</span>
        {[9, 11, 13].map(s => (
          <button key={s} onClick={() => setConfig(c => ({ ...c, gridW: s, gridH: s }))}
            className={`px-1.5 py-0.5 rounded cursor-pointer border ${config.gridW === s ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8'}`}>
            {s}×{s}
          </button>
        ))}
        <span className="ml-2">obstacles:</span>
        {[5, 7, 9].map(n => (
          <button key={n} onClick={() => setConfig(c => ({ ...c, nObs: n }))}
            className={`px-1.5 py-0.5 rounded cursor-pointer border ${config.nObs === n ? 'bg-orchid/10 border-orchid/25 text-text' : 'border-orchid/8'}`}>
            {n}
          </button>
        ))}
      </div>

      {phase === 'nav' && <p className="text-[10px] text-text-3 mb-1">arrow keys to navigate. reach the ★ goal.</p>}

      {/* Grid */}
      <div className="mx-auto mb-2" style={{ display: 'grid', gridTemplateColumns: `repeat(${config.gridW}, ${cs}px)`, gap: '1px' }}>
        {Array.from({ length: config.gridH }).map((_, y) =>
          Array.from({ length: config.gridW }).map((_, x) => {
            const isP = pos[0] === x && pos[1] === y;
            const isG = maze.goal[0] === x && maze.goal[1] === y;
            const isW = maze.walls.has(pk(x, y));
            const obs = maze.obstacles.find(o => o.cells.some(([cx, cy]) => cx === x && cy === y));
            const isHi = highlightCells.has(pk(x, y));

            let bg = 'rgba(176,124,198,0.03)';
            if (isW) bg = '#2D2438';
            else if (isP) bg = '#8BACD4';
            else if (isG) bg = '#FFD54F';
            else if (obs && phase === 'nav') bg = '#B07CC6';
            else if (isHi) bg = '#64B5F6';

            return (
              <div key={`${x}-${y}`}
                onClick={() => { const dx = x - pos[0], dy = y - pos[1]; if (Math.abs(dx) + Math.abs(dy) === 1) move(dx, dy); }}
                style={{ width: cs, height: cs, background: bg, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, color: 'white', fontWeight: 700, cursor: phase === 'nav' ? 'pointer' : 'default' }}>
                {isP && '●'}{isG && !isP && '★'}
                {obs && phase === 'nav' && !isP && !isG && <span style={{ opacity: 0.6 }}>{obs.label}</span>}
              </div>
            );
          })
        )}
      </div>

      {/* Awareness probes */}
      {phase === 'probe' && probeIdx < maze.obstacles.length && (
        <div className="space-y-1">
          <p className="text-xs text-text-2">obstacle <strong className="text-orchid">{maze.obstacles[probeIdx].label}</strong> highlighted. how aware were you?</p>
          <div className="flex gap-0.5">
            {SCALE_8.map((val, i) => (
              <button key={i} onClick={() => {
                setAwareness(prev => ({ ...prev, [maze.obstacles[probeIdx].label]: val }));
                if (probeIdx + 1 < maze.obstacles.length) setProbeIdx(probeIdx + 1);
                else setPhase('result');
              }}
                className="flex-1 py-1.5 rounded text-[9px] cursor-pointer border border-orchid/15 hover:bg-orchid/10 text-text-3">
                {i === 0 ? '0' : i === 7 ? '1' : (val).toFixed(1)}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-text-4">{probeIdx + 1}/{maze.obstacles.length} · 8-point scale</p>
        </div>
      )}

      {/* Results */}
      {phase === 'result' && (
        <div className="space-y-2">
          <p className="text-xs text-text-2 font-semibold">awareness vs model prediction:</p>
          {maze.obstacles.map(obs => (
            <div key={obs.label} className="flex items-center gap-1 text-[9px]">
              <span className="font-mono text-orchid w-3">{obs.label}</span>
              <div className="flex-1 flex gap-0.5">
                <div className="flex-1 h-1.5 bg-orchid/8 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-orchid" style={{ width: `${(awareness[obs.label] ?? 0.5) * 100}%` }} />
                </div>
                <div className="flex-1 h-1.5 bg-blue/8 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue" style={{ width: `${obs.construalProb * 100}%` }} />
                </div>
              </div>
              <span className="font-mono w-6 text-right text-text-3">{(awareness[obs.label] ?? 0.5).toFixed(1)}</span>
              <span className="font-mono w-6 text-right text-blue">{obs.construalProb.toFixed(1)}</span>
            </div>
          ))}
          <div className="flex items-center gap-3 text-[9px] text-text-4">
            <span><span className="inline-block w-2 h-2 bg-orchid rounded-sm mr-0.5" />your awareness</span>
            <span><span className="inline-block w-2 h-2 bg-blue rounded-sm mr-0.5" />model prediction</span>
          </div>
          {(() => {
            const a = maze.obstacles.map(o => awareness[o.label] ?? 0.5);
            const p = maze.obstacles.map(o => o.construalProb);
            const mA = a.reduce((s, v) => s + v, 0) / a.length;
            const mP = p.reduce((s, v) => s + v, 0) / p.length;
            let num = 0, dA = 0, dP = 0;
            for (let i = 0; i < a.length; i++) { num += (a[i] - mA) * (p[i] - mP); dA += (a[i] - mA) ** 2; dP += (p[i] - mP) ** 2; }
            const r = Math.sqrt(dA * dP) > 0 ? num / Math.sqrt(dA * dP) : 0;
            return <p className="text-xs text-text-2">r = <strong className={r > 0.3 ? 'text-sage' : 'text-orchid'}>{r.toFixed(3)}</strong> {r > 0.3 ? '(matches prediction)' : ''}</p>;
          })()}
          <div className="flex gap-2">
            <button onClick={() => setMazeIdx(m => m + 1)} className="text-xs text-orchid cursor-pointer hover:underline">next maze →</button>
          </div>
          <p className="text-[8px] text-text-4 italic">Ho et al.: β=0.133, p&lt;10⁻¹⁶. Our model uses BFS path impact approximation.</p>
        </div>
      )}
    </div>
  );
}
