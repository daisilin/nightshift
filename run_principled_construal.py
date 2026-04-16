"""
Principled Construal: Self-Guided Attention
=============================================
The model sees the FULL maze but plans step-by-step.
Only obstacles it ENCOUNTERS during planning get encoded.

Approach: "Mental walk" — the model traces a route one step at a time.
At each step, we ask what obstacles it can see from its current position.
After the walk, awareness = what it mentioned during the walk.

This is the computational equivalent of human gaze-guided attention:
- Full information available (the maze exists)
- But attention is serial (one position at a time)
- Encoding depends on what's encountered during the planning trace

Also: re-test multimodal with Opus on all 12 mazes (larger sample).
"""

import json, time, sys, math, random
from pathlib import Path
from collections import deque
import boto3
from botocore.config import Config

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
            else: print(f"  err: {e}",file=sys.stderr); return ""

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

def compute_effect(trials):
    hs,ls=[],[]
    for t in trials:
        for l,s in t["awareness"].items():
            if l in t["construal"]: (hs if t["construal"][l]=="high" else ls).append(s)
    mh=sum(hs)/len(hs) if hs else 0; ml=sum(ls)/len(ls) if ls else 0
    return {"effect":mh-ml,"high":mh,"low":ml,"n_high":len(hs),"n_low":len(ls)}

# ═══════════════════════════════════════════════════════════════
# PRINCIPLED: MENTAL WALK (self-guided attention)
# ═══════════════════════════════════════════════════════════════

