import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';

// Ho et al. (Nature) maze paradigm
// Navigate blue dot to goal, then memory probe for obstacles

const W = 7, H = 7;
type Pos = [number, number];

interface Obstacle { pos: Pos; label: string; relevant: boolean }

function generateMaze(seed: number): { start: Pos; goal: Pos; walls: Pos[]; obstacles: Obstacle[] } {
  const rng = () => { seed = (seed * 16807 + 1) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };

  const start: Pos = [0, 1 + Math.floor(rng() * (H - 2))];
  const goal: Pos = [W - 1, 1 + Math.floor(rng() * (H - 2))];

  // Center walls (+)
  const walls: Pos[] = [];
  const midX = 3, midY = 3;
  for (let y = 1; y < H - 1; y++) walls.push([midX, y]);
  for (let x = 1; x < W - 1; x++) if (x !== midX) walls.push([x, midY]);

  // Remove some wall cells to create openings
  const openings = [Math.floor(rng() * (H - 2)) + 1, Math.floor(rng() * (W - 2)) + 1];
  const filtered = walls.filter(([wx, wy]) => !(wx === midX && wy === openings[0]) && !(wx === openings[1] && wy === midY));

  // Obstacles
  const labels = 'ABCDEF';
  const obstacles: Obstacle[] = [];
  const occupied = new Set([`${start[0]},${start[1]}`, `${goal[0]},${goal[1]}`, ...filtered.map(([x, y]) => `${x},${y}`)]);

  for (let i = 0; i < 4; i++) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const x = Math.floor(rng() * W);
      const y = Math.floor(rng() * H);
      const key = `${x},${y}`;
      if (!occupied.has(key)) {
        const nearStart = Math.abs(x - start[0]) + Math.abs(y - start[1]) < 3;
        const nearGoal = Math.abs(x - goal[0]) + Math.abs(y - goal[1]) < 3;
        obstacles.push({ pos: [x, y], label: labels[i], relevant: nearStart || nearGoal });
        occupied.add(key);
        break;
      }
    }
  }

  return { start, goal, walls: filtered, obstacles };
}

