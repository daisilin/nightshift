"""
POWERED STUDY: 20 Personas × 4 Tasks
======================================
Paper-ready dataset with proper statistical power.

Tasks: WCST (64 trials), Two-Step (80 trials), Corsi (adaptive), Maze (6 mazes × 2 conditions)
Each persona has calibrated ctx + temp mapped from cognitive profile.
Maze runs in TWO conditions: full CoT (baseline) and token-budget (80 tokens).

20 personas spanning: age (18-75), WM capacity (low-high), cognitive tempo (impulsive-reflective),
attention control (low-high), education, motivation, and cultural background.
"""

import json, time, sys, math, random
from pathlib import Path
from collections import deque
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))
MODEL_ID = "us.anthropic.claude-sonnet-4-6"

# ═══════════════════════════════════════════════════════════════
# 20 DIVERSE PERSONAS WITH CALIBRATED STRUCTURAL PARAMETERS
# ═══════════════════════════════════════════════════════════════

PERSONAS = [
    # --- LOW WM / HIGH NOISE (ctx 6-8, temp 0.9-1.0) ---
    {"id":"p01","ctx":6,"temp":1.0,"prompt":"You are Tyler, a 28-year-old delivery driver from Florida. You do online surveys on your phone during breaks for extra cash. You're tired, don't read instructions carefully, and want to finish quickly. Do the task as YOU would."},
    {"id":"p02","ctx":7,"temp":0.95,"prompt":"You are Aiden, a 10-year-old 5th grader from California. You're excited but fidgety. You play video games a lot and get bored easily with tasks that aren't fun. When bored you start clicking randomly. Do the task as YOU would."},
    {"id":"p03","ctx":6,"temp":1.0,"prompt":"You are Sam, a 25-year-old graphic designer with ADHD. You can hyperfocus on interesting tasks but zone out quickly on repetitive ones. Your mind tends to wander. You're creative but inconsistent. Do the task as YOU would."},
    {"id":"p04","ctx":8,"temp":0.9,"prompt":"You are Marcus, a 45-year-old construction foreman. You're practical and hands-on but not comfortable with abstract computer tasks. You're doing this study because your daughter signed you up. You prefer to just get on with it. Do the task as YOU would."},

    # --- LOW-MODERATE WM / MODERATE NOISE (ctx 8-10, temp 0.8-0.9) ---
    {"id":"p05","ctx":8,"temp":0.9,"prompt":"You are Emma, a 19-year-old psychology sophomore. You're doing this for course credit. You've done 3 studies this semester and are tired of them. You go with your gut and respond quickly. Do the task as YOU would."},
    {"id":"p06","ctx":9,"temp":0.85,"prompt":"You are Rosa, a 52-year-old ESL teacher from Mexico City. You're careful and methodical but sometimes second-guess yourself. English is your second language. You want to do well but processing takes a bit longer. Do the task as YOU would."},
    {"id":"p07","ctx":8,"temp":0.9,"prompt":"You are Jamal, a 22-year-old business major at a state university. You're a social person who finds these tasks kind of boring. You put in reasonable effort but don't agonize over answers. Do the task as YOU would."},
    {"id":"p08","ctx":10,"temp":0.8,"prompt":"You are Linda, a 60-year-old office manager nearing retirement. You're experienced and steady but technology makes you nervous. You take your time and read everything twice before responding. Do the task as YOU would."},

    # --- MODERATE WM / MODERATE NOISE (ctx 10-12, temp 0.6-0.8) ---
    {"id":"p09","ctx":10,"temp":0.7,"prompt":"You are Dorothy, a 71-year-old retired high school teacher from Vermont. You read everything twice. You process slowly but compensate by being very deliberate. You get tired after 20 minutes. Do the task as YOU would."},
    {"id":"p10","ctx":11,"temp":0.7,"prompt":"You are Maria, a 34-year-old freelance web developer and mother of two. You're experienced with online studies. You're detail-oriented but efficient — you want to do well without spending all day. Do the task as YOU would."},
    {"id":"p11","ctx":12,"temp":0.65,"prompt":"You are David, a 40-year-old high school math teacher. You're patient and systematic. You enjoy logical puzzles and approach problems step by step. You're moderately careful and consistent. Do the task as YOU would."},
    {"id":"p12","ctx":10,"temp":0.75,"prompt":"You are Kenji, a 38-year-old software QA tester from Osaka. You're thorough and methodical. You test things systematically but don't overthink. You're comfortable with structured tasks. Do the task as YOU would."},

    # --- HIGH WM / LOW NOISE (ctx 12-14, temp 0.4-0.6) ---
    {"id":"p13","ctx":12,"temp":0.55,"prompt":"You are James, a 22-year-old computer science senior. You enjoy puzzles and competitive games. You think things through carefully — you'd rather be slow and right than fast and wrong. You can focus deeply. Do the task as YOU would."},
    {"id":"p14","ctx":13,"temp":0.5,"prompt":"You are Sarah, a 29-year-old data analyst at a consulting firm. You're analytically strong and meticulous. You look for patterns and check your work. You approach everything systematically. Do the task as YOU would."},
    {"id":"p15","ctx":14,"temp":0.45,"prompt":"You are Wei, a 35-year-old research scientist in biology. You're used to careful experimental procedures. You're precise, patient, and thorough. You enjoy the process of figuring things out. Do the task as YOU would."},
    {"id":"p16","ctx":12,"temp":0.6,"prompt":"You are Elena, a 27-year-old graduate student in philosophy. You think deeply and carefully about everything. You're introspective and sometimes overthink, but you're sharp and focused. Do the task as YOU would."},

    # --- VERY HIGH WM / VERY LOW NOISE (ctx 14-16, temp 0.3-0.5) ---
    {"id":"p17","ctx":15,"temp":0.4,"prompt":"You are Priya, a 25-year-old PhD student in computer science at MIT. You have excellent working memory and approach tasks systematically. You enjoy optimization problems. Do the task as YOU would."},
    {"id":"p18","ctx":16,"temp":0.3,"prompt":"You are Robert, a 68-year-old retired engineer. You do woodworking and crossword puzzles daily. You're still sharp mentally, methodical, and precise. You prefer to take your time and get things right. Do the task as YOU would."},
    {"id":"p19","ctx":14,"temp":0.45,"prompt":"You are Yuki, a 31-year-old professional chess player from Tokyo. You have extraordinary working memory and pattern recognition. You think many steps ahead. You're calm and focused under pressure. Do the task as YOU would."},
    {"id":"p20","ctx":16,"temp":0.35,"prompt":"You are Alexandra, a 42-year-old neurosurgeon. You have exceptional concentration and spatial reasoning. You're used to maintaining focus for hours. You're precise, methodical, and rarely make careless errors. Do the task as YOU would."},
]

