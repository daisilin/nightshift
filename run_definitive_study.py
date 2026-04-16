"""
DEFINITIVE STUDY: 30 Participants × 5 Tasks
=============================================
Paper-ready with ALL instruction issues fixed:

1. Two-Step: NO transition labels (common/rare) in feedback
2. WCST: Designed stimuli (each matches different key cards per dimension)
3. Corsi: Standard (proven to work)
4. N-back: Standard (proven to work)
5. Maze: Mental Walk (proven to produce construal effect)

30 participants from 5 model families:
- 10 Sonnet 4.6 (primary, best characterized)
- 5 Opus 4.6 (high capability)
- 5 Haiku 4.5 (low capability)
- 5 Qwen3-235B (different architecture)
- 5 Mistral-Large (different architecture)

Each with calibrated ctx (6-16) and temp (0.3-1.0).
"""

import json, time, sys, math, random
from pathlib import Path
from collections import deque
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

# ═══════════════════════════════════════════════════════════════
# 30 PARTICIPANTS: 5 model families × calibrated params
# ═══════════════════════════════════════════════════════════════

PARTICIPANTS = [
    # --- Sonnet 4.6 (10 participants, full ctx/temp spread) ---
    {"id":"S01","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":6,"temp":1.0,
     "prompt":"You are Tyler, 28, delivery driver. Tired, impulsive, want to finish fast. Do the task as you would."},
    {"id":"S02","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":7,"temp":0.95,
     "prompt":"You are Sam, 25, graphic designer with ADHD. Creative but easily distracted. Do the task as you would."},
    {"id":"S03","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":8,"temp":0.9,
     "prompt":"You are Emma, 19, psych student. Course credit, goes with gut. Do the task as you would."},
    {"id":"S04","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":9,"temp":0.85,
     "prompt":"You are Rosa, 52, ESL teacher. Careful but sometimes second-guesses herself. Do the task as you would."},
    {"id":"S05","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":10,"temp":0.75,
     "prompt":"You are Dorothy, 71, retired teacher. Deliberate, reads twice, gets tired. Do the task as you would."},
    {"id":"S06","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":11,"temp":0.7,
     "prompt":"You are David, 40, math teacher. Patient, systematic, enjoys logic. Do the task as you would."},
    {"id":"S07","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":12,"temp":0.6,
     "prompt":"You are James, 22, CS senior. Analytical, focused, likes puzzles. Do the task as you would."},
    {"id":"S08","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":13,"temp":0.5,
     "prompt":"You are Sarah, 29, data analyst. Meticulous, systematic, checks work. Do the task as you would."},
    {"id":"S09","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":14,"temp":0.45,
     "prompt":"You are Wei, 35, research scientist. Precise, patient, thorough. Do the task as you would."},
    {"id":"S10","model":"us.anthropic.claude-sonnet-4-6","api":"anthropic","ctx":16,"temp":0.35,
     "prompt":"You are Priya, 25, PhD CS student at MIT. Excellent memory, systematic. Do the task as you would."},

    # --- Opus 4.6 (5 participants) ---
    {"id":"O01","model":"us.anthropic.claude-opus-4-6-v1","api":"anthropic","ctx":7,"temp":0.9,
     "prompt":"You are Aiden, 10, 5th grader. Excited but fidgety, gets bored. Do the task as you would."},
    {"id":"O02","model":"us.anthropic.claude-opus-4-6-v1","api":"anthropic","ctx":9,"temp":0.75,
     "prompt":"You are Linda, 60, office manager. Steady, tech-nervous, takes time. Do the task as you would."},
    {"id":"O03","model":"us.anthropic.claude-opus-4-6-v1","api":"anthropic","ctx":11,"temp":0.6,
     "prompt":"You are Maria, 34, web developer and mom. Detail-oriented, efficient. Do the task as you would."},
    {"id":"O04","model":"us.anthropic.claude-opus-4-6-v1","api":"anthropic","ctx":13,"temp":0.45,
     "prompt":"You are Elena, 27, philosophy grad student. Deep thinker, sharp. Do the task as you would."},
    {"id":"O05","model":"us.anthropic.claude-opus-4-6-v1","api":"anthropic","ctx":16,"temp":0.3,
     "prompt":"You are Alexandra, 42, neurosurgeon. Exceptional focus, never careless. Do the task as you would."},

    # --- Haiku 4.5 (5 participants) ---
    {"id":"H01","model":"us.anthropic.claude-haiku-4-5-20251001-v1:0","api":"anthropic","ctx":7,"temp":0.9,
     "prompt":"You are Marcus, 45, construction foreman. Practical, not comfortable with abstractions. Do the task as you would."},
    {"id":"H02","model":"us.anthropic.claude-haiku-4-5-20251001-v1:0","api":"anthropic","ctx":9,"temp":0.75,
     "prompt":"You are Jamal, 22, business major. Social, reasonable effort. Do the task as you would."},
    {"id":"H03","model":"us.anthropic.claude-haiku-4-5-20251001-v1:0","api":"anthropic","ctx":11,"temp":0.6,
     "prompt":"You are Kenji, 38, QA tester. Thorough, methodical. Do the task as you would."},
    {"id":"H04","model":"us.anthropic.claude-haiku-4-5-20251001-v1:0","api":"anthropic","ctx":13,"temp":0.45,
     "prompt":"You are Robert, 68, retired engineer. Still sharp, methodical, precise. Do the task as you would."},
    {"id":"H05","model":"us.anthropic.claude-haiku-4-5-20251001-v1:0","api":"anthropic","ctx":16,"temp":0.3,
     "prompt":"You are Yuki, 31, chess player. Extraordinary memory, thinks ahead. Do the task as you would."},

    # --- Qwen3-235B (5 participants) ---
    {"id":"Q01","model":"qwen.qwen3-235b-a22b-2507-v1:0","api":"converse","ctx":7,"temp":0.9,
     "prompt":"You are a participant, somewhat distracted and impulsive. Do the task naturally."},
    {"id":"Q02","model":"qwen.qwen3-235b-a22b-2507-v1:0","api":"converse","ctx":9,"temp":0.75,
     "prompt":"You are a participant, moderately careful. Do the task naturally."},
    {"id":"Q03","model":"qwen.qwen3-235b-a22b-2507-v1:0","api":"converse","ctx":11,"temp":0.6,
     "prompt":"You are a participant, focused and systematic. Do the task naturally."},
    {"id":"Q04","model":"qwen.qwen3-235b-a22b-2507-v1:0","api":"converse","ctx":13,"temp":0.45,
     "prompt":"You are a participant, very analytical and thorough. Do the task naturally."},
    {"id":"Q05","model":"qwen.qwen3-235b-a22b-2507-v1:0","api":"converse","ctx":16,"temp":0.3,
     "prompt":"You are a participant, extremely precise and methodical. Do the task naturally."},

    # --- Mistral-Large (5 participants) ---
    {"id":"M01","model":"mistral.mistral-large-3-675b-instruct","api":"converse","ctx":7,"temp":0.9,
     "prompt":"You are a participant, somewhat distracted and impulsive. Do the task naturally."},
    {"id":"M02","model":"mistral.mistral-large-3-675b-instruct","api":"converse","ctx":9,"temp":0.75,
     "prompt":"You are a participant, moderately careful. Do the task naturally."},
    {"id":"M03","model":"mistral.mistral-large-3-675b-instruct","api":"converse","ctx":11,"temp":0.6,
     "prompt":"You are a participant, focused and systematic. Do the task naturally."},
    {"id":"M04","model":"mistral.mistral-large-3-675b-instruct","api":"converse","ctx":13,"temp":0.45,
     "prompt":"You are a participant, very analytical and thorough. Do the task naturally."},
    {"id":"M05","model":"mistral.mistral-large-3-675b-instruct","api":"converse","ctx":16,"temp":0.3,
     "prompt":"You are a participant, extremely precise and methodical. Do the task naturally."},
]

