"""
Humanization Experiments: Close the Gap
=========================================
Three parallel experiments to make LLMs more human-like:

1. MAZE: Capacity-limited attention
   - Condition A: Full maze (baseline — no construal effect)
   - Condition B: "Glance" — show maze for description, then REMOVE it before planning
   - Condition C: "Scan" — only show 5x5 window around current position
   - Condition D: "Token budget" — force very short CoT (max 100 tokens for planning)

2. TOL: Verification + optimal prompting
   - First: verify puzzle correctness (BFS)
   - Then: test Claude directly (no persona) with explicit state tracking
   - Then: test with image input on Opus

3. TWO-STEP: Calibrated noise injection
   - Condition A: Randomly omit feedback on 20% of trials (inattention)
   - Condition B: Randomly swap reported transition type on 15% (confusion)
   - Condition C: Very short context (4 msgs) + high temp (1.0) combined
"""

import json, time, sys, math, random
from pathlib import Path
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

def call_claude(system, user, messages=None, max_tokens=300, temp=1.0, model_id="us.anthropic.claude-sonnet-4-6"):
    if messages is None: messages = [{"role": "user", "content": user}]
    else: messages = list(messages) + [{"role": "user", "content": user}]
    for attempt in range(3):
        try:
            body_dict = {"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens, "system": system, "messages": messages}
            if temp != 1.0: body_dict["temperature"] = temp
            resp = bedrock.invoke_model(modelId=model_id, contentType="application/json", accept="application/json", body=json.dumps(body_dict))
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt + random.random())
            else: print(f"    API error: {e}", file=sys.stderr); return ""

def parse_json(raw, fallback=None):
    cleaned = raw.replace("```json","").replace("```","").strip()
    f, l = cleaned.find("{"), cleaned.rfind("}")
    if f >= 0 and l > f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    return fallback

PERSONA = "You are a participant in a research study. Do the task as you naturally would. Just respond."

# ═══════════════════════════════════════════════════════════════
# 1. MAZE: CAPACITY-LIMITED ATTENTION
# ═══════════════════════════════════════════════════════════════

def load_mazes():
    with open(Path(__file__).parent / "src" / "data" / "paperMazes.json") as f: return json.load(f)

