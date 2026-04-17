"""
WCST Rerun with Standard 64-Card Deck
=======================================
Same 30 participants as the definitive study, but WCST only
with the correct standard stimulus deck (all 4×4×4 combinations).

Standard key cards (Grant & Berg, 1948):
  Card 1: 1 red triangle
  Card 2: 2 green stars
  Card 3: 3 yellow crosses
  Card 4: 4 blue circles

64 stimulus cards: all combinations of 4 colors × 4 shapes × 4 numbers.
64 trials, rule switches after 10 consecutive correct.
"""

import json, time, sys, math, random
from pathlib import Path
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

# Same 30 participants as definitive study
PARTICIPANTS = [
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

COLORS = ['red', 'green', 'yellow', 'blue']
SHAPES = ['triangle', 'star', 'cross', 'circle']
NUMBERS = [1, 2, 3, 4]
KEY_CARDS = [{"color":"red","shape":"triangle","number":1},{"color":"green","shape":"star","number":2},
             {"color":"yellow","shape":"cross","number":3},{"color":"blue","shape":"circle","number":4}]
RULE_ORDER = ['color','shape','number','color','shape','number']

# Standard 64-card deck
DECK = [{"color":c,"shape":s,"number":n} for c in COLORS for s in SHAPES for n in NUMBERS]

def desc_card(c): return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number']>1 else ''}"
def card_match(s,rule):
    for i,kc in enumerate(KEY_CARDS):
        if s[rule]==kc[rule]: return i+1
    return 1

def call_model(p, system, user, messages=None, max_tokens=200):
    if messages is None: msgs=[{"role":"user","content":user}]
    else: msgs=list(messages)+[{"role":"user","content":user}]
    for attempt in range(3):
        try:
            if p["api"]=="anthropic":
                bd={"anthropic_version":"bedrock-2023-05-31","max_tokens":max_tokens,"system":system,"messages":msgs}
                if p["temp"]!=1.0: bd["temperature"]=p["temp"]
                resp=bedrock.invoke_model(modelId=p["model"],contentType="application/json",accept="application/json",body=json.dumps(bd))
                return json.loads(resp["body"].read())["content"][0]["text"]
            else:
                conv=[{"role":m["role"],"content":[{"text":m["content"]}]} for m in msgs]
                ic={"maxTokens":max_tokens}
                if p["temp"]!=1.0: ic["temperature"]=p["temp"]
                resp=bedrock.converse(modelId=p["model"],messages=conv,system=[{"text":system}],inferenceConfig=ic)
                return resp["output"]["message"]["content"][0]["text"]
        except Exception as e:
            if attempt<2: time.sleep(2**attempt+random.random())
            else: print(f"  {p['id']} err: {e}",file=sys.stderr); return ""

def parse_json(raw, fallback=None):
    cleaned=raw.replace("```json","").replace("```","").replace("</think>","").strip()
    f,l=cleaned.rfind("{"),cleaned.rfind("}")
    if f>=0 and l>f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    f,l=cleaned.find("{"),cleaned.find("}")
    if f>=0 and l>f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    return fallback

WCST_SYS = "Wisconsin Card Sorting Test.\nKey cards: 1=red triangle, 2=green stars, 3=yellow crosses, 4=blue circles.\nSort by matching to a key card. Rule is HIDDEN. Learn from feedback. Rule may CHANGE.\nReturn ONLY JSON: { \"choice\": 1-4 }"

def run_wcst(p, n_trials=64):
    rng=random.Random(42+hash(p["id"]))
    system=f"{p['prompt']}\n\n{WCST_SYS}"
    h=[]; ri,rule,prev=0,RULE_ORDER[0],None
    con,cats,pers,errs=0,0,0,0; det=[]
    for t in range(n_trials):
        # Draw from standard 64-card deck
        s=DECK[int(rng.random()*len(DECK))]
        cor=card_match(s,rule); msg=""
        if t>0: msg+=f"{'Correct!' if det[-1]['c'] else 'Incorrect.'}\n\n"
        msg+=f"Trial {t+1}/{n_trials}. Stimulus: {desc_card(s)}. Which key card? (1-4)"
        raw=call_model(p,system,msg,h,100)
        pr=parse_json(raw,{}); ch=pr.get("choice",0) if isinstance(pr,dict) else 0
        if not isinstance(ch,int) or ch<1 or ch>4:
            m=__import__('re').search(r'[1-4]',raw); ch=int(m.group()) if m else random.randint(1,4)
        ic=ch==cor; ip=False
        if not ic:
            errs+=1
            if prev and card_match(s,prev)==ch: ip=True; pers+=1
        det.append({"c":ic,"p":ip})
        h.append({"role":"user","content":msg}); h.append({"role":"assistant","content":raw})
        if len(h)>p["ctx"]: h=h[-p["ctx"]:]
        if ic:
            con+=1
            if con>=10 and ri<len(RULE_ORDER)-1: prev=rule; ri+=1; rule=RULE_ORDER[ri]; cats+=1; con=0
        else: con=0
        time.sleep(0.1)
    return {"pers":pers,"errs":errs,"cats":cats,"acc":(n_trials-errs)/n_trials}

if __name__=="__main__":
    print("="*70)
    print("WCST RERUN: Standard 64-Card Deck × 30 Participants")
    print("="*70)

    results={}; t_start=time.time()
    for pi,p in enumerate(PARTICIPANTS):
        print(f"  [{pi+1}/30] {p['id']}...",end=" ",flush=True)
        r=run_wcst(p); results[p["id"]]=r
        print(f"pers={r['pers']}, acc={r['acc']:.0%}, cats={r['cats']}")

    # Summary by model family
    families={"sonnet":[p for p in PARTICIPANTS if "sonnet" in p["model"]],
              "opus":[p for p in PARTICIPANTS if "opus" in p["model"]],
              "haiku":[p for p in PARTICIPANTS if "haiku" in p["model"]],
              "qwen":[p for p in PARTICIPANTS if "qwen" in p["model"]],
              "mistral":[p for p in PARTICIPANTS if "mistral" in p["model"]]}

    print(f"\n{'Family':>10} {'N':>3} {'Mean Pers':>10} {'Mean Acc':>9} {'Mean Cats':>10}")
    for fam,ps in families.items():
        ids=[p["id"] for p in ps]
        pe=[results[i]["pers"] for i in ids]; ac=[results[i]["acc"] for i in ids]; ca=[results[i]["cats"] for i in ids]
        avg=lambda x:sum(x)/len(x)
        print(f"{fam:>10} {len(ps):>3} {avg(pe):>10.1f} {avg(ac):>9.0%} {avg(ca):>10.1f}")

    all_ids=[p["id"] for p in PARTICIPANTS]
    all_pers=[results[i]["pers"] for i in all_ids]
    all_acc=[results[i]["acc"] for i in all_ids]
    mean_p=sum(all_pers)/30; sd_p=math.sqrt(sum((v-mean_p)**2 for v in all_pers)/29)
    mean_a=sum(all_acc)/30
    print(f"\nOverall (n=30): pers M={mean_p:.1f} SD={sd_p:.1f}, acc={mean_a:.0%}")
    print(f"Human reference: pers=2.45 (SEM=0.17)")

    out=Path(__file__).parent/"wcst_fixed_results.json"
    json.dump(results,open(out,"w"),indent=2)
    print(f"\nTime: {(time.time()-t_start)/60:.0f}min. Saved to {out}")