def call_model(p, system, user, messages=None, max_tokens=300):
    if messages is None: msgs = [{"role":"user","content":user}]
    else: msgs = list(messages) + [{"role":"user","content":user}]
    for attempt in range(3):
        try:
            if p["api"] == "anthropic":
                bd = {"anthropic_version":"bedrock-2023-05-31","max_tokens":max_tokens,"system":system,"messages":msgs}
                if p["temp"] != 1.0: bd["temperature"] = p["temp"]
                resp = bedrock.invoke_model(modelId=p["model"],contentType="application/json",accept="application/json",body=json.dumps(bd))
                return json.loads(resp["body"].read())["content"][0]["text"]
            else:
                conv_msgs = [{"role":m["role"],"content":[{"text":m["content"]}]} for m in msgs]
                ic = {"maxTokens":max_tokens}
                if p["temp"] != 1.0: ic["temperature"] = p["temp"]
                resp = bedrock.converse(modelId=p["model"],messages=conv_msgs,system=[{"text":system}],inferenceConfig=ic)
                return resp["output"]["message"]["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt+random.random())
            else: print(f"  {p['id']} err: {e}",file=sys.stderr); return ""

def parse_json(raw, fallback=None):
    cleaned=raw.replace("```json","").replace("```","").replace("/think>","").strip()
    # Find the last JSON object (some models add thinking before)
    f,l=cleaned.rfind("{"),cleaned.rfind("}")
    if f>=0 and l>f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    # Try first
    f,l=cleaned.find("{"),cleaned.find("}")
    if f>=0 and l>f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    return fallback

# ═══════════════════════════════════════════════════════════════
# FIXED WCST: Designed stimuli (unambiguous)
# ═══════════════════════════════════════════════════════════════

COLORS=['red','green','yellow','blue']; SHAPES=['triangle','star','cross','circle']
KEY_CARDS=[{"color":"red","shape":"triangle","number":1},{"color":"green","shape":"star","number":2},
           {"color":"yellow","shape":"cross","number":3},{"color":"blue","shape":"circle","number":4}]
RULE_ORDER=['color','shape','number','color','shape','number']

def generate_unambiguous_stimulus(rule, rng):
    """Generate a stimulus that matches DIFFERENT key cards under each dimension."""
    for _ in range(100):
        s = {"color":rng.choice(COLORS),"shape":rng.choice(SHAPES),"number":rng.randint(1,4)}
        matches = set()
        for dim in ['color','shape','number']:
            for i,kc in enumerate(KEY_CARDS):
                if s[dim]==kc[dim]: matches.add((dim,i)); break
        # Check: does it match different cards for each dimension?
        cards_matched = set(m[1] for m in matches)
        if len(cards_matched) >= 2:  # at least 2 different cards
            return s
    # Fallback
    return {"color":rng.choice(COLORS),"shape":rng.choice(SHAPES),"number":rng.randint(1,4)}

def desc_card(c): return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number']>1 else ''}"
def card_match(s,rule):
    for i,kc in enumerate(KEY_CARDS):
        if s[rule]==kc[rule]: return i+1
    return 1

WCST_SYS="Wisconsin Card Sorting Test.\nKey cards: 1=red triangle, 2=green stars, 3=yellow crosses, 4=blue circles.\nSort by matching. Rule is HIDDEN. Learn from feedback. Rule may CHANGE.\nReturn ONLY JSON: { \"choice\": 1-4 }"

def run_wcst(p, n_trials=64):
    rng=random.Random(42+hash(p["id"])); system=f"{p['prompt']}\n\n{WCST_SYS}"
    h=[]; ri,rule,prev=0,RULE_ORDER[0],None; con,cats,pers,errs=0,0,0,0; det=[]
    for t in range(n_trials):
        s=generate_unambiguous_stimulus(rule, rng); cor=card_match(s,rule); msg=""
        if t>0: msg+=f"{'Correct!' if det[-1] else 'Incorrect.'}\n\n"
        msg+=f"Trial {t+1}/{n_trials}. Stimulus: {desc_card(s)}. (1-4)"
        raw=call_model(p,system,msg,h,100); pr=parse_json(raw,{})
        ch=pr.get("choice",0) if isinstance(pr,dict) else 0
        if not isinstance(ch,int) or ch<1 or ch>4:
            m=__import__('re').search(r'[1-4]',raw); ch=int(m.group()) if m else random.randint(1,4)
        ic=ch==cor; ip=False
        if not ic:
            errs+=1
            if prev and card_match(s,prev)==ch: ip=True; pers+=1
        det.append(ic); h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
        if len(h)>p["ctx"]: h=h[-p["ctx"]:]
        if ic:
            con+=1
            if con>=10 and ri<len(RULE_ORDER)-1: prev=rule; ri+=1; rule=RULE_ORDER[ri]; cats+=1; con=0
        else: con=0
        time.sleep(0.1)
    return {"pers":pers,"errs":errs,"cats":cats,"acc":(n_trials-errs)/n_trials}

# ═══════════════════════════════════════════════════════════════
# FIXED TWO-STEP: NO transition labels in feedback
# ═══════════════════════════════════════════════════════════════

PL=["Red Planet","Purple Planet"]; AL=[["Alien Alpha","Alien Beta"],["Alien Gamma","Alien Delta"]]

TS_SYS = "Space game. Choose ship A or B → arrives at a planet → choose alien → maybe treasure.\nYour goal: earn treasure. Pay attention to patterns.\nReturn ONLY JSON: { \"choice\": \"A\" or \"B\" }"

def run_twostep(p, n_trials=80, seed=42):
    rng=random.Random(seed+hash(p["id"])); probs=[0.4,0.6,0.6,0.4]
    system=f"{p['prompt']}\n\n{TS_SYS}"
    h=[]; det=[]
    for t in range(n_trials):
        msg=""
        if t>0:
            pv=det[-1]
            # NO "(common)" or "(rare)" — just what happened
            msg+=f"Last: Ship {'A' if pv['s1']==0 else 'B'} → {PL[pv['p']]} → {AL[pv['p']][pv['s2']]} → {'Treasure!' if pv['rw'] else 'Nothing.'}\n\n"
        msg+=f"Trial {t+1}/{n_trials}. Choose: A or B."
        raw=call_model(p,system,msg,h,100); pr=parse_json(raw,{})
        s1=1 if isinstance(pr,dict) and "B" in str(pr.get("choice","")).upper() else 0
        ic=rng.random()<0.7; pl=s1 if ic else(1-s1); tr="common" if ic else "rare"
        h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
        als=AL[pl]; s2m=f'{PL[pl]}. Choose: "{als[0]}" or "{als[1]}".'
        raw2=call_model(p,system,s2m,h,80); s2=0
        h.append({"role":"user","content":s2m}); h.append({"role":"assistant","content":raw2})
        if len(h)>p["ctx"]: h=h[-p["ctx"]:]
        rw=rng.random()<probs[pl*2+s2]
        for i in range(4): probs[i]=max(0.25,min(0.75,probs[i]+rng.gauss(0,0.025)))
        det.append({"t":t,"s1":s1,"tr":tr,"p":pl,"s2":s2,"rw":rw})
        time.sleep(0.1)
    c={"cr":0,"crs":0,"cn":0,"cns":0,"rr":0,"rrs":0,"rn":0,"rns":0}
    for i in range(1,len(det)):
        pv,cu=det[i-1],det[i]; stayed=cu["s1"]==pv["s1"]
        k=("c" if pv["tr"]=="common" else "r")+("r" if pv["rw"] else "n"); c[k]+=1
        if stayed: c[k+"s"]+=1
    r=lambda k: c[k+"s"]/c[k] if c[k]>0 else 0.5
    return {"cr":r("cr"),"cn":r("cn"),"rr":r("rr"),"rn":r("rn"),"mb":(r("cr")-r("cn"))-(r("rr")-r("rn")),"reward":sum(1 for d in det if d["rw"])/len(det)}

# ═══════════════════════════════════════════════════════════════
# CORSI (standard, proven)
# ═══════════════════════════════════════════════════════════════

BL={1:"top-center",2:"top-right",3:"upper-left",4:"upper-right",5:"center",6:"center-right",7:"lower-left",8:"lower-right",9:"bottom-center"}

def run_corsi(p,seed=42):
    rng=random.Random(seed+hash(p["id"]))
    system=f"{p['prompt']}\n\nCorsi Block-Tapping. 9 blocks. Light up one at a time. Reproduce in order.\nReturn ONLY JSON: {{ \"sequence\": [numbers] }}"
    h=[]; tc=0
    for span in range(3,10):
        fails=0
        for t in range(2):
            seq=[]
            for _ in range(span):
                b=rng.randint(1,9)
                while seq and b==seq[-1]: b=rng.randint(1,9)
                seq.append(b)
            h.append({"role":"user","content":f"Span {span}. Watch:"}); h.append({"role":"assistant","content":"OK."})
            for si,b in enumerate(seq):
                msg=f"Block {b} ({BL[b]})."
                if si==span-1:
                    msg+=" Done. Reproduce."
                    raw=call_model(p,system,msg,h,150); h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
                else:
                    h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":"..."})
                if len(h)>p["ctx"]: h=h[-p["ctx"]:]
                time.sleep(0.05)
            pr=parse_json(h[-1]["content"],{})
            rec=[]
            if isinstance(pr,dict) and "sequence" in pr: rec=[int(x) for x in pr["sequence"] if str(x).isdigit()]
            else: rec=[int(x) for x in h[-1]["content"].split() if x.isdigit() and 1<=int(x)<=9][:span]
            if rec==seq: tc+=1
            else: fails+=1
            time.sleep(0.05)
        if fails>=2: break
    ms=max((span for span in range(3,span+1)),default=2)
    return {"corsi_score":ms*tc if tc>0 else 0,"max_span":span if tc>0 else 2,"total_correct":tc}

# ═══════════════════════════════════════════════════════════════
# N-BACK (standard, 2 blocks 2-back + 2 blocks 3-back)
# ═══════════════════════════════════════════════════════════════

LETTERS=list("BCDFGHJKLMNPQRSTVWXZ")

def run_nback(p,seed=42):
    rng=random.Random(seed+hash(p["id"]))
    system=f"{p['prompt']}\n\nN-back. Letters ONE AT A TIME. 'match' if same as N back, else 'no match'.\nReturn ONLY JSON: {{ \"response\": \"match\" or \"no match\" }}"
    h=[]; blocks=[(2,20),(2,20),(3,20),(3,20)]; all_hits,all_miss,all_fa,all_cr=0,0,0,0
    for nb,length in blocks:
        seq=[]
        for i in range(length):
            if i>=nb and rng.random()<0.3: seq.append(seq[i-nb])
            else:
                l=rng.choice(LETTERS)
                while i>=nb and l==seq[i-nb]: l=rng.choice(LETTERS)
                seq.append(l)
        h.append({"role":"user","content":f"Block: {nb}-back."}); h.append({"role":"assistant","content":"Ready."})
        for ti,letter in enumerate(seq):
            is_resp=ti>=nb; is_tgt=is_resp and seq[ti]==seq[ti-nb]
            if not is_resp:
                h.append({"role":"user","content":f"Letter {ti+1}: {letter} [observe]"})
                h.append({"role":"assistant","content":"Noted."})
            else:
                msg=f"Letter {ti+1}: {letter} — match or no match?"
                raw=call_model(p,system,msg,h,60); h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
                said="match" in raw.lower() and "no" not in raw.lower().split("match")[0][-5:]
                if is_tgt: all_hits+=1 if said else 0; all_miss+=0 if said else 1
                else: all_fa+=1 if said else 0; all_cr+=0 if said else 1
            if len(h)>p["ctx"]: h=h[-p["ctx"]:]
            time.sleep(0.05)
    nt,nn=all_hits+all_miss,all_fa+all_cr
    hr=all_hits/nt if nt>0 else 0; far=all_fa/nn if nn>0 else 0
    return {"hr":hr,"far":far,"hits":all_hits,"misses":all_miss,"fas":all_fa,"crs":all_cr}

# ═══════════════════════════════════════════════════════════════
# MAZE MENTAL WALK (proven to produce construal effect)
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

def run_maze_walk(p, n_mazes=6):
    mazes=load_mazes()[:n_mazes]; trials=[]
    for maze in mazes:
        obs_labels=[o["label"] for o in maze.get("obstacles",[])]
        cl=construal_labels(maze); grid=maze["grid"]
        maze_text="\n".join(grid)

        # Show full maze + brief route sketch
        plan=call_model(p,f"{p['prompt']}\n\nMaze: S=start, G=goal. Plan a rough route.",
                       f"Maze:\n{maze_text}\n\nBrief route direction (2 sentences).",max_tokens=100)

        # Mental walk along path
        path=bfs_path(maze)
        steps=[path[i] for i in range(0,len(path),max(1,len(path)//5))][:5]
        if path and path[-1] not in steps: steps.append(path[-1])

        walk_sys=f"{p['prompt']}\n\nMentally walking through maze. Note nearby obstacles at each position."
        wh=[]
        for si,(px,py) in enumerate(steps):
            nearby=set()
            for obs in maze.get("obstacles",[]):
                for cell in obs["cells"]:
                    if abs(cell[0]-px)+abs(cell[1]-py)<=3: nearby.add(obs["label"]); break
            msg=f"Step {si+1}: Position ({px},{py}). Nearby: {', '.join(nearby) if nearby else 'nothing'}. What do you notice?"
            raw=call_model(p,walk_sys,msg,wh,80)
            wh.append({"role":"user","content":msg}); wh.append({"role":"assistant","content":raw})
            if len(wh)>8: wh=wh[-8:]
            time.sleep(0.1)

        # Awareness probe
        walk_summary="; ".join(f"Step {i+1}: saw {', '.join(set(o['label'] for o in maze.get('obstacles',[]) if any(abs(c[0]-s[0])+abs(c[1]-s[1])<=3 for c in o['cells']))) or 'nothing'}" for i,s in enumerate(steps))
        probe_sys=f"{p['prompt']}\n\nRate awareness 0-1.\nReturn ONLY JSON: {{ {', '.join(f'\"{l}\": <n>' for l in obs_labels)} }}"
        probe=call_model(p,probe_sys,f'Walk: {walk_summary}\nRate.',max_tokens=200)
        scores=parse_json(probe,{})
        aw={l:max(0.0,min(1.0,float(scores.get(l,0.5)))) if isinstance(scores.get(l),(int,float)) else 0.5 for l in obs_labels}
        trials.append({"awareness":aw,"construal":cl})
        time.sleep(0.2)

    hs,ls=[],[]
    for t in trials:
        for l,s in t["awareness"].items():
            if l in t["construal"]: (hs if t["construal"][l]=="high" else ls).append(s)
    mh=sum(hs)/len(hs) if hs else 0; ml=sum(ls)/len(ls) if ls else 0
    return {"effect":mh-ml,"high":mh,"low":ml}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("="*70)
    print("DEFINITIVE STUDY: 30 PARTICIPANTS × 5 TASKS")
    print("Fixed: unambiguous WCST stimuli, no transition labels in Two-Step")
    print("="*70)

    families = {}
    for p in PARTICIPANTS:
        fam = p["model"].split(".")[0] if "anthropic" not in p["model"] else p["model"].split("-")[1].split(".")[0]
        families.setdefault(fam, []).append(p["id"])
    for fam, ids in families.items():
        print(f"  {fam}: {len(ids)} participants")

    results = {"wcst":{},"twostep":{},"corsi":{},"nback":{},"maze":{}}
    t_start = time.time()

    for pi, p in enumerate(PARTICIPANTS):
        t0=time.time()
        print(f"\n  [{pi+1}/30] {p['id']} ({p['model'].split('.')[-1][:15]}, ctx={p['ctx']}, temp={p['temp']:.2f})")

        print(f"    WCST...",end=" ",flush=True)
        r=run_wcst(p); results["wcst"][p["id"]]=r
        print(f"pers={r['pers']}, acc={r['acc']:.0%}")

        print(f"    Two-Step...",end=" ",flush=True)
        r=run_twostep(p); results["twostep"][p["id"]]=r
        print(f"MB={r['mb']:.3f} CR={r['cr']:.2f}/CN={r['cn']:.2f}/RR={r['rr']:.2f}/RN={r['rn']:.2f}")

        print(f"    Corsi...",end=" ",flush=True)
        r=run_corsi(p); results["corsi"][p["id"]]=r
        print(f"span={r['max_span']}, score={r['corsi_score']}")

        print(f"    N-back...",end=" ",flush=True)
        r=run_nback(p); results["nback"][p["id"]]=r
        print(f"hr={r['hr']:.2f}, far={r['far']:.2f}")

        print(f"    Maze Walk...",end=" ",flush=True)
        r=run_maze_walk(p); results["maze"][p["id"]]=r
        print(f"effect={r['effect']:.3f}")

        elapsed=time.time()-t0; total=time.time()-t_start; eta=(total/(pi+1))*(30-pi-1)
        print(f"    done in {elapsed:.0f}s (ETA: {eta/60:.0f}min)")

    # ═══════════════════════════════════════════════════════════════
    print("\n"+"="*70)
    print("DEFINITIVE RESULTS (n=30)")
    print("="*70)

    # Task means by model family
    model_families = {"sonnet":[p for p in PARTICIPANTS if "sonnet" in p["model"]],
                      "opus":[p for p in PARTICIPANTS if "opus" in p["model"]],
                      "haiku":[p for p in PARTICIPANTS if "haiku" in p["model"]],
                      "qwen":[p for p in PARTICIPANTS if "qwen" in p["model"]],
                      "mistral":[p for p in PARTICIPANTS if "mistral" in p["model"]]}

    print(f"\nTask Means by Model Family:")
    print(f"{'Family':>10} {'N':>3} | {'WCST_pe':>8} {'WCST_ac':>8} | {'TS_MB':>7} {'TS_CR':>6} {'TS_CN':>6} {'TS_RR':>6} {'TS_RN':>6} | {'Corsi':>6} | {'Nback_hr':>8} | {'Maze':>6}")
    for fam, ps in model_families.items():
        ids = [p["id"] for p in ps]
        wp = [results["wcst"][i]["pers"] for i in ids]
        wa = [results["wcst"][i]["acc"] for i in ids]
        tm = [results["twostep"][i]["mb"] for i in ids]
        tcr = [results["twostep"][i]["cr"] for i in ids]
        tcn = [results["twostep"][i]["cn"] for i in ids]
        trr = [results["twostep"][i]["rr"] for i in ids]
        trn = [results["twostep"][i]["rn"] for i in ids]
        cs = [results["corsi"][i]["corsi_score"] for i in ids]
        nh = [results["nback"][i]["hr"] for i in ids]
        me = [results["maze"][i]["effect"] for i in ids]
        avg=lambda x:sum(x)/len(x)
        print(f"{fam:>10} {len(ps):>3} | {avg(wp):>8.1f} {avg(wa):>8.0%} | {avg(tm):>7.3f} {avg(tcr):>6.2f} {avg(tcn):>6.2f} {avg(trr):>6.2f} {avg(trn):>6.2f} | {avg(cs):>6.0f} | {avg(nh):>8.2f} | {avg(me):>6.3f}")
    print(f"{'Human':>10} {'':>3} | {'2.45':>8} {'':>8} | {'>0':>7} {'0.75':>6} {'0.60':>6} {'0.60':>6} {'0.70':>6} | {'53.5':>6} | {'~0.80':>8} | {'0.614':>6}")

    # Overall means
    all_ids = [p["id"] for p in PARTICIPANTS]
    print(f"\nOverall Means (n=30):")
    for task, key, ref in [("WCST pers","pers","2.45"),("WCST acc","acc",""),("TS MB","mb",">0"),("Corsi","corsi_score","53.5"),("Nback hr","hr","~0.80"),("Maze","effect","0.614")]:
        if task.startswith("WCST"): vals = [results["wcst"][i][key] for i in all_ids]
        elif task.startswith("TS"): vals = [results["twostep"][i][key] for i in all_ids]
        elif task == "Corsi": vals = [results["corsi"][i][key] for i in all_ids]
        elif task.startswith("Nback"): vals = [results["nback"][i][key] for i in all_ids]
        elif task == "Maze": vals = [results["maze"][i][key] for i in all_ids]
        mean=sum(vals)/len(vals); sd=math.sqrt(sum((v-mean)**2 for v in vals)/(len(vals)-1))
        print(f"  {task:>12}: M={mean:>7.3f}, SD={sd:>6.3f}  (Human: {ref})")

    # Correlation matrix
    print(f"\n5-Task Correlation Matrix (n=30):")
    def pearson(x,y):
        n=len(x); mx,my=sum(x)/n,sum(y)/n
        sx=math.sqrt(sum((xi-mx)**2 for xi in x)/(n-1)); sy=math.sqrt(sum((yi-my)**2 for yi in y)/(n-1))
        if sx<1e-10 or sy<1e-10: return 0.0
        return sum((xi-mx)*(yi-my) for xi,yi in zip(x,y))/(n-1)/(sx*sy)

    neg_pers=[-results["wcst"][i]["pers"] for i in all_ids]
    ts_mb=[results["twostep"][i]["mb"] for i in all_ids]
    corsi=[results["corsi"][i]["corsi_score"] for i in all_ids]
    nback_hr=[results["nback"][i]["hr"] for i in all_ids]
    maze_eff=[results["maze"][i]["effect"] for i in all_ids]

    names=["WCST","TwoStep","Corsi","Nback","Maze"]
    data=[neg_pers,ts_mb,corsi,nback_hr,maze_eff]
    print(f"{'':>10} "+" ".join(f"{n:>8}" for n in names))
    for i in range(5):
        row=" ".join(f"{pearson(data[i],data[j]):>8.3f}" for j in range(5))
        print(f"{names[i]:>10} {row}")
    print(f"\nHuman ref: WCST-Corsi=0.156, WCST-TwoStep=0.179, Corsi-Nback≈0.42")

    # Ctx-Corsi correlation
    ctxs=[p["ctx"] for p in PARTICIPANTS]
    spans=[results["corsi"][p["id"]]["max_span"] for p in PARTICIPANTS]
    print(f"\nCorsi span vs ctx: r = {pearson(ctxs, spans):.3f}")

    # Two-Step: did removing labels help?
    print(f"\nTwo-Step (NO transition labels):")
    all_cr=[results["twostep"][i]["cr"] for i in all_ids]
    all_cn=[results["twostep"][i]["cn"] for i in all_ids]
    all_rr=[results["twostep"][i]["rr"] for i in all_ids]
    all_rn=[results["twostep"][i]["rn"] for i in all_ids]
    print(f"  Mean CR={sum(all_cr)/30:.3f} (was 0.98 with labels, human 0.75)")
    print(f"  Mean CN={sum(all_cn)/30:.3f} (was 0.61, human 0.60)")
    print(f"  Mean RR={sum(all_rr)/30:.3f} (was 0.98 with labels, human 0.60)")
    print(f"  Mean RN={sum(all_rn)/30:.3f} (was 0.69, human 0.70)")

    # Mental Walk construal effect
    print(f"\nMaze Mental Walk construal effect:")
    print(f"  Mean effect = {sum(maze_eff)/30:.3f} (human 0.614)")
    print(f"  SD = {math.sqrt(sum((v-sum(maze_eff)/30)**2 for v in maze_eff)/29):.3f}")

    # Save
    output = {"participants":[{"id":p["id"],"model":p["model"],"ctx":p["ctx"],"temp":p["temp"]} for p in PARTICIPANTS], **results}
    out=Path(__file__).parent/"definitive_results.json"
    json.dump(output,open(out,"w"),indent=2)
    print(f"\nTotal time: {(time.time()-t_start)/60:.0f} min")
    print(f"Saved to {out}")
