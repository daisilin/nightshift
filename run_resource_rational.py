"""
Resource-Rational Construal: Creative Approaches
==================================================
Test multiple ways to limit LLM cognitive resources to produce
human-like selective attention on maze construal.

The key insight from Ho et al.: humans' attention is GUIDED BY PLANNING.
They look at start → trace toward goal → encode obstacles near that trace.
Far obstacles are never fixated. We need to simulate this.

Approaches:
A. Sequential scanning: reveal maze row by row, old rows fall out of context
B. Flashlight: only show 5×5 window centered on agent position
C. Gaze-guided reveal: first show start+goal, then reveal obstacles
   one at a time starting from those near the likely path
D. Two-phase memory: show full maze, then clear and ask from memory
E. Competing task: require the model to count something while planning
"""

import json, time, sys, math, random
from pathlib import Path
from collections import deque
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

def call_claude(system, user, messages=None, max_tokens=300, temp=1.0):
    if messages is None: messages = [{"role": "user", "content": user}]
    else: messages = list(messages) + [{"role": "user", "content": user}]
    for attempt in range(3):
        try:
            bd = {"anthropic_version":"bedrock-2023-05-31","max_tokens":max_tokens,"system":system,"messages":messages}
            if temp != 1.0: bd["temperature"] = temp
            resp = bedrock.invoke_model(modelId="us.anthropic.claude-sonnet-4-6", contentType="application/json",
                                       accept="application/json", body=json.dumps(bd))
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt+random.random())
            else: print(f"  API err: {e}",file=sys.stderr); return ""

def parse_json(raw, fallback=None):
    cleaned=raw.replace("```json","").replace("```","").strip()
    f,l=cleaned.find("{"),cleaned.rfind("}")
    if f>=0 and l>f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    return fallback

def load_mazes():
    with open(Path(__file__).parent/"src"/"data"/"paperMazes.json") as f: return json.load(f)

def bfs_path(maze):
    grid=maze["grid"]; h,w=len(grid),len(grid[0]); sx,sy=maze["start"]; gx,gy=maze["goal"]
    q=deque([(sx,sy,[(sx,sy)])]); vis={(sx,sy)}
    while q:
        x,y,path=q.popleft()
        if x==gx and y==gy: return path
        for dx,dy in [(0,1),(0,-1),(1,0),(-1,0)]:
            nx,ny=x+dx,y+dy
            if 0<=nx<w and 0<=ny<h and (nx,ny) not in vis and grid[ny][nx] in '.SG':
                vis.add((nx,ny)); q.append((nx,ny,path+[(nx,ny)]))
    return []