def call_claude(system, user, messages=None, max_tokens=300, temp=1.0):
    if messages is None: messages = [{"role": "user", "content": user}]
    else: messages = list(messages) + [{"role": "user", "content": user}]
    for attempt in range(3):
        try:
            bd = {"anthropic_version":"bedrock-2023-05-31","max_tokens":max_tokens,"system":system,"messages":messages}
            if temp != 1.0: bd["temperature"] = temp
            resp = bedrock.invoke_model(modelId=MODEL_ID, contentType="application/json", accept="application/json", body=json.dumps(bd))
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt+random.random())
            else: print(f"  API err: {e}",file=sys.stderr); return ""

def parse_json(raw, fallback=None):
    cleaned=raw.replace("```json","").replace("```","").strip()
    f,l=cleaned.find("{"),cleaned.rfind("}")
    if f>=0 and l>f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    return fallback

# ═══════════════════════════════════════════════════════════════
# WCST
# ═══════════════════════════════════════════════════════════════

COLORS=['red','green','yellow','blue']; SHAPES=['triangle','star','cross','circle']
KEY_CARDS=[{"color":"red","shape":"triangle","number":1},{"color":"green","shape":"star","number":2},{"color":"yellow","shape":"cross","number":3},{"color":"blue","shape":"circle","number":4}]
RULE_ORDER=['color','shape','number','color','shape','number']
def desc_card(c): return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number']>1 else ''}"
def rand_card(): return {"color":random.choice(COLORS),"shape":random.choice(SHAPES),"number":random.randint(1,4)}
def match(s,rule):
    for i,kc in enumerate(KEY_CARDS):
        if s[rule]==kc[rule]: return i+1
    return 1

