"""
Multi-Model Cognitive Diversity
================================
Test 7 models on WCST + Corsi to see if different architectures
produce genuinely different cognitive profiles.

Models: Haiku, Sonnet, Opus, Qwen3-32B, Qwen3-235B, Gemma-27B, Mistral-Large
Each model runs 3 personas (low/med/high WM) on WCST (32 trials) + Corsi (adaptive)
"""

import json, time, sys, math, random
from pathlib import Path
import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))

MODELS = {
    "haiku-4.5": {"id": "us.anthropic.claude-haiku-4-5-20251001-v1:0", "family": "anthropic", "api": "anthropic"},
    "sonnet-4.6": {"id": "us.anthropic.claude-sonnet-4-6", "family": "anthropic", "api": "anthropic"},
    "opus-4.6": {"id": "us.anthropic.claude-opus-4-6-v1", "family": "anthropic", "api": "anthropic"},
    "qwen3-32b": {"id": "qwen.qwen3-32b-v1:0", "family": "qwen", "api": "converse"},
    "qwen3-235b": {"id": "qwen.qwen3-235b-a22b-2507-v1:0", "family": "qwen", "api": "converse"},
    "gemma-27b": {"id": "google.gemma-3-27b-it", "family": "google", "api": "converse"},
    "mistral-lg": {"id": "mistral.mistral-large-3-675b-instruct", "family": "mistral", "api": "converse"},
}

PERSONAS = [
    {"id": "low", "ctx": 8, "prompt": "You are a participant in a research study. You tend to be quick and impulsive. Do the task as you naturally would."},
    {"id": "med", "ctx": 12, "prompt": "You are a participant in a research study. You are moderately careful and focused. Do the task as you naturally would."},
    {"id": "high", "ctx": 16, "prompt": "You are a participant in a research study. You are very analytical and methodical. Do the task as you naturally would."},
]

