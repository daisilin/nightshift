"""
Test-Retest Reliability + Model Version Sensitivity
=====================================================
1. Test-retest: Run 5 personas TWICE on WCST + Corsi + N-back
   Same persona, same params, different random seed.
   Correlation between run1 and run2 = reliability.

2. Model versions: Run same 3 personas on multiple Claude versions
   Sonnet 4.6 vs Sonnet 4.5 vs Sonnet 4 vs Claude 3.7 Sonnet
   Same tasks, same params — how much does version matter?
"""

import json, time, sys, math, random
from pathlib import Path
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

def call_claude(model_id, system, user, messages=None, max_tokens=300, temp=1.0):
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

def parse_json(raw, fallback=None):
    cleaned=raw.replace("```json","").replace("```","").strip()
    f,l=cleaned.find("{"),cleaned.rfind("}")
    if f>=0 and l>f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    return fallback

# ═══════════════════════════════════════════════════════════════
# TASKS (abbreviated for speed: WCST 32 trials, Corsi, N-back 2 blocks)
# ═══════════════════════════════════════════════════════════════

COLORS=['red','green','yellow','blue']; SHAPES=['triangle','star','cross','circle']
KEY_CARDS=[{"color":"red","shape":"triangle","number":1},{"color":"green","shape":"star","number":2},
           {"color":"yellow","shape":"cross","number":3},{"color":"blue","shape":"circle","number":4}]
RULE_ORDER=['color','shape','number','color','shape','number']
def desc_card(c): return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number']>1 else ''}"
def card_match(s,rule):
    for i,kc in enumerate(KEY_CARDS):
        if s[rule]==kc[rule]: return i+1
    return 1

def gen_unambig(rule, rng):
    for _ in range(100):
        s={"color":rng.choice(COLORS),"shape":rng.choice(SHAPES),"number":rng.randint(1,4)}
        cards={d: card_match(s,d) for d in ['color','shape','number']}
        if len(set(cards.values())) >= 2: return s
    return {"color":rng.choice(COLORS),"shape":rng.choice(SHAPES),"number":rng.randint(1,4)}

def run_wcst(model_id, prompt, ctx, temp, seed, n_trials=32):
    rng=random.Random(seed)
    system=f"{prompt}\n\nWCST. Key: 1=red triangle, 2=green stars, 3=yellow crosses, 4=blue circles.\nSort by hidden rule. Learn from feedback. Rule may change.\nReturn ONLY JSON: {{ \"choice\": 1-4 }}"
    h=[]; ri,rule,prev=0,RULE_ORDER[0],None; con,cats,pers,errs=0,0,0,0; det=[]
    for t in range(n_trials):
        s=gen_unambig(rule,rng); cor=card_match(s,rule); msg=""
        if t>0: msg+=f"{'Correct!' if det[-1] else 'Incorrect.'}\n\n"
        msg+=f"Trial {t+1}/{n_trials}. Stimulus: {desc_card(s)}. (1-4)"
        raw=call_claude(model_id,system,msg,h,100,temp); pr=parse_json(raw,{})
        ch=pr.get("choice",0) if isinstance(pr,dict) else 0
        if not isinstance(ch,int) or ch<1 or ch>4:
            m=__import__('re').search(r'[1-4]',raw); ch=int(m.group()) if m else random.randint(1,4)
        ic=ch==cor; ip=False
        if not ic:
            errs+=1
            if prev and card_match(s,prev)==ch: ip=True; pers+=1
        det.append(ic); h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
        if len(h)>ctx: h=h[-ctx:]
        if ic:
            con+=1
            if con>=10 and ri<len(RULE_ORDER)-1: prev=rule; ri+=1; rule=RULE_ORDER[ri]; cats+=1; con=0
        else: con=0
        time.sleep(0.1)
    return {"pers":pers,"acc":(n_trials-errs)/n_trials}

BL={1:"top-center",2:"top-right",3:"upper-left",4:"upper-right",5:"center",6:"center-right",7:"lower-left",8:"lower-right",9:"bottom-center"}