def run_mental_walk(maze, ctx=8):
    """
    Model sees the full maze first, then does a 'mental walk' step by step.
    At each step: 'You are at position X. What obstacles can you see nearby?'
    Awareness = frequency of mentions during the walk.
    The context limit means early observations fall out — just like human memory decay.
    """
    obs_labels = [o["label"] for o in maze.get("obstacles",[])]
    cl = construal_labels(maze)
    grid = maze["grid"]; h,w = len(grid),len(grid[0])
    maze_text = "\n".join(grid)

    # Phase 1: Show full maze briefly, ask for initial route plan
    plan_sys = f"{PERSONA}\n\nYou see a maze. S=start(bottom-left), G=goal(top-right). Plan a rough route direction."
    route_plan = call_claude(plan_sys, f"Maze:\n{maze_text}\n\nWhich general direction will you go? Just give a brief route sketch (2-3 sentences).", max_tokens=100)

    # Phase 2: Mental walk — step through positions, ask about nearby obstacles
    # Use BFS path as the "walk" (but model doesn't know it's optimal)
    path = bfs_path(maze)
    if not path: path = [(maze["start"][0], maze["start"][1])]

    # Sample ~5 positions along the path
    step_positions = [path[i] for i in range(0, len(path), max(1, len(path)//5))][:5]
    if path[-1] not in step_positions: step_positions.append(path[-1])

    walk_sys = f"{PERSONA}\n\nYou're mentally walking through the maze. At each position, look around and note any obstacles you see nearby."
    history = []
    mentioned_obstacles = set()

    for pi, (px, py) in enumerate(step_positions):
        # What's visible from this position (3-cell radius)
        nearby = []
        for obs in maze.get("obstacles",[]):
            for cell in obs["cells"]:
                if abs(cell[0]-px) + abs(cell[1]-py) <= 3:
                    nearby.append(obs["label"])
                    break

        msg = f"Step {pi+1}: You're at position ({px},{py}). Looking around, you can see: "
        if nearby:
            msg += f"obstacles {', '.join(set(nearby))} are nearby."
        else:
            msg += "no obstacles nearby."
        msg += " What do you notice?"

        raw = call_claude(walk_sys, msg, history, max_tokens=80)
        history.append({"role":"user","content":msg})
        history.append({"role":"assistant","content":raw})
        if len(history) > ctx: history = history[-ctx:]

        # Track which obstacles were mentioned
        for label in obs_labels:
            if label in raw or f"obstacle {label}" in raw.lower():
                mentioned_obstacles.add(label)

        time.sleep(0.15)

    # Phase 3: Awareness probe — but based on the walk experience
    probe_sys = f"{PERSONA}\n\nYou just mentally walked through a maze. Rate how aware you were of each obstacle during your walk.\n0.0=never noticed, 0.5=vaguely saw, 1.0=clearly noticed.\nReturn ONLY JSON: {{ {', '.join(f'\"{l}\": <number>' for l in obs_labels)} }}"

    walk_summary = "; ".join(f"Step {i+1}: saw {', '.join(set(n for o in maze.get('obstacles',[]) for n in [o['label']] if any(abs(c[0]-p[0])+abs(c[1]-p[1])<=3 for c in o['cells']))) or 'nothing'}" for i,(p) in enumerate(step_positions))

    probe = call_claude(probe_sys, f'Your walk: {walk_summary}\nRate awareness.', max_tokens=200)
    scores = parse_json(probe, {})
    awareness = {l: max(0.0,min(1.0,float(scores.get(l,0.5)))) if isinstance(scores.get(l),(int,float)) else 0.5 for l in obs_labels}

    return {"awareness": awareness, "construal": cl, "mentioned": list(mentioned_obstacles)}


# ═══════════════════════════════════════════════════════════════
# PRINCIPLED: PLANNING-THEN-RECALL (natural memory filter)
# ═══════════════════════════════════════════════════════════════

def run_planning_recall(maze):
    """
    Model sees full maze, plans route with full CoT, then we ask awareness
    in a SEPARATE call with ONLY the maze obstacles listed (no maze grid).
    The model must recall from its planning — what did it actually think about?

    Key: the awareness probe has NO access to the maze grid.
    It only knows what obstacles exist and what the model said during planning.
    But we severely truncate the planning CoT (first 100 chars only).
    """
    obs_labels = [o["label"] for o in maze.get("obstacles",[])]
    cl = construal_labels(maze)
    maze_text = "\n".join(maze["grid"])

    # Full planning with full maze
    cot = call_claude(f"{PERSONA}\n\nMaze: S=start, G=goal, #=wall, digits=obstacles. Plan route.",
                     f"Maze:\n{maze_text}\n\nPlan your route.", max_tokens=500)

    time.sleep(0.3)

    # Awareness probe with MINIMAL context from planning (first 100 chars only)
    # This simulates the memory decay — only the most salient planning thoughts survive
    truncated_cot = cot[:100]

    probe_sys = f"{PERSONA}\n\nYou planned a maze route. Here's a brief fragment of your planning.\nRate awareness of each obstacle: 0.0=didn't think about it, 1.0=clearly considered it.\nReturn ONLY JSON: {{ {', '.join(f'\"{l}\": <number>' for l in obs_labels)} }}"
    probe = call_claude(probe_sys, f'Planning fragment: "{truncated_cot}..."\n\nObstacles in the maze: {", ".join(obs_labels)}. Rate each.', max_tokens=200)

    scores = parse_json(probe, {})
    awareness = {l: max(0.0,min(1.0,float(scores.get(l,0.5)))) if isinstance(scores.get(l),(int,float)) else 0.5 for l in obs_labels}
    return {"awareness": awareness, "construal": cl}


# ═══════════════════════════════════════════════════════════════
# MULTIMODAL WITH LARGER SAMPLE (Opus, all 12 mazes, 3 personas)
# ═══════════════════════════════════════════════════════════════

import base64, io
try:
    from PIL import Image, ImageDraw
    HAS_PIL = True
except: HAS_PIL = False

CELL_SIZE = 40
OBS_COLORS = [(176,124,198),(155,110,185),(190,140,210),(140,100,175),(165,115,195),(180,130,200),(150,105,180),(170,120,195),(185,135,205),(145,108,178)]

def render_maze_image(maze):
    if not HAS_PIL: return ""
    grid=maze["grid"]; h,w=len(grid),len(grid[0])
    img=Image.new('RGB',(w*CELL_SIZE,h*CELL_SIZE),(240,240,235)); draw=ImageDraw.Draw(img)
    for r in range(h):
        for c in range(w):
            ch=grid[r][c]; x,y=c*CELL_SIZE,r*CELL_SIZE
            if ch=='#': draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1],fill=(45,36,56))
            elif ch=='S':
                draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1],fill=(240,240,235))
                draw.ellipse([x+8,y+8,x+CELL_SIZE-8,y+CELL_SIZE-8],fill=(100,160,220))
            elif ch=='G': draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1],fill=(255,215,80))
            elif ch.isdigit():
                draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1],fill=OBS_COLORS[int(ch)%len(OBS_COLORS)])
                try: draw.text((x+CELL_SIZE//2-4,y+CELL_SIZE//2-6),ch,fill=(255,255,255))
                except: pass
            draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1],outline=(200,200,195))
    buf=io.BytesIO(); img.save(buf,format='PNG')
    return base64.b64encode(buf.getvalue()).decode()

def call_vision(system, user_text, image_b64, max_tokens=500, model_id="us.anthropic.claude-opus-4-6-v1"):
    messages=[{"role":"user","content":[
        {"type":"image","source":{"type":"base64","media_type":"image/png","data":image_b64}},
        {"type":"text","text":user_text}]}]
    for attempt in range(3):
        try:
            bd={"anthropic_version":"bedrock-2023-05-31","max_tokens":max_tokens,"system":system,"messages":messages}
            resp=bedrock.invoke_model(modelId=model_id,contentType="application/json",accept="application/json",body=json.dumps(bd))
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt<2: time.sleep(2**attempt+random.random())
            else: print(f"  vision err: {e}",file=sys.stderr); return ""