export function MazePreview() {
  const [mazeIdx, setMazeIdx] = useState(0);
  const [playerPos, setPlayerPos] = useState<Pos>([0, 0]);
  const [phase, setPhase] = useState<'navigate' | 'probe' | 'result'>('navigate');
  const [probeAnswers, setProbeAnswers] = useState<Record<string, number>>({});
  const [moves, setMoves] = useState(0);

  const maze = generateMaze(42 + mazeIdx * 13);

  const reset = useCallback(() => {
    setPlayerPos([...maze.start]);
    setPhase('navigate');
    setProbeAnswers({});
    setMoves(0);
  }, [maze]);

  // Initialize player position
  if (playerPos[0] === 0 && playerPos[1] === 0 && (maze.start[0] !== 0 || maze.start[1] !== 0)) {
    setPlayerPos([...maze.start]);
  }

  const isWall = (x: number, y: number) => maze.walls.some(([wx, wy]) => wx === x && wy === y);
  const isObstacle = (x: number, y: number) => maze.obstacles.some(o => o.pos[0] === x && o.pos[1] === y);

  const move = (dx: number, dy: number) => {
    if (phase !== 'navigate') return;
    const nx = playerPos[0] + dx;
    const ny = playerPos[1] + dy;
    if (nx < 0 || nx >= W || ny < 0 || ny >= H) return;
    if (isWall(nx, ny) || isObstacle(nx, ny)) return;
    setPlayerPos([nx, ny]);
    setMoves(m => m + 1);
    if (nx === maze.goal[0] && ny === maze.goal[1]) {
      setPhase('probe');
    }
  };

  const cellColor = (x: number, y: number) => {
    if (playerPos[0] === x && playerPos[1] === y) return '#8BACD4';
    if (maze.goal[0] === x && maze.goal[1] === y) return '#FFD54F';
    if (isWall(x, y)) return '#2D2438';
    const obs = maze.obstacles.find(o => o.pos[0] === x && o.pos[1] === y);
    if (obs) return phase === 'navigate' ? '#B07CC6' : 'rgba(176,124,198,0.15)';
    return 'rgba(176,124,198,0.04)';
  };

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-heading text-text">🗺 maze construal task</h3>
        <span className="text-xs font-mono text-text-3">
          {phase === 'navigate' ? `${moves} moves` : phase === 'probe' ? 'memory probe' : 'results'} · maze {mazeIdx + 1}
        </span>
      </div>

      {phase === 'navigate' && (
        <p className="text-xs text-text-3 mb-2">navigate the blue dot to the yellow goal. use arrow keys or click adjacent cells. avoid walls (dark) and obstacles (purple).</p>
      )}

      {/* Grid */}
      <div className="grid gap-0.5 mx-auto mb-3" style={{ gridTemplateColumns: `repeat(${W}, 1fr)`, maxWidth: '280px' }}
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'ArrowUp') move(0, -1);
          if (e.key === 'ArrowDown') move(0, 1);
          if (e.key === 'ArrowLeft') move(-1, 0);
          if (e.key === 'ArrowRight') move(1, 0);
        }}>
        {Array.from({ length: H }).map((_, y) =>
          Array.from({ length: W }).map((_, x) => {
            const obs = maze.obstacles.find(o => o.pos[0] === x && o.pos[1] === y);
            return (
              <motion.div key={`${x}-${y}`}
                onClick={() => {
                  const dx = x - playerPos[0], dy = y - playerPos[1];
                  if (Math.abs(dx) + Math.abs(dy) === 1) move(dx, dy);
                }}
                className="aspect-square rounded-sm flex items-center justify-center text-[9px] font-bold cursor-pointer select-none"
                style={{ background: cellColor(x, y), color: 'white' }}>
                {obs && phase === 'navigate' ? obs.label : ''}
                {maze.goal[0] === x && maze.goal[1] === y ? 'G' : ''}
                {playerPos[0] === x && playerPos[1] === y ? '●' : ''}
              </motion.div>
            );
          })
        )}
      </div>

      {/* Memory probe */}
      {phase === 'probe' && (
        <div className="space-y-2">
          <p className="text-xs text-text-2 font-semibold">you reached the goal! now, how aware were you of each obstacle?</p>
          {maze.obstacles.map(obs => (
            <div key={obs.label} className="flex items-center gap-2">
              <span className="text-xs font-mono text-orchid w-6">{obs.label}</span>
              <input type="range" min="0" max="1" step="0.1"
                value={probeAnswers[obs.label] ?? 0.5}
                onChange={e => setProbeAnswers(prev => ({ ...prev, [obs.label]: parseFloat(e.target.value) }))}
                className="flex-1 accent-orchid h-1" />
              <span className="text-[10px] font-mono text-text-3 w-8">{(probeAnswers[obs.label] ?? 0.5).toFixed(1)}</span>
            </div>
          ))}
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={() => setPhase('result')}
            className="w-full py-2 rounded-xl text-xs font-semibold text-white cursor-pointer mt-2"
            style={{ background: 'linear-gradient(135deg, #B07CC6, #D48BB5)' }}>
            submit
          </motion.button>
        </div>
      )}

      {/* Results */}
      {phase === 'result' && (
        <div className="space-y-2">
          <p className="text-xs text-text-2 font-semibold">your construal pattern:</p>
          <div className="space-y-1">
            {maze.obstacles.map(obs => (
              <div key={obs.label} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-orchid w-6">{obs.label}</span>
                <div className="flex-1 h-2 bg-orchid/8 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${(probeAnswers[obs.label] ?? 0.5) * 100}%`,
                    background: obs.relevant ? '#8FB89A' : '#E8A87C',
                  }} />
                </div>
                <span className="text-[10px] text-text-3">{obs.relevant ? 'relevant' : 'irrelevant'}</span>
              </div>
            ))}
          </div>
          {(() => {
            const relMem = maze.obstacles.filter(o => o.relevant).map(o => probeAnswers[o.label] ?? 0.5);
            const irrelMem = maze.obstacles.filter(o => !o.relevant).map(o => probeAnswers[o.label] ?? 0.5);
            const relAvg = relMem.length > 0 ? relMem.reduce((a, b) => a + b, 0) / relMem.length : 0;
            const irrelAvg = irrelMem.length > 0 ? irrelMem.reduce((a, b) => a + b, 0) / irrelMem.length : 0;
            const effect = relAvg - irrelAvg;
            return (
              <p className="text-xs text-text-2 mt-2">
                construal effect: <span className={effect > 0 ? 'text-sage font-semibold' : 'text-text-3'}>{effect > 0 ? '+' : ''}{effect.toFixed(2)}</span>
                {effect > 0 ? ' — you noticed relevant obstacles more (matches Ho et al.)' : ''}
              </p>
            );
          })()}
          <div className="flex gap-2 mt-2">
            <button onClick={() => { setMazeIdx(m => m + 1); reset(); }} className="text-xs text-orchid cursor-pointer hover:underline">next maze →</button>
            <button onClick={reset} className="text-xs text-text-3 cursor-pointer hover:text-text">replay</button>
          </div>
        </div>
      )}

      <p className="text-[9px] text-text-4 mt-2 italic">
        based on Ho et al. (Nature) — "People construct simplified mental representations to plan"
      </p>
    </div>
  );
}
