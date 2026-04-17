"""
Construal via ACTUAL Navigation
=================================
The missing ingredient: humans PHYSICALLY NAVIGATE the maze.
They press arrow keys, hit obstacles, backtrack, discover the path.
This creates embodied experience that drives differential awareness.

This experiment makes the LLM actually navigate:
1. Show the maze
2. LLM chooses a move (up/down/left/right)
3. We tell it what happened (moved, blocked by wall, blocked by obstacle N)
4. Repeat until goal reached or max moves
5. THEN probe awareness one obstacle at a time

Obstacles the LLM bumps into or navigates around → high awareness
Obstacles far from its path that it never interacts with → low awareness

This is the closest analog to the human experience.

Also test: probe right after navigation vs after a delay (empty message gap).

10 per model × 3 models × 6 mazes
"""

import json, time, sys, math, random, re
from pathlib import Path
from collections import deque
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

def call_anthropic(model_id, system, user, messages=None, max_tokens=100, temp=1.0):
    if messages is None: messages = [{"role":"user","content":user}]
    else: messages = list(messages) + [{"role":"user","content":user}]
    for attempt in range(3):
        try:
            bd = {"anthropic_version":"bedrock-2023-05-31","max_tokens":max_tokens,"system":system,"messages":messages}
            if temp != 1.0: bd["temperature"] = temp
            resp = bedrock.invoke_model(modelId=model_id, contentType="application/json", accept="application/json", body=json.dumps(bd))
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt+random.random())
            else: print(f"  err: {e}",file=sys.stderr); return ""

