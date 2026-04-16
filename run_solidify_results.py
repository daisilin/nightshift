"""
Solidify Results: Proper experiments with sufficient N
=======================================================
1. TOL: 20 BFS-verified puzzles × text + Opus vision × 3 personas
2. Maze: Token-budget amplification (combine with ctx/temp constraints)
3. Two-Step: ctx×temp grid search (no feedback manipulation)
"""

import json, time, sys, math, random, base64, io
from pathlib import Path
from collections import deque
import boto3
from botocore.config import Config

try:
    from PIL import Image, ImageDraw
    HAS_PIL = True
except:
    HAS_PIL = False

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

def call_claude(system, user, messages=None, max_tokens=300, temp=1.0, model_id="us.anthropic.claude-sonnet-4-6"):
    if messages is None: messages = [{"role": "user", "content": user}]
    else: messages = list(messages) + [{"role": "user", "content": user}]
    for attempt in range(3):
        try:
            bd = {"anthropic_version":"bedrock-2023-05-31","max_tokens":max_tokens,"system":system,"messages":messages}
            if temp != 1.0: bd["temperature"] = temp
            resp = bedrock.invoke_model(modelId=model_id, contentType="application/json", accept="application/json", body=json.dumps(bd))
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt+random.random())
            else: print(f"    API err: {e}",file=sys.stderr); return ""

def parse_json(raw, fallback=None):
    cleaned=raw.replace("```json","").replace("```","").strip()
    f,l=cleaned.find("{"),cleaned.rfind("}")
    if f>=0 and l>f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    return fallback

# ═══════════════════════════════════════════════════════════════
# 1. TOL: PROPER EXPERIMENT WITH BFS-VERIFIED PUZZLES
# ═══════════════════════════════════════════════════════════════

PEG_CAP = [3, 2, 1]
BALL_NAME = {"R":"red","G":"green","B":"blue"}
BALLS = ["R","G","B"]

def clone(s): return [list(p) for p in s]
def state_key(s): return str(s)

def bfs_solve(init, goal):
    """BFS returning (min_moves, solution_path)."""
    if state_key(init)==state_key(goal): return 0, []
    vis={state_key(init)}
    q=deque([(clone(init),0,[])])
    while q:
        state,moves,path=q.popleft()
        if moves>8: continue
        for fr in range(3):
            if not state[fr]: continue
            for to in range(3):
                if fr==to or len(state[to])>=PEG_CAP[to]: continue
                ns=clone(state); ball=ns[fr].pop(); ns[to].append(ball)
                k=state_key(ns)
                if k not in vis:
                    vis.add(k)
                    np=path+[f"{BALL_NAME[ball]} from peg {fr+1} to peg {to+1}"]
                    if state_key(ns)==state_key(goal): return moves+1, np
                    q.append((ns,moves+1,np))
    return -1, []

def generate_verified_puzzles(n_per_level, seed=42):
    """Generate puzzles with BFS-verified minimum moves."""
    rng = random.Random(seed)
    puzzles = []
    targets = {2: n_per_level, 3: n_per_level, 4: n_per_level, 5: n_per_level}

    for _ in range(5000):
        if all(v==0 for v in targets.values()): break
        # Random goal
        goal = [[], [], []]
        balls_left = list(BALLS)
        rng.shuffle(balls_left)
        for b in balls_left:
            peg = rng.randint(0,2)
            if len(goal[peg]) < PEG_CAP[peg]: goal[peg].append(b)
            else:
                for p in range(3):
                    if len(goal[p]) < PEG_CAP[p]: goal[p].append(b); break
        # Random initial
        init = [[], [], []]
        balls_left = list(BALLS)
        rng.shuffle(balls_left)
        for b in balls_left:
            peg = rng.randint(0,2)
            if len(init[peg]) < PEG_CAP[peg]: init[peg].append(b)
            else:
                for p in range(3):
                    if len(init[p]) < PEG_CAP[p]: init[p].append(b); break

        min_moves, solution = bfs_solve(init, goal)
        if min_moves in targets and targets[min_moves] > 0:
            puzzles.append({"init": init, "goal": goal, "min": min_moves, "solution": solution})
            targets[min_moves] -= 1

    return sorted(puzzles, key=lambda p: p["min"])

def describe_state(state):
    return "\n".join(f"  Peg {i+1} (cap {PEG_CAP[i]}): {', '.join(BALL_NAME[b] for b in p) if p else 'empty'}" for i,p in enumerate(state))