def run_corsi(model_id, prompt, ctx, temp, seed):
    rng=random.Random(seed)
    system=f"{prompt}\n\nCorsi. 9 blocks. Reproduce sequence.\nReturn ONLY JSON: {{ \"sequence\": [numbers] }}"
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
                    raw=call_claude(model_id,system,msg,h,150,temp)
                    h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
                else:
                    h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":"..."})
                if len(h)>ctx: h=h[-ctx:]
                time.sleep(0.05)
            pr=parse_json(h[-1]["content"],{})
            rec=[]
            if isinstance(pr,dict) and "sequence" in pr: rec=[int(x) for x in pr["sequence"] if str(x).isdigit()]
            else: rec=[int(x) for x in h[-1]["content"].split() if x.isdigit() and 1<=int(x)<=9][:span]
            if rec==seq: tc+=1
            else: fails+=1
            time.sleep(0.05)
        if fails>=2: break
    return {"max_span":span if tc>0 else 2, "total_correct":tc}

LETTERS=list("BCDFGHJKLMNPQRSTVWXZ")
def run_nback(model_id, prompt, ctx, temp, seed):
    rng=random.Random(seed)
    system=f"{prompt}\n\nN-back. Letters one at a time. 'match' if same as N back.\nReturn ONLY JSON: {{ \"response\": \"match\" or \"no match\" }}"
    h=[]; blocks=[(2,15),(3,15)]; all_h,all_m,all_f,all_c=0,0,0,0
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
                raw=call_claude(model_id,system,msg,h,60,temp)
                h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
                said="match" in raw.lower() and "no" not in raw.lower().split("match")[0][-5:]
                if is_tgt: all_h+=1 if said else 0; all_m+=0 if said else 1
                else: all_f+=1 if said else 0; all_c+=0 if said else 1
            if len(h)>ctx: h=h[-ctx:]
            time.sleep(0.05)
    nt,nn=all_h+all_m,all_f+all_c
    return {"hr":all_h/nt if nt>0 else 0, "far":all_f/nn if nn>0 else 0}

# ═══════════════════════════════════════════════════════════════
# 1. TEST-RETEST RELIABILITY
# ═══════════════════════════════════════════════════════════════

RETEST_PERSONAS = [
    {"id":"low","ctx":8,"temp":0.9,"prompt":"You are impulsive and easily distracted. Do the task naturally."},
    {"id":"med_low","ctx":10,"temp":0.75,"prompt":"You are moderately careful. Do the task naturally."},
    {"id":"med","ctx":12,"temp":0.6,"prompt":"You are focused and systematic. Do the task naturally."},
    {"id":"med_high","ctx":14,"temp":0.45,"prompt":"You are very analytical and thorough. Do the task naturally."},
    {"id":"high","ctx":16,"temp":0.3,"prompt":"You are extremely precise and methodical. Do the task naturally."},
]

# ═══════════════════════════════════════════════════════════════
# 2. MODEL VERSION SENSITIVITY
# ═══════════════════════════════════════════════════════════════

MODEL_VERSIONS = {
    "sonnet-4.6": "us.anthropic.claude-sonnet-4-6",
    "sonnet-4.5": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "sonnet-4.0": "anthropic.claude-sonnet-4-20250514-v1:0",
    "sonnet-3.7": "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
}