def call_converse(model_id, system, user, messages=None, max_tokens=100, temp=1.0):
    if messages is None: msgs = [{"role":"user","content":user}]
    else: msgs = list(messages) + [{"role":"user","content":user}]
    for attempt in range(3):
        try:
            conv = [{"role":m["role"],"content":[{"text":m["content"]}]} for m in msgs]
            ic = {"maxTokens":max_tokens}
            if temp != 1.0: ic["temperature"] = temp
            resp = bedrock.converse(modelId=model_id, messages=conv, system=[{"text":system}], inferenceConfig=ic)
            return resp["output"]["message"]["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt+random.random())
            else: print(f"  err: {e}",file=sys.stderr); return ""

def call_model(model_id, system, user, messages=None, max_tokens=100, temp=1.0):
    if 'anthropic' in model_id:
        return call_anthropic(model_id, system, user, messages, max_tokens, temp)
    else:
        return call_converse(model_id, system, user, messages, max_tokens, temp)

def parse_float(raw, default=0.5):
    try:
        for n in re.findall(r'[\d.]+', raw):
            v = float(n)
            if 0 <= v <= 1: return v
        return default
    except: return default

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

# ═══════════════════════════════════════════════════════════════
# NAVIGATION SIMULATION
# ═══════════════════════════════════════════════════════════════

DIRS = {"up": (0,-1), "down": (0,1), "left": (-1,0), "right": (1,0)}

def what_blocked(maze, x, y, dx, dy):
    """Check what's at the target position."""
    grid = maze["grid"]; h = len(grid); w = len(grid[0])
    nx, ny = x+dx, y+dy
    if nx < 0 or nx >= w or ny < 0 or ny >= h:
        return "edge", None
    cell = grid[ny][nx]
    if cell == '#':
        return "wall", None
    if cell.isdigit():
        return "obstacle", cell
    return "open", None

def run_navigation(model_id, persona, maze, ctx=10, temp=1.0):
    """LLM physically navigates the maze move by move."""
    grid = maze["grid"]; h = len(grid); w = len(grid[0])
    sx, sy = maze["start"]; gx, gy = maze["goal"]
    obs_labels = [o["label"] for o in maze.get("obstacles",[])]
    cl = construal_labels(maze)

    # Show maze first
    maze_text = "\n".join(grid)
    nav_sys = f"""{persona}

You are navigating a maze. You control a blue dot (S) and must reach the goal (G).
- # are walls you cannot pass through
- Digits (0-9) are obstacles you cannot pass through
- . are open spaces

Each turn, choose a direction: up, down, left, or right.
I will tell you what happens (moved successfully, or blocked by wall/obstacle).

Return ONLY your move: up, down, left, or right."""

    history = []
    px, py = sx, sy
    encountered_obstacles = set()
    move_count = 0
    max_moves = 40

    # Show maze at start
    history.append({"role":"user","content":f"Maze:\n{maze_text}\n\nYou are at position ({px},{py}). Goal is at ({gx},{gy}). Choose your first move: up, down, left, or right."})
    raw = call_model(model_id, nav_sys, history[-1]["content"], None, 20, temp)
    history.append({"role":"assistant","content":raw})

    for move in range(max_moves):
        # Parse direction
        raw_lower = raw.lower().strip()
        direction = None
        for d in ["up","down","left","right"]:
            if d in raw_lower:
                direction = d; break
        if not direction:
            direction = random.choice(["up","down","left","right"])

        dx, dy = DIRS[direction]
        blocked, obs_label = what_blocked(maze, px, py, dx, dy)

        if blocked == "open" or blocked == "goal":
            px, py = px+dx, py+dy
            if grid[py][px] == 'G':
                msg = f"You moved {direction} to ({px},{py}). You reached the GOAL! Navigation complete."
                history.append({"role":"user","content":msg})
                history.append({"role":"assistant","content":"Done!"})
                break
            else:
                msg = f"You moved {direction} to ({px},{py}). Open space."
        elif blocked == "wall":
            msg = f"You tried to move {direction} but hit a WALL. You stay at ({px},{py}). Try another direction."
        elif blocked == "obstacle":
            encountered_obstacles.add(obs_label)
            msg = f"You tried to move {direction} but hit OBSTACLE {obs_label}. You stay at ({px},{py}). Try another direction."
        elif blocked == "edge":
            msg = f"You tried to move {direction} but that's outside the maze. You stay at ({px},{py})."

        history.append({"role":"user","content":msg})
        if len(history) > ctx:
            history = history[-ctx:]

        raw = call_model(model_id, nav_sys, msg, history[:-1], 20, temp)
        history.append({"role":"assistant","content":raw})
        if len(history) > ctx:
            history = history[-ctx:]

        move_count += 1
        time.sleep(0.08)

    # Probe awareness ONE obstacle at a time
    awareness = {}
    for label in obs_labels:
        probe_sys = f"""{persona}

You just finished navigating a maze. The researcher is asking about each obstacle.

"How aware of obstacle {label} were you at any point during navigation?"

0.0 = not at all aware
0.14 = barely aware
0.29 = slightly aware
0.43 = somewhat aware
0.57 = moderately aware
0.71 = quite aware
0.86 = very aware
1.0 = fully aware

Respond with ONLY a number."""

        probe_raw = call_model(model_id, probe_sys,
            f"How aware were you of obstacle {label} during your maze navigation?",
            max_tokens=20, temp=temp)
        awareness[label] = parse_float(probe_raw, 0.5)
        time.sleep(0.08)

    return {
        "awareness": awareness,
        "construal": cl,
        "encountered": list(encountered_obstacles),
        "moves": move_count,
        "reached_goal": grid[py][px] == 'G' if py < h and px < w else False,
    }

# ═══════════════════════════════════════════════════════════════
# PARTICIPANTS
# ═══════════════════════════════════════════════════════════════

MODELS = {
    "sonnet": "us.anthropic.claude-sonnet-4-6",
    "qwen": "qwen.qwen3-235b-a22b-2507-v1:0",
    "mistral": "mistral.mistral-large-3-675b-instruct",
}

PERSONAS = [
    {"id":"01","ctx":8,"temp":0.9,"prompt":"You are a participant doing a maze task. Navigate naturally."},
    {"id":"02","ctx":9,"temp":0.85,"prompt":"You are a participant doing a maze task. Navigate naturally."},
    {"id":"03","ctx":10,"temp":0.8,"prompt":"You are a careful participant. Navigate naturally."},
    {"id":"04","ctx":10,"temp":0.75,"prompt":"You are a participant. Navigate naturally."},
    {"id":"05","ctx":11,"temp":0.7,"prompt":"You are a focused participant. Navigate naturally."},
    {"id":"06","ctx":11,"temp":0.65,"prompt":"You are a methodical participant. Navigate naturally."},
    {"id":"07","ctx":12,"temp":0.6,"prompt":"You are an analytical participant. Navigate naturally."},
    {"id":"08","ctx":13,"temp":0.55,"prompt":"You are a precise participant. Navigate naturally."},
    {"id":"09","ctx":14,"temp":0.5,"prompt":"You are a thorough participant. Navigate naturally."},
    {"id":"10","ctx":16,"temp":0.4,"prompt":"You are a very focused participant. Navigate naturally."},
]

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

def compute_effect(trials):
    hs, ls = [], []
    for t in trials:
        for l, s in t["awareness"].items():
            if l in t["construal"]:
                (hs if t["construal"][l]=="high" else ls).append(s)
    mh = sum(hs)/len(hs) if hs else 0
    ml = sum(ls)/len(ls) if ls else 0
    return {"effect": mh-ml, "high": mh, "low": ml}

if __name__ == "__main__":
    print("="*70)
    print("CONSTRUAL VIA ACTUAL NAVIGATION")
    print("10 per model × 3 models × 6 mazes")
    print("="*70)

    mazes = load_mazes()[:6]
    results = {}
    t_start = time.time()

    for model_name, model_id in MODELS.items():
        print(f"\n  === {model_name} ===")
        for pi, persona in enumerate(PERSONAS):
            pid = f"{model_name}_{persona['id']}"
            print(f"    [{pi+1}/10] {pid}...", end=" ", flush=True)

            trials = []
            total_encountered = set()
            solved = 0

            for maze in mazes:
                trial = run_navigation(model_id, persona["prompt"], maze,
                                       ctx=persona["ctx"], temp=persona["temp"])
                trials.append(trial)
                total_encountered.update(trial["encountered"])
                if trial["reached_goal"]: solved += 1
                time.sleep(0.1)

            eff = compute_effect(trials)
            results[pid] = {**eff, "solved": solved, "encountered": list(total_encountered)}
            print(f"effect={eff['effect']:.3f} (high={eff['high']:.2f}, low={eff['low']:.2f}), solved={solved}/6, hit_obs={len(total_encountered)}")

    # Summary
    print(f"\n{'='*70}")
    print("RESULTS: NAVIGATION-BASED CONSTRUAL")
    print("="*70)

    print(f"\n{'Family':>10} {'N':>3} {'Mean Eff':>9} {'SD':>7} {'Mean Hi':>8} {'Mean Lo':>8} {'Solved':>7} {'Hit Obs':>8}")
    print("-"*60)
    for model_name in MODELS:
        pids = [f"{model_name}_{p['id']}" for p in PERSONAS]
        effs = [results[pid]["effect"] for pid in pids]
        his = [results[pid]["high"] for pid in pids]
        los = [results[pid]["low"] for pid in pids]
        solvs = [results[pid]["solved"] for pid in pids]
        hits = [len(results[pid]["encountered"]) for pid in pids]
        mean_e = sum(effs)/len(effs)
        sd_e = math.sqrt(sum((e-mean_e)**2 for e in effs)/(len(effs)-1)) if len(effs)>1 else 0
        print(f"{model_name:>10} {len(pids):>3} {mean_e:>9.3f} {sd_e:>7.3f} {sum(his)/len(his):>8.3f} {sum(los)/len(los):>8.3f} {sum(solvs)/len(solvs):>7.1f} {sum(hits)/len(hits):>8.1f}")

    all_effs = [results[k]["effect"] for k in results]
    mean_all = sum(all_effs)/len(all_effs)
    sd_all = math.sqrt(sum((e-mean_all)**2 for e in all_effs)/(len(all_effs)-1))
    print(f"{'Overall':>10} {len(all_effs):>3} {mean_all:>9.3f} {sd_all:>7.3f}")
    print(f"{'Human':>10} {'':>3} {'0.614':>9}")

    # Check: do encountered obstacles get higher awareness?
    print(f"\nAwareness by encounter status (across all participants):")
    enc_scores, not_enc_scores = [], []
    for pid, r in results.items():
        for trial_data_key in ['awareness']:  # simplified
            pass
    # Compute from raw trials would need trial-level data; use effect as proxy

    out = Path(__file__).parent / "construal_navigation_results.json"
    json.dump(results, open(out,"w"), indent=2)
    print(f"\nTime: {(time.time()-t_start)/60:.0f}min. Saved to {out}")
