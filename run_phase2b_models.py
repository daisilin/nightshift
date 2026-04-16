"""
Phase 2b: Model Tier as Cognitive Ability
==========================================
Tests: does model capability map onto g-factor?

WCST × [Haiku, Sonnet, Opus] × 3 personas
N-back × [Haiku, Sonnet, Opus] × 3 personas
FIAR × [Haiku, Sonnet, Opus] × 3 personas
"""

import json, time, sys, math, random
from pathlib import Path
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

MODELS = {
    "haiku": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    "sonnet": "us.anthropic.claude-sonnet-4-6",
    "opus": "us.anthropic.claude-opus-4-6-v1",
}

PERSONAS = [
    {"id": "emma", "prompt": "You are Emma, a 19-year-old psychology sophomore at a large Midwestern state university. You're doing this study for course credit. You've done 3 other psych studies this semester and are getting tired of them. You tend to check your phone between trials. You go with your gut and respond quickly — thinking too long feels uncomfortable. You're cooperative and tend to go along with what's asked. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
    {"id": "james", "prompt": "You are James, a 22-year-old computer science senior at a private East Coast university. You enjoy puzzles and competitive games. You're an analytical thinker who looks for patterns and optimal strategies. You think things through carefully before responding — you'd rather be slow and right than fast and wrong. You can focus deeply on a task even when there are distractions. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
    {"id": "dorothy", "prompt": "You are Dorothy, a 71-year-old retired high school teacher from Vermont. You read everything twice — a habit from 35 years of grading papers. You're not comfortable with computers; your grandson helped set you up. You process information more slowly than you used to but compensate by being very deliberate. You get tired after about 20 minutes of sustained concentration. You tend to agree with statements rather than disagree. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
]

def call_claude(model_id, system, user, messages=None, max_tokens=300):
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

def parse_json(raw, fallback=None):
    cleaned = raw.replace("```json","").replace("```","").strip()
    f, l = cleaned.find("{"), cleaned.rfind("}")
    if f >= 0 and l > f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    return fallback

# ─── WCST (32 trials) ───
COLORS = ['red','green','yellow','blue']; SHAPES = ['triangle','star','cross','circle']
KEY_CARDS = [{"color":"red","shape":"triangle","number":1},{"color":"green","shape":"star","number":2},{"color":"yellow","shape":"cross","number":3},{"color":"blue","shape":"circle","number":4}]
RULE_ORDER = ['color','shape','number','color','shape','number']
def describe_card(c): return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number']>1 else ''}"
def random_card(): return {"color":random.choice(COLORS),"shape":random.choice(SHAPES),"number":random.randint(1,4)}
def correct_match(s, rule):
    for i,kc in enumerate(KEY_CARDS):
        if s[rule]==kc[rule]: return i+1
    return 1

WCST_SYS = "You are doing the Wisconsin Card Sorting Test.\n\nFour key cards: Card 1: 1 red triangle, Card 2: 2 green stars, Card 3: 3 yellow crosses, Card 4: 4 blue circles.\n\nSort stimulus cards by matching to a key card. Rule is HIDDEN. Figure it out from feedback. Rule may CHANGE.\n\nReturn ONLY JSON: { \"choice\": 1-4, \"reasoning\": \"brief\" }"

def run_wcst(model_id, persona, n_trials=32):
    system = f"{persona['prompt']}\n\n{WCST_SYS}"
    history = []; rule_idx, rule, prev_rule = 0, RULE_ORDER[0], None
    consec, cats, pers, errs = 0, 0, 0, 0; details = []
    for t in range(n_trials):
        stim = random_card(); correct = correct_match(stim, rule)
        msg = ""
        if t > 0: msg += f"{'Correct!' if details[-1]['c'] else 'Incorrect.'}\n\n"
        msg += f"Trial {t+1}/{n_trials}. Stimulus: {describe_card(stim)}. Which key card? (1-4)"
        raw = call_claude(model_id, system, msg, history, 150)
        p = parse_json(raw, {}); ch = p.get("choice",0) if isinstance(p,dict) else 0
        if not isinstance(ch,int) or ch<1 or ch>4:
            m = __import__('re').search(r'[1-4]', raw); ch = int(m.group()) if m else 1
        ic = ch == correct; ip = False
        if not ic:
            errs += 1
            if prev_rule and correct_match(stim, prev_rule) == ch: ip = True; pers += 1
        details.append({"t":t,"c":ic,"p":ip})
        history.append({"role":"user","content":msg}); history.append({"role":"assistant","content":raw})
        if len(history) > 30: history = history[-30:]
        if ic:
            consec += 1
            if consec >= 10 and rule_idx < len(RULE_ORDER)-1:
                prev_rule = rule; rule_idx += 1; rule = RULE_ORDER[rule_idx]; cats += 1; consec = 0
        else: consec = 0
        time.sleep(0.15)
    return {"pers":pers, "errs":errs, "cats":cats, "acc":(n_trials-errs)/n_trials}

# ─── N-BACK (2 blocks, 15 letters each) ───
LETTERS = list("BCDFGHJKLMNPQRSTVWXZ")
def run_nback(model_id, persona, seed=42):
    rng = random.Random(seed + hash(persona["id"]))
    system = f"{persona['prompt']}\n\nN-back task. Letters ONE AT A TIME. 'match' if same as N back, else 'no match'.\nReturn ONLY JSON: {{ \"response\": \"match\" or \"no match\" }}"
    history = []; blocks = [(2,15),(3,15)]; results = []
    for n_back, length in blocks:
        seq = []
        for i in range(length):
            if i >= n_back and rng.random() < 0.3: seq.append(seq[i-n_back])
            else:
                l = rng.choice(LETTERS)
                while i >= n_back and l == seq[i-n_back]: l = rng.choice(LETTERS)
                seq.append(l)
        hits,misses,fas,crs = 0,0,0,0
        history.append({"role":"user","content":f"Block: {n_back}-back."}); history.append({"role":"assistant","content":"Ready."})
        for ti, letter in enumerate(seq):
            is_resp = ti >= n_back; is_tgt = is_resp and seq[ti]==seq[ti-n_back]
            if not is_resp:
                history.append({"role":"user","content":f"Letter {ti+1}: {letter} [observe]"})
                history.append({"role":"assistant","content":"Noted."})
            else:
                msg = f"Letter {ti+1}: {letter} — match or no match?"
                raw = call_claude(model_id, system, msg, history, 60)
                history.append({"role":"user","content":msg}); history.append({"role":"assistant","content":raw})
                said = "match" in raw.lower() and "no" not in raw.lower().split("match")[0][-5:]
                if is_tgt: hits += 1 if said else 0; misses += 0 if said else 1
                else: fas += 1 if said else 0; crs += 0 if said else 1
            if len(history) > 12: history = history[-12:]
            time.sleep(0.1)
        nt,nn = hits+misses, fas+crs
        results.append({"nback":n_back,"hr":hits/nt if nt>0 else 0,"far":fas/nn if nn>0 else 0})
    all_hr = sum(b.get("hr",0) for b in results)/len(results)
    all_far = sum(b.get("far",0) for b in results)/len(results)
    return {"hr":all_hr, "far":all_far, "blocks":results}

# ─── FIAR (6 games for speed) ───
def create_board(): return [['.']*9 for _ in range(4)]
def check_win(b,p):
    for r in range(4):
        for c in range(9):
            if b[r][c]!=p: continue
            for dr,dc in [(0,1),(1,0),(1,1),(1,-1)]:
                if all(0<=r+dr*k<4 and 0<=c+dc*k<9 and b[r+dr*k][c+dc*k]==p for k in range(4)): return True
    return False
def ai_move(b,skill,rng):
    empty=[(r,c) for r in range(4) for c in range(9) if b[r][c]=='.']
    if not empty: return None
    for r,c in empty:
        b[r][c]='O'
        if check_win(b,'O'): b[r][c]='.'; return (r,c)
        b[r][c]='.'
    for r,c in empty:
        b[r][c]='X'
        if check_win(b,'X'):
            b[r][c]='.'
            if rng.random()<skill: return (r,c)
        b[r][c]='.'
    return rng.choice(empty)

def run_fiar(model_id, persona, n_games=6, seed=42):
    rng = random.Random(seed + hash(persona["id"]))
    system = f"{persona['prompt']}\n\nFour-in-a-Row. 4×9 board. You=X. Free placement. Get 4 in a row.\nReturn ONLY JSON: {{ \"row\": 1-4, \"col\": 1-9 }}"
    history = []; wins,losses,draws = 0,0,0
    for gi in range(n_games):
        skill = 0.3 + (gi/n_games)*0.5; board = create_board(); result = "draw"
        player_first = gi%2==0; turn_player = player_first
        if not player_first:
            mv = ai_move(board,skill,rng)
            if mv: board[mv[0]][mv[1]]='O'
        for turn in range(18):
            empty=[(r,c) for r in range(4) for c in range(9) if board[r][c]=='.']
            if not empty: break
            if turn_player:
                bt = "  "+" ".join(str(i+1) for i in range(9))+"\n"+"\n".join(f"{i+1} {' '.join(board[i])}" for i in range(4))
                raw = call_claude(model_id, system, f"Game {gi+1}.\n{bt}\nYour move (X):", history, 80)
                history.append({"role":"user","content":"Board shown. Move:"}); history.append({"role":"assistant","content":raw})
                if len(history)>12: history=history[-12:]
                p = parse_json(raw,{}); r=(int(p.get("row",0)) if isinstance(p,dict) else 0)-1; c=(int(p.get("col",0)) if isinstance(p,dict) else 0)-1
                if 0<=r<4 and 0<=c<9 and board[r][c]=='.': board[r][c]='X'
                else:
                    mv=rng.choice(empty); board[mv[0]][mv[1]]='X'
                if check_win(board,'X'): result="win"; wins+=1; break
            else:
                mv=ai_move(board,skill,rng)
                if mv:
                    board[mv[0]][mv[1]]='O'
                    if check_win(board,'O'): result="loss"; losses+=1; break
            turn_player = not turn_player
            time.sleep(0.1)
        if result=="draw": draws+=1
    return {"wins":wins,"losses":losses,"draws":draws,"win_rate":wins/n_games}

# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("="*70)
    print("PHASE 2b: MODEL TIER AS COGNITIVE ABILITY")
    print("="*70)

    results = {"wcst":{},"nback":{},"fiar":{}}

    for model_name, model_id in MODELS.items():
        print(f"\n=== Model: {model_name} ({model_id}) ===")
        for p in PERSONAS:
            pid = p["id"]
            print(f"  WCST {model_name}/{pid}...", end=" ", flush=True)
            r = run_wcst(model_id, p)
            results["wcst"][f"{pid}_{model_name}"] = {**r, "model":model_name, "persona":pid}
            print(f"pers={r['pers']}, acc={r['acc']:.0%}")

            print(f"  N-back {model_name}/{pid}...", end=" ", flush=True)
            r = run_nback(model_id, p)
            results["nback"][f"{pid}_{model_name}"] = {**r, "model":model_name, "persona":pid}
            print(f"hr={r['hr']:.2f}, far={r['far']:.2f}")

            print(f"  FIAR {model_name}/{pid}...", end=" ", flush=True)
            r = run_fiar(model_id, p)
            results["fiar"][f"{pid}_{model_name}"] = {**r, "model":model_name, "persona":pid}
            print(f"wins={r['wins']}/{6}")

    # Summary
    print("\n" + "="*70)
    print("PHASE 2b SUMMARY")
    print("="*70)

    print("\nWCST Perseverative Errors by Model:")
    print(f"{'Model':>8} {'Emma':>8} {'James':>8} {'Dorothy':>8} {'Mean':>8}")
    for mn in MODELS:
        vals = [results["wcst"][f"{p['id']}_{mn}"]["pers"] for p in PERSONAS]
        print(f"{mn:>8} {vals[0]:>8} {vals[1]:>8} {vals[2]:>8} {sum(vals)/3:>8.1f}")

    print("\nN-back Hit Rate by Model:")
    print(f"{'Model':>8} {'Emma':>8} {'James':>8} {'Dorothy':>8} {'Mean':>8}")
    for mn in MODELS:
        vals = [results["nback"][f"{p['id']}_{mn}"]["hr"] for p in PERSONAS]
        print(f"{mn:>8} {vals[0]:>8.2f} {vals[1]:>8.2f} {vals[2]:>8.2f} {sum(vals)/3:>8.2f}")

    print("\nFIAR Win Rate by Model:")
    print(f"{'Model':>8} {'Emma':>8} {'James':>8} {'Dorothy':>8} {'Mean':>8}")
    for mn in MODELS:
        vals = [results["fiar"][f"{p['id']}_{mn}"]["win_rate"] for p in PERSONAS]
        print(f"{mn:>8} {vals[0]:>8.0%} {vals[1]:>8.0%} {vals[2]:>8.0%} {sum(vals)/3:>8.0%}")

    out = Path(__file__).parent / "phase2b_results.json"
    json.dump(results, open(out,"w"), indent=2)
    print(f"\nSaved to {out}")