VERSION_PERSONAS = [
    {"id":"low","ctx":8,"temp":0.9,"prompt":"You are impulsive. Do the task naturally."},
    {"id":"med","ctx":12,"temp":0.6,"prompt":"You are moderately careful. Do the task naturally."},
    {"id":"high","ctx":16,"temp":0.3,"prompt":"You are very precise. Do the task naturally."},
]

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    MAIN_MODEL = "us.anthropic.claude-sonnet-4-6"

    # === 1. TEST-RETEST ===
    print("="*70)
    print("1. TEST-RETEST RELIABILITY")
    print("="*70)

    run1, run2 = {}, {}
    for p in RETEST_PERSONAS:
        print(f"\n  {p['id']} — Run 1...", end=" ", flush=True)
        w1 = run_wcst(MAIN_MODEL, p["prompt"], p["ctx"], p["temp"], seed=100)
        c1 = run_corsi(MAIN_MODEL, p["prompt"], p["ctx"], p["temp"], seed=100)
        n1 = run_nback(MAIN_MODEL, p["prompt"], p["ctx"], p["temp"], seed=100)
        run1[p["id"]] = {"wcst_pers":w1["pers"],"wcst_acc":w1["acc"],"corsi":c1["max_span"],"nback_hr":n1["hr"]}
        print(f"wcst={w1['pers']}/{w1['acc']:.0%}, corsi={c1['max_span']}, nback={n1['hr']:.2f}")

        print(f"  {p['id']} — Run 2...", end=" ", flush=True)
        w2 = run_wcst(MAIN_MODEL, p["prompt"], p["ctx"], p["temp"], seed=200)
        c2 = run_corsi(MAIN_MODEL, p["prompt"], p["ctx"], p["temp"], seed=200)
        n2 = run_nback(MAIN_MODEL, p["prompt"], p["ctx"], p["temp"], seed=200)
        run2[p["id"]] = {"wcst_pers":w2["pers"],"wcst_acc":w2["acc"],"corsi":c2["max_span"],"nback_hr":n2["hr"]}
        print(f"wcst={w2['pers']}/{w2['acc']:.0%}, corsi={c2['max_span']}, nback={n2['hr']:.2f}")

    def pearson(x,y):
        n=len(x); mx,my=sum(x)/n,sum(y)/n
        sx=math.sqrt(sum((xi-mx)**2 for xi in x)/(n-1)) if n>1 else 1
        sy=math.sqrt(sum((yi-my)**2 for yi in y)/(n-1)) if n>1 else 1
        if sx<1e-10 or sy<1e-10: return 0.0
        return sum((xi-mx)*(yi-my) for xi,yi in zip(x,y))/(n-1)/(sx*sy)

    print(f"\n  Test-Retest Correlations (n=5):")
    for metric in ["wcst_pers","wcst_acc","corsi","nback_hr"]:
        v1 = [run1[p["id"]][metric] for p in RETEST_PERSONAS]
        v2 = [run2[p["id"]][metric] for p in RETEST_PERSONAS]
        r = pearson(v1, v2)
        print(f"    {metric:>12}: r = {r:.3f}")
        print(f"      Run1: {[f'{v:.2f}' if isinstance(v,float) else str(v) for v in v1]}")
        print(f"      Run2: {[f'{v:.2f}' if isinstance(v,float) else str(v) for v in v2]}")
    print(f"  Human reference: Two-Step r=0.30, TOL/FIAR/Corsi r=0.50-0.86")

    # === 2. MODEL VERSION SENSITIVITY ===
    print(f"\n{'='*70}")
    print("2. MODEL VERSION SENSITIVITY")
    print("="*70)

    version_results = {}
    for vname, vid in MODEL_VERSIONS.items():
        print(f"\n  === {vname} ===")
        version_results[vname] = {}
        for p in VERSION_PERSONAS:
            print(f"    {p['id']}...", end=" ", flush=True)
            try:
                w = run_wcst(vid, p["prompt"], p["ctx"], p["temp"], seed=42)
                c = run_corsi(vid, p["prompt"], p["ctx"], p["temp"], seed=42)
                n = run_nback(vid, p["prompt"], p["ctx"], p["temp"], seed=42)
                version_results[vname][p["id"]] = {"wcst_pers":w["pers"],"wcst_acc":w["acc"],
                                                    "corsi":c["max_span"],"nback_hr":n["hr"]}
                print(f"wcst={w['pers']}/{w['acc']:.0%}, corsi={c['max_span']}, nback={n['hr']:.2f}")
            except Exception as e:
                print(f"FAILED: {e}")
                version_results[vname][p["id"]] = {"wcst_pers":-1,"wcst_acc":0,"corsi":0,"nback_hr":0}

    print(f"\n  Model Version Summary:")
    print(f"  {'Version':>15} | {'WCST_acc':>8} {'WCST_pe':>8} {'Corsi':>6} {'Nback':>6}")
    for vname in MODEL_VERSIONS:
        accs = [version_results[vname][p["id"]]["wcst_acc"] for p in VERSION_PERSONAS if version_results[vname][p["id"]]["wcst_pers"]>=0]
        pers = [version_results[vname][p["id"]]["wcst_pers"] for p in VERSION_PERSONAS if version_results[vname][p["id"]]["wcst_pers"]>=0]
        cors = [version_results[vname][p["id"]]["corsi"] for p in VERSION_PERSONAS if version_results[vname][p["id"]]["corsi"]>0]
        nbks = [version_results[vname][p["id"]]["nback_hr"] for p in VERSION_PERSONAS if version_results[vname][p["id"]]["nback_hr"]>0]
        print(f"  {vname:>15} | {sum(accs)/len(accs) if accs else 0:>8.0%} {sum(pers)/len(pers) if pers else 0:>8.1f} {sum(cors)/len(cors) if cors else 0:>6.1f} {sum(nbks)/len(nbks) if nbks else 0:>6.2f}")

    out = Path(__file__).parent / "reliability_results.json"
    json.dump({"test_retest":{"run1":run1,"run2":run2},"model_versions":version_results}, open(out,"w"), indent=2)
    print(f"\nSaved to {out}")