def construal_labels(maze):
    ps=set(bfs_path(maze)); res=[]
    for obs in maze.get("obstacles",[]):
        cells=[tuple(c) for c in obs["cells"]]
        md=min(abs(oc[0]-pc[0])+abs(oc[1]-pc[1]) for oc in cells for pc in ps) if ps else 99
        res.append({"label":obs["label"],"dist":md})
    if not res: return {}
    med=sorted(r["dist"] for r in res)[len(res)//2]
    return {r["label"]:"high" if r["dist"]<=med else "low" for r in res}

PERSONA = "You are a participant in a research study. Do the task naturally."

def run_awareness_probe(obs_labels, cot_snippet, temp=1.0):
    """Standard awareness probe used by all conditions."""
    probe_sys = f"{PERSONA}\n\nRate awareness of each obstacle during planning: 0.0=didn't notice, 1.0=fully noticed.\nReturn ONLY JSON: {{ {', '.join(f'\"{l}\": <number>' for l in obs_labels)} }}"
    probe = call_claude(probe_sys, f'Obstacles: {", ".join(obs_labels)}. Your notes: "{cot_snippet[:250]}". Rate.', max_tokens=200, temp=temp)
    scores = parse_json(probe, {})
    return {l: max(0.0, min(1.0, float(scores.get(l, 0.5)))) if isinstance(scores.get(l), (int,float)) else 0.5 for l in obs_labels}

def compute_effect(trials):
    hs, ls = [], []
    for t in trials:
        for l, s in t["awareness"].items():
            if l in t["construal"]: (hs if t["construal"][l] == "high" else ls).append(s)
    mh = sum(hs)/len(hs) if hs else 0; ml = sum(ls)/len(ls) if ls else 0
    return {"effect": mh-ml, "high": mh, "low": ml, "n_high": len(hs), "n_low": len(ls)}


# ═══════════════════════════════════════════════════════════════
# CONDITION A: SEQUENTIAL SCANNING (row by row, limited context)
# ═══════════════════════════════════════════════════════════════

def run_sequential_scan(maze, ctx=6):
    """Reveal maze row by row in separate messages. Old rows fall out of context."""
    obs_labels = [o["label"] for o in maze.get("obstacles", [])]
    cl = construal_labels(maze)
    grid = maze["grid"]; h = len(grid)

    system = f"{PERSONA}\n\nYou're seeing a maze revealed one row at a time (top to bottom). S=start, G=goal, #=wall, digits=obstacles. Build a mental map as rows are revealed."
    history = []

    # Reveal rows one at a time
    for r in range(h):
        msg = f"Row {r}: {grid[r]}"
        if r == 0: msg = f"Top of maze. Row {r}: {grid[r]}"
        if r == h-1: msg += "\n\nAll rows revealed. Now plan your route from S to G. Which obstacles are in your way?"
        history.append({"role": "user", "content": msg})
        if r < h-1:
            history.append({"role": "assistant", "content": "Noted."})
        else:
            cot = call_claude(system, msg, history[:-1], max_tokens=200)
            history.append({"role": "assistant", "content": cot})
        # Enforce context limit — old rows fall out
        if len(history) > ctx: history = history[-ctx:]
        time.sleep(0.1)

    awareness = run_awareness_probe(obs_labels, cot if 'cot' in dir() else "")
    return {"awareness": awareness, "construal": cl}


# ═══════════════════════════════════════════════════════════════
# CONDITION B: FLASHLIGHT (5×5 window around agent)
# ═══════════════════════════════════════════════════════════════

def run_flashlight(maze, window=5):
    """Only show a 5×5 window centered on the agent's start, then goal area."""
    obs_labels = [o["label"] for o in maze.get("obstacles", [])]
    cl = construal_labels(maze)
    grid = maze["grid"]; h, w = len(grid), len(grid[0])
    sx, sy = maze["start"]; gx, gy = maze["goal"]
    half = window // 2

    def extract_window(cx, cy):
        lines = []
        for r in range(max(0,cy-half), min(h,cy+half+1)):
            row = ""
            for c in range(max(0,cx-half), min(w,cx+half+1)):
                row += grid[r][c]
            lines.append(row)
        return "\n".join(lines)

    start_view = extract_window(sx, sy)
    goal_view = extract_window(gx, gy)

    # Also show the middle area
    mid_x, mid_y = (sx+gx)//2, (sy+gy)//2
    mid_view = extract_window(mid_x, mid_y)

    system = f"{PERSONA}\n\nYou're navigating a maze but can only see a small area at a time (like a flashlight). Plan your route from what you can see."

    cot = call_claude(system,
        f"View from START area:\n{start_view}\n\nView from MIDDLE area:\n{mid_view}\n\nView near GOAL:\n{goal_view}\n\nPlan your route. Which obstacles did you see?",
        max_tokens=200)

    awareness = run_awareness_probe(obs_labels, cot)
    return {"awareness": awareness, "construal": cl}


# ═══════════════════════════════════════════════════════════════
# CONDITION C: GAZE-GUIDED REVEAL
# ═══════════════════════════════════════════════════════════════

def run_gaze_guided(maze):
    """Reveal obstacles one at a time, starting with those near the optimal path."""
    obs_labels = [o["label"] for o in maze.get("obstacles", [])]
    cl = construal_labels(maze)
    grid = maze["grid"]
    path = bfs_path(maze)
    path_set = set(path)

    # Sort obstacles by distance to path (near first)
    obs_with_dist = []
    for obs in maze.get("obstacles", []):
        cells = [tuple(c) for c in obs["cells"]]
        min_d = min(abs(oc[0]-pc[0])+abs(oc[1]-pc[1]) for oc in cells for pc in path_set) if path_set else 99
        obs_with_dist.append((obs["label"], min_d))
    obs_sorted = sorted(obs_with_dist, key=lambda x: x[1])

    system = f"{PERSONA}\n\nYou're learning about a maze. The start is at bottom-left, goal at top-right. Walls form a cross in the center. Obstacles will be described one at a time."
    history = []

    # Reveal first 4 obstacles (near path) fully, last 3 briefly
    for i, (label, dist) in enumerate(obs_sorted):
        obs_data = [o for o in maze.get("obstacles",[]) if o["label"]==label][0]
        cells = obs_data["cells"]
        avg_r = sum(c[1] for c in cells)/len(cells)
        avg_c = sum(c[0] for c in cells)/len(cells)
        region = "top" if avg_r < len(grid)/3 else "middle" if avg_r < 2*len(grid)/3 else "bottom"
        side = "left" if avg_c < len(grid[0])/3 else "center" if avg_c < 2*len(grid[0])/3 else "right"

        if i < 4:
            msg = f"Obstacle {label}: tetromino shape at {region}-{side}, occupying cells {cells}. It{'s near your likely path' if dist <= 2 else ' is off to the side'}."
        else:
            msg = f"Obstacle {label}: somewhere in the {region}-{side} area."

        history.append({"role": "user", "content": msg})
        history.append({"role": "assistant", "content": "Noted."})
        if len(history) > 10: history = history[-10:]

    cot = call_claude(system, "Now plan your route from start to goal. Which obstacles matter?", history, max_tokens=200)
    awareness = run_awareness_probe(obs_labels, cot)
    return {"awareness": awareness, "construal": cl}


# ═══════════════════════════════════════════════════════════════
# CONDITION D: MEMORY WIPE
# ═══════════════════════════════════════════════════════════════

def run_memory_wipe(maze):
    """Show full maze, let model study it, then CLEAR context and ask from memory."""
    obs_labels = [o["label"] for o in maze.get("obstacles", [])]
    cl = construal_labels(maze)
    maze_text = "\n".join(maze["grid"])

    # Phase 1: study the maze (separate API call — this context will be lost)
    study = call_claude(
        f"{PERSONA}\n\nStudy this maze carefully. You'll be asked about it later WITHOUT seeing it again.",
        f"Maze:\n{maze_text}\n\nStudy the obstacles and their positions relative to the path from S to G. List the key obstacles.",
        max_tokens=300)

    time.sleep(0.3)

    # Phase 2: ask from memory (NEW call — no maze in context, only the model's memory from study phase)
    # But we include the model's own study notes
    cot = call_claude(
        f"{PERSONA}\n\nYou studied a maze earlier. Here are your notes from studying it:",
        f'Your study notes: "{study[:300]}"\n\nFrom memory: which obstacles were near your planned route? Which were far away and irrelevant?',
        max_tokens=200)

    awareness = run_awareness_probe(obs_labels, cot)
    return {"awareness": awareness, "construal": cl}


# ═══════════════════════════════════════════════════════════════
# CONDITION E: COMPETING TASK
# ═══════════════════════════════════════════════════════════════

def run_competing_task(maze):
    """Model must count wall segments while planning route — splits attention."""
    obs_labels = [o["label"] for o in maze.get("obstacles", [])]
    cl = construal_labels(maze)
    maze_text = "\n".join(maze["grid"])

    system = f"""{PERSONA}

You have TWO tasks to do simultaneously:
1. Plan the shortest route from S to G
2. Count the EXACT number of '#' wall characters in the maze

You must report BOTH the route AND the wall count. This is timed — be quick."""

    cot = call_claude(system,
        f"Maze:\n{maze_text}\n\nQuickly: plan route AND count walls. Report both.",
        max_tokens=150)

    awareness = run_awareness_probe(obs_labels, cot)
    return {"awareness": awareness, "construal": cl}


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("="*70)
    print("RESOURCE-RATIONAL CONSTRUAL: CREATIVE APPROACHES")
    print("="*70)

    mazes = load_mazes()[:6]
    conditions = {
        "A_sequential_scan": run_sequential_scan,
        "B_flashlight": run_flashlight,
        "C_gaze_guided": run_gaze_guided,
        "D_memory_wipe": run_memory_wipe,
        "E_competing_task": run_competing_task,
    }

    # Also run baseline (full maze, unlimited)
    def run_baseline(maze):
        obs_labels = [o["label"] for o in maze.get("obstacles",[])]
        cl = construal_labels(maze)
        cot = call_claude(f"{PERSONA}\n\nMaze: S=start, G=goal, #=wall, digits=obstacles. Plan route.",
                         f"Maze:\n{chr(10).join(maze['grid'])}\n\nPlan route.", max_tokens=500)
        awareness = run_awareness_probe(obs_labels, cot)
        return {"awareness": awareness, "construal": cl}

    all_results = {}

    # Baseline
    print(f"\n  Baseline (full maze, unlimited)...", end=" ", flush=True)
    trials = [run_baseline(m) for m in mazes]
    r = compute_effect(trials)
    all_results["baseline"] = r
    print(f"effect={r['effect']:.3f} (high={r['high']:.3f}, low={r['low']:.3f})")

    # Each creative condition
    for cond_name, cond_fn in conditions.items():
        print(f"\n  {cond_name}...", end=" ", flush=True)
        trials = []
        for maze in mazes:
            try:
                trial = cond_fn(maze)
                trials.append(trial)
            except Exception as e:
                print(f"\n    Error on maze: {e}", file=sys.stderr)
            time.sleep(0.3)
        if trials:
            r = compute_effect(trials)
            all_results[cond_name] = r
            print(f"effect={r['effect']:.3f} (high={r['high']:.3f}, low={r['low']:.3f})")
        else:
            print("FAILED")

    # Summary
    print(f"\n{'='*70}")
    print(f"SUMMARY: Construal Effect by Resource-Limitation Approach")
    print(f"{'='*70}")
    print(f"{'Condition':<25} {'Effect':>8} {'High':>8} {'Low':>8}")
    print("-"*50)
    for cond, r in all_results.items():
        print(f"{cond:<25} {r['effect']:>8.3f} {r['high']:>8.3f} {r['low']:>8.3f}")
    print(f"{'Human':.<25} {'0.614':>8} {'0.787':>8} {'0.173':>8}")

    out = Path(__file__).parent / "resource_rational_results.json"
    json.dump(all_results, open(out, "w"), indent=2)
    print(f"\nSaved to {out}")