WCST_SYS="You are doing the Wisconsin Card Sorting Test.\nFour key cards: Card 1: 1 red triangle, Card 2: 2 green stars, Card 3: 3 yellow crosses, Card 4: 4 blue circles.\nSort by matching to a key card. Rule is HIDDEN — learn from feedback. Rule may CHANGE.\nReturn ONLY JSON: { \"choice\": 1-4 }"

def run_wcst(p):
    ctx,temp=p["ctx"],p["temp"]; system=f"{p['prompt']}\n\n{WCST_SYS}"
    h=[]; ri,rule,prev=0,RULE_ORDER[0],None; con,cats,pers,errs=0,0,0,0; det=[]
    for t in range(64):
        s=rand_card(); cor=match(s,rule); msg=""
        if t>0: msg+=f"{'Correct!' if det[-1] else 'Incorrect.'}\n\n"
        msg+=f"Trial {t+1}/64. Stimulus: {desc_card(s)}. (1-4)"
        raw=call_claude(system,msg,h,100,temp); pr=parse_json(raw,{})
        ch=pr.get("choice",0) if isinstance(pr,dict) else 0
        if not isinstance(ch,int) or ch<1 or ch>4:
            m=__import__('re').search(r'[1-4]',raw); ch=int(m.group()) if m else random.randint(1,4)
        ic=ch==cor; ip=False
        if not ic:
            errs+=1
            if prev and match(s,prev)==ch: ip=True; pers+=1
        det.append(ic); h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
        if len(h)>ctx: h=h[-ctx:]
        if ic:
            con+=1
            if con>=10 and ri<len(RULE_ORDER)-1: prev=rule; ri+=1; rule=RULE_ORDER[ri]; cats+=1; con=0
        else: con=0
        time.sleep(0.12)
    return {"pers":pers,"errs":errs,"cats":cats,"acc":(64-errs)/64}

# ═══════════════════════════════════════════════════════════════
# TWO-STEP
# ═══════════════════════════════════════════════════════════════

PL=["Red Planet","Purple Planet"]; AL=[["Alien Alpha","Alien Beta"],["Alien Gamma","Alien Delta"]]

