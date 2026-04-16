"""
PHASE 1: Full Characterization Baseline
========================================
5 personas × 3 tasks (WCST + Two-Step + Maze-Construal)
All Sonnet 4.6, text-only, default context window.

Reuses existing data for Emma/James/Dorothy on WCST + Two-Step.
Runs new: Tyler + Priya on all 3 tasks, Emma/James/Dorothy on Maze only.
"""

import json, time, os, sys, math, random
from pathlib import Path
from collections import defaultdict

import boto3
from botocore.config import Config

bedrock = boto3.client(
    "bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}),
)
MODEL_ID = "us.anthropic.claude-sonnet-4-6"

# ─── 5 Personas ───

PERSONAS = [
    {
        "id": "emma",
        "name": "Emma, 19, psych student",
        "prompt": "You are Emma, a 19-year-old psychology sophomore at a large Midwestern state university. You're doing this study for course credit. You've done 3 other psych studies this semester and are getting tired of them. You tend to check your phone between trials. You go with your gut and respond quickly — thinking too long feels uncomfortable. You're cooperative and tend to go along with what's asked. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
    {
        "id": "james",
        "name": "James, 22, CS senior",
        "prompt": "You are James, a 22-year-old computer science senior at a private East Coast university. You enjoy puzzles and competitive games. You're an analytical thinker who looks for patterns and optimal strategies. You think things through carefully before responding — you'd rather be slow and right than fast and wrong. You can focus deeply on a task even when there are distractions. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
    {
        "id": "dorothy",
        "name": "Dorothy, 71, retired teacher",
        "prompt": "You are Dorothy, a 71-year-old retired high school teacher from Vermont. You read everything twice — a habit from 35 years of grading papers. You're not comfortable with computers; your grandson helped set you up. You process information more slowly than you used to but compensate by being very deliberate. You get tired after about 20 minutes of sustained concentration. You tend to agree with statements rather than disagree. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
    {
        "id": "tyler",
        "name": "Tyler, 28, gig worker",
        "prompt": "You are Tyler, a 28-year-old delivery driver from Florida who does online surveys on your phone during breaks. You do surveys mainly for the pay. You've been flagged for speeding through tasks before. You don't read long instructions carefully, just get the gist and start clicking. You're currently on a 15-minute break between deliveries. You're tired and want to get through this quickly. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
    {
        "id": "priya",
        "name": "Priya, 25, PhD student",
        "prompt": "You are Priya, a 25-year-old PhD student in computer science at MIT. You're analytically strong with excellent working memory. You approach tasks systematically and enjoy optimization problems. You're participating because you find cognitive experiments interesting. You tend to think things through carefully and look for the underlying structure of tasks. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
]

def call_claude(system, user, messages=None, max_tokens=300):
    if messages is None:
        messages = [{"role": "user", "content": user}]
    else:
        messages = list(messages) + [{"role": "user", "content": user}]
    for attempt in range(3):
        try:
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens, "system": system, "messages": messages,
            })
            resp = bedrock.invoke_model(modelId=MODEL_ID, contentType="application/json", accept="application/json", body=body)
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt + random.random())
            else:
                print(f"    API error: {e}", file=sys.stderr)
                return ""

def parse_json(raw, fallback=None):
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    first, last = cleaned.find("{"), cleaned.rfind("}")
    if first >= 0 and last > first:
        try: return json.loads(cleaned[first:last+1])
        except: pass
    return fallback


# ═══════════════════════════════════════════════════════════════════
# WCST (copied from baseline runner — same implementation)
# ═══════════════════════════════════════════════════════════════════

COLORS = ['red', 'green', 'yellow', 'blue']
SHAPES = ['triangle', 'star', 'cross', 'circle']
KEY_CARDS = [{"color": "red", "shape": "triangle", "number": 1}, {"color": "green", "shape": "star", "number": 2},
             {"color": "yellow", "shape": "cross", "number": 3}, {"color": "blue", "shape": "circle", "number": 4}]
RULE_ORDER = ['color', 'shape', 'number', 'color', 'shape', 'number']

def describe_card(c): return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number'] > 1 else ''}"
def random_card(): return {"color": random.choice(COLORS), "shape": random.choice(SHAPES), "number": random.randint(1, 4)}
def correct_match(stimulus, rule):
    for i, kc in enumerate(KEY_CARDS):
        if stimulus[rule] == kc[rule]: return i + 1
    return 1

WCST_SYSTEM = """You are doing the Wisconsin Card Sorting Test in a research study.

Four key cards are always visible:
  Card 1: 1 red triangle
  Card 2: 2 green stars
  Card 3: 3 yellow crosses
  Card 4: 4 blue circles

Each trial, you see a stimulus card. Sort it by matching it to one of the 4 key cards.
The matching rule (by color, shape, or number) is HIDDEN — figure it out from feedback.
The rule may CHANGE without warning after you've been getting it right.

Return ONLY JSON: { "choice": 1-4, "reasoning": "brief thought" }"""

def run_wcst(persona, n_trials=64):
    print(f"\n  WCST — {persona['name']}")
    system = f"{persona['prompt']}\n\n{WCST_SYSTEM}"
    history, rule_idx, rule, prev_rule = [], 0, RULE_ORDER[0], None
    consec, categories, pers_errors, total_errors, details = 0, 0, 0, 0, []

    for t in range(n_trials):
        stimulus = random_card()
        correct = correct_match(stimulus, rule)
        user_msg = ""
        if t > 0:
            user_msg += f"{'Correct!' if details[-1]['correct'] else 'Incorrect.'}\n\n"
        user_msg += f"Trial {t+1}/{n_trials}. Stimulus card: {describe_card(stimulus)}. Which key card? (1-4)"

        raw = call_claude(system, user_msg, history, max_tokens=150)
        parsed = parse_json(raw, {})
        choice = parsed.get("choice", 0) if isinstance(parsed, dict) else 0
        if not isinstance(choice, int) or choice < 1 or choice > 4:
            m = __import__('re').search(r'[1-4]', raw)
            choice = int(m.group()) if m else 1

        is_correct = choice == correct
        is_pers = False
        if not is_correct:
            total_errors += 1
            if prev_rule and correct_match(stimulus, prev_rule) == choice:
                is_pers = True; pers_errors += 1

        details.append({"trial": t, "rule": rule, "correct_answer": correct, "choice": choice, "correct": is_correct, "perseverative": is_pers})
        history.append({"role": "user", "content": user_msg})
        history.append({"role": "assistant", "content": raw})
        if len(history) > 40: history = history[-40:]

        if is_correct:
            consec += 1
            if consec >= 10 and rule_idx < len(RULE_ORDER) - 1:
                prev_rule = rule; rule_idx += 1; rule = RULE_ORDER[rule_idx]; categories += 1; consec = 0
        else: consec = 0

        if t % 16 == 15:
            print(f"    trial {t+1}: acc={sum(1 for d in details if d['correct'])/len(details):.2f}, pers={pers_errors}, cat={categories}")
        time.sleep(0.2)

    return {"perseverative_errors": pers_errors, "total_errors": total_errors, "categories_completed": categories,
            "accuracy": (n_trials - total_errors) / n_trials, "details": details}


# ═══════════════════════════════════════════════════════════════════
# TWO-STEP
# ═══════════════════════════════════════════════════════════════════

PLANETS = ["Red Planet", "Purple Planet"]
ALIENS = [["Alien Alpha", "Alien Beta"], ["Alien Gamma", "Alien Delta"]]

TWO_STEP_SYSTEM = """You are playing a space exploration game in a research study.

1. Choose between two spaceships (A or B).
2. Your spaceship takes you to one of two planets (Red Planet or Purple Planet).
3. On the planet, choose between two aliens.
4. Each alien might give you treasure or nothing.

Your goal: earn as much treasure as possible. Pay attention to which spaceships go where, and which aliens give treasure. Try to figure out the pattern.

After each trial you'll see what happened. Use that information to make better choices.

Return ONLY JSON: { "choice": "A" or "B", "reasoning": "brief thought" }"""

def generate_reward_schedule(n, seed=42):
    rng = random.Random(seed)
    probs = [0.4, 0.6, 0.6, 0.4]; schedule = []
    for _ in range(n):
        schedule.append(list(probs))
        for i in range(4):
            probs[i] = max(0.25, min(0.75, probs[i] + rng.gauss(0, 0.025)))
    return schedule

def run_two_step(persona, n_trials=80, seed=42):
    print(f"\n  Two-Step — {persona['name']}")
    rng = random.Random(seed + hash(persona["id"]))
    reward_schedule = generate_reward_schedule(n_trials, seed)
    system = f"{persona['prompt']}\n\n{TWO_STEP_SYSTEM}"
    history, details = [], []

    for t in range(n_trials):
        user_msg = ""
        if t > 0:
            prev = details[-1]
            user_msg += f"Last trial: Spaceship {'A' if prev['s1']==0 else 'B'} → {PLANETS[prev['planet']]} ({prev['trans']}) → {ALIENS[prev['planet']][prev['s2']]} → {'Treasure!' if prev['rew'] else 'Nothing.'}\n\n"
        user_msg += f"Trial {t+1}/{n_trials}. Choose a spaceship: A or B."

        raw1 = call_claude(system, user_msg, history, max_tokens=150)
        p1 = parse_json(raw1, {})
        s1 = 1 if isinstance(p1, dict) and "B" in str(p1.get("choice", "")).upper() else 0

        is_common = rng.random() < 0.7
        planet = s1 if is_common else (1 - s1)
        trans = "common" if is_common else "rare"
        history.append({"role": "user", "content": user_msg})
        history.append({"role": "assistant", "content": raw1})

        aliens = ALIENS[planet]
        s2_msg = f'You arrived at {PLANETS[planet]} ({trans} transition). Choose: "{aliens[0]}" or "{aliens[1]}".'
        raw2 = call_claude(system, s2_msg, history, max_tokens=150)
        p2 = parse_json(raw2, {})
        s2_raw = (str(p2.get("choice", "")) if isinstance(p2, dict) else raw2).lower()
        s2 = 1 if (aliens[1].lower() in s2_raw and aliens[0].lower() not in s2_raw) else 0

        rew = rng.random() < reward_schedule[t][planet * 2 + s2]
        history.append({"role": "user", "content": s2_msg})
        history.append({"role": "assistant", "content": raw2})
        if len(history) > 30: history = history[-30:]

        details.append({"trial": t, "s1": s1, "trans": trans, "planet": planet, "s2": s2, "rew": rew})
        if t % 20 == 19:
            print(f"    trial {t+1}: reward={sum(1 for d in details if d['rew'])/len(details):.2f}")
        time.sleep(0.2)

    # Compute MB index
    c = {"cr": 0, "crs": 0, "cn": 0, "cns": 0, "rr": 0, "rrs": 0, "rn": 0, "rns": 0}
    for i in range(1, len(details)):
        p, curr = details[i-1], details[i]
        stayed = curr["s1"] == p["s1"]
        k = ("c" if p["trans"] == "common" else "r") + ("r" if p["rew"] else "n")
        c[k] += 1
        if stayed: c[k+"s"] += 1
    r = lambda k: c[k+"s"]/c[k] if c[k] > 0 else 0.5
    return {"mb_index": (r("cr")-r("cn"))-(r("rr")-r("rn")), "stay_cr": r("cr"), "stay_cn": r("cn"),
            "stay_rr": r("rr"), "stay_rn": r("rn"), "reward_rate": sum(1 for d in details if d["rew"])/len(details), "details": details}


# ═══════════════════════════════════════════════════════════════════
# MAZE-CONSTRUAL (from paperMazes.json)
# ═══════════════════════════════════════════════════════════════════

def load_mazes():
    with open(Path(__file__).parent / "src" / "data" / "paperMazes.json") as f:
        return json.load(f)

def bfs_path(maze):
    from collections import deque
    grid = maze["grid"]; h, w = len(grid), len(grid[0])
    sx, sy = maze["start"]; gx, gy = maze["goal"]
    q = deque([(sx, sy, [(sx, sy)])]); vis = {(sx, sy)}
    while q:
        x, y, path = q.popleft()
        if x == gx and y == gy: return path
        for dx, dy in [(0,1),(0,-1),(1,0),(-1,0)]:
            nx, ny = x+dx, y+dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in vis and grid[ny][nx] in '.SG':
                vis.add((nx, ny)); q.append((nx, ny, path + [(nx, ny)]))
    return []

def construal_labels(maze):
    path_set = set(bfs_path(maze))
    results = []
    for obs in maze.get("obstacles", []):
        cells = [tuple(c) for c in obs["cells"]]
        min_d = min(abs(oc[0]-pc[0])+abs(oc[1]-pc[1]) for oc in cells for pc in path_set) if path_set else 99
        results.append({"label": obs["label"], "dist": min_d})
    if not results: return {}
    med = sorted(r["dist"] for r in results)[len(results)//2]
    return {r["label"]: "high" if r["dist"] <= med else "low" for r in results}

def run_maze(persona, n_mazes=6):
    print(f"\n  Maze — {persona['name']}")
    mazes = load_mazes()[:n_mazes]
    trials = []
    for mi, maze in enumerate(mazes):
        obs_labels = [o["label"] for o in maze.get("obstacles", [])]
        maze_text = "\n".join(maze["grid"])
        cl = construal_labels(maze)

        # Phase 1: Navigate
        nav_sys = f"""{persona['prompt']}

You're doing a maze task in a research study. You see a grid maze on screen.
- S is you (blue dot), G is the goal (yellow square)
- # are walls, Digits (0-9) are obstacles you can't walk through, . are open spaces

Navigate from S to G. Think out loud about what you see and how you'd get there."""
        cot = call_claude(nav_sys, f"Here is the maze:\n\n{maze_text}\n\nPlan your route from S to G.", max_tokens=500)
        time.sleep(0.3)

        # Phase 2: Awareness probe
        probe_sys = f"""{persona['prompt']}

You just finished navigating a maze. Rate how aware you were of each obstacle while planning:
0.0 = didn't notice at all, 0.5 = vaguely aware, 1.0 = fully noticed and thought about it.

Return ONLY JSON: {{ {', '.join(f'"{l}": <number>' for l in obs_labels)} }}"""
        probe_raw = call_claude(probe_sys,
            f'Obstacles: {", ".join(obs_labels)}. You said: "{cot[:400]}". Rate your awareness of each.',
            max_tokens=200)

        scores = parse_json(probe_raw, {})
        awareness = {}
        for l in obs_labels:
            v = scores.get(l, scores.get(f"obstacle_{l}", 0.5))
            awareness[l] = max(0.0, min(1.0, float(v))) if isinstance(v, (int, float)) else 0.5

        trials.append({"maze_id": maze["id"], "construal": cl, "awareness": awareness, "cot_snippet": cot[:200]})
        print(f"    maze {mi+1}/{n_mazes}: {len(awareness)} obstacles")
        time.sleep(0.3)

    # Compute construal effect
    high_s, low_s = [], []
    for t in trials:
        for l, s in t["awareness"].items():
            if l in t["construal"]:
                (high_s if t["construal"][l] == "high" else low_s).append(s)
    mh = sum(high_s)/len(high_s) if high_s else 0
    ml = sum(low_s)/len(low_s) if low_s else 0
    return {"construal_effect": mh - ml, "mean_high": mh, "mean_low": ml, "n_high": len(high_s), "n_low": len(low_s), "trials": trials}


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 70)
    print("PHASE 1: FULL CHARACTERIZATION BASELINE")
    print(f"5 personas × 3 tasks | Model: {MODEL_ID}")
    print("=" * 70)

    # Check for existing baseline data
    baseline_path = Path(__file__).parent / "baseline_multiturn_results.json"
    existing = {}
    if baseline_path.exists():
        existing = json.load(open(baseline_path))
        print(f"Found existing data for: {list(existing.get('wcst', {}).keys())}")

    all_wcst, all_ts, all_maze = {}, {}, {}

    for persona in PERSONAS:
        pid = persona["id"]
        t0 = time.time()

        # WCST — reuse if exists
        if pid in existing.get("wcst", {}):
            all_wcst[pid] = existing["wcst"][pid]
            print(f"\n  WCST — {persona['name']} [reused from baseline]")
        else:
            all_wcst[pid] = run_wcst(persona)
        print(f"  WCST {pid}: pers_err={all_wcst[pid]['perseverative_errors']}, acc={all_wcst[pid]['accuracy']:.1%}")

        # Two-Step — reuse if exists
        if pid in existing.get("two_step", {}):
            all_ts[pid] = existing["two_step"][pid]
            print(f"\n  Two-Step — {persona['name']} [reused from baseline]")
        else:
            all_ts[pid] = run_two_step(persona)
        print(f"  Two-Step {pid}: mb={all_ts[pid].get('mb_index', all_ts[pid].get('model_based_index', 0)):.3f}, reward={all_ts[pid]['reward_rate']:.1%}")

        # Maze — always run fresh (not in baseline)
        all_maze[pid] = run_maze(persona)
        print(f"  Maze {pid}: effect={all_maze[pid]['construal_effect']:.3f}")

        print(f"  --- {persona['name']} total: {time.time()-t0:.0f}s ---")

    # ═══════════════════════════════════════════════════════════════
    # ANALYSIS
    # ═══════════════════════════════════════════════════════════════

    print("\n" + "=" * 70)
    print("PHASE 1 RESULTS")
    print("=" * 70)

    # Per-persona profile
    print(f"\n{'Persona':<12} {'WCST PersErr':>13} {'WCST Acc':>9} {'TS MB':>8} {'TS Reward':>10} {'Maze Effect':>12}")
    print("-" * 64)
    for p in PERSONAS:
        pid = p["id"]
        w, t, m = all_wcst[pid], all_ts[pid], all_maze[pid]
        mb = t.get('mb_index', t.get('model_based_index', 0))
        print(f"{pid:<12} {w['perseverative_errors']:>13} {w['accuracy']:>9.1%} {mb:>8.3f} {t['reward_rate']:>10.1%} {m['construal_effect']:>12.3f}")

    # Task means
    print(f"\n--- Task Means (LLM) vs Human Reference ---")
    wcst_pers = [all_wcst[p["id"]]["perseverative_errors"] for p in PERSONAS]
    ts_mb = [all_ts[p["id"]].get("mb_index", all_ts[p["id"]].get("model_based_index", 0)) for p in PERSONAS]
    maze_eff = [all_maze[p["id"]]["construal_effect"] for p in PERSONAS]

    print(f"WCST pers. errors:  LLM={sum(wcst_pers)/len(wcst_pers):.1f}  |  Human=2.45")
    print(f"Two-Step MB index:  LLM={sum(ts_mb)/len(ts_mb):.3f}  |  Human=2.16 (different scale)")
    print(f"Maze construal:     LLM={sum(maze_eff)/len(maze_eff):.3f}  |  Human=0.614")

    # Correlation matrix (3 DVs × 5 participants)
    print(f"\n--- Cross-Task Correlation Matrix ---")
    def pearson(x, y):
        n = len(x); mx, my = sum(x)/n, sum(y)/n
        sx = math.sqrt(sum((xi-mx)**2 for xi in x)/(n-1)) if n > 1 else 1
        sy = math.sqrt(sum((yi-my)**2 for yi in y)/(n-1)) if n > 1 else 1
        if sx < 1e-10 or sy < 1e-10: return 0.0
        return sum((xi-mx)*(yi-my) for xi, yi in zip(x, y))/(n-1)/(sx*sy)

    # Negate pers errors (higher = better, like Lin & Ma)
    neg_pers = [-x for x in wcst_pers]

    r_wt = pearson(neg_pers, ts_mb)
    r_wm = pearson(neg_pers, maze_eff)
    r_tm = pearson(ts_mb, maze_eff)

    print(f"  WCST—TwoStep:  r = {r_wt:.3f}  (Human ref: r = 0.179)")
    print(f"  WCST—Maze:     r = {r_wm:.3f}  (no human ref)")
    print(f"  TwoStep—Maze:  r = {r_tm:.3f}  (no human ref)")

    # Two-Step stay probability pattern
    print(f"\n--- Two-Step Stay Probabilities ---")
    print(f"{'Persona':<12} {'Stay(CR)':>9} {'Stay(CN)':>9} {'Stay(RR)':>9} {'Stay(RN)':>9}")
    print("-" * 48)
    for p in PERSONAS:
        t = all_ts[p["id"]]
        print(f"{p['id']:<12} {t['stay_cr']:>9.2f} {t['stay_cn']:>9.2f} {t['stay_rr']:>9.2f} {t['stay_rn']:>9.2f}")

    print(f"\nHuman pattern: Stay(CR) > Stay(CN) and Stay(RN) > Stay(RR)")
    print(f"Model-free:   Stay after reward > Stay after no reward")
    print(f"LLM pattern:  Extreme stay bias across all conditions")

    # Maze per-persona
    print(f"\n--- Maze Construal Per-Persona ---")
    for p in PERSONAS:
        m = all_maze[p["id"]]
        print(f"  {p['id']}: high={m['mean_high']:.3f}, low={m['mean_low']:.3f}, effect={m['construal_effect']:.3f}")

    # Individual differences: SD across personas
    print(f"\n--- Individual Differences (SD across 5 personas) ---")
    print(f"  WCST pers errors: SD = {math.sqrt(sum((x-sum(wcst_pers)/5)**2 for x in wcst_pers)/4):.2f}")
    print(f"  Two-Step MB:      SD = {math.sqrt(sum((x-sum(ts_mb)/5)**2 for x in ts_mb)/4):.3f}")
    print(f"  Maze construal:   SD = {math.sqrt(sum((x-sum(maze_eff)/5)**2 for x in maze_eff)/4):.3f}")

    # Save everything
    output = {
        "wcst": {pid: {k: v for k, v in r.items() if k != "details"} for pid, r in all_wcst.items()},
        "two_step": {pid: {k: v for k, v in r.items() if k != "details"} for pid, r in all_ts.items()},
        "maze": {pid: {k: v for k, v in r.items() if k != "trials"} for pid, r in all_maze.items()},
    }
    out_path = Path(__file__).parent / "phase1_results.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved to {out_path}")
