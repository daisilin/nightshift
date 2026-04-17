"""
WCST Multimodal: Visual Card Sorting with Fixed Key Cards
==========================================================
Two critical fixes:
1. Key cards have UNCORRELATED dimensions (color/shape/number scrambled)
2. Cards rendered as images, sent via vision API

Key Cards (dimensions uncorrelated):
  Card 1: 1 red star       (color=red, shape=star, number=1)
  Card 2: 2 green cross    (color=green, shape=cross, number=2)
  Card 3: 3 yellow circle  (color=yellow, shape=circle, number=3)
  Card 4: 4 blue triangle  (color=blue, shape=triangle, number=4)

Now matching by color→Card1, by shape→Card4(triangle≠Card1), by number→Card2(2≠1).
Rule switches produce immediate feedback change.

Conditions:
A. Text + old correlated keys (baseline — shows the bug)
B. Text + new uncorrelated keys (fixes key correlation)
C. Multimodal + new uncorrelated keys (full fix)
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

def call_claude(system, user, messages=None, max_tokens=200, model_id="us.anthropic.claude-sonnet-4-6"):
    if messages is None: messages = [{"role":"user","content":user}]
    else: messages = list(messages) + [{"role":"user","content":user}]
    for attempt in range(3):
        try:
            bd = {"anthropic_version":"bedrock-2023-05-31","max_tokens":max_tokens,"system":system,"messages":messages}
            resp = bedrock.invoke_model(modelId=model_id, contentType="application/json", accept="application/json", body=json.dumps(bd))
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt+random.random())
            else: print(f"  err: {e}",file=sys.stderr); return ""

def call_vision(system, user_text, image_b64, max_tokens=200, model_id="us.anthropic.claude-sonnet-4-6"):
    messages = [{"role":"user","content":[
        {"type":"image","source":{"type":"base64","media_type":"image/png","data":image_b64}},
        {"type":"text","text":user_text}]}]
    for attempt in range(3):
        try:
            bd = {"anthropic_version":"bedrock-2023-05-31","max_tokens":max_tokens,"system":system,"messages":messages}
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
# KEY CARD DEFINITIONS
# ═══════════════════════════════════════════════════════════════

# OLD (correlated — the bug)
OLD_KEYS = [
    {"color":"red","shape":"triangle","number":1},
    {"color":"green","shape":"star","number":2},
    {"color":"yellow","shape":"cross","number":3},
    {"color":"blue","shape":"circle","number":4},
]

# NEW (uncorrelated — the fix)
# Each dimension maps to a DIFFERENT card position
# Color: red=1, green=2, yellow=3, blue=4
# Shape: star=1, cross=2, circle=3, triangle=4
# Number: 1=1, 2=2, 3=3, 4=4... but scrambled with shapes
NEW_KEYS = [
    {"color":"red","shape":"star","number":3},       # color→1, shape→1, number→3: all different except shape
    {"color":"green","shape":"triangle","number":1},  # color→2, shape→4 wait...
    {"color":"yellow","shape":"circle","number":4},   # color→3, shape→3... still correlated
    {"color":"blue","shape":"cross","number":2},      # color→4, shape→3...
]

# Actually let me be more careful. We need: for ANY stimulus,
# matching by color gives card X, by shape gives card Y, by number gives card Z,
# where X≠Y≠Z (or at least X≠Y and X≠Z).
#
# This means the mapping color→card, shape→card, number→card must be
# different permutations.
#
# Color mapping: red→1, green→2, yellow→3, blue→4
# Shape mapping: triangle→1, star→2, cross→3, circle→4  ← same as color! BAD
# Need shape mapping to be a DIFFERENT permutation:
# Shape mapping: cross→1, circle→2, triangle→3, star→4
# Number mapping: 3→1, 1→2, 4→3, 2→4

NEW_KEYS = [
    {"color":"red","shape":"cross","number":3},
    {"color":"green","shape":"circle","number":1},
    {"color":"yellow","shape":"triangle","number":4},
    {"color":"blue","shape":"star","number":2},
]

# Verify: for a stimulus like "2 red triangle"
# By color (red): Card 1
# By shape (triangle): Card 3
# By number (2): Card 4
# All different! ✓

COLORS = ['red','green','yellow','blue']
SHAPES = ['cross','circle','triangle','star']
NUMBERS = [1,2,3,4]
RULE_ORDER = ['color','shape','number','color','shape','number']

def card_match(s, rule, keys):
    for i, kc in enumerate(keys):
        if s[rule] == kc[rule]: return i+1
    return 1

def desc_card(c):
    return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number']>1 else ''}"

def gen_stimulus(rule, keys, rng):
    """Generate stimulus that matches different key cards under different rules."""
    for _ in range(200):
        s = {"color":rng.choice(COLORS),"shape":rng.choice(SHAPES),"number":rng.choice(NUMBERS)}
        matches = {d: card_match(s, d, keys) for d in ['color','shape','number']}
        if len(set(matches.values())) == 3:  # all 3 rules give different cards
            return s
    # Fallback: at least 2 different
    for _ in range(100):
        s = {"color":rng.choice(COLORS),"shape":rng.choice(SHAPES),"number":rng.choice(NUMBERS)}
        matches = {d: card_match(s, d, keys) for d in ['color','shape','number']}
        if len(set(matches.values())) >= 2: return s
    return {"color":rng.choice(COLORS),"shape":rng.choice(SHAPES),"number":rng.choice(NUMBERS)}

# ═══════════════════════════════════════════════════════════════
# CARD RENDERING
# ═══════════════════════════════════════════════════════════════

COLOR_HEX = {"red":(220,60,60),"green":(60,180,80),"yellow":(220,200,50),"blue":(60,100,220)}
CARD_W, CARD_H = 100, 130

def draw_shape(draw, cx, cy, shape, color, size=18):
    r,g,b = COLOR_HEX[color]
    if shape == "triangle":
        draw.polygon([(cx,cy-size),(cx-size,cy+size),(cx+size,cy+size)], fill=(r,g,b))
    elif shape == "circle":
        draw.ellipse([cx-size,cy-size,cx+size,cy+size], fill=(r,g,b))
    elif shape == "star":
        # Simple 5-pointed star approximation
        pts = []
        for i in range(10):
            angle = math.pi/2 + i * math.pi/5
            rad = size if i%2==0 else size*0.4
            pts.append((cx + rad*math.cos(angle), cy - rad*math.sin(angle)))
        draw.polygon(pts, fill=(r,g,b))
    elif shape == "cross":
        t = size * 0.35
        draw.rectangle([cx-t, cy-size, cx+t, cy+size], fill=(r,g,b))
        draw.rectangle([cx-size, cy-t, cx+size, cy+t], fill=(r,g,b))

def render_card(card, label=""):
    if not HAS_PIL: return ""
    img = Image.new('RGB', (CARD_W, CARD_H), (255,255,255))
    draw = ImageDraw.Draw(img)
    draw.rectangle([0,0,CARD_W-1,CARD_H-1], outline=(180,180,180), width=2)

    n = card["number"]
    # Position shapes based on count
    positions = {
        1: [(CARD_W//2, CARD_H//2)],
        2: [(CARD_W//2, CARD_H//3), (CARD_W//2, 2*CARD_H//3)],
        3: [(CARD_W//2, CARD_H//4), (CARD_W//2, CARD_H//2), (CARD_W//2, 3*CARD_H//4)],
        4: [(CARD_W//3, CARD_H//3), (2*CARD_W//3, CARD_H//3), (CARD_W//3, 2*CARD_H//3), (2*CARD_W//3, 2*CARD_H//3)],
    }
    for cx, cy in positions.get(n, positions[1]):
        draw_shape(draw, cx, cy, card["shape"], card["color"], size=14)

    if label:
        try: draw.text((CARD_W//2-8, CARD_H-16), label, fill=(120,120,120))
        except: pass

    buf = io.BytesIO(); img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()

def render_wcst_display(keys, stimulus):
    """Render the full WCST display: 4 key cards on top, stimulus below."""
    if not HAS_PIL: return ""
    W = CARD_W * 4 + 50
    H = CARD_H * 2 + 60
    img = Image.new('RGB', (W, H), (240, 240, 235))
    draw = ImageDraw.Draw(img)

    # Key cards on top
    try: draw.text((10, 5), "KEY CARDS:", fill=(80,80,80))
    except: pass
    for i, kc in enumerate(keys):
        card_img = Image.open(io.BytesIO(base64.b64decode(render_card(kc, f"Card {i+1}"))))
        img.paste(card_img, (10 + i*(CARD_W+10), 22))

    # Stimulus below center
    try: draw.text((10, CARD_H + 35), "SORT THIS CARD:", fill=(80,80,80))
    except: pass
    stim_img = Image.open(io.BytesIO(base64.b64decode(render_card(stimulus))))
    # Add highlight border to stimulus
    sx = W//2 - CARD_W//2
    sy = CARD_H + 50
    draw.rectangle([sx-3, sy-3, sx+CARD_W+3, sy+CARD_H+3], outline=(200,100,50), width=3)
    img.paste(stim_img, (sx, sy))

    buf = io.BytesIO(); img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()

# ═══════════════════════════════════════════════════════════════
# RUN WCST
# ═══════════════════════════════════════════════════════════════

PERSONA = "You are a participant in a research study. Do the task naturally."

def run_wcst(keys, mode, n_trials=32, seed=42, ctx=12):
    rng = random.Random(seed)
    keys_desc = ", ".join(f"Card {i+1}: {desc_card(kc)}" for i,kc in enumerate(keys))

    if mode == "text":
        system = f"{PERSONA}\n\nWCST. Key cards: {keys_desc}.\nSort by hidden rule (color, shape, or number). Learn from feedback. Rule may change.\nReturn ONLY JSON: {{ \"choice\": 1-4 }}"
    else:
        system = f"{PERSONA}\n\nWCST. You see 4 key cards and a stimulus card in the image.\nSort the stimulus by matching to a key card. Rule is hidden (color, shape, or number). Learn from feedback.\nReturn ONLY JSON: {{ \"choice\": 1-4 }}"

    h = []; ri, rule, prev = 0, RULE_ORDER[0], None
    con, cats, pers, errs = 0, 0, 0, 0; det = []

    for t in range(n_trials):
        s = gen_stimulus(rule, keys, rng)
        correct = card_match(s, rule, keys)

        # Check ambiguity
        matches = {d: card_match(s, d, keys) for d in ['color','shape','number']}
        n_unique = len(set(matches.values()))

        msg = ""
        if t > 0: msg += f"{'Correct!' if det[-1]['c'] else 'Incorrect.'}\n\n"

        if mode == "multimodal" and HAS_PIL:
            img_b64 = render_wcst_display(keys, s)
            msg += f"Trial {t+1}/{n_trials}. Which key card? (1-4)"
            raw = call_vision(system, msg, img_b64, 100)
        else:
            msg += f"Trial {t+1}/{n_trials}. Stimulus: {desc_card(s)}. (1-4)"
            raw = call_claude(system, msg, h, 100)

        pr = parse_json(raw, {})
        ch = pr.get("choice", 0) if isinstance(pr, dict) else 0
        if not isinstance(ch, int) or ch < 1 or ch > 4:
            m = __import__('re').search(r'[1-4]', raw)
            ch = int(m.group()) if m else random.randint(1, 4)

        ic = ch == correct; ip = False
        if not ic:
            errs += 1
            if prev and card_match(s, prev, keys) == ch: ip = True; pers += 1

        det.append({"c": ic, "p": ip, "ambig": n_unique, "rule": rule, "correct": correct, "choice": ch})
        h.append({"role": "user", "content": msg if mode == "text" else f"Trial {t+1} shown. (1-4)"})
        h.append({"role": "assistant", "content": raw})
        if len(h) > ctx: h = h[-ctx:]

        if ic:
            con += 1
            if con >= 10 and ri < len(RULE_ORDER) - 1:
                prev = rule; ri += 1; rule = RULE_ORDER[ri]; cats += 1; con = 0
        else:
            con = 0
        time.sleep(0.12)

    # Compute ambiguity stats
    total_ambig = sum(1 for d in det if d["ambig"] < 3)
    post_switch = [d for i, d in enumerate(det) if i > 0 and det[i-1].get("rule") != d.get("rule") or (i > 10 and any(det[j].get("rule") != det[j-1].get("rule") for j in range(max(1,i-5), i)))]

    return {
        "pers": pers, "errs": errs, "cats": cats, "acc": (n_trials - errs) / n_trials,
        "ambig_pct": total_ambig / n_trials,
        "details": det,
    }


# ═══════════════════════════════════════════════════════════════
# VERIFY KEY CARD FIX
# ═══════════════════════════════════════════════════════════════

def verify_keys(keys, name):
    """Check how often random stimuli are ambiguous with these key cards."""
    rng = random.Random(99)
    total = 0; fully_unambig = 0; partial = 0; ambig = 0
    for _ in range(1000):
        s = {"color":rng.choice(COLORS),"shape":rng.choice(SHAPES),"number":rng.choice(NUMBERS)}
        matches = {d: card_match(s, d, keys) for d in ['color','shape','number']}
        n_unique = len(set(matches.values()))
        total += 1
        if n_unique == 3: fully_unambig += 1
        elif n_unique == 2: partial += 1
        else: ambig += 1
    print(f"  {name}: {fully_unambig/total:.0%} fully unambiguous, {partial/total:.0%} partial, {ambig/total:.0%} fully ambiguous")
    return fully_unambig / total

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("="*70)
    print("WCST: MULTIMODAL + FIXED KEY CARDS")
    print(f"PIL available: {HAS_PIL}")
    print("="*70)

    # Verify key card fix
    print("\nKey card ambiguity analysis:")
    verify_keys(OLD_KEYS, "OLD (correlated)")
    verify_keys(NEW_KEYS, "NEW (uncorrelated)")

    # Show example: what happens after rule switch with each key set?
    print("\nAfter color→shape switch, LLM matches by color:")
    for name, keys in [("OLD", OLD_KEYS), ("NEW", NEW_KEYS)]:
        rng = random.Random(42)
        false_positives = 0
        for _ in range(20):
            s = {"color":rng.choice(COLORS),"shape":rng.choice(SHAPES),"number":rng.choice(NUMBERS)}
            color_ans = card_match(s, 'color', keys)
            shape_ans = card_match(s, 'shape', keys)
            if color_ans == shape_ans: false_positives += 1
        print(f"  {name}: {false_positives}/20 times old rule gives same answer as new rule ({false_positives/20:.0%})")

    # Run 3 conditions × 3 personas
    conditions = [
        ("text_old_keys", "text", OLD_KEYS),
        ("text_new_keys", "text", NEW_KEYS),
    ]
    if HAS_PIL:
        conditions.append(("multimodal_new_keys", "multimodal", NEW_KEYS))

    personas = [
        {"id":"low","ctx":8},
        {"id":"med","ctx":12},
        {"id":"high","ctx":16},
    ]

    results = {}
    for cond_name, mode, keys in conditions:
        print(f"\n  === {cond_name} ===")
        for p in personas:
            key = f"{cond_name}_{p['id']}"
            print(f"    {p['id']}...", end=" ", flush=True)
            r = run_wcst(keys, mode, n_trials=32, seed=42, ctx=p["ctx"])
            results[key] = r
            print(f"pers={r['pers']}, acc={r['acc']:.0%}, cats={r['cats']}, ambig={r['ambig_pct']:.0%}")

    # Summary
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    print(f"\n{'Condition':<30} {'Low':>8} {'Med':>8} {'High':>8} {'Mean':>8}")

    print("\nPerseverative Errors:")
    for cond_name, _, _ in conditions:
        vals = [results[f"{cond_name}_{p['id']}"]["pers"] for p in personas]
        print(f"  {cond_name:<28} {vals[0]:>8} {vals[1]:>8} {vals[2]:>8} {sum(vals)/3:>8.1f}")

    print("\nAccuracy:")
    for cond_name, _, _ in conditions:
        vals = [results[f"{cond_name}_{p['id']}"]["acc"] for p in personas]
        print(f"  {cond_name:<28} {vals[0]:>8.0%} {vals[1]:>8.0%} {vals[2]:>8.0%} {sum(vals)/3:>8.0%}")

    print("\nCategories Completed:")
    for cond_name, _, _ in conditions:
        vals = [results[f"{cond_name}_{p['id']}"]["cats"] for p in personas]
        print(f"  {cond_name:<28} {vals[0]:>8} {vals[1]:>8} {vals[2]:>8} {sum(vals)/3:>8.1f}")

    print(f"\n  Human reference: pers=2.45, ~75% accuracy")

    out = Path(__file__).parent / "wcst_multimodal_results.json"
    json.dump(results, open(out,"w"), indent=2, default=str)
    print(f"\nSaved to {out}")