def run_ts(p, seed=42):
    ctx,temp=p["ctx"],p["temp"]; rng=random.Random(seed+hash(p["id"]))
    probs=[0.4,0.6,0.6,0.4]
    sys_p=f"{p['prompt']}\n\nSpace game: ship A or B → planet → alien → maybe treasure. Earn treasure.\nReturn ONLY JSON: {{ \"choice\": \"A\" or \"B\" }}"
    h=[]; det=[]
    for t in range(80):
        msg=""
        if t>0:
            pv=det[-1]; msg+=f"Last: Ship {'A' if pv['s1']==0 else 'B'} → {PL[pv['p']]} ({pv['tr']}) → {AL[pv['p']][pv['s2']]} → {'Treasure!' if pv['rw'] else 'Nothing.'}\n\n"
        msg+=f"Trial {t+1}/80. Choose: A or B."
        raw=call_claude(sys_p,msg,h,100,temp); pr=parse_json(raw,{})
        s1=1 if isinstance(pr,dict) and "B" in str(pr.get("choice","")).upper() else 0
        ic=rng.random()<0.7; pl=s1 if ic else(1-s1); tr="common" if ic else "rare"
        h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
        als=AL[pl]; s2m=f'{PL[pl]}. Choose: "{als[0]}" or "{als[1]}".'
        raw2=call_claude(sys_p,s2m,h,80,temp); s2=0
        h.append({"role":"user","content":s2m}); h.append({"role":"assistant","content":raw2})
        if len(h)>ctx: h=h[-ctx:]
        rw=rng.random()<probs[pl*2+s2]
        for i in range(4): probs[i]=max(0.25,min(0.75,probs[i]+rng.gauss(0,0.025)))
        det.append({"t":t,"s1":s1,"tr":tr,"p":pl,"s2":s2,"rw":rw})
        time.sleep(0.12)
    c={"cr":0,"crs":0,"cn":0,"cns":0,"rr":0,"rrs":0,"rn":0,"rns":0}
    for i in range(1,len(det)):
        pv,cu=det[i-1],det[i]; stayed=cu["s1"]==pv["s1"]
        k=("c" if pv["tr"]=="common" else "r")+("r" if pv["rw"] else "n"); c[k]+=1
        if stayed: c[k+"s"]+=1
    r=lambda k: c[k+"s"]/c[k] if c[k]>0 else 0.5
    return {"cr":r("cr"),"cn":r("cn"),"rr":r("rr"),"rn":r("rn"),"mb":(r("cr")-r("cn"))-(r("rr")-r("rn")),"reward":sum(1 for d in det if d["rw"])/len(det)}

# ═══════════════════════════════════════════════════════════════
# CORSI
# ═══════════════════════════════════════════════════════════════

BL={1:"top-center",2:"top-right",3:"upper-left",4:"upper-right",5:"center",6:"center-right",7:"lower-left",8:"lower-right",9:"bottom-center"}

def run_corsi(p,seed=42):
    ctx,temp=p["ctx"],p["temp"]; rng=random.Random(seed+hash(p["id"]))
    sys_p=f"{p['prompt']}\n\nCorsi Block-Tapping. 9 blocks. Blocks light up one at a time. Reproduce in order.\nReturn ONLY JSON: {{ \"sequence\": [numbers] }}"
    h=[]; tc=0; det=[]
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
                    msg+=" Sequence done. Reproduce."
                    raw=call_claude(sys_p,msg,h,150,temp); h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
                else:
                    h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":"..."})
                if len(h)>ctx: h=h[-ctx:]
                time.sleep(0.06)
            pr=parse_json(h[-1]["content"],{})
            rec=[]
            if isinstance(pr,dict) and "sequence" in pr: rec=[int(x) for x in pr["sequence"] if str(x).isdigit()]
            else: rec=[int(x) for x in h[-1]["content"].split() if x.isdigit() and 1<=int(x)<=9][:span]
            correct=rec==seq
            if correct: tc+=1
            else: fails+=1
            det.append({"span":span,"correct":correct})
            time.sleep(0.06)
        if fails>=2: break
    ms=max((d["span"] for d in det if d["correct"]),default=2)
    return {"corsi_score":ms*tc,"max_span":ms,"total_correct":tc}

# ═══════════════════════════════════════════════════════════════
# MAZE (two conditions: full + token budget)
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

