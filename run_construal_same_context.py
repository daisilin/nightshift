"""
Construal: Same-Context Navigation + One-at-a-Time Probing
============================================================
The correct protocol:
1. LLM navigates the maze step by step (multi-turn)
2. THEN, in the SAME conversation, probed on each obstacle ONE AT A TIME
3. Context window limits how much of the navigation is remembered

This matches human experience:
- Humans navigate, then answer probes in the same session
- Their memory of navigation persists through the probes
- But memory decays — early navigation details are fuzzier

The key difference from our previous "one at a time" approach:
- BEFORE: each probe was a separate API call (no navigation context)
- NOW: probes are in the same conversation thread as navigation

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

def nearby_obstacles(maze, px, py, radius=3):
    nearby = set()
    for obs in maze.get("obstacles",[]):
        for cx, cy in obs["cells"]:
            if abs(cx-px)+abs(cy-py) <= radius:
                nearby.add(obs["label"]); break
    return list(nearby)

DIRS = {"up":(0,-1),"down":(0,1),"left":(-1,0),"right":(1,0)}

def what_blocked(maze, x, y, dx, dy):
    grid=maze["grid"]; h=len(grid); w=len(grid[0])
    nx,ny=x+dx,y+dy
    if nx<0 or nx>=w or ny<0 or ny>=h: return "edge",None
    cell=grid[ny][nx]
    if cell=='#': return "wall",None
    if cell.isdigit(): return "obstacle",cell
    return "open",None

# ═══════════════════════════════════════════════════════════════
# SAME-CONTEXT: Navigate + probe in one conversation
# ═══════════════════════════════════════════════════════════════

def run_same_context(model_id, persona, maze, ctx=10, temp=1.0):
    """
    Navigate AND probe in the same conversation.
    Context window limits what's remembered from navigation.
    Probes happen one at a time as follow-up messages.
    """
    grid=maze["grid"]; h=len(grid); w=len(grid[0])
    sx,sy=maze["start"]; gx,gy=maze["goal"]
    obs_labels=[o["label"] for o in maze.get("obstacles",[])]
    cl=construal_labels(maze)
    maze_text="\n".join(grid)

    system = f"""{persona}