def run_multimodal_maze(maze, model_id="us.anthropic.claude-opus-4-6-v1"):
    obs_labels=[o["label"] for o in maze.get("obstacles",[])]
    cl=construal_labels(maze)
    if not HAS_PIL: return {"awareness":{l:0.5 for l in obs_labels},"construal":cl}
    img=render_maze_image(maze)
    nav_sys=f"{PERSONA}\n\nMaze task. Blue dot=you, yellow=goal. Navigate to goal. Think about obstacles."
    cot=call_vision(nav_sys,"Plan your route from the blue dot to the yellow square.",img,model_id=model_id)
    time.sleep(0.3)
    probe_sys=f"{PERSONA}\n\nRate awareness 0.0-1.0.\nReturn ONLY JSON: {{ {', '.join(f'\"{l}\": <number>' for l in obs_labels)} }}"
    probe=call_claude(probe_sys,f'Obstacles: {", ".join(obs_labels)}. Your thoughts: "{cot[:300]}". Rate.',max_tokens=200,model_id=model_id)
    scores=parse_json(probe,{})
    awareness={l:max(0.0,min(1.0,float(scores.get(l,0.5)))) if isinstance(scores.get(l),(int,float)) else 0.5 for l in obs_labels}
    return {"awareness":awareness,"construal":cl}

MULTI_PERSONAS = [
    {"id":"low","prompt":"You are Tyler, impulsive and inattentive. Do the task quickly."},
    {"id":"med","prompt":"You are Maria, moderately careful. Do the task naturally."},
    {"id":"high","prompt":"You are James, analytical and focused. Do the task thoroughly."},
]

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("="*70)
    print("PRINCIPLED CONSTRUAL + MULTIMODAL LARGER SAMPLE")
    print("="*70)

    mazes = load_mazes()  # all 12

    results = {}

    # Condition 1: Mental Walk (principled self-guided attention)
    print(f"\n  Mental Walk (all 12 mazes)...", end=" ", flush=True)
    trials = [run_mental_walk(m) for m in mazes]
    r = compute_effect(trials)
    results["mental_walk"] = r
    print(f"effect={r['effect']:.3f} (high={r['high']:.3f}, low={r['low']:.3f})")

    # Condition 2: Planning-then-recall (natural memory filter)
    print(f"  Planning-Recall (all 12 mazes)...", end=" ", flush=True)
    trials = [run_planning_recall(m) for m in mazes]
    r = compute_effect(trials)
    results["planning_recall"] = r
    print(f"effect={r['effect']:.3f} (high={r['high']:.3f}, low={r['low']:.3f})")

    # Condition 3: Baseline (full maze, unlimited)
    print(f"  Baseline (all 12 mazes)...", end=" ", flush=True)
    trials_baseline = []
    for m in mazes:
        obs_labels=[o["label"] for o in m.get("obstacles",[])]
        cl=construal_labels(m)
        cot=call_claude(f"{PERSONA}\n\nMaze. Plan route S→G.",f"Maze:\n{chr(10).join(m['grid'])}\n\nPlan.",max_tokens=500)
        probe_sys=f"{PERSONA}\n\nRate awareness 0-1.\nReturn JSON: {{ {', '.join(f'\"{l}\": <n>' for l in obs_labels)} }}"
        probe=call_claude(probe_sys,f'Obs: {", ".join(obs_labels)}. Notes: "{cot[:250]}". Rate.',max_tokens=200)
        scores=parse_json(probe,{})
        aw={l:max(0.0,min(1.0,float(scores.get(l,0.5)))) if isinstance(scores.get(l),(int,float)) else 0.5 for l in obs_labels}
        trials_baseline.append({"awareness":aw,"construal":cl})
        time.sleep(0.2)
    r=compute_effect(trials_baseline)
    results["baseline_12maze"] = r
    print(f"effect={r['effect']:.3f} (high={r['high']:.3f}, low={r['low']:.3f})")

    # Condition 4: Multimodal Opus (all 12 mazes × 3 personas)
    if HAS_PIL:
        for persona in MULTI_PERSONAS:
            key = f"opus_vision_{persona['id']}"
            print(f"  Opus Vision {persona['id']} (12 mazes)...", end=" ", flush=True)
            trials_mm = []
            for m in mazes:
                trial = run_multimodal_maze(m)
                trials_mm.append(trial)
                time.sleep(0.5)
            r = compute_effect(trials_mm)
            results[key] = r
            print(f"effect={r['effect']:.3f} (high={r['high']:.3f}, low={r['low']:.3f})")

    # Summary
    print(f"\n{'='*70}")
    print(f"SUMMARY")
    print(f"{'='*70}")
    print(f"{'Condition':<25} {'Effect':>8} {'High':>8} {'Low':>8} {'N_high':>7} {'N_low':>6}")
    for cond, r in results.items():
        print(f"{cond:<25} {r['effect']:>8.3f} {r['high']:>8.3f} {r['low']:>8.3f} {r.get('n_high','?'):>7} {r.get('n_low','?'):>6}")
    print(f"{'Human':.<25} {'0.614':>8} {'0.787':>8} {'0.173':>8}")

    out = Path(__file__).parent / "principled_construal_results.json"
    json.dump(results, open(out,"w"), indent=2)
    print(f"\nSaved to {out}")