def run_tol_proper(persona_prompt, puzzles, model_id="us.anthropic.claude-sonnet-4-6"):
    """Run TOL with proper scoring."""
    system = f"""{persona_prompt}

Tower of London puzzle. 3 pegs (cap 3, 2, 1), 3 colored balls (red, green, blue).
Move ONLY the top ball. Find MINIMUM moves.

After EACH move, write the full state. Format:
Move N: [color] from Peg X to Peg Y
State: Peg 1=[...], Peg 2=[...], Peg 3=[...]

Return your moves, then at the end: {{ "total_moves": N }}"""

    weighted_score = 0
    solved = 0
    optimal = 0
    details = []

    for pi, puzzle in enumerate(puzzles):
        init_desc = describe_state(puzzle["init"])
        goal_desc = describe_state(puzzle["goal"])

        resp = call_claude(system,
            f"Puzzle {pi+1}/{len(puzzles)} (try to solve in {puzzle['min']} moves):\n\nCurrent:\n{init_desc}\n\nGoal:\n{goal_desc}\n\nSolve with minimum moves.",
            max_tokens=600, model_id=model_id)

        # Parse: count numbered moves and check if final state matches goal
        import re
        move_lines = re.findall(r'move\s*\d+', resp.lower())
        n_moves = len(move_lines)
        # Rough check: did they claim to finish?
        parsed = parse_json(resp, {})
        claimed_moves = parsed.get("total_moves", n_moves) if isinstance(parsed, dict) else n_moves

        # Simulate to check correctness
        state = clone(puzzle["init"])
        actual_moves = 0
        is_solved = False
        for line in resp.split('\n'):
            ll = line.lower().strip()
            # Try to parse "move N: COLOR from peg X to peg Y"
            m = re.match(r'move\s*\d+[:\s]+(\w+)\s+from\s+peg\s*(\d)\s+to\s+peg\s*(\d)', ll)
            if m:
                color = m.group(1)
                fr = int(m.group(2))-1
                to = int(m.group(3))-1
                ball = "R" if "red" in color else "G" if "green" in color else "B" if "blue" in color else None
                if ball and 0<=fr<=2 and 0<=to<=2 and state[fr] and state[fr][-1]==ball and len(state[to])<PEG_CAP[to]:
                    state[fr].pop(); state[to].append(ball)
                    actual_moves += 1
                    if state_key(state)==state_key(puzzle["goal"]):
                        is_solved = True
                        break

        is_optimal = is_solved and actual_moves <= puzzle["min"]
        score = puzzle["min"] if is_optimal else 0
        weighted_score += score
        if is_solved: solved += 1
        if is_optimal: optimal += 1

        details.append({"puzzle":pi, "min":puzzle["min"], "actual":actual_moves, "solved":is_solved, "optimal":is_optimal, "score":score})

        if pi % 5 == 4:
            print(f"      puzzle {pi+1}: {optimal}/{pi+1} optimal, {solved}/{pi+1} solved, weighted={weighted_score}")
        time.sleep(0.3)

    return {"weighted_score":weighted_score, "solved":solved, "optimal":optimal, "total":len(puzzles), "details":details}


# ═══════════════════════════════════════════════════════════════
# 2. MAZE CONSTRUAL: AMPLIFY TOKEN BUDGET
# ═══════════════════════════════════════════════════════════════