def call_model(model_name, system, user, messages=None, max_tokens=200):
    model = MODELS[model_name]
    if messages is None: msgs = [{"role": "user", "content": user}]
    else: msgs = list(messages) + [{"role": "user", "content": user}]

    for attempt in range(3):
        try:
            if model["api"] == "anthropic":
                body = json.dumps({"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens,
                                  "system": system, "messages": msgs})
                resp = bedrock.invoke_model(modelId=model["id"], contentType="application/json",
                                           accept="application/json", body=body)
                data = json.loads(resp["body"].read())
                return data["content"][0]["text"]
            else:
                # Use converse API for non-Anthropic models
                converse_msgs = []
                for m in msgs:
                    converse_msgs.append({"role": m["role"], "content": [{"text": m["content"]}]})
                resp = bedrock.converse(
                    modelId=model["id"],
                    messages=converse_msgs,
                    system=[{"text": system}],
                    inferenceConfig={"maxTokens": max_tokens},
                )
                return resp["output"]["message"]["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt + random.random())
            else: print(f"    {model_name} err: {e}", file=sys.stderr); return ""

def parse_json(raw, fallback=None):
    cleaned = raw.replace("```json","").replace("```","").strip()
    f, l = cleaned.find("{"), cleaned.rfind("}")
    if f >= 0 and l > f:
        try: return json.loads(cleaned[f:l+1])
        except: pass
    return fallback

# ═══════════════════════════════════════════════════════════════
# WCST (32 trials, ctx-limited)
# ═══════════════════════════════════════════════════════════════

COLORS = ['red','green','yellow','blue']; SHAPES = ['triangle','star','cross','circle']
KEY_CARDS = [{"color":"red","shape":"triangle","number":1},{"color":"green","shape":"star","number":2},
             {"color":"yellow","shape":"cross","number":3},{"color":"blue","shape":"circle","number":4}]
RULE_ORDER = ['color','shape','number','color','shape','number']
def desc_card(c): return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number']>1 else ''}"
def rand_card(): return {"color":random.choice(COLORS),"shape":random.choice(SHAPES),"number":random.randint(1,4)}
def card_match(s,rule):
    for i,kc in enumerate(KEY_CARDS):
        if s[rule]==kc[rule]: return i+1
    return 1

WCST_SYS = "Wisconsin Card Sorting Test.\nKey cards: 1=red triangle, 2=green stars, 3=yellow crosses, 4=blue circles.\nSort by matching. Rule is HIDDEN. Learn from feedback. Rule may CHANGE.\nReturn ONLY JSON: { \"choice\": 1-4 }"

def run_wcst(model_name, persona):
    ctx = persona["ctx"]
    system = f"{persona['prompt']}\n\n{WCST_SYS}"
    h = []; ri, rule, prev = 0, RULE_ORDER[0], None
    con, cats, pers, errs = 0, 0, 0, 0; det = []
    for t in range(32):
        s = rand_card(); cor = card_match(s, rule)
        msg = ""
        if t > 0: msg += f"{'Correct!' if det[-1] else 'Incorrect.'}\n\n"
        msg += f"Trial {t+1}/32. Stimulus: {desc_card(s)}. (1-4)"
        raw = call_model(model_name, system, msg, h, 100)
        pr = parse_json(raw, {})
        ch = pr.get("choice", 0) if isinstance(pr, dict) else 0
        if not isinstance(ch, int) or ch < 1 or ch > 4:
            m = __import__('re').search(r'[1-4]', raw)
            ch = int(m.group()) if m else random.randint(1, 4)
        ic = ch == cor; ip = False
        if not ic:
            errs += 1
            if prev and card_match(s, prev) == ch: ip = True; pers += 1
        det.append(ic)
        h.append({"role": "user", "content": msg})
        h.append({"role": "assistant", "content": raw})
        if len(h) > ctx: h = h[-ctx:]
        if ic:
            con += 1
            if con >= 10 and ri < len(RULE_ORDER) - 1:
                prev = rule; ri += 1; rule = RULE_ORDER[ri]; cats += 1; con = 0
        else: con = 0
        time.sleep(0.15)
    return {"pers": pers, "errs": errs, "cats": cats, "acc": (32-errs)/32}

# ═══════════════════════════════════════════════════════════════
# CORSI (adaptive, ctx-limited)
# ═══════════════════════════════════════════════════════════════

BL = {1:"top-center",2:"top-right",3:"upper-left",4:"upper-right",5:"center",
      6:"center-right",7:"lower-left",8:"lower-right",9:"bottom-center"}

def run_corsi(model_name, persona, seed=42):
    ctx = persona["ctx"]
    rng = random.Random(seed + hash(model_name) + hash(persona["id"]))
    system = f"{persona['prompt']}\n\nCorsi Block-Tapping. 9 blocks. Light up one at a time. Reproduce in order.\nReturn ONLY JSON: {{ \"sequence\": [numbers] }}"
    h = []; tc = 0
    for span in range(3, 10):
        fails = 0
        for t in range(2):
            seq = []
            for _ in range(span):
                b = rng.randint(1, 9)
                while seq and b == seq[-1]: b = rng.randint(1, 9)
                seq.append(b)
            h.append({"role": "user", "content": f"Span {span}. Watch:"})
            h.append({"role": "assistant", "content": "OK."})
            for si, b in enumerate(seq):
                msg = f"Block {b} ({BL[b]})."
                if si == span - 1:
                    msg += " Done. Reproduce."
                    raw = call_model(model_name, system, msg, h, 150)
                    h.append({"role": "user", "content": msg})
                    h.append({"role": "assistant", "content": raw})
                else:
                    h.append({"role": "user", "content": msg})
                    h.append({"role": "assistant", "content": "..."})
                if len(h) > ctx: h = h[-ctx:]
                time.sleep(0.06)
            pr = parse_json(h[-1]["content"], {})
            rec = []
            if isinstance(pr, dict) and "sequence" in pr:
                rec = [int(x) for x in pr["sequence"] if str(x).isdigit()]
            else:
                rec = [int(x) for x in h[-1]["content"].split() if x.isdigit() and 1 <= int(x) <= 9][:span]
            if rec == seq: tc += 1
            else: fails += 1
            time.sleep(0.06)
        if fails >= 2: break
    ms = max(span for span in range(3, 10) if any(d for d in range(2)))  # simplified
    # Recompute max span from results
    # (simplified: just track what we got)
    return {"corsi_score": tc, "max_span": span if tc > 0 else 2, "total_correct": tc}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 70)
    print("MULTI-MODEL COGNITIVE DIVERSITY")
    print(f"7 models × 3 personas × WCST + Corsi")
    print("=" * 70)

    results = {"wcst": {}, "corsi": {}}

    for model_name in MODELS:
        print(f"\n  === {model_name} ({MODELS[model_name]['family']}) ===")
        for persona in PERSONAS:
            key = f"{model_name}_{persona['id']}"

            print(f"    WCST {persona['id']}...", end=" ", flush=True)
            try:
                r = run_wcst(model_name, persona)
                results["wcst"][key] = {**r, "model": model_name, "persona": persona["id"]}
                print(f"pers={r['pers']}, acc={r['acc']:.0%}")
            except Exception as e:
                print(f"FAILED: {e}")
                results["wcst"][key] = {"pers": -1, "errs": -1, "cats": 0, "acc": 0, "model": model_name, "persona": persona["id"]}

            print(f"    Corsi {persona['id']}...", end=" ", flush=True)
            try:
                r = run_corsi(model_name, persona)
                results["corsi"][key] = {**r, "model": model_name, "persona": persona["id"]}
                print(f"correct={r['total_correct']}")
            except Exception as e:
                print(f"FAILED: {e}")
                results["corsi"][key] = {"corsi_score": 0, "max_span": 0, "total_correct": 0, "model": model_name, "persona": persona["id"]}

    # Summary
    print("\n" + "=" * 70)
    print("MULTI-MODEL SUMMARY")
    print("=" * 70)

    print(f"\nWCST Perseverative Errors:")
    print(f"  {'Model':>15} {'Low WM':>8} {'Med WM':>8} {'High WM':>8} {'Mean':>8}")
    for mn in MODELS:
        vals = [results["wcst"].get(f"{mn}_{p['id']}", {}).get("pers", -1) for p in PERSONAS]
        mean = sum(v for v in vals if v >= 0) / max(1, sum(1 for v in vals if v >= 0))
        print(f"  {mn:>15} {vals[0]:>8} {vals[1]:>8} {vals[2]:>8} {mean:>8.1f}")

    print(f"\nWCST Accuracy:")
    print(f"  {'Model':>15} {'Low WM':>8} {'Med WM':>8} {'High WM':>8} {'Mean':>8}")
    for mn in MODELS:
        vals = [results["wcst"].get(f"{mn}_{p['id']}", {}).get("acc", 0) for p in PERSONAS]
        mean = sum(vals) / len(vals)
        print(f"  {mn:>15} {vals[0]:>8.0%} {vals[1]:>8.0%} {vals[2]:>8.0%} {mean:>8.0%}")

    print(f"\nCorsi Total Correct:")
    print(f"  {'Model':>15} {'Low WM':>8} {'Med WM':>8} {'High WM':>8} {'Mean':>8}")
    for mn in MODELS:
        vals = [results["corsi"].get(f"{mn}_{p['id']}", {}).get("total_correct", 0) for p in PERSONAS]
        mean = sum(vals) / len(vals)
        print(f"  {mn:>15} {vals[0]:>8} {vals[1]:>8} {vals[2]:>8} {mean:>8.1f}")

    print(f"\n  Human reference: WCST pers=2.45, Corsi score=53.5")

    out = Path(__file__).parent / "multi_model_results.json"
    json.dump(results, open(out, "w"), indent=2)
    print(f"\nSaved to {out}")
