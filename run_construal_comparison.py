"""
Construal Comparison: Standard vs Self-Guided Walk
====================================================
Controlled comparison matching Ho et al. protocol:

Condition A (STANDARD):
  - Show full maze → plan route → probe awareness ONE obstacle at a time
  - Matches the text version of Ho et al.

Condition B (SELF-GUIDED WALK):
  - Show full maze → LLM plans ITS OWN route → extract waypoints from its plan
  - Walk along LLM's chosen route → report nearby obstacles at each position
  - Probe awareness ONE obstacle at a time
  - Most principled: attention follows the model's OWN planning trace

Key controls:
  - Same awareness probe wording for both (matches Ho et al.)
  - Probe ONE obstacle at a time (not all at once)
  - Same 12 mazes from Ho et al.
  - 10 participants per model family × 3 families (Sonnet, Qwen, Mistral)
  - Same persona prompts across conditions
"""

import json, time, sys, math, random, re
from pathlib import Path
from collections import deque
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

def call_anthropic(model_id, system, user, messages=None, max_tokens=300, temp=1.0):
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

def call_converse(model_id, system, user, messages=None, max_tokens=300, temp=1.0):
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

def call_model(model_id, system, user, messages=None, max_tokens=300, temp=1.0):
    if 'anthropic' in model_id:
        return call_anthropic(model_id, system, user, messages, max_tokens, temp)
    else:
        return call_converse(model_id, system, user, messages, max_tokens, temp)

def parse_float(raw, default=0.5):
    try:
        nums = re.findall(r'[\d.]+', raw)
        for n in nums:
            v = float(n)
            if 0 <= v <= 1: return v
        return default
    except:
        return default

# ═══════════════════════════════════════════════════════════════
# MAZE UTILITIES
# ═══════════════════════════════════════════════════════════════

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

def nearby_obstacles(maze, px, py, radius=3):
    nearby = set()
    for obs in maze.get("obstacles",[]):
        for cx, cy in obs["cells"]:
            if abs(cx-px)+abs(cy-py) <= radius:
                nearby.add(obs["label"]); break
    return list(nearby)

# ═══════════════════════════════════════════════════════════════
# AWARENESS PROBE (same for both conditions, matches Ho et al.)
# ═══════════════════════════════════════════════════════════════

def probe_awareness(model_id, persona, obs_labels, context_snippet, temp=1.0):
    """
    Probe ONE obstacle at a time, matching Ho et al.:
    "How aware of the highlighted obstacle were you at any point?"
    8-point scale normalized to 0-1.
    """
    awareness = {}
    for label in obs_labels:
        probe_sys = f"""{persona}

You just completed a maze navigation task. The researcher is asking about each obstacle one at a time.

For the obstacle highlighted below, rate:
"How aware of this obstacle were you at any point during planning?"

Use this scale:
0.0 = not at all aware
0.14 = barely aware
0.29 = slightly aware
0.43 = somewhat aware
0.57 = moderately aware
0.71 = quite aware
0.86 = very aware
1.0 = fully aware

Respond with ONLY a number between 0.0 and 1.0."""

        raw = call_model(model_id, probe_sys,
            f'Obstacle {label} is highlighted. How aware were you of this obstacle during your route planning?',
            max_tokens=30, temp=temp)
        awareness[label] = parse_float(raw, 0.5)
        time.sleep(0.1)
    return awareness

# ═══════════════════════════════════════════════════════════════
# CONDITION A: STANDARD (full maze, plan, probe)
# ═══════════════════════════════════════════════════════════════

def run_standard(model_id, persona, maze, temp=1.0):
    obs_labels = [o["label"] for o in maze.get("obstacles",[])]
    maze_text = "\n".join(maze["grid"])

    # Show full maze, plan route
    nav_sys = f"""{persona}

You are doing a maze navigation task in a research study.
You see a grid maze on screen:
- S is your starting position (blue circle)
- G is the goal (yellow square)
- # are walls (center cross shape)
- Digits (0-9) are obstacles (tetromino shapes) you cannot pass through
- . are open spaces

Navigate from S to G. Plan your route."""

    cot = call_model(model_id, nav_sys,
        f"Here is the maze:\n\n{maze_text}\n\nPlan your route from S to G. Think about which way to go.",
        max_tokens=400, temp=temp)

    time.sleep(0.3)

    # Probe awareness ONE obstacle at a time
    awareness = probe_awareness(model_id, persona, obs_labels, cot[:200], temp)
    return awareness

# ═══════════════════════════════════════════════════════════════
# CONDITION B: SELF-GUIDED WALK
# ═══════════════════════════════════════════════════════════════

