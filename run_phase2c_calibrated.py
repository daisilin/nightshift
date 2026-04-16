"""
Phase 2c: Persona-Calibrated Structural Parameters
====================================================
KEY IDEA: Identity-driven ARCHITECTURE, not just identity-driven prompting.
Each persona gets structural parameters matched to their cognitive profile:
  - Context window → working memory capacity (from persona traits)
  - Temperature → cognitive noise / exploration (from persona tempo)
  - Model tier → capability ceiling (optional future axis)

Also retests multimodal with Opus (stronger vision model).

This is the "close the gap" experiment:
if personas get BOTH the right instructions AND the right brain,
do we get human-like individual differences and factor structure?
"""

import json, time, sys, math, random, base64, io
from pathlib import Path
import boto3
from botocore.config import Config

try:
    from PIL import Image, ImageDraw
    HAS_PIL = True
except:
    HAS_PIL = False

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

# ─── Persona-Calibrated Parameters ───
# Each persona maps identity traits → structural parameters
PERSONAS = [
    {
        "id": "emma", "name": "Emma, 19, impulsive psych student",
        "ctx": 8,        # low WM: distracted, checks phone, impulsive
        "temp": 0.95,    # high noise: goes with gut, inconsistent (Bedrock max=1.0)
        "prompt": "You are Emma, a 19-year-old psychology sophomore at a large Midwestern state university. You're doing this study for course credit. You've done 3 other psych studies this semester and are getting tired of them. You tend to check your phone between trials. You go with your gut and respond quickly — thinking too long feels uncomfortable. You're cooperative and tend to go along with what's asked. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
    {
        "id": "james", "name": "James, 22, focused CS senior",
        "ctx": 14,       # high WM: analytical, focused, high attention
        "temp": 0.4,     # low noise: reflective, consistent, systematic
        "prompt": "You are James, a 22-year-old computer science senior at a private East Coast university. You enjoy puzzles and competitive games. You're an analytical thinker who looks for patterns and optimal strategies. You think things through carefully before responding — you'd rather be slow and right than fast and wrong. You can focus deeply on a task even when there are distractions. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
    {
        "id": "dorothy", "name": "Dorothy, 71, careful retired teacher",
        "ctx": 10,       # moderate WM: careful compensates for age decline
        "temp": 0.6,     # moderate-low noise: deliberate, but slower processing
        "prompt": "You are Dorothy, a 71-year-old retired high school teacher from Vermont. You read everything twice — a habit from 35 years of grading papers. You're not comfortable with computers; your grandson helped set you up. You process information more slowly than you used to but compensate by being very deliberate. You get tired after about 20 minutes of sustained concentration. You tend to agree with statements rather than disagree. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
    {
        "id": "tyler", "name": "Tyler, 28, inattentive gig worker",
        "ctx": 6,        # very low WM: speedrunner, doesn't read instructions, tired
        "temp": 1.0,     # max noise: impulsive, random, satisficing (Bedrock max=1.0)
        "prompt": "You are Tyler, a 28-year-old delivery driver from Florida who does online surveys on your phone during breaks. You do surveys mainly for the pay. You've been flagged for speeding through tasks before. You don't read long instructions carefully, just get the gist and start clicking. You're currently on a 15-minute break between deliveries. You're tired and want to get through this quickly. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
    {
        "id": "priya", "name": "Priya, 25, high-WM PhD student",
        "ctx": 16,       # very high WM: systematic, excellent memory
        "temp": 0.3,     # very low noise: precise, methodical, consistent
        "prompt": "You are Priya, a 25-year-old PhD student in computer science at MIT. You're analytically strong with excellent working memory. You approach tasks systematically and enjoy optimization problems. You're participating because you find cognitive experiments interesting. You tend to think things through carefully and look for the underlying structure of tasks. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."
    },
]

def call_claude(system, user, messages=None, max_tokens=300, temp=1.0, model_id=None):
    if model_id is None:
        model_id = "us.anthropic.claude-sonnet-4-6"
    if messages is None: messages = [{"role": "user", "content": user}]
    else: messages = list(messages) + [{"role": "user", "content": user}]
    for attempt in range(3):
        try:
            body_dict = {"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens,
                        "system": system, "messages": messages}
            if temp != 1.0:
                body_dict["temperature"] = temp
            body = json.dumps(body_dict)
            resp = bedrock.invoke_model(modelId=model_id, contentType="application/json", accept="application/json", body=body)
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt + random.random())
            else: print(f"    API error: {e}", file=sys.stderr); return ""

def call_claude_vision(system, user_text, image_b64, max_tokens=500, temp=1.0, model_id=None):
    if model_id is None:
        model_id = "us.anthropic.claude-sonnet-4-6"
    messages = [{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
        {"type": "text", "text": user_text},
    ]}]
    for attempt in range(3):
        try:
            body_dict = {"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens,
                        "system": system, "messages": messages}
            if temp != 1.0:
                body_dict["temperature"] = temp
            body = json.dumps(body_dict)
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

# ═══════════════════════════════════════════════════════════════
# WCST (32 trials, persona-calibrated ctx + temp)
# ═══════════════════════════════════════════════════════════════

COLORS = ['red','green','yellow','blue']; SHAPES = ['triangle','star','cross','circle']
KEY_CARDS = [{"color":"red","shape":"triangle","number":1},{"color":"green","shape":"star","number":2},
             {"color":"yellow","shape":"cross","number":3},{"color":"blue","shape":"circle","number":4}]
RULE_ORDER = ['color','shape','number','color','shape','number']
def describe_card(c): return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number']>1 else ''}"
def random_card(): return {"color":random.choice(COLORS),"shape":random.choice(SHAPES),"number":random.randint(1,4)}
def correct_match(s, rule):
    for i,kc in enumerate(KEY_CARDS):
        if s[rule]==kc[rule]: return i+1
    return 1

WCST_SYS = "You are doing the Wisconsin Card Sorting Test.\n\nFour key cards: Card 1: 1 red triangle, Card 2: 2 green stars, Card 3: 3 yellow crosses, Card 4: 4 blue circles.\n\nSort stimulus cards by matching to a key card. Rule is HIDDEN. Figure it out from feedback. Rule may CHANGE.\n\nReturn ONLY JSON: { \"choice\": 1-4, \"reasoning\": \"brief\" }"

def run_wcst_calibrated(persona, n_trials=32):
    ctx, temp = persona["ctx"], persona["temp"]
    system = f"{persona['prompt']}\n\n{WCST_SYS}"
    history = []; rule_idx, rule, prev_rule = 0, RULE_ORDER[0], None
    consec, cats, pers, errs = 0, 0, 0, 0; details = []
    for t in range(n_trials):
        stim = random_card(); correct = correct_match(stim, rule)
        msg = ""
        if t > 0: msg += f"{'Correct!' if details[-1]['c'] else 'Incorrect.'}\n\n"
        msg += f"Trial {t+1}/{n_trials}. Stimulus: {describe_card(stim)}. Which key card? (1-4)"
        raw = call_claude(system, msg, history, 150, temp=temp)
        p = parse_json(raw, {}); ch = p.get("choice",0) if isinstance(p,dict) else 0
        if not isinstance(ch,int) or ch<1 or ch>4:
            m = __import__('re').search(r'[1-4]', raw); ch = int(m.group()) if m else random.randint(1,4)
        ic = ch == correct; ip = False
        if not ic:
            errs += 1
            if prev_rule and correct_match(stim, prev_rule) == ch: ip = True; pers += 1
        details.append({"t":t,"c":ic,"p":ip})
        history.append({"role":"user","content":msg}); history.append({"role":"assistant","content":raw})
        if len(history) > ctx: history = history[-ctx:]
        if ic:
            consec += 1
            if consec >= 10 and rule_idx < len(RULE_ORDER)-1:
                prev_rule = rule; rule_idx += 1; rule = RULE_ORDER[rule_idx]; cats += 1; consec = 0
        else: consec = 0
        time.sleep(0.15)
    return {"pers":pers, "errs":errs, "cats":cats, "acc":(n_trials-errs)/n_trials, "ctx":ctx, "temp":temp}

# ═══════════════════════════════════════════════════════════════
# CORSI (persona-calibrated ctx + temp)
# ═══════════════════════════════════════════════════════════════

BLOCK_LABELS = {1:"top-center",2:"top-right",3:"upper-left",4:"upper-right",5:"center",
                6:"center-right",7:"lower-left",8:"lower-right",9:"bottom-center"}

def run_corsi_calibrated(persona, seed=42):
    ctx, temp = persona["ctx"], persona["temp"]
    rng = random.Random(seed + hash(persona["id"]))
    system = f"{persona['prompt']}\n\nCorsi Block-Tapping. 9 blocks on screen. Blocks light up one at a time. Reproduce sequence in order.\nReturn ONLY JSON: {{ \"sequence\": [block numbers] }}"
    history = []; total_correct = 0; details = []
    for span in range(3, 10):
        fails = 0
        for t in range(2):
            seq = []
            for _ in range(span):
                b = rng.randint(1,9)
                while seq and b == seq[-1]: b = rng.randint(1,9)
                seq.append(b)
            history.append({"role":"user","content":f"Span {span}, trial {t+1}/2. Watch:"}); history.append({"role":"assistant","content":"Watching."})
            for si, b in enumerate(seq):
                msg = f"Block {b} ({BLOCK_LABELS[b]}) lights up."
                if si == span - 1:
                    msg += "\nSequence done. Reproduce in order."
                    raw = call_claude(system, msg, history, 150, temp=temp)
                    history.append({"role":"user","content":msg}); history.append({"role":"assistant","content":raw})
                else:
                    history.append({"role":"user","content":msg}); history.append({"role":"assistant","content":"..."})
                if len(history) > ctx: history = history[-ctx:]
                time.sleep(0.08)
            p = parse_json(history[-1]["content"], {})
            recalled = []
            if isinstance(p,dict) and "sequence" in p: recalled = [int(x) for x in p["sequence"] if str(x).isdigit()]
            else:
                nums = [int(x) for x in history[-1]["content"].split() if x.isdigit() and 1<=int(x)<=9]
                recalled = nums[:span]
            correct = recalled == seq
            if correct: total_correct += 1
            else: fails += 1
            details.append({"span":span,"correct":correct})
            time.sleep(0.1)
        if fails >= 2: break
    max_span = max((d["span"] for d in details if d["correct"]), default=2)
    return {"corsi_score": max_span * total_correct, "max_span": max_span, "total_correct": total_correct, "ctx":ctx, "temp":temp}

# ═══════════════════════════════════════════════════════════════
# TWO-STEP (persona-calibrated — abbreviated 40 trials)
# ═══════════════════════════════════════════════════════════════

PLANETS = ["Red Planet", "Purple Planet"]
ALIENS = [["Alien Alpha", "Alien Beta"], ["Alien Gamma", "Alien Delta"]]

def run_twostep_calibrated(persona, n_trials=40, seed=42):
    ctx, temp = persona["ctx"], persona["temp"]
    rng = random.Random(seed + hash(persona["id"]))
    system = f"""{persona['prompt']}

You are playing a space exploration game.
1. Choose between two spaceships (A or B).
2. Your spaceship takes you to one of two planets.
3. On the planet, choose between two aliens.
4. Each alien might give you treasure or nothing.

Your goal: earn as much treasure as possible. Pay attention to patterns.
Return ONLY JSON: {{ "choice": "A" or "B", "reasoning": "brief" }}"""

    # Drifting reward probs
    probs = [0.4, 0.6, 0.6, 0.4]
    history = []; details = []
    for t in range(n_trials):
        msg = ""
        if t > 0:
            prev = details[-1]
            msg += f"Last: Ship {'A' if prev['s1']==0 else 'B'} → {PLANETS[prev['p']]} ({prev['tr']}) → {ALIENS[prev['p']][prev['s2']]} → {'Treasure!' if prev['rw'] else 'Nothing.'}\n\n"
        msg += f"Trial {t+1}/{n_trials}. Choose: A or B."
        raw = call_claude(system, msg, history, 150, temp=temp)
        p = parse_json(raw, {}); s1 = 1 if isinstance(p,dict) and "B" in str(p.get("choice","")).upper() else 0
        is_common = rng.random() < 0.7; planet = s1 if is_common else (1-s1)
        history.append({"role":"user","content":msg}); history.append({"role":"assistant","content":raw})

        aliens = ALIENS[planet]
        s2_msg = f'Arrived at {PLANETS[planet]} ({"common" if is_common else "rare"}). Choose: "{aliens[0]}" or "{aliens[1]}".'
        raw2 = call_claude(system, s2_msg, history, 150, temp=temp)
        p2 = parse_json(raw2, {}); s2_raw = (str(p2.get("choice","")) if isinstance(p2,dict) else raw2).lower()
        s2 = 1 if (aliens[1].lower() in s2_raw and aliens[0].lower() not in s2_raw) else 0
        rw = rng.random() < probs[planet*2+s2]
        history.append({"role":"user","content":s2_msg}); history.append({"role":"assistant","content":raw2})
        if len(history) > ctx: history = history[-ctx:]
        # Drift
        for i in range(4): probs[i] = max(0.25, min(0.75, probs[i] + rng.gauss(0, 0.025)))
        details.append({"t":t,"s1":s1,"tr":"common" if is_common else "rare","p":planet,"s2":s2,"rw":rw})
        time.sleep(0.15)

    # MB index
    c = {"cr":0,"crs":0,"cn":0,"cns":0,"rr":0,"rrs":0,"rn":0,"rns":0}
    for i in range(1,len(details)):
        prev,curr = details[i-1],details[i]; stayed = curr["s1"]==prev["s1"]
        k = ("c" if prev["tr"]=="common" else "r")+("r" if prev["rw"] else "n"); c[k]+=1
        if stayed: c[k+"s"]+=1
    r = lambda k: c[k+"s"]/c[k] if c[k]>0 else 0.5
    mb = (r("cr")-r("cn"))-(r("rr")-r("rn"))
    stays = {k: r(k) for k in ["cr","cn","rr","rn"]}
    return {"mb":mb, "stays":stays, "reward":sum(1 for d in details if d["rw"])/len(details), "ctx":ctx, "temp":temp}

# ═══════════════════════════════════════════════════════════════
# MAZE — multimodal with OPUS (stronger vision)
# ═══════════════════════════════════════════════════════════════

CELL_SIZE = 40
OBSTACLE_COLORS = [(176,124,198),(155,110,185),(190,140,210),(140,100,175),(165,115,195),(180,130,200),(150,105,180),(170,120,195),(185,135,205),(145,108,178)]

def render_maze_image(maze):
    if not HAS_PIL: return ""
    grid = maze["grid"]; h, w = len(grid), len(grid[0])
    img = Image.new('RGB', (w*CELL_SIZE, h*CELL_SIZE), (240,240,235))
    draw = ImageDraw.Draw(img)
    for r in range(h):
        for c in range(w):
            ch = grid[r][c]; x, y = c*CELL_SIZE, r*CELL_SIZE
            if ch == '#': draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1], fill=(45,36,56))
            elif ch == 'S':
                draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1], fill=(240,240,235))
                draw.ellipse([x+8,y+8,x+CELL_SIZE-8,y+CELL_SIZE-8], fill=(100,160,220))
            elif ch == 'G': draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1], fill=(255,215,80))
            elif ch.isdigit():
                draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1], fill=OBSTACLE_COLORS[int(ch)%len(OBSTACLE_COLORS)])
                try: draw.text((x+CELL_SIZE//2-4, y+CELL_SIZE//2-6), ch, fill=(255,255,255))
                except: pass
            draw.rectangle([x,y,x+CELL_SIZE-1,y+CELL_SIZE-1], outline=(200,200,195))
    buf = io.BytesIO(); img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()

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

def run_maze_calibrated(persona, mode="text", n_mazes=6, model_id=None):
    temp = persona["temp"]
    mazes = load_mazes()[:n_mazes]; trials = []
    for mi, maze in enumerate(mazes):
        obs_labels = [o["label"] for o in maze.get("obstacles",[])]
        cl = construal_labels(maze)
        nav_sys = f"""{persona['prompt']}

You're doing a maze task in a research study. You see a grid maze.
- Blue dot (S) is you, Yellow square (G) is the goal
- Dark walls (#) block your path, Numbered colored shapes are obstacles
- Navigate from S to G. Think out loud about your route."""

        if mode == "multimodal" and HAS_PIL:
            img_b64 = render_maze_image(maze)
            cot = call_claude_vision(nav_sys, "Here is the maze. Plan your route from the blue dot (S) to the yellow square (G).", img_b64, temp=temp, model_id=model_id)
        else:
            maze_text = "\n".join(maze["grid"])
            cot = call_claude(nav_sys, f"Here is the maze:\n\n{maze_text}\n\nLegend: S=start, G=goal, #=wall, digits=obstacles, .=empty\nPlan your route.", temp=temp, model_id=model_id)

        time.sleep(0.3)
        probe_sys = f"""{persona['prompt']}

You just navigated a maze. Rate how aware you were of each obstacle while planning:
0.0 = didn't notice, 0.5 = vaguely aware, 1.0 = fully noticed.
Return ONLY JSON: {{ {', '.join(f'"{l}": <number>' for l in obs_labels)} }}"""

        probe_raw = call_claude(probe_sys, f'Obstacles: {", ".join(obs_labels)}. You said: "{cot[:400]}". Rate awareness.', max_tokens=200, temp=temp, model_id=model_id)
        scores = parse_json(probe_raw, {})
        awareness = {}
        for l in obs_labels:
            v = scores.get(l, scores.get(f"obstacle_{l}",0.5))
            awareness[l] = max(0.0,min(1.0,float(v))) if isinstance(v,(int,float)) else 0.5
        trials.append({"maze_id":maze["id"],"construal":cl,"awareness":awareness})
        time.sleep(0.3)

    high_s, low_s = [], []
    for t in trials:
        for l, s in t["awareness"].items():
            if l in t["construal"]: (high_s if t["construal"][l]=="high" else low_s).append(s)
    mh = sum(high_s)/len(high_s) if high_s else 0
    ml = sum(low_s)/len(low_s) if low_s else 0
    return {"effect":mh-ml, "high":mh, "low":ml, "mode":mode, "temp":temp}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("="*70)
    print("PHASE 2c: PERSONA-CALIBRATED STRUCTURAL PARAMETERS")
    print("Identity-driven architecture: each persona gets a different 'brain'")
    print("="*70)

    for p in PERSONAS:
        print(f"  {p['id']:>10}: ctx={p['ctx']:>2}, temp={p['temp']:.1f}")

    results = {"wcst":{}, "corsi":{}, "twostep":{}, "maze_text":{}, "maze_opus_vision":{}}

    for persona in PERSONAS:
        pid = persona["id"]
        t0 = time.time()

        print(f"\n  === {persona['name']} (ctx={persona['ctx']}, temp={persona['temp']}) ===")

        print(f"    WCST...", end=" ", flush=True)
        r = run_wcst_calibrated(persona)
        results["wcst"][pid] = r
        print(f"pers={r['pers']}, acc={r['acc']:.0%}")

        print(f"    Corsi...", end=" ", flush=True)
        r = run_corsi_calibrated(persona)
        results["corsi"][pid] = r
        print(f"span={r['max_span']}, score={r['corsi_score']}")

        print(f"    Two-Step (40t)...", end=" ", flush=True)
        r = run_twostep_calibrated(persona)
        results["twostep"][pid] = r
        print(f"mb={r['mb']:.3f}, reward={r['reward']:.0%}, stays=CR{r['stays']['cr']:.2f}/CN{r['stays']['cn']:.2f}/RR{r['stays']['rr']:.2f}/RN{r['stays']['rn']:.2f}")

        print(f"    Maze (text)...", end=" ", flush=True)
        r = run_maze_calibrated(persona, mode="text")
        results["maze_text"][pid] = r
        print(f"effect={r['effect']:.3f}")

        if HAS_PIL:
            print(f"    Maze (Opus vision)...", end=" ", flush=True)
            r = run_maze_calibrated(persona, mode="multimodal", model_id="us.anthropic.claude-opus-4-6-v1")
            results["maze_opus_vision"][pid] = r
            print(f"effect={r['effect']:.3f}")

        print(f"    done in {time.time()-t0:.0f}s")

    # ═══════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("PHASE 2c RESULTS: CALIBRATED vs UNCALIBRATED")
    print("="*70)

    # Load Phase 1 for comparison
    p1 = json.load(open(Path(__file__).parent / "phase1_full_results.json"))

    print(f"\n{'Persona':<10} {'Ctx':>4} {'Temp':>5} | {'WCST PE':>8} {'(P1)':>5} | {'Corsi':>6} {'(P1)':>5} | {'TS MB':>7} {'(P1)':>6} | {'Maze':>6} {'(P1)':>6}")
    print("-"*85)
    for persona in PERSONAS:
        pid = persona["id"]
        w = results["wcst"][pid]
        c = results["corsi"][pid]
        ts = results["twostep"][pid]
        m = results["maze_text"][pid]
        # Phase 1 values
        p1w = p1["wcst"].get(pid,{}).get("perseverative_errors", "?")
        p1c = p1.get("corsi",{}).get(pid,{}).get("corsi_score", 126)
        p1ts = p1["two_step"].get(pid,{}).get("mb_index", p1["two_step"].get(pid,{}).get("model_based_index", "?"))
        p1m = p1["maze"].get(pid,{}).get("construal_effect", "?")
        print(f"{pid:<10} {persona['ctx']:>4} {persona['temp']:>5.1f} | {w['pers']:>8} {p1w:>5} | {c['corsi_score']:>6} {p1c:>5} | {ts['mb']:>7.3f} {p1ts if isinstance(p1ts,str) else f'{p1ts:.3f}':>6} | {m['effect']:>6.3f} {p1m if isinstance(p1m,str) else f'{p1m:.3f}':>6}")

    # Individual differences
    print(f"\nIndividual Differences (SD across 5 personas):")
    wcst_vals = [results["wcst"][p["id"]]["pers"] for p in PERSONAS]
    corsi_vals = [results["corsi"][p["id"]]["corsi_score"] for p in PERSONAS]
    ts_vals = [results["twostep"][p["id"]]["mb"] for p in PERSONAS]
    maze_vals = [results["maze_text"][p["id"]]["effect"] for p in PERSONAS]
    for name, vals in [("WCST pers",wcst_vals),("Corsi score",corsi_vals),("Two-Step MB",ts_vals),("Maze effect",maze_vals)]:
        mean = sum(vals)/len(vals)
        sd = math.sqrt(sum((v-mean)**2 for v in vals)/max(1,len(vals)-1))
        print(f"  {name:>12}: mean={mean:.2f}, SD={sd:.2f}  (Phase 1 had {'zero' if name=='Corsi score' else 'low'} variance)")

    # Two-Step stay pattern
    print(f"\nTwo-Step Stay Probabilities (calibrated):")
    print(f"{'Persona':<10} {'Stay CR':>8} {'Stay CN':>8} {'Stay RR':>8} {'Stay RN':>8} {'MB':>7}")
    for p in PERSONAS:
        ts = results["twostep"][p["id"]]
        print(f"{p['id']:<10} {ts['stays']['cr']:>8.2f} {ts['stays']['cn']:>8.2f} {ts['stays']['rr']:>8.2f} {ts['stays']['rn']:>8.2f} {ts['mb']:>7.3f}")
    print(f"Human:     {'~0.75':>8} {'~0.60':>8} {'~0.60':>8} {'~0.70':>8} {'>0':>7}")

    # Multimodal comparison (Opus vision)
    if HAS_PIL:
        print(f"\nMaze Construal: Text (calibrated temp) vs Opus Vision:")
        print(f"{'Persona':<10} {'Text':>8} {'Opus Vis':>10}")
        for p in PERSONAS:
            t_e = results["maze_text"][p["id"]]["effect"]
            m_e = results["maze_opus_vision"].get(p["id"],{}).get("effect",0)
            print(f"{p['id']:<10} {t_e:>8.3f} {m_e:>10.3f}")

    out = Path(__file__).parent / "phase2c_results.json"
    json.dump(results, open(out,"w"), indent=2)
    print(f"\nSaved to {out}")