def load_mazes():
    with open(Path(__file__).parent / "src" / "data" / "paperMazes.json") as f: return json.load(f)

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
    path_set=set(bfs_path(maze)); results=[]
    for obs in maze.get("obstacles",[]):
        cells=[tuple(c) for c in obs["cells"]]
        min_d=min(abs(oc[0]-pc[0])+abs(oc[1]-pc[1]) for oc in cells for pc in path_set) if path_set else 99
        results.append({"label":obs["label"],"dist":min_d})
    if not results: return {}
    med=sorted(r["dist"] for r in results)[len(results)//2]
    return {r["label"]:"high" if r["dist"]<=med else "low" for r in results}

def run_maze_amplified(cot_tokens, ctx_limit, temp, n_mazes=6):
    """Run maze with combined constraints: limited CoT + limited ctx + temp."""
    mazes = load_mazes()[:n_mazes]
    trials = []
    PERSONA = "You are a participant in a research study. Do the task naturally."
    history = []

    for mi, maze in enumerate(mazes):
        obs_labels = [o["label"] for o in maze.get("obstacles",[])]
        cl = construal_labels(maze)
        maze_text = "\n".join(maze["grid"])

        nav_sys = f"{PERSONA}\n\nMaze task. S=start, G=goal, #=wall, digits=obstacles. Plan route S→G. Note ONLY the obstacles that matter for your path — ignore the rest."
        cot = call_claude(nav_sys, f"Maze:\n{maze_text}\n\nQuickly: route and key obstacles?", max_tokens=cot_tokens, temp=temp)
        if len(history) > ctx_limit: history = history[-ctx_limit:]

        probe_sys = f"{PERSONA}\n\nRate awareness of each obstacle: 0.0=didn't notice, 1.0=fully noticed.\nReturn ONLY JSON: {{ {', '.join(f'\"{l}\": <number>' for l in obs_labels)} }}"
        probe = call_claude(probe_sys, f'Obstacles: {", ".join(obs_labels)}. Your route notes: "{cot[:200]}". Rate.', max_tokens=200, temp=temp)

        scores = parse_json(probe, {})
        awareness = {}
        for l in obs_labels:
            v = scores.get(l, 0.5)
            awareness[l] = max(0.0,min(1.0,float(v))) if isinstance(v,(int,float)) else 0.5
        trials.append({"awareness":awareness,"construal":cl})
        time.sleep(0.3)

    high_s,low_s=[],[]
    for t in trials:
        for l,s in t["awareness"].items():
            if l in t["construal"]: (high_s if t["construal"][l]=="high" else low_s).append(s)
    mh=sum(high_s)/len(high_s) if high_s else 0
    ml=sum(low_s)/len(low_s) if low_s else 0
    return {"effect":mh-ml,"high":mh,"low":ml}


# ═══════════════════════════════════════════════════════════════
# 3. TWO-STEP: CTX × TEMP GRID (no feedback manipulation)
# ═══════════════════════════════════════════════════════════════

PLANETS = ["Red Planet", "Purple Planet"]
ALIENS = [["Alien Alpha", "Alien Beta"], ["Alien Gamma", "Alien Delta"]]

def run_twostep_grid(ctx, temp, n_trials=30, seed=42):
    rng=random.Random(seed); probs=[0.4,0.6,0.6,0.4]
    system = "You are a participant. Space game: ship A or B → planet → alien → maybe treasure. Try to earn treasure.\nReturn ONLY JSON: { \"choice\": \"A\" or \"B\" }"
    history=[]; details=[]
    for t in range(n_trials):
        msg=""
        if t>0:
            p=details[-1]
            msg+=f"Last: Ship {'A' if p['s1']==0 else 'B'} → {PLANETS[p['p']]} ({p['tr']}) → {ALIENS[p['p']][p['s2']]} → {'Treasure!' if p['rw'] else 'Nothing.'}\n\n"
        msg+=f"Trial {t+1}/{n_trials}. Choose: A or B."
        raw=call_claude(system,msg,history,100,temp=temp)
        pr=parse_json(raw,{}); s1=1 if isinstance(pr,dict) and "B" in str(pr.get("choice","")).upper() else 0
        ic=rng.random()<0.7; planet=s1 if ic else (1-s1); tr="common" if ic else "rare"
        history.append({"role":"user","content":msg}); history.append({"role":"assistant","content":raw})
        aliens=ALIENS[planet]
        s2m=f'{PLANETS[planet]}. Choose: "{aliens[0]}" or "{aliens[1]}".'
        raw2=call_claude(system,s2m,history,80,temp=temp)
        s2=0
        history.append({"role":"user","content":s2m}); history.append({"role":"assistant","content":raw2})
        if len(history)>ctx: history=history[-ctx:]
        rw=rng.random()<probs[planet*2+s2]
        for i in range(4): probs[i]=max(0.25,min(0.75,probs[i]+rng.gauss(0,0.025)))
        details.append({"t":t,"s1":s1,"tr":tr,"p":planet,"s2":s2,"rw":rw})
        time.sleep(0.15)
    c={"cr":0,"crs":0,"cn":0,"cns":0,"rr":0,"rrs":0,"rn":0,"rns":0}
    for i in range(1,len(details)):
        p,cu=details[i-1],details[i]; stayed=cu["s1"]==p["s1"]
        k=("c" if p["tr"]=="common" else "r")+("r" if p["rw"] else "n"); c[k]+=1
        if stayed: c[k+"s"]+=1
    r=lambda k: c[k+"s"]/c[k] if c[k]>0 else 0.5
    return {"cr":r("cr"),"cn":r("cn"),"rr":r("rr"),"rn":r("rn"),"mb":(r("cr")-r("cn"))-(r("rr")-r("rn"))}


# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":

    # === 1. TOL PROPER ===
    print("="*70)
    print("1. TOL: 20 BFS-VERIFIED PUZZLES")
    print("="*70)
    puzzles = generate_verified_puzzles(5, seed=12345)
    print(f"  Generated {len(puzzles)} puzzles: {[p['min'] for p in puzzles]}")

    PERSONAS_TOL = [
        ("direct (no persona)", "Solve this puzzle optimally. Track state after each move."),
        ("james (analytical)", "You are James, a 22-year-old CS senior. Analytical, methodical. Solve this puzzle."),
        ("emma (impulsive)", "You are Emma, a 19-year-old psych student. Do the task naturally. Solve this puzzle."),
    ]

    tol_results = {}
    for name, prompt in PERSONAS_TOL:
        print(f"\n  {name}:")
        r = run_tol_proper(prompt, puzzles)
        tol_results[name] = r
        print(f"  → weighted={r['weighted_score']}, solved={r['solved']}/{r['total']}, optimal={r['optimal']}/{r['total']}")

    print(f"\n  TOL Summary:")
    print(f"  {'Persona':<25} {'Weighted':>9} {'Solved':>7} {'Optimal':>8} {'%Opt':>6}")
    for name, r in tol_results.items():
        print(f"  {name:<25} {r['weighted_score']:>9} {r['solved']:>4}/{r['total']} {r['optimal']:>5}/{r['total']} {r['optimal']/r['total']:>6.0%}")
    print(f"  Human reference: weighted=56.85, ~80% solved")

    # Per-difficulty breakdown
    print(f"\n  By difficulty:")
    for min_m in [2,3,4,5]:
        for name, r in tol_results.items():
            d = [x for x in r["details"] if puzzles[x["puzzle"]]["min"]==min_m]
            opt = sum(1 for x in d if x["optimal"])
            sol = sum(1 for x in d if x["solved"])
            print(f"    {min_m}-move, {name[:15]:<15}: {opt}/{len(d)} optimal, {sol}/{len(d)} solved")

    # === 2. MAZE AMPLIFICATION ===
    print("\n" + "="*70)
    print("2. MAZE: TOKEN-BUDGET AMPLIFICATION")
    print("="*70)

    maze_configs = [
        {"label": "baseline (500tok)", "cot": 500, "ctx": 40, "temp": 1.0},
        {"label": "token_80", "cot": 80, "ctx": 40, "temp": 1.0},
        {"label": "token_50", "cot": 50, "ctx": 40, "temp": 1.0},
        {"label": "token_80+ctx8", "cot": 80, "ctx": 8, "temp": 1.0},
        {"label": "token_80+ctx8+temp0.5", "cot": 80, "ctx": 8, "temp": 0.5},
        {"label": "token_50+ctx6+temp0.5", "cot": 50, "ctx": 6, "temp": 0.5},
    ]

    maze_results = {}
    for cfg in maze_configs:
        print(f"  {cfg['label']}...", end=" ", flush=True)
        r = run_maze_amplified(cfg["cot"], cfg["ctx"], cfg["temp"])
        maze_results[cfg["label"]] = r
        print(f"effect={r['effect']:.3f} (high={r['high']:.3f}, low={r['low']:.3f})")

    print(f"\n  Maze Summary:")
    print(f"  {'Config':<30} {'Effect':>8} {'High':>8} {'Low':>8}")
    for label, r in maze_results.items():
        print(f"  {label:<30} {r['effect']:>8.3f} {r['high']:>8.3f} {r['low']:>8.3f}")
    print(f"  {'Human':.<30} {'0.614':>8} {'0.787':>8} {'0.173':>8}")

    # === 3. TWO-STEP GRID ===
    print("\n" + "="*70)
    print("3. TWO-STEP: CTX × TEMP GRID")
    print("="*70)

    grid_results = {}
    for ctx in [6, 8, 10]:
        for temp in [0.7, 0.85, 1.0]:
            key = f"ctx{ctx}_temp{temp}"
            print(f"  {key}...", end=" ", flush=True)
            r = run_twostep_grid(ctx, temp)
            grid_results[key] = r
            print(f"CR={r['cr']:.2f} CN={r['cn']:.2f} RR={r['rr']:.2f} RN={r['rn']:.2f} MB={r['mb']:.3f}")

    print(f"\n  Two-Step Grid Summary:")
    print(f"  {'Config':<20} {'CR':>6} {'CN':>6} {'RR':>6} {'RN':>6} {'MB':>7}")
    for key, r in grid_results.items():
        print(f"  {key:<20} {r['cr']:>6.2f} {r['cn']:>6.2f} {r['rr']:>6.2f} {r['rn']:>6.2f} {r['mb']:>7.3f}")
    print(f"  {'Human':.<20} {'~0.75':>6} {'~0.60':>6} {'~0.60':>6} {'~0.70':>6} {'>0':>7}")

    # Best match to human
    human_target = {"cr":0.75,"cn":0.60,"rr":0.60,"rn":0.70}
    best_key, best_dist = None, float('inf')
    for key, r in grid_results.items():
        dist = sum((r[k]-human_target[k])**2 for k in human_target)
        if dist < best_dist: best_dist = dist; best_key = key
    print(f"\n  Best match to human: {best_key} (MSE={best_dist:.4f})")

    out = Path(__file__).parent / "solidify_results.json"
    json.dump({"tol":tol_results,"maze":maze_results,"twostep":grid_results}, open(out,"w"), indent=2, default=str)
    print(f"\nSaved to {out}")
