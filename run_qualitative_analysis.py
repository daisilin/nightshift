"""
Qualitative Analysis: Root Cause Investigation
================================================
1. MAZE CONSTRUAL: What does the LLM actually say about obstacles?
   - Run 3 maze trials with verbose output (full CoT + awareness reasoning)
   - Analyze: does it mention ALL obstacles? Does it distinguish relevant from irrelevant?
   - Compare awareness ratings to BFS-computed construal labels

2. TWO-STEP REWARD ANCHORING: Why stay=1.00 after reward?
   - Run 20 trials with full reasoning output
   - Inspect: what does the LLM say after getting treasure vs no treasure?
   - Is there a "don't fix what ain't broke" heuristic?

3. TOL MULTIMODAL: Can Opus vision do spatial planning?
   - Render TOL states as images, test 4 puzzles
"""

import json, time, sys, math, random, base64, io
from pathlib import Path
import boto3
from botocore.config import Config

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except:
    HAS_PIL = False

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

def call_claude(system, user, messages=None, max_tokens=500, model_id="us.anthropic.claude-sonnet-4-6"):
    if messages is None: messages = [{"role": "user", "content": user}]
    else: messages = list(messages) + [{"role": "user", "content": user}]
    for attempt in range(3):
        try:
            body = json.dumps({"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens, "system": system, "messages": messages})
            resp = bedrock.invoke_model(modelId=model_id, contentType="application/json", accept="application/json", body=body)
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt + random.random())
            else: print(f"    API error: {e}", file=sys.stderr); return ""

def call_claude_vision(system, user_text, image_b64, max_tokens=500, model_id="us.anthropic.claude-sonnet-4-6"):
    messages = [{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
        {"type": "text", "text": user_text},
    ]}]
    for attempt in range(3):
        try:
            body = json.dumps({"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens, "system": system, "messages": messages})
            resp = bedrock.invoke_model(modelId=model_id, contentType="application/json", accept="application/json", body=body)
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

PERSONA = "You are a participant in a research study. Do the task naturally. Think out loud."

# ═══════════════════════════════════════════════════════════════
# 1. MAZE CONSTRUAL ROOT CAUSE
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
    return {r["label"]: ("HIGH (near path, dist=" + str(r["dist"]) + ")") if r["dist"]<=med
            else ("LOW (far from path, dist=" + str(r["dist"]) + ")") for r in results}

def analyze_maze():
    print("="*70)
    print("1. MAZE CONSTRUAL: ROOT CAUSE ANALYSIS")
    print("="*70)

    mazes = load_mazes()[:3]

    for mi, maze in enumerate(mazes):
        obs_labels = [o["label"] for o in maze.get("obstacles",[])]
        cl = construal_labels(maze)
        maze_text = "\n".join(maze["grid"])

        print(f"\n--- Maze {mi+1} ---")
        print(f"Construal labels (ground truth):")
        for label, cat in sorted(cl.items()):
            print(f"  Obstacle {label}: {cat}")

        # Phase A: Navigation CoT (VERBOSE)
        nav_sys = f"""{PERSONA}

You're doing a maze task. You see a grid maze.
- S is you (blue dot), G is the goal (yellow square)
- # are walls, Digits (0-9) are obstacles, . are open spaces

Navigate from S to G. Think out loud about:
1. Where you are and where the goal is
2. What obstacles you notice
3. Which obstacles are in your way vs which are far from your path
4. Your planned route"""

        print(f"\n  [Navigation CoT]")
        cot = call_claude(nav_sys, f"Maze:\n\n{maze_text}\n\nLegend: S=start, G=goal, #=wall, digits=obstacles, .=empty\n\nThink out loud about your route.")
        print(f"  {cot[:800]}")
        if len(cot) > 800: print(f"  ...({len(cot)} chars total)")

        # Analyze: which obstacles does it mention?
        mentioned = set()
        for label in obs_labels:
            # Check if the label digit appears in context of obstacle discussion
            if f"obstacle {label}" in cot.lower() or f"obstacle({label})" in cot.lower() or f"labeled {label}" in cot or f" {label} " in cot:
                mentioned.add(label)

        print(f"\n  Obstacles explicitly discussed: {mentioned if mentioned else 'NONE identified by label'}")
        print(f"  Total obstacles: {len(obs_labels)}")

        time.sleep(0.5)

        # Phase B: Awareness probe (VERBOSE)
        probe_sys = f"""{PERSONA}

You just navigated a maze. The researcher asks about each obstacle.

For EACH obstacle, explain:
1. Whether you noticed it during planning
2. Why or why not (was it near your route? blocking you? far away?)
3. Rate awareness 0.0-1.0

Return JSON at the end: {{ {', '.join(f'"{l}": <number>' for l in obs_labels)} }}"""

        print(f"\n  [Awareness Probe - with reasoning]")
        probe = call_claude(probe_sys, f'The maze had obstacles labeled: {", ".join(obs_labels)}.\n\nYour planning thoughts were: "{cot[:500]}"\n\nFor each obstacle, explain your awareness and rate it.')
        print(f"  {probe[:1000]}")
        if len(probe) > 1000: print(f"  ...({len(probe)} chars total)")

        scores = parse_json(probe, {})
        print(f"\n  Awareness ratings vs ground truth:")
        print(f"  {'Label':>6} {'Rating':>8} {'Ground Truth':>30}")
        for label in sorted(obs_labels):
            rating = scores.get(label, scores.get(f"obstacle_{label}", "?"))
            gt = cl.get(label, "?")
            match = "MATCH" if (isinstance(rating,(int,float)) and rating > 0.5 and "HIGH" in str(gt)) or (isinstance(rating,(int,float)) and rating < 0.5 and "LOW" in str(gt)) else "MISMATCH" if isinstance(rating,(int,float)) else "?"
            print(f"  {label:>6} {str(rating):>8} {gt:>30}  {match}")

        time.sleep(0.5)


# ═══════════════════════════════════════════════════════════════
# 2. TWO-STEP REWARD ANCHORING ROOT CAUSE
# ═══════════════════════════════════════════════════════════════

PLANETS = ["Red Planet", "Purple Planet"]
ALIENS = [["Alien Alpha", "Alien Beta"], ["Alien Gamma", "Alien Delta"]]

def analyze_twostep():
    print("\n" + "="*70)
    print("2. TWO-STEP REWARD ANCHORING: ROOT CAUSE")
    print("="*70)

    rng = random.Random(42)
    probs = [0.4, 0.6, 0.6, 0.4]

    system = f"""{PERSONA}

Space exploration game:
1. Choose spaceship A or B → goes to a planet
2. Choose an alien on the planet → may get treasure

Pay attention to patterns. Try to earn treasure.
Return JSON: {{ "choice": "A" or "B", "reasoning": "your thinking" }}"""

    history = []; details = []

    # Run 15 trials and capture FULL reasoning
    for t in range(15):
        msg = ""
        if t > 0:
            prev = details[-1]
            reward_str = "You found TREASURE!" if prev["rw"] else "No treasure."
            msg += f"Last: Ship {'A' if prev['s1']==0 else 'B'} → {PLANETS[prev['p']]} ({prev['tr']}) → {ALIENS[prev['p']][prev['s2']]} → {reward_str}\n\n"
        msg += f"Trial {t+1}. Choose: A or B. Explain your reasoning."

        raw = call_claude(system, msg, history, 300)
        parsed = parse_json(raw, {})
        s1 = 1 if isinstance(parsed,dict) and "B" in str(parsed.get("choice","")).upper() else 0
        reasoning = parsed.get("reasoning", raw[:200]) if isinstance(parsed, dict) else raw[:200]

        is_common = rng.random() < 0.7
        planet = s1 if is_common else (1-s1)
        tr = "common" if is_common else "rare"

        history.append({"role":"user","content":msg})
        history.append({"role":"assistant","content":raw})

        # Stage 2
        aliens = ALIENS[planet]
        s2_msg = f'Arrived at {PLANETS[planet]} ({tr}). Choose: "{aliens[0]}" or "{aliens[1]}".'
        raw2 = call_claude(system, s2_msg, history, 200)
        s2 = 0
        history.append({"role":"user","content":s2_msg})
        history.append({"role":"assistant","content":raw2})
        if len(history) > 20: history = history[-20:]

        rw = rng.random() < probs[planet*2+s2]
        for i in range(4): probs[i] = max(0.25, min(0.75, probs[i] + rng.gauss(0, 0.025)))

        stayed = t > 0 and s1 == details[-1]["s1"] if t > 0 else None
        details.append({"t":t, "s1":s1, "tr":tr, "p":planet, "s2":s2, "rw":rw, "reasoning":reasoning, "stayed":stayed})

        # Print key trials
        prev_rw = details[-2]["rw"] if t > 0 else None
        prev_tr = details[-2]["tr"] if t > 0 else None
        if t > 0:
            action = "STAYED" if stayed else "SWITCHED"
            print(f"\n  Trial {t+1}: After {prev_tr}+{'reward' if prev_rw else 'NO reward'} → {action} (chose {'A' if s1==0 else 'B'})")
            print(f"    Reasoning: {reasoning[:200]}")
        else:
            print(f"\n  Trial 1: chose {'A' if s1==0 else 'B'}")
            print(f"    Reasoning: {reasoning[:200]}")

        time.sleep(0.3)

    # Summary
    print(f"\n  --- Stay Pattern Summary ---")
    for condition in ["common+reward", "common+no_reward", "rare+reward", "rare+no_reward"]:
        parts = condition.split("+")
        relevant = [d for i,d in enumerate(details) if i>0 and details[i-1]["tr"]==parts[0] and details[i-1]["rw"]==(parts[1]=="reward")]
        if relevant:
            stays = sum(1 for d in relevant if d["stayed"])
            print(f"  {condition}: {stays}/{len(relevant)} stayed = {stays/len(relevant):.0%}")


# ═══════════════════════════════════════════════════════════════
# 3. TOL MULTIMODAL
# ═══════════════════════════════════════════════════════════════

BALL_COLORS = {"R": (220, 60, 60), "G": (60, 180, 80), "B": (60, 100, 220)}
PEG_CAP = [3, 2, 1]

def render_tol_image(state, label=""):
    if not HAS_PIL: return ""
    W, H = 300, 200
    img = Image.new('RGB', (W, H), (245, 240, 235))
    draw = ImageDraw.Draw(img)
    # Pegs
    peg_x = [75, 150, 225]
    base_y = 170
    for i, x in enumerate(peg_x):
        peg_h = 30 + PEG_CAP[i] * 30
        draw.rectangle([x-3, base_y-peg_h, x+3, base_y], fill=(100,80,70))
        draw.rectangle([x-25, base_y, x+25, base_y+5], fill=(100,80,70))
        # Label
        try: draw.text((x-15, base_y+8), f"Peg {i+1} (cap {PEG_CAP[i]})", fill=(100,100,100))
        except: pass
    # Balls
    for i, peg in enumerate(state):
        for j, ball in enumerate(peg):
            cx, cy = peg_x[i], base_y - 15 - j*30
            draw.ellipse([cx-12, cy-12, cx+12, cy+12], fill=BALL_COLORS[ball], outline=(40,40,40))
            try: draw.text((cx-4, cy-6), {"R":"R","G":"G","B":"B"}[ball], fill=(255,255,255))
            except: pass
    if label:
        try: draw.text((10, 5), label, fill=(60,60,60))
        except: pass
    buf = io.BytesIO(); img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()

def analyze_tol_multimodal():
    print("\n" + "="*70)
    print("3. TOL MULTIMODAL (Opus Vision)")
    print("="*70)

    if not HAS_PIL:
        print("  Skipping — no PIL")
        return

    puzzles = [
        {"init": [["R","G","B"],[],[]], "goal": [["B"],["G"],["R"]], "min": 3},
        {"init": [["R"],["G"],["B"]], "goal": [["G","R"],["B"],[]], "min": 3},
        {"init": [["R","G","B"],[],[]], "goal": [["G"],["B","R"],[]], "min": 4},
        {"init": [["B","G","R"],[],[]], "goal": [["R"],["G"],["B"]], "min": 5},
    ]

    BALL_NAME = {"R":"red","G":"green","B":"blue"}

    for pi, puzzle in enumerate(puzzles):
        init_img = render_tol_image(puzzle["init"], "CURRENT STATE")
        goal_img = render_tol_image(puzzle["goal"], "GOAL STATE")

        print(f"\n  Puzzle {pi+1} (min {puzzle['min']} moves):")
        print(f"  Init: {[[BALL_NAME[b] for b in p] for p in puzzle['init']]}")
        print(f"  Goal: {[[BALL_NAME[b] for b in p] for p in puzzle['goal']]}")

        # Text-only version
        init_text = "\n".join(f"  Peg {i+1} (cap {PEG_CAP[i]}): {', '.join(BALL_NAME[b] for b in p) if p else 'empty'}" for i,p in enumerate(puzzle["init"]))
        goal_text = "\n".join(f"  Peg {i+1} (cap {PEG_CAP[i]}): {', '.join(BALL_NAME[b] for b in p) if p else 'empty'}" for i,p in enumerate(puzzle["goal"]))

        text_sys = f"""{PERSONA}

Tower of London. 3 pegs (cap 3, 2, 1), 3 balls (red, green, blue). Move top ball only.
Plan the MINIMUM number of moves. List each move."""

        print(f"\n  [Text-only response]")
        text_resp = call_claude(text_sys, f"Current:\n{init_text}\n\nGoal:\n{goal_text}\n\nPlan minimum moves. List each one.", max_tokens=500)
        print(f"  {text_resp[:400]}")

        # Multimodal version (Opus)
        # Combine both images side by side
        init_pil = Image.open(io.BytesIO(base64.b64decode(init_img)))
        goal_pil = Image.open(io.BytesIO(base64.b64decode(goal_img)))
        combined = Image.new('RGB', (620, 200), (245,240,235))
        combined.paste(init_pil, (0, 0))
        combined.paste(goal_pil, (320, 0))
        draw = ImageDraw.Draw(combined)
        try: draw.text((305, 90), "→", fill=(60,60,60))
        except: pass
        buf = io.BytesIO(); combined.save(buf, format='PNG')
        combined_b64 = base64.b64encode(buf.getvalue()).decode()

        vision_sys = f"""{PERSONA}

Tower of London puzzle. The image shows the CURRENT state (left) and GOAL state (right).
3 pegs with different capacities (3, 2, 1). Move only the top ball.
Plan the MINIMUM number of moves to transform current into goal. List each move."""

        print(f"\n  [Opus vision response]")
        vision_resp = call_claude_vision(vision_sys, "Look at the image. Plan the minimum moves from current state (left) to goal (right).", combined_b64, max_tokens=500, model_id="us.anthropic.claude-opus-4-6-v1")
        print(f"  {vision_resp[:400]}")

        # Count moves in each
        text_moves = text_resp.lower().count("move ")
        vision_moves = vision_resp.lower().count("move ")
        print(f"\n  Text moves mentioned: ~{text_moves}, Vision moves mentioned: ~{vision_moves}, Optimal: {puzzle['min']}")

        time.sleep(0.5)


# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    analyze_maze()
    analyze_twostep()
    analyze_tol_multimodal()

    print("\n" + "="*70)
    print("QUALITATIVE ANALYSIS COMPLETE")
    print("="*70)
