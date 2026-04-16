"""
Phase 3: Multimodal — Vision vs Text
======================================
Renders maze grids and TOL states as images, sends to Claude vision.
Same 3 personas, same tasks. Compares construal effect and TOL optimality.

Uses Pillow to render images, sends as base64 to Bedrock.
"""

import json, time, sys, math, random, base64, io
from pathlib import Path
import boto3
from botocore.config import Config

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("WARNING: Pillow not installed. Install with: pip install Pillow", file=sys.stderr)

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))
MODEL_ID = "us.anthropic.claude-sonnet-4-6"

PERSONAS = [
    {"id": "emma", "prompt": "You are Emma, a 19-year-old psychology sophomore at a large Midwestern state university. You're doing this study for course credit. You've done 3 other psych studies this semester and are getting tired of them. You tend to check your phone between trials. You go with your gut and respond quickly — thinking too long feels uncomfortable. You're cooperative and tend to go along with what's asked. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
    {"id": "james", "prompt": "You are James, a 22-year-old computer science senior at a private East Coast university. You enjoy puzzles and competitive games. You're an analytical thinker who looks for patterns and optimal strategies. You think things through carefully before responding — you'd rather be slow and right than fast and wrong. You can focus deeply on a task even when there are distractions. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
    {"id": "dorothy", "prompt": "You are Dorothy, a 71-year-old retired high school teacher from Vermont. You read everything twice — a habit from 35 years of grading papers. You're not comfortable with computers; your grandson helped set you up. You process information more slowly than you used to but compensate by being very deliberate. You get tired after about 20 minutes of sustained concentration. You tend to agree with statements rather than disagree. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
]

def call_claude_vision(system, user_text, image_b64, max_tokens=500):
    """Call Claude with both text and image input."""
    messages = [{"role": "user", "content": [
        {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": image_b64}},
        {"type": "text", "text": user_text},
    ]}]
    for attempt in range(3):
        try:
            body = json.dumps({"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens, "system": system, "messages": messages})
            resp = bedrock.invoke_model(modelId=MODEL_ID, contentType="application/json", accept="application/json", body=body)
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2**attempt + random.random())
            else: print(f"    API error: {e}", file=sys.stderr); return ""

def call_claude_text(system, user, max_tokens=500):
    messages = [{"role": "user", "content": user}]
    for attempt in range(3):
        try:
            body = json.dumps({"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens, "system": system, "messages": messages})
            resp = bedrock.invoke_model(modelId=MODEL_ID, contentType="application/json", accept="application/json", body=body)
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
# MAZE RENDERING
# ═══════════════════════════════════════════════════════════════

CELL_SIZE = 40
COLORS_MAP = {
    '.': (240, 240, 235), 'S': (100, 160, 220), 'G': (255, 215, 80),
    '#': (45, 36, 56),
}
OBSTACLE_COLORS = [
    (176, 124, 198), (155, 110, 185), (190, 140, 210), (140, 100, 175),
    (165, 115, 195), (180, 130, 200), (150, 105, 180), (170, 120, 195),
    (185, 135, 205), (145, 108, 178),
]

def render_maze_image(maze) -> str:
    """Render maze grid as PNG, return base64."""
    if not HAS_PIL: return ""
    grid = maze["grid"]
    h, w = len(grid), len(grid[0])
    img = Image.new('RGB', (w * CELL_SIZE, h * CELL_SIZE), (240, 240, 235))
    draw = ImageDraw.Draw(img)

    for r in range(h):
        for c in range(w):
            ch = grid[r][c]
            x, y = c * CELL_SIZE, r * CELL_SIZE
            if ch == '#':
                draw.rectangle([x, y, x+CELL_SIZE-1, y+CELL_SIZE-1], fill=(45, 36, 56))
            elif ch == 'S':
                draw.rectangle([x, y, x+CELL_SIZE-1, y+CELL_SIZE-1], fill=(240, 240, 235))
                draw.ellipse([x+8, y+8, x+CELL_SIZE-8, y+CELL_SIZE-8], fill=(100, 160, 220))
            elif ch == 'G':
                draw.rectangle([x, y, x+CELL_SIZE-1, y+CELL_SIZE-1], fill=(255, 215, 80))
                draw.rectangle([x+6, y+6, x+CELL_SIZE-6, y+CELL_SIZE-6], fill=(100, 200, 100))
            elif ch.isdigit():
                idx = int(ch) % len(OBSTACLE_COLORS)
                draw.rectangle([x, y, x+CELL_SIZE-1, y+CELL_SIZE-1], fill=OBSTACLE_COLORS[idx])
                try:
                    draw.text((x+CELL_SIZE//2-4, y+CELL_SIZE//2-6), ch, fill=(255,255,255))
                except: pass
            # Grid lines
            draw.rectangle([x, y, x+CELL_SIZE-1, y+CELL_SIZE-1], outline=(200,200,195))

    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return base64.b64encode(buf.getvalue()).decode()

# ═══════════════════════════════════════════════════════════════
# MAZE CONSTRUAL EXPERIMENT
# ═══════════════════════════════════════════════════════════════

def load_mazes():
    with open(Path(__file__).parent / "src" / "data" / "paperMazes.json") as f:
        return json.load(f)

def bfs_path(maze):
    from collections import deque
    grid = maze["grid"]; h, w = len(grid), len(grid[0])
    sx, sy = maze["start"]; gx, gy = maze["goal"]
    q = deque([(sx,sy,[(sx,sy)])]); vis = {(sx,sy)}
    while q:
        x,y,path = q.popleft()
        if x==gx and y==gy: return path
        for dx,dy in [(0,1),(0,-1),(1,0),(-1,0)]:
            nx,ny = x+dx, y+dy
            if 0<=nx<w and 0<=ny<h and (nx,ny) not in vis and grid[ny][nx] in '.SG':
                vis.add((nx,ny)); q.append((nx,ny,path+[(nx,ny)]))
    return []

def construal_labels(maze):
    path_set = set(bfs_path(maze)); results = []
    for obs in maze.get("obstacles",[]):
        cells = [tuple(c) for c in obs["cells"]]
        min_d = min(abs(oc[0]-pc[0])+abs(oc[1]-pc[1]) for oc in cells for pc in path_set) if path_set else 99
        results.append({"label":obs["label"],"dist":min_d})
    if not results: return {}
    med = sorted(r["dist"] for r in results)[len(results)//2]
    return {r["label"]: "high" if r["dist"]<=med else "low" for r in results}

def run_maze_experiment(persona, mode="text", n_mazes=6):
    """Run maze construal in text or multimodal mode."""
    mazes = load_mazes()[:n_mazes]
    trials = []

    for mi, maze in enumerate(mazes):
        obs_labels = [o["label"] for o in maze.get("obstacles",[])]
        cl = construal_labels(maze)

        nav_sys = f"""{persona['prompt']}

You're doing a maze task in a research study. You see a grid maze.
- Blue dot (S) is you, Yellow square (G) is the goal
- Dark walls (#) block your path, Numbered colored shapes are obstacles
- Navigate from S to G. Think out loud about your route."""

        probe_sys = f"""{persona['prompt']}

You just navigated a maze. Rate how aware you were of each obstacle while planning:
0.0 = didn't notice, 0.5 = vaguely aware, 1.0 = fully noticed.
Return ONLY JSON: {{ {', '.join(f'"{l}": <number>' for l in obs_labels)} }}"""

        if mode == "multimodal" and HAS_PIL:
            img_b64 = render_maze_image(maze)
            cot = call_claude_vision(nav_sys, "Here is the maze. Plan your route from the blue dot (S) to the yellow square (G).", img_b64)
        else:
            maze_text = "\n".join(maze["grid"])
            cot = call_claude_text(nav_sys, f"Here is the maze:\n\n{maze_text}\n\nLegend: S=start, G=goal, #=wall, digits=obstacles, .=empty\nPlan your route from S to G.")

        time.sleep(0.3)
        probe_raw = call_claude_text(probe_sys, f'Obstacles: {", ".join(obs_labels)}. You said: "{cot[:400]}". Rate awareness.', max_tokens=200)

        scores = parse_json(probe_raw, {})
        awareness = {}
        for l in obs_labels:
            v = scores.get(l, scores.get(f"obstacle_{l}", 0.5))
            awareness[l] = max(0.0, min(1.0, float(v))) if isinstance(v, (int,float)) else 0.5

        trials.append({"maze_id":maze["id"], "construal":cl, "awareness":awareness})
        print(f"    maze {mi+1}/{n_mazes} ({mode}): done")
        time.sleep(0.3)

    high_s, low_s = [], []
    for t in trials:
        for l, s in t["awareness"].items():
            if l in t["construal"]:
                (high_s if t["construal"][l]=="high" else low_s).append(s)
    mh = sum(high_s)/len(high_s) if high_s else 0
    ml = sum(low_s)/len(low_s) if low_s else 0
    return {"construal_effect": mh-ml, "mean_high": mh, "mean_low": ml, "mode": mode}

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
if __name__ == "__main__":
    print("="*70)
    print("PHASE 3: MULTIMODAL vs TEXT")
    print(f"PIL available: {HAS_PIL}")
    print("="*70)

    results = {"maze_text": {}, "maze_multimodal": {}}

    for p in PERSONAS:
        # Text-only maze
        print(f"\n  Maze TEXT — {p['id']}")
        r = run_maze_experiment(p, mode="text")
        results["maze_text"][p["id"]] = r
        print(f"  → effect={r['construal_effect']:.3f}")

        # Multimodal maze
        if HAS_PIL:
            print(f"\n  Maze MULTIMODAL — {p['id']}")
            r = run_maze_experiment(p, mode="multimodal")
            results["maze_multimodal"][p["id"]] = r
            print(f"  → effect={r['construal_effect']:.3f}")
        else:
            print(f"  Skipping multimodal (no PIL)")

    # Summary
    print("\n" + "="*70)
    print("PHASE 3 SUMMARY")
    print("="*70)

    print("\nMaze Construal Effect: Text vs Multimodal")
    print(f"{'Persona':>10} {'Text':>10} {'Multimodal':>12} {'Diff':>8}")
    print("-"*42)
    for p in PERSONAS:
        t_eff = results["maze_text"].get(p["id"],{}).get("construal_effect",0)
        m_eff = results["maze_multimodal"].get(p["id"],{}).get("construal_effect",0) if HAS_PIL else 0
        print(f"{p['id']:>10} {t_eff:>10.3f} {m_eff:>12.3f} {m_eff-t_eff:>8.3f}")

    t_vals = [results["maze_text"][p["id"]]["construal_effect"] for p in PERSONAS]
    m_vals = [results["maze_multimodal"][p["id"]]["construal_effect"] for p in PERSONAS] if HAS_PIL else [0]*3
    print(f"\n  Text mean:       {sum(t_vals)/len(t_vals):.3f}")
    if HAS_PIL:
        print(f"  Multimodal mean: {sum(m_vals)/len(m_vals):.3f}")
    print(f"  Human reference: 0.614")

    out = Path(__file__).parent / "phase3_results.json"
    json.dump(results, open(out,"w"), indent=2)
    print(f"\nSaved to {out}")