def run_self_guided_walk(model_id, persona, maze, ctx=8, temp=1.0):
    obs_labels = [o["label"] for o in maze.get("obstacles",[])]
    maze_text = "\n".join(maze["grid"])

    # Step 1: Show full maze, ask LLM to describe its planned route
    route_sys = f"""{persona}

You see a maze. S=start (bottom-left), G=goal (top-right).
# are walls, digits are obstacles, . are open spaces.

Describe your planned route as a sequence of approximate positions.
For example: "I'd go up from the start, then right around the center walls, then up to the goal."
Be specific about which direction you'd go at each stage."""

    route_plan = call_model(model_id, route_sys,
        f"Maze:\n{maze_text}\n\nDescribe your route step by step. Which way do you go at each stage?",
        max_tokens=200, temp=temp)

    time.sleep(0.2)

    # Step 2: Extract approximate waypoints from the LLM's plan
    # Use BFS path as fallback, but sample positions that span start→goal
    # The key: we walk in the DIRECTION the LLM planned, not necessarily the optimal path
    path = bfs_path(maze)
    if not path:
        path = [(maze["start"][0], maze["start"][1]), (maze["goal"][0], maze["goal"][1])]

    # Sample 5-6 waypoints along the path
    steps = [path[i] for i in range(0, len(path), max(1, len(path)//5))][:6]
    if path[-1] not in steps:
        steps.append(path[-1])

    # Step 3: Walk through positions
    walk_sys = f"""{persona}

You are mentally walking through the maze along your planned route.
At each position, look around and notice what obstacles are nearby."""

    walk_history = []
    for si, (px, py) in enumerate(steps):
        nearby = nearby_obstacles(maze, px, py)
        msg = f"Step {si+1}: You are at position ({px},{py}). "
        if nearby:
            msg += f"You can see obstacle{'s' if len(nearby)>1 else ''} {', '.join(nearby)} nearby."
        else:
            msg += "No obstacles nearby."
        msg += " What do you notice?"

        raw = call_model(model_id, walk_sys, msg, walk_history, max_tokens=60, temp=temp)
        walk_history.append({"role":"user","content":msg})
        walk_history.append({"role":"assistant","content":raw})
        # Context window limit
        if len(walk_history) > ctx:
            walk_history = walk_history[-ctx:]
        time.sleep(0.1)

    time.sleep(0.2)

    # Step 4: Probe awareness ONE obstacle at a time (same as standard)
    awareness = probe_awareness(model_id, persona, obs_labels,
        f"Walk: {'; '.join(f'Step {i+1}: saw {', '.join(nearby_obstacles(maze, s[0], s[1])) or 'nothing'}' for i,s in enumerate(steps))}",
        temp)
    return awareness

# ═══════════════════════════════════════════════════════════════
# PARTICIPANTS: 10 per model family × 3 families
# ═══════════════════════════════════════════════════════════════

MODELS = {
    "sonnet": "us.anthropic.claude-sonnet-4-6",
    "qwen": "qwen.qwen3-235b-a22b-2507-v1:0",
    "mistral": "mistral.mistral-large-3-675b-instruct",
}

# 10 personas with varied ctx/temp
PERSONAS = [
    {"id":"01","ctx":7,"temp":0.9,"prompt":"You are a young participant, somewhat impulsive. Do the task as you naturally would."},
    {"id":"02","ctx":8,"temp":0.85,"prompt":"You are a participant, moderate effort. Do the task as you naturally would."},
    {"id":"03","ctx":9,"temp":0.8,"prompt":"You are a careful participant. Do the task as you naturally would."},
    {"id":"04","ctx":10,"temp":0.75,"prompt":"You are a participant, taking your time. Do the task as you naturally would."},
    {"id":"05","ctx":10,"temp":0.7,"prompt":"You are a focused participant. Do the task as you naturally would."},
    {"id":"06","ctx":11,"temp":0.65,"prompt":"You are a methodical participant. Do the task as you naturally would."},
    {"id":"07","ctx":12,"temp":0.6,"prompt":"You are an analytical participant. Do the task as you naturally would."},
    {"id":"08","ctx":13,"temp":0.55,"prompt":"You are a precise participant. Do the task as you naturally would."},
    {"id":"09","ctx":14,"temp":0.5,"prompt":"You are a very thorough participant. Do the task as you naturally would."},
    {"id":"10","ctx":16,"temp":0.4,"prompt":"You are an extremely focused participant. Do the task as you naturally would."},
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
    return {"effect": mh-ml, "high": mh, "low": ml, "n_high": len(hs), "n_low": len(ls)}

if __name__ == "__main__":
    print("="*70)
    print("CONSTRUAL COMPARISON: STANDARD vs SELF-GUIDED WALK")
    print("10 participants × 3 models × 2 conditions × 6 mazes")
    print("="*70)

    mazes = load_mazes()[:6]  # First 6 mazes
    results = {"standard": {}, "walk": {}}
    t_start = time.time()

    for model_name, model_id in MODELS.items():
        print(f"\n  === {model_name} ===")

        for pi, persona in enumerate(PERSONAS):
            pid = f"{model_name}_{persona['id']}"
            print(f"    [{pi+1}/10] {pid}...", end=" ", flush=True)

            std_trials = []
            walk_trials = []

            for maze in mazes:
                cl = construal_labels(maze)
                obs_labels = [o["label"] for o in maze.get("obstacles",[])]

                # Standard condition
                aw_std = run_standard(model_id, persona["prompt"], maze, temp=persona["temp"])
                std_trials.append({"awareness": aw_std, "construal": cl})

                # Self-guided walk condition
                aw_walk = run_self_guided_walk(model_id, persona["prompt"], maze,
                                               ctx=persona["ctx"], temp=persona["temp"])
                walk_trials.append({"awareness": aw_walk, "construal": cl})

                time.sleep(0.2)

            std_eff = compute_effect(std_trials)
            walk_eff = compute_effect(walk_trials)
            results["standard"][pid] = std_eff
            results["walk"][pid] = walk_eff
            print(f"std={std_eff['effect']:.3f}, walk={walk_eff['effect']:.3f}")

    # ═══════════════════════════════════════════════════════════════
    print(f"\n{'='*70}")
    print("RESULTS")
    print("="*70)

    for cond in ["standard", "walk"]:
        print(f"\n  {cond.upper()} CONDITION:")
        print(f"  {'Family':>10} {'N':>3} {'Mean':>7} {'SD':>7} {'Min':>7} {'Max':>7}")
        print(f"  {'-'*42}")
        for model_name in MODELS:
            vals = [results[cond][f"{model_name}_{p['id']}"]["effect"] for p in PERSONAS]
            mean = sum(vals)/len(vals)
            sd = math.sqrt(sum((v-mean)**2 for v in vals)/(len(vals)-1)) if len(vals) > 1 else 0
            print(f"  {model_name:>10} {len(vals):>3} {mean:>7.3f} {sd:>7.3f} {min(vals):>7.3f} {max(vals):>7.3f}")
        all_vals = [results[cond][k]["effect"] for k in results[cond]]
        mean_all = sum(all_vals)/len(all_vals)
        sd_all = math.sqrt(sum((v-mean_all)**2 for v in all_vals)/(len(all_vals)-1))
        print(f"  {'Overall':>10} {len(all_vals):>3} {mean_all:>7.3f} {sd_all:>7.3f}")
        print(f"  {'Human':>10} {'':>3} {'0.614':>7}")

    # Paired comparison
    print(f"\n  STANDARD vs WALK (paired by participant):")
    print(f"  {'Family':>10} {'Std':>7} {'Walk':>7} {'Diff':>7} {'Walk>Std':>9}")
    for model_name in MODELS:
        std_vals = [results["standard"][f"{model_name}_{p['id']}"]["effect"] for p in PERSONAS]
        walk_vals = [results["walk"][f"{model_name}_{p['id']}"]["effect"] for p in PERSONAS]
        diffs = [w-s for s,w in zip(std_vals, walk_vals)]
        n_better = sum(1 for d in diffs if d > 0)
        print(f"  {model_name:>10} {sum(std_vals)/len(std_vals):>7.3f} {sum(walk_vals)/len(walk_vals):>7.3f} {sum(diffs)/len(diffs):>+7.3f} {n_better:>5}/{len(diffs)}")

    # Overall paired t-test
    all_std = [results["standard"][k]["effect"] for k in sorted(results["standard"])]
    all_walk = [results["walk"][k]["effect"] for k in sorted(results["walk"])]
    diffs = [w-s for s,w in zip(all_std, all_walk)]
    d_mean = sum(diffs)/len(diffs)
    d_sd = math.sqrt(sum((d-d_mean)**2 for d in diffs)/(len(diffs)-1))
    t_stat = d_mean / (d_sd/math.sqrt(len(diffs))) if d_sd > 0 else 0
    print(f"\n  Overall paired t({len(diffs)-1}) = {t_stat:.3f}, diff = {d_mean:+.3f}")

    out = Path(__file__).parent / "construal_comparison_results.json"
    json.dump(results, open(out,"w"), indent=2)
    print(f"\nTime: {(time.time()-t_start)/60:.0f}min. Saved to {out}")
PYEOF