def bfs_path(maze):
    from collections import deque
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
    path_set=set(bfs_path(maze)); results=[]
    for obs in maze.get("obstacles",[]):
        cells=[tuple(c) for c in obs["cells"]]
        min_d=min(abs(oc[0]-pc[0])+abs(oc[1]-pc[1]) for oc in cells for pc in path_set) if path_set else 99
        results.append({"label":obs["label"],"dist":min_d})
    if not results: return {}
    med=sorted(r["dist"] for r in results)[len(results)//2]
    return {r["label"]:"high" if r["dist"]<=med else "low" for r in results}

def run_maze_condition(condition, n_mazes=4):
    """Run maze with different attention constraints."""
    mazes = load_mazes()[:n_mazes]
    trials = []

    for mi, maze in enumerate(mazes):
        obs_labels = [o["label"] for o in maze.get("obstacles",[])]
        cl = construal_labels(maze)
        maze_text = "\n".join(maze["grid"])

        if condition == "full":
            # Baseline: full maze, unlimited CoT
            nav_sys = f"{PERSONA}\n\nYou see a maze. S=start, G=goal, #=wall, digits=obstacles, .=empty. Plan your route from S to G."
            cot = call_claude(nav_sys, f"Maze:\n{maze_text}\n\nPlan your route.", max_tokens=500)

        elif condition == "glance":
            # Show maze, then ask to plan FROM MEMORY (no maze in planning prompt)
            glance_sys = f"{PERSONA}\n\nYou will see a maze BRIEFLY. Study it quickly, then it will be removed. You'll plan from memory."
            # Step 1: Show maze
            call_claude(glance_sys, f"Study this maze:\n{maze_text}\n\nRemember the layout. Say 'ready' when done.", max_tokens=30)
            # Step 2: Plan WITHOUT maze
            cot = call_claude(f"{PERSONA}\n\nThe maze has been removed. From memory, plan your route from S to G. What obstacles do you remember near your path?", "Plan from memory. Which obstacles were near your route and which were far away?", max_tokens=300)

        elif condition == "token_budget":
            # Very short CoT — simulates limited processing time
            nav_sys = f"{PERSONA}\n\nMaze task. S=start, G=goal, #=wall, digits=obstacles. Plan route S to G. Be VERY brief — just note the key obstacles in your way."
            cot = call_claude(nav_sys, f"Maze:\n{maze_text}\n\nQuickly: what's the route and which obstacles matter?", max_tokens=80)

        elif condition == "partial_reveal":
            # Only describe obstacles by region, don't show full grid
            grid = maze["grid"]; h = len(grid)
            # Describe start, goal, and obstacle positions verbally
            obs_desc = []
            for obs in maze.get("obstacles", []):
                cells = [tuple(c) for c in obs["cells"]]
                avg_r = sum(c[1] for c in cells) / len(cells)
                avg_c = sum(c[0] for c in cells) / len(cells)
                region = "top" if avg_r < h/3 else "middle" if avg_r < 2*h/3 else "bottom"
                side = "left" if avg_c < len(grid[0])/3 else "center" if avg_c < 2*len(grid[0])/3 else "right"
                obs_desc.append(f"Obstacle {obs['label']}: {region}-{side}")

            nav_sys = f"""{PERSONA}

You're navigating a maze. The start (S) is at bottom-left, goal (G) at top-right.
There are walls in a cross shape through the center.
Here are the obstacles (you can't see the full grid — just descriptions):
{chr(10).join(obs_desc)}

Which obstacles would be in your way if you tried to reach the goal? Which are irrelevant?"""
            cot = call_claude(nav_sys, "Think about which obstacles matter for your route.", max_tokens=300)

        time.sleep(0.3)

        # Awareness probe (same for all conditions)
        probe_sys = f"""{PERSONA}

Rate how aware you were of each obstacle during planning: 0.0=didn't notice, 0.5=vaguely aware, 1.0=fully noticed.
Return ONLY JSON: {{ {', '.join(f'"{l}": <number>' for l in obs_labels)} }}"""

        probe = call_claude(probe_sys, f'Obstacles: {", ".join(obs_labels)}. Your thoughts: "{cot[:300]}". Rate awareness.', max_tokens=200)
        scores = parse_json(probe, {})
        awareness = {}
        for l in obs_labels:
            v = scores.get(l, 0.5)
            awareness[l] = max(0.0, min(1.0, float(v))) if isinstance(v,(int,float)) else 0.5

        trials.append({"awareness": awareness, "construal": cl})
        time.sleep(0.3)

    # Compute effect
    high_s, low_s = [], []
    for t in trials:
        for l, s in t["awareness"].items():
            if l in t["construal"]: (high_s if t["construal"][l]=="high" else low_s).append(s)
    mh = sum(high_s)/len(high_s) if high_s else 0
    ml = sum(low_s)/len(low_s) if low_s else 0
    return {"effect": mh-ml, "high": mh, "low": ml, "n_high": len(high_s), "n_low": len(low_s)}


# ═══════════════════════════════════════════════════════════════
# 2. TOL: VERIFICATION + OPTIMAL PROMPTING
# ═══════════════════════════════════════════════════════════════

PEG_CAP = [3, 2, 1]
BALL_NAME = {"R":"red","G":"green","B":"blue"}

def verify_tol_bfs(init, goal):
    """BFS to verify minimum moves."""
    from collections import deque
    def state_key(s): return str(s)
    def clone(s): return [list(p) for p in s]

    if state_key(init) == state_key(goal): return 0
    vis = {state_key(init)}
    q = deque([(clone(init), 0, [])])
    while q:
        state, moves, path = q.popleft()
        for fr in range(3):
            if not state[fr]: continue
            for to in range(3):
                if fr == to or len(state[to]) >= PEG_CAP[to]: continue
                ns = clone(state)
                ball = ns[fr].pop()
                ns[to].append(ball)
                k = state_key(ns)
                if k not in vis:
                    vis.add(k)
                    new_path = path + [f"Move {BALL_NAME[ball]} from peg {fr+1} to peg {to+1}"]
                    if state_key(ns) == state_key(goal):
                        return moves+1, new_path
                    q.append((ns, moves+1, new_path))
        if moves > 8: break
    return -1, []

def describe_state(state):
    return "\n".join(f"  Peg {i+1} (cap {PEG_CAP[i]}): {', '.join(BALL_NAME[b] for b in p) if p else 'empty'}" for i,p in enumerate(state))

def test_tol():
    print("\n" + "="*70)
    print("2. TOL VERIFICATION + DIRECT PROMPTING")
    print("="*70)

    puzzles = [
        {"init": [["R","G","B"],[],[]], "goal": [["B"],["G"],["R"]], "claimed_min": 3},
        {"init": [["R"],["G"],["B"]], "goal": [["G","R"],["B"],[]], "claimed_min": 3},
        {"init": [["R","G","B"],[],[]], "goal": [["G"],["B","R"],[]], "claimed_min": 4},
        {"init": [["B","G","R"],[],[]], "goal": [["R"],["G"],["B"]], "claimed_min": 5},
    ]

    for pi, puzzle in enumerate(puzzles):
        actual_min, optimal_path = verify_tol_bfs(puzzle["init"], puzzle["goal"])
        print(f"\n  Puzzle {pi+1}: claimed min={puzzle['claimed_min']}, verified min={actual_min}")
        if optimal_path:
            print(f"  Optimal solution: {' → '.join(optimal_path)}")
        else:
            print(f"  WARNING: Could not find solution!")

        # Test Claude DIRECTLY — no persona, explicit state tracking, clear format
        direct_sys = """You are solving a Tower of London puzzle.

Rules:
- 3 pegs with capacities: Peg 1 holds 3 balls, Peg 2 holds 2, Peg 3 holds 1
- You can ONLY move the TOP ball from a peg
- Find the MINIMUM number of moves

IMPORTANT: After each move, write out the FULL state of all 3 pegs. This helps you track what's happening.

Format each move as:
Move N: [ball] from Peg X to Peg Y
State: Peg 1=[...], Peg 2=[...], Peg 3=[...]"""

        init_desc = describe_state(puzzle["init"])
        goal_desc = describe_state(puzzle["goal"])

        print(f"\n  [Direct prompt — no persona, explicit state tracking]")
        resp = call_claude(direct_sys, f"Initial state:\n{init_desc}\n\nGoal state:\n{goal_desc}\n\nSolve in MINIMUM moves. Write the full state after each move.", max_tokens=800)
        print(f"  {resp[:500]}")

        # Count moves
        move_count = resp.lower().count("move ")
        print(f"\n  Moves mentioned: ~{move_count}, Optimal: {actual_min}")

        # Check if solution is correct by parsing moves
        # Simple heuristic: count "move N:" patterns
        import re
        move_patterns = re.findall(r'move\s*\d+', resp.lower())
        print(f"  Numbered moves found: {len(move_patterns)}")

        time.sleep(0.5)


# ═══════════════════════════════════════════════════════════════
# 3. TWO-STEP: NOISE INJECTION
# ═══════════════════════════════════════════════════════════════

PLANETS = ["Red Planet", "Purple Planet"]
ALIENS = [["Alien Alpha", "Alien Beta"], ["Alien Gamma", "Alien Delta"]]

def run_twostep_noisy(condition, n_trials=30, seed=42):
    rng = random.Random(seed)
    probs = [0.4, 0.6, 0.6, 0.4]
    system = f"""{PERSONA}

Space game. Choose spaceship A or B → planet → alien → maybe treasure.
Return ONLY JSON: {{ "choice": "A" or "B" }}"""

    history = []; details = []

    for t in range(n_trials):
        msg = ""
        if t > 0:
            prev = details[-1]
            true_feedback = f"Ship {'A' if prev['s1']==0 else 'B'} → {PLANETS[prev['p']]} ({prev['tr']}) → {ALIENS[prev['p']][prev['s2']]} → {'Treasure!' if prev['rw'] else 'Nothing.'}"

            if condition == "omit_feedback":
                # 20% chance of no feedback (inattention)
                if rng.random() < 0.2:
                    msg += "[You weren't paying attention and missed what happened last trial.]\n\n"
                else:
                    msg += f"Last: {true_feedback}\n\n"

            elif condition == "noisy_feedback":
                # 15% chance of swapping transition label (confusion)
                if rng.random() < 0.15:
                    swapped_tr = "rare" if prev["tr"] == "common" else "common"
                    msg += f"Last: Ship {'A' if prev['s1']==0 else 'B'} → {PLANETS[prev['p']]} ({swapped_tr}) → {ALIENS[prev['p']][prev['s2']]} → {'Treasure!' if prev['rw'] else 'Nothing.'}\n\n"
                else:
                    msg += f"Last: {true_feedback}\n\n"

            elif condition == "ultra_short_ctx":
                msg += f"Last: {true_feedback}\n\n"

            else:  # baseline
                msg += f"Last: {true_feedback}\n\n"

        msg += f"Trial {t+1}/{n_trials}. Choose: A or B."

        ctx_limit = 4 if condition == "ultra_short_ctx" else 20
        temp = 1.0 if condition == "ultra_short_ctx" else 1.0

        raw = call_claude(system, msg, history, 100, temp=temp)
        p = parse_json(raw, {}); s1 = 1 if isinstance(p,dict) and "B" in str(p.get("choice","")).upper() else 0

        is_common = rng.random() < 0.7; planet = s1 if is_common else (1-s1)
        tr = "common" if is_common else "rare"
        history.append({"role":"user","content":msg}); history.append({"role":"assistant","content":raw})

        # Stage 2
        aliens = ALIENS[planet]
        s2_msg = f'{PLANETS[planet]}. Choose: "{aliens[0]}" or "{aliens[1]}".'
        raw2 = call_claude(system, s2_msg, history, 80, temp=temp)
        s2 = 0
        history.append({"role":"user","content":s2_msg}); history.append({"role":"assistant","content":raw2})
        if len(history) > ctx_limit: history = history[-ctx_limit:]

        rw = rng.random() < probs[planet*2+s2]
        for i in range(4): probs[i] = max(0.25, min(0.75, probs[i] + rng.gauss(0, 0.025)))
        details.append({"t":t,"s1":s1,"tr":tr,"p":planet,"s2":s2,"rw":rw})
        time.sleep(0.15)

    # Compute stays
    c = {"cr":0,"crs":0,"cn":0,"cns":0,"rr":0,"rrs":0,"rn":0,"rns":0}
    for i in range(1,len(details)):
        prev,curr = details[i-1],details[i]; stayed = curr["s1"]==prev["s1"]
        k = ("c" if prev["tr"]=="common" else "r")+("r" if prev["rw"] else "n"); c[k]+=1
        if stayed: c[k+"s"]+=1
    r = lambda k: c[k+"s"]/c[k] if c[k]>0 else 0.5
    return {"cr":r("cr"),"cn":r("cn"),"rr":r("rr"),"rn":r("rn"),
            "mb":(r("cr")-r("cn"))-(r("rr")-r("rn")),
            "reward":sum(1 for d in details if d["rw"])/len(details)}


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":

    # === 1. MAZE CONSTRUAL ===
    print("="*70)
    print("1. MAZE: CAPACITY-LIMITED ATTENTION")
    print("="*70)

    maze_results = {}
    for cond in ["full", "glance", "token_budget", "partial_reveal"]:
        print(f"\n  Condition: {cond}...", end=" ", flush=True)
        r = run_maze_condition(cond)
        maze_results[cond] = r
        print(f"effect={r['effect']:.3f} (high={r['high']:.3f}, low={r['low']:.3f})")

    print(f"\n  Summary — Construal Effect by Condition:")
    print(f"  {'Condition':<18} {'Effect':>8} {'High':>8} {'Low':>8}")
    print(f"  {'-'*42}")
    for cond, r in maze_results.items():
        print(f"  {cond:<18} {r['effect']:>8.3f} {r['high']:>8.3f} {r['low']:>8.3f}")
    print(f"  {'Human':.<18} {'0.614':>8} {'0.787':>8} {'0.173':>8}")

    # === 2. TOL ===
    test_tol()

    # === 3. TWO-STEP NOISE ===
    print("\n" + "="*70)
    print("3. TWO-STEP: NOISE INJECTION")
    print("="*70)

    ts_results = {}
    for cond in ["baseline", "omit_feedback", "noisy_feedback", "ultra_short_ctx"]:
        print(f"\n  Condition: {cond}...", end=" ", flush=True)
        r = run_twostep_noisy(cond)
        ts_results[cond] = r
        print(f"MB={r['mb']:.3f}, CR={r['cr']:.2f}, CN={r['cn']:.2f}, RR={r['rr']:.2f}, RN={r['rn']:.2f}")

    print(f"\n  Summary — Stay Probabilities by Condition:")
    print(f"  {'Condition':<18} {'Stay CR':>8} {'Stay CN':>8} {'Stay RR':>8} {'Stay RN':>8} {'MB':>7}")
    print(f"  {'-'*55}")
    for cond, r in ts_results.items():
        print(f"  {cond:<18} {r['cr']:>8.2f} {r['cn']:>8.2f} {r['rr']:>8.2f} {r['rn']:>8.2f} {r['mb']:>7.3f}")
    print(f"  {'Human':.<18} {'~0.75':>8} {'~0.60':>8} {'~0.60':>8} {'~0.70':>8} {'>0':>7}")

    # Save
    out = Path(__file__).parent / "humanization_results.json"
    json.dump({"maze": maze_results, "twostep": ts_results}, open(out,"w"), indent=2)
    print(f"\nSaved to {out}")