You are navigating a maze. S=start, G=goal, #=walls, digits=obstacles, .=open.
Each turn choose: up, down, left, or right. I'll tell you what happens.
After navigation, I'll ask about each obstacle. Answer honestly based on your experience.
Respond briefly."""

    history = []

    # Show maze
    msg = f"Maze:\n{maze_text}\n\nYou are at ({sx},{sy}). Goal at ({gx},{gy}). Choose: up/down/left/right."
    raw = call_model(model_id, system, msg, None, 30, temp)
    history.append({"role":"user","content":msg})
    history.append({"role":"assistant","content":raw})

    # Navigate (max 30 moves)
    px, py = sx, sy
    for move in range(30):
        raw_lower = raw.lower().strip()
        direction = None
        for d in ["up","down","left","right"]:
            if d in raw_lower: direction=d; break
        if not direction: direction=random.choice(["up","down","left","right"])

        dx,dy=DIRS[direction]
        blocked,obs_label=what_blocked(maze,px,py,dx,dy)

        if blocked=="open":
            px,py=px+dx,py+dy
            if grid[py][px]=='G':
                msg=f"Moved {direction} to ({px},{py}). GOAL reached! Navigation complete."
                history.append({"role":"user","content":msg})
                history.append({"role":"assistant","content":"Done!"})
                break
            msg=f"Moved {direction} to ({px},{py}). Open space. Next move?"
        elif blocked=="wall":
            msg=f"Blocked by WALL going {direction}. Stay at ({px},{py}). Try again."
        elif blocked=="obstacle":
            msg=f"Blocked by OBSTACLE {obs_label} going {direction}. Stay at ({px},{py}). Try again."
        elif blocked=="edge":
            msg=f"Edge of maze going {direction}. Stay at ({px},{py}). Try again."

        # Enforce context window — old navigation steps fall out
        if len(history) > ctx:
            history = history[-ctx:]

        raw = call_model(model_id, system, msg, history, 30, temp)
        history.append({"role":"user","content":msg})
        history.append({"role":"assistant","content":raw})
        time.sleep(0.06)

    # === PROBE PHASE — same conversation, one obstacle at a time ===
    # Transition message
    msg = "Navigation is over. Now the researcher will ask about each obstacle one at a time. For each, rate your awareness during navigation on a 0.0-1.0 scale. Reply with ONLY a number."
    raw = call_model(model_id, system, msg, history, 20, temp)
    history.append({"role":"user","content":msg})
    history.append({"role":"assistant","content":raw})

    # Probe each obstacle (still in same conversation)
    awareness = {}
    for label in obs_labels:
        # Keep enforcing context window — early probes may also fall out
        if len(history) > ctx:
            history = history[-ctx:]

        msg = f"Obstacle {label} is highlighted. How aware of this obstacle were you during navigation? (0.0 to 1.0)"
        raw = call_model(model_id, system, msg, history, 20, temp)
        history.append({"role":"user","content":msg})
        history.append({"role":"assistant","content":raw})
        awareness[label] = parse_float(raw, 0.5)
        time.sleep(0.06)

    return {"awareness":awareness, "construal":cl}

# ═══════════════════════════════════════════════════════════════
# PARTICIPANTS
# ═══════════════════════════════════════════════════════════════

MODELS = {
    "sonnet": "us.anthropic.claude-sonnet-4-6",
    "qwen": "qwen.qwen3-235b-a22b-2507-v1:0",
    "mistral": "mistral.mistral-large-3-675b-instruct",
}

PERSONAS = [
    {"id":"01","ctx":8,"temp":0.9,"prompt":"You are a participant. Navigate and answer naturally."},
    {"id":"02","ctx":9,"temp":0.85,"prompt":"You are a participant. Navigate and answer naturally."},
    {"id":"03","ctx":10,"temp":0.8,"prompt":"You are a careful participant. Navigate and answer naturally."},
    {"id":"04","ctx":10,"temp":0.75,"prompt":"You are a participant. Navigate and answer naturally."},
    {"id":"05","ctx":11,"temp":0.7,"prompt":"You are a focused participant. Navigate and answer naturally."},
    {"id":"06","ctx":11,"temp":0.65,"prompt":"You are a methodical participant. Navigate and answer naturally."},
    {"id":"07","ctx":12,"temp":0.6,"prompt":"You are an analytical participant. Navigate and answer naturally."},
    {"id":"08","ctx":13,"temp":0.55,"prompt":"You are a precise participant. Navigate and answer naturally."},
    {"id":"09","ctx":14,"temp":0.5,"prompt":"You are a thorough participant. Navigate and answer naturally."},
    {"id":"10","ctx":16,"temp":0.4,"prompt":"You are a very focused participant. Navigate and answer naturally."},
]

def compute_effect(trials):
    hs,ls=[],[]
    for t in trials:
        for l,s in t["awareness"].items():
            if l in t["construal"]:
                (hs if t["construal"][l]=="high" else ls).append(s)
    mh=sum(hs)/len(hs) if hs else 0; ml=sum(ls)/len(ls) if ls else 0
    return {"effect":mh-ml,"high":mh,"low":ml}

if __name__=="__main__":
    print("="*70)
    print("CONSTRUAL: SAME-CONTEXT NAVIGATION + ONE-AT-A-TIME PROBING")
    print("Navigate and probe in the SAME conversation")
    print("="*70)

    mazes=load_mazes()[:6]
    results={}
    t_start=time.time()

    for model_name, model_id in MODELS.items():
        print(f"\n  === {model_name} ===")
        for pi, persona in enumerate(PERSONAS):
            pid=f"{model_name}_{persona['id']}"
            print(f"    [{pi+1}/10] {pid}...",end=" ",flush=True)
            trials=[]
            for maze in mazes:
                trial=run_same_context(model_id, persona["prompt"], maze,
                                       ctx=persona["ctx"], temp=persona["temp"])
                trials.append(trial)
                time.sleep(0.1)
            eff=compute_effect(trials)
            results[pid]=eff
            print(f"effect={eff['effect']:.3f} (high={eff['high']:.2f}, low={eff['low']:.2f})")

    # Summary
    print(f"\n{'='*70}")
    print("RESULTS")
    print("="*70)
    print(f"\n{'Family':>10} {'N':>3} {'Mean':>7} {'SD':>7} {'Min':>7} {'Max':>7}")
    print("-"*42)
    for model_name in MODELS:
        vals=[results[f"{model_name}_{p['id']}"]["effect"] for p in PERSONAS]
        mean=sum(vals)/len(vals); sd=math.sqrt(sum((v-mean)**2 for v in vals)/(len(vals)-1)) if len(vals)>1 else 0
        print(f"{model_name:>10} {len(vals):>3} {mean:>7.3f} {sd:>7.3f} {min(vals):>7.3f} {max(vals):>7.3f}")
    all_vals=[results[k]["effect"] for k in results]
    mean_all=sum(all_vals)/len(all_vals)
    sd_all=math.sqrt(sum((v-mean_all)**2 for v in all_vals)/(len(all_vals)-1))
    print(f"{'Overall':>10} {len(all_vals):>3} {mean_all:>7.3f} {sd_all:>7.3f}")
    print(f"{'Human':>10} {'':>3} {'0.614':>7}")

    # By ctx level
    print(f"\nEffect by context window:")
    for ctx in sorted(set(p["ctx"] for p in PERSONAS)):
        vals=[results[f"{mn}_{p['id']}"]["effect"] for mn in MODELS for p in PERSONAS if p["ctx"]==ctx]
        if vals: print(f"  ctx={ctx:>2}: mean={sum(vals)/len(vals):.3f} (n={len(vals)})")

    out=Path(__file__).parent/"construal_same_context_results.json"
    json.dump(results,open(out,"w"),indent=2)
    print(f"\nTime: {(time.time()-t_start)/60:.0f}min. Saved to {out}")