def run_maze(p, cot_tokens, n_mazes=6):
    temp=p["temp"]
    mazes=load_mazes()[:n_mazes]; trials=[]
    PERSONA=p["prompt"]
    for mi,maze in enumerate(mazes):
        obs_labels=[o["label"] for o in maze.get("obstacles",[])]
        cl=construal_labels(maze); mt="\n".join(maze["grid"])
        if cot_tokens <= 100:
            nav_sys=f"{PERSONA}\n\nMaze: S=start, G=goal, #=wall, digits=obstacles. Plan route S→G. Note ONLY obstacles in your way."
        else:
            nav_sys=f"{PERSONA}\n\nMaze: S=start, G=goal, #=wall, digits=obstacles. Plan your route from S to G."
        cot=call_claude(nav_sys,f"Maze:\n{mt}\n\nPlan route.",max_tokens=cot_tokens,temp=temp)
        time.sleep(0.2)
        probe_sys=f"{PERSONA}\n\nRate awareness of each obstacle: 0.0=didn't notice, 1.0=fully noticed.\nReturn ONLY JSON: {{ {', '.join(f'\"{l}\": <number>' for l in obs_labels)} }}"
        probe=call_claude(probe_sys,f'Obstacles: {", ".join(obs_labels)}. Notes: "{cot[:250]}". Rate.',max_tokens=200,temp=temp)
        scores=parse_json(probe,{})
        aw={}
        for l in obs_labels:
            v=scores.get(l,0.5); aw[l]=max(0.0,min(1.0,float(v))) if isinstance(v,(int,float)) else 0.5
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
    print("POWERED STUDY: 20 PERSONAS × 4 TASKS")
    print(f"Model: {MODEL_ID}")
    print("="*70)
    print(f"\nPersona profiles:")
    for p in PERSONAS:
        print(f"  {p['id']}: ctx={p['ctx']:>2}, temp={p['temp']:.2f}")

    results = {"wcst":{},"twostep":{},"corsi":{},"maze_full":{},"maze_token80":{}}
    t_start = time.time()

    for pi, p in enumerate(PERSONAS):
        pid=p["id"]; t0=time.time()
        print(f"\n  [{pi+1}/20] {pid} (ctx={p['ctx']}, temp={p['temp']:.2f})")

        print(f"    WCST...", end=" ", flush=True)
        r=run_wcst(p); results["wcst"][pid]=r
        print(f"pers={r['pers']}, acc={r['acc']:.0%}")

        print(f"    Two-Step...", end=" ", flush=True)
        r=run_ts(p); results["twostep"][pid]=r
        print(f"MB={r['mb']:.3f}, CR={r['cr']:.2f}/CN={r['cn']:.2f}/RR={r['rr']:.2f}/RN={r['rn']:.2f}")

        print(f"    Corsi...", end=" ", flush=True)
        r=run_corsi(p); results["corsi"][pid]=r
        print(f"span={r['max_span']}, score={r['corsi_score']}")

        print(f"    Maze (full)...", end=" ", flush=True)
        r=run_maze(p, 500); results["maze_full"][pid]=r
        print(f"effect={r['effect']:.3f}")

        print(f"    Maze (token80)...", end=" ", flush=True)
        r=run_maze(p, 80); results["maze_token80"][pid]=r
        print(f"effect={r['effect']:.3f}")

        elapsed=time.time()-t0
        total_elapsed=time.time()-t_start
        eta=(total_elapsed/(pi+1))*(20-pi-1)
        print(f"    done in {elapsed:.0f}s (ETA: {eta/60:.0f}min)")

    # ═══════════════════════════════════════════════════════════════
    print("\n" + "="*70)
    print("POWERED STUDY RESULTS (n=20)")
    print("="*70)

    # Score matrix
    print(f"\n{'ID':>4} {'Ctx':>4} {'Temp':>5} | {'WCST PE':>8} {'WCSTAcc':>8} | {'TS MB':>7} {'CR':>5} {'CN':>5} {'RR':>5} {'RN':>5} | {'Corsi':>6} {'Span':>5} | {'Maze':>6} {'MzTk':>6}")
    print("-"*105)
    for p in PERSONAS:
        pid=p["id"]; w=results["wcst"][pid]; ts=results["twostep"][pid]; c=results["corsi"][pid]
        mf=results["maze_full"][pid]; mt=results["maze_token80"][pid]
        print(f"{pid:>4} {p['ctx']:>4} {p['temp']:>5.2f} | {w['pers']:>8} {w['acc']:>8.0%} | {ts['mb']:>7.3f} {ts['cr']:>5.2f} {ts['cn']:>5.2f} {ts['rr']:>5.2f} {ts['rn']:>5.2f} | {c['corsi_score']:>6} {c['max_span']:>5} | {mf['effect']:>6.3f} {mt['effect']:>6.3f}")

    # Task means
    print(f"\nTask Means (n=20) vs Human Reference:")
    wcst_pers=[results["wcst"][p["id"]]["pers"] for p in PERSONAS]
    ts_mb=[results["twostep"][p["id"]]["mb"] for p in PERSONAS]
    corsi_scores=[results["corsi"][p["id"]]["corsi_score"] for p in PERSONAS]
    maze_full=[results["maze_full"][p["id"]]["effect"] for p in PERSONAS]
    maze_tok=[results["maze_token80"][p["id"]]["effect"] for p in PERSONAS]

    for name,vals,ref in [("WCST pers",wcst_pers,"2.45"),("Two-Step MB",ts_mb,">0"),
                           ("Corsi score",corsi_scores,"53.5"),("Maze full",maze_full,"0.614"),("Maze tok80",maze_tok,"0.614")]:
        mean=sum(vals)/len(vals); sd=math.sqrt(sum((v-mean)**2 for v in vals)/19)
        print(f"  {name:>12}: M={mean:>7.2f}, SD={sd:>6.2f}  (Human: {ref})")

    # Correlation matrix
    print(f"\nCorrelation Matrix (Pearson, n=20):")
    def pearson(x,y):
        n=len(x); mx,my=sum(x)/n,sum(y)/n
        sx=math.sqrt(sum((xi-mx)**2 for xi in x)/(n-1)); sy=math.sqrt(sum((yi-my)**2 for yi in y)/(n-1))
        if sx<1e-10 or sy<1e-10: return 0.0
        return sum((xi-mx)*(yi-my) for xi,yi in zip(x,y))/(n-1)/(sx*sy)

    neg_pers=[-x for x in wcst_pers]  # negate so higher=better
    task_names=["WCST","TwoStep","Corsi","MazeFull","MazeTk80"]
    task_data=[neg_pers,ts_mb,corsi_scores,maze_full,maze_tok]
    print(f"{'':>10} " + " ".join(f"{t:>8}" for t in task_names))
    for i in range(5):
        row=" ".join(f"{pearson(task_data[i],task_data[j]):>8.3f}" for j in range(5))
        print(f"{task_names[i]:>10} {row}")

    print(f"\nLin & Ma reference: WCST-Corsi r=0.156, WCST-TwoStep r=0.179")

    # Corsi vs ctx (the key relationship)
    print(f"\nCorsi Span vs Context Window:")
    for p in PERSONAS:
        c=results["corsi"][p["id"]]
        print(f"  ctx={p['ctx']:>2} → span={c['max_span']}")
    r_ctx_span=pearson([p["ctx"] for p in PERSONAS],[results["corsi"][p["id"]]["max_span"] for p in PERSONAS])
    print(f"  Correlation(ctx, span) = {r_ctx_span:.3f}")

    # Maze: full vs token budget
    print(f"\nMaze Construal: Full vs Token Budget (paired comparison):")
    print(f"  Full CoT mean:     {sum(maze_full)/20:.3f}")
    print(f"  Token-80 mean:     {sum(maze_tok)/20:.3f}")
    print(f"  Difference:        {sum(maze_tok)/20 - sum(maze_full)/20:.3f}")
    # Paired t-test approximation
    diffs=[maze_tok[i]-maze_full[i] for i in range(20)]
    d_mean=sum(diffs)/20; d_sd=math.sqrt(sum((d-d_mean)**2 for d in diffs)/19)
    t_stat=d_mean/(d_sd/math.sqrt(20)) if d_sd>0 else 0
    print(f"  Paired t({19}) = {t_stat:.3f}")

    # Save
    output = {"personas":[{"id":p["id"],"ctx":p["ctx"],"temp":p["temp"]} for p in PERSONAS], **results}
    out=Path(__file__).parent/"powered_study_results.json"
    json.dump(output, open(out,"w"), indent=2)
    print(f"\nTotal time: {(time.time()-t_start)/60:.0f} min")
    print(f"Saved to {out}")
