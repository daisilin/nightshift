"""
Phase 1 Remaining: TOL + N-back + Corsi + FIAR
================================================
Reuses WCST + Two-Step + Maze from phase1_results.json.
Runs 4 new tasks × 5 personas via Bedrock.
Then computes full 7-task correlation matrix.
"""

import json, time, sys, math, random
from pathlib import Path
from collections import defaultdict

import boto3
from botocore.config import Config

bedrock = boto3.client("bedrock-runtime", region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}))
MODEL_ID = "us.anthropic.claude-sonnet-4-6"

PERSONAS = [
    {"id": "emma", "name": "Emma, 19, psych student",
     "prompt": "You are Emma, a 19-year-old psychology sophomore at a large Midwestern state university. You're doing this study for course credit. You've done 3 other psych studies this semester and are getting tired of them. You tend to check your phone between trials. You go with your gut and respond quickly — thinking too long feels uncomfortable. You're cooperative and tend to go along with what's asked. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
    {"id": "james", "name": "James, 22, CS senior",
     "prompt": "You are James, a 22-year-old computer science senior at a private East Coast university. You enjoy puzzles and competitive games. You're an analytical thinker who looks for patterns and optimal strategies. You think things through carefully before responding — you'd rather be slow and right than fast and wrong. You can focus deeply on a task even when there are distractions. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
    {"id": "dorothy", "name": "Dorothy, 71, retired teacher",
     "prompt": "You are Dorothy, a 71-year-old retired high school teacher from Vermont. You read everything twice — a habit from 35 years of grading papers. You're not comfortable with computers; your grandson helped set you up. You process information more slowly than you used to but compensate by being very deliberate. You get tired after about 20 minutes of sustained concentration. You tend to agree with statements rather than disagree. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
    {"id": "tyler", "name": "Tyler, 28, gig worker",
     "prompt": "You are Tyler, a 28-year-old delivery driver from Florida who does online surveys on your phone during breaks. You do surveys mainly for the pay. You've been flagged for speeding through tasks before. You don't read long instructions carefully, just get the gist and start clicking. You're currently on a 15-minute break between deliveries. You're tired and want to get through this quickly. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
    {"id": "priya", "name": "Priya, 25, PhD student",
     "prompt": "You are Priya, a 25-year-old PhD student in computer science at MIT. You're analytically strong with excellent working memory. You approach tasks systematically and enjoy optimization problems. You're participating because you find cognitive experiments interesting. You tend to think things through carefully and look for the underlying structure of tasks. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."},
]

def call_claude(system, user, messages=None, max_tokens=300):
    if messages is None:
        messages = [{"role": "user", "content": user}]
    else:
        messages = list(messages) + [{"role": "user", "content": user}]
    for attempt in range(3):
        try:
            body = json.dumps({"anthropic_version": "bedrock-2023-05-31", "max_tokens": max_tokens, "system": system, "messages": messages})
            resp = bedrock.invoke_model(modelId=MODEL_ID, contentType="application/json", accept="application/json", body=body)
            return json.loads(resp["body"].read())["content"][0]["text"]
        except Exception as e:
            if attempt < 2: time.sleep(2 ** attempt + random.random())
            else: print(f"    API error: {e}", file=sys.stderr); return ""

def parse_json(raw, fallback=None):
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    first, last = cleaned.find("{"), cleaned.rfind("}")
    if first >= 0 and last > first:
        try: return json.loads(cleaned[first:last+1])
        except: pass
    return fallback


# ═══════════════════════════════════════════════════════════════
# TOL (simplified: 12 puzzles at 3-5 moves for speed)
# ═══════════════════════════════════════════════════════════════

TOL_PUZZLES = [
    # (initial_state, goal_state, min_moves) — pegs as lists of balls bottom→top
    {"init": [["R","G","B"],[],[]], "goal": [["B"],["G"],["R"]], "min": 3},
    {"init": [["R"],["G"],["B"]], "goal": [["G","R"],["B"],[]], "min": 3},
    {"init": [["B","R"],["G"],[]], "goal": [[],["R"],["G"]], "min": 3},  # peg3 cap=1 so G must go to peg3
    {"init": [["R","G","B"],[],[]], "goal": [["G"],["B","R"],[]], "min": 4},
    {"init": [["B"],["R","G"],[]], "goal": [["R"],["B"],["G"]], "min": 4},
    {"init": [["G","B"],["R"],[]], "goal": [["R","G"],["B"],[]], "min": 4},
    {"init": [["R","G","B"],[],[]], "goal": [[],["R","G"],["B"]], "min": 5},
    {"init": [["B","G","R"],[],[]], "goal": [["R"],["G"],["B"]], "min": 5},
    {"init": [["G"],["B"],["R"]], "goal": [["R","G","B"],[],[]], "min": 5},
    {"init": [["R","B"],["G"],[]], "goal": [["G","R"],["B"],[]], "min": 5},
    {"init": [["B","R","G"],[],[]], "goal": [["G","B"],["R"],[]], "min": 5},
    {"init": [["R","G","B"],[],[]], "goal": [["B","R"],["G"],[]], "min": 5},
]
PEG_CAP = [3, 2, 1]
BALL_NAME = {"R": "red", "G": "green", "B": "blue"}

def describe_state(state, label):
    lines = []
    for i, peg in enumerate(state):
        balls = ", ".join(BALL_NAME[b] for b in peg) if peg else "empty"
        lines.append(f"  Peg {i+1} (cap {PEG_CAP[i]}): {balls}")
    return f"{label}:\n" + "\n".join(lines)

def run_tol(persona):
    print(f"\n  TOL — {persona['name']}")
    system = f"""{persona['prompt']}

You are doing the Tower of London task. 3 pegs (capacities 3, 2, 1), 3 balls (red, green, blue).
Move one ball at a time (top only). Match the goal in minimum moves.
Return ONLY JSON: {{ "ball": "red/green/blue", "from": 1-3, "to": 1-3 }}"""

    history = []
    weighted_score = 0
    details = []

    for pi, puzzle in enumerate(TOL_PUZZLES):
        state = [list(p) for p in puzzle["init"]]
        goal = [list(p) for p in puzzle["goal"]]
        min_moves = puzzle["min"]
        moves_made = 0
        solved = False
        max_moves = min_moves + 4

        stimulus = f"Puzzle {pi+1}/{len(TOL_PUZZLES)} (min {min_moves} moves):\n{describe_state(state, 'Current')}\n{describe_state(goal, 'Goal')}\nYour move:"

        for mi in range(max_moves):
            raw = call_claude(system, stimulus if mi == 0 else f"{describe_state(state, 'Current')}\n{describe_state(goal, 'Goal')}\nMove {mi+1}:", history, max_tokens=150)
            history.append({"role": "user", "content": stimulus if mi == 0 else f"Move {mi+1}:"})
            history.append({"role": "assistant", "content": raw})
            if len(history) > 20: history = history[-20:]

            parsed = parse_json(raw, {})
            ball_str = (parsed.get("ball", "") if isinstance(parsed, dict) else "").lower()
            ball = "R" if "red" in ball_str else "G" if "green" in ball_str else "B" if "blue" in ball_str else None
            fr = (parsed.get("from", 0) if isinstance(parsed, dict) else 0)
            to = (parsed.get("to", 0) if isinstance(parsed, dict) else 0)
            fr = (int(fr) if isinstance(fr, (int, float)) else 0) - 1
            to = (int(to) if isinstance(to, (int, float)) else 0) - 1

            valid = False
            if ball and 0 <= fr <= 2 and 0 <= to <= 2 and fr != to:
                if state[fr] and state[fr][-1] == ball and len(state[to]) < PEG_CAP[to]:
                    state[fr].pop()
                    state[to].append(ball)
                    moves_made += 1
                    valid = True

            if not valid:
                moves_made += 1  # count invalid as a wasted move

            if state == goal:
                solved = True
                break

            time.sleep(0.2)

        optimal = solved and moves_made <= min_moves
        score = min_moves if optimal else 0
        weighted_score += score
        details.append({"puzzle": pi, "min": min_moves, "actual": moves_made, "solved": solved, "optimal": optimal, "score": score})

        if pi % 4 == 3:
            opt_count = sum(1 for d in details if d["optimal"])
            print(f"    puzzle {pi+1}: {opt_count}/{pi+1} optimal, weighted={weighted_score}")

        time.sleep(0.2)

    return {"weighted_score": weighted_score, "proportion_optimal": sum(1 for d in details if d["optimal"]) / len(details),
            "proportion_solved": sum(1 for d in details if d["solved"]) / len(details), "details": details}


# ═══════════════════════════════════════════════════════════════
# N-BACK (2 blocks of 2-back, 2 blocks of 3-back, 20 letters each)
# ═══════════════════════════════════════════════════════════════

LETTERS = list("BCDFGHJKLMNPQRSTVWXZ")

def generate_nback_seq(n_back, length, rng):
    seq = []
    for i in range(length):
        if i >= n_back and rng.random() < 0.3:
            seq.append(seq[i - n_back])  # target
        else:
            letter = rng.choice(LETTERS)
            while i >= n_back and letter == seq[i - n_back]:
                letter = rng.choice(LETTERS)
            seq.append(letter)
    return seq

def compute_dprime(hr, far, n_tgt, n_non):
    from math import log, sqrt, pi, erf
    def z(p):
        p = max(0.01, min(0.99, p))
        # Approximation
        return sqrt(2) * erfinv(2*p - 1)
    def erfinv(x):
        a = 0.147
        ln = log(1 - x*x)
        s = (2/(pi*a) + ln/2)
        return copysign(sqrt(sqrt(s*s - ln/a) - s), x)
    from math import copysign
    adj_hr = (hr * n_tgt + 0.5) / (n_tgt + 1)
    adj_far = (far * n_non + 0.5) / (n_non + 1)
    return z(adj_hr) - z(adj_far)

def run_nback(persona, seed=42):
    print(f"\n  N-back — {persona['name']}")
    rng = random.Random(seed + hash(persona["id"]))
    system = f"""{persona['prompt']}

You are doing an N-back working memory task. Letters appear ONE AT A TIME.
Respond "match" if the current letter equals the one N positions back, otherwise "no match".
Return ONLY JSON: {{ "response": "match" or "no match" }}"""

    history = []
    blocks_cfg = [(2, 20), (2, 20), (3, 20), (3, 20)]
    block_results = []

    for bi, (n_back, length) in enumerate(blocks_cfg):
        seq = generate_nback_seq(n_back, length, rng)
        hits, misses, fas, crs = 0, 0, 0, 0

        # Announce block
        history.append({"role": "user", "content": f"Block {bi+1}/4: {n_back}-back. Respond for each letter starting from letter {n_back+1}."})
        history.append({"role": "assistant", "content": "Ready."})

        for ti, letter in enumerate(seq):
            is_response = ti >= n_back
            is_target = is_response and seq[ti] == seq[ti - n_back]

            if not is_response:
                msg = f"Letter {ti+1}: {letter} [observe]"
                history.append({"role": "user", "content": msg})
                history.append({"role": "assistant", "content": "Noted."})
            else:
                msg = f"Letter {ti+1}: {letter} — match or no match?"
                raw = call_claude(system, msg, history, max_tokens=60)
                history.append({"role": "user", "content": msg})
                history.append({"role": "assistant", "content": raw})

                said_match = "match" in raw.lower() and "no" not in raw.lower().split("match")[0][-5:]

                if is_target:
                    if said_match: hits += 1
                    else: misses += 1
                else:
                    if said_match: fas += 1
                    else: crs += 1

            if len(history) > 16: history = history[-16:]  # WM constraint
            time.sleep(0.15)

        n_tgt = hits + misses
        n_non = fas + crs
        hr = hits / n_tgt if n_tgt > 0 else 0
        far = fas / n_non if n_non > 0 else 0
        dp = compute_dprime(hr, far, n_tgt, n_non) if (n_tgt > 0 and n_non > 0) else 0
        block_results.append({"nBack": n_back, "hits": hits, "misses": misses, "fas": fas, "crs": crs, "hr": hr, "far": far, "dprime": dp})
        print(f"    block {bi+1} ({n_back}-back): hr={hr:.2f}, far={far:.2f}, d'={dp:.2f}")

    overall_hr = sum(b["hits"] for b in block_results) / max(1, sum(b["hits"]+b["misses"] for b in block_results))
    overall_far = sum(b["fas"] for b in block_results) / max(1, sum(b["fas"]+b["crs"] for b in block_results))
    overall_dp = compute_dprime(overall_hr, overall_far,
        sum(b["hits"]+b["misses"] for b in block_results),
        sum(b["fas"]+b["crs"] for b in block_results))

    return {"dprime": overall_dp, "hit_rate": overall_hr, "fa_rate": overall_far, "blocks": block_results}


# ═══════════════════════════════════════════════════════════════
# CORSI (span 3-9, 2 trials per span, stop after 2 fails)
# ═══════════════════════════════════════════════════════════════

BLOCK_LABELS = {1:"top-center", 2:"top-right", 3:"upper-left", 4:"upper-right",
                5:"center", 6:"center-right", 7:"lower-left", 8:"lower-right", 9:"bottom-center"}

def run_corsi(persona, seed=42):
    print(f"\n  Corsi — {persona['name']}")
    rng = random.Random(seed + hash(persona["id"]))
    system = f"""{persona['prompt']}

You are doing the Corsi Block-Tapping task. 9 blocks on screen:
. 1 . . 2
3 . . 4 .
. . 5 . 6
7 . . 8 .
. 9 . . .

Blocks light up one at a time. After the sequence, reproduce it in order.
Return ONLY JSON: {{ "sequence": [block numbers in order] }}"""

    history = []
    total_correct = 0
    trial_details = []

    for span in range(3, 10):
        fails = 0
        for t in range(2):
            # Generate sequence
            seq = []
            for _ in range(span):
                b = rng.randint(1, 9)
                while seq and b == seq[-1]: b = rng.randint(1, 9)
                seq.append(b)

            # Present one at a time
            history.append({"role": "user", "content": f"Span {span}, trial {t+1}/2. Watch:"})
            history.append({"role": "assistant", "content": "Watching."})

            for si, b in enumerate(seq):
                msg = f"Block {b} ({BLOCK_LABELS[b]}) lights up."
                if si < span - 1:
                    history.append({"role": "user", "content": msg})
                    history.append({"role": "assistant", "content": "..."})
                else:
                    msg += "\nSequence done. Reproduce it in order."
                    raw = call_claude(system, msg, history, max_tokens=150)
                    history.append({"role": "user", "content": msg})
                    history.append({"role": "assistant", "content": raw})

                if len(history) > 16: history = history[-16:]
                time.sleep(0.1)

            # Parse recall
            parsed = parse_json(history[-1]["content"], {})
            recalled = []
            if isinstance(parsed, dict) and "sequence" in parsed:
                recalled = [int(x) for x in parsed["sequence"] if str(x).isdigit()]
            else:
                nums = [int(x) for x in history[-1]["content"].split() if x.isdigit() and 1 <= int(x) <= 9]
                recalled = nums[:span]

            correct = recalled == seq
            if correct: total_correct += 1
            else: fails += 1

            trial_details.append({"span": span, "trial": t, "seq": seq, "recalled": recalled, "correct": correct})
            time.sleep(0.15)

        if fails >= 2:
            print(f"    stopped at span {span}")
            break
        else:
            print(f"    span {span}: {'pass' if fails == 0 else '1 fail'}")

    max_span = max((d["span"] for d in trial_details if d["correct"]), default=2)
    return {"corsi_score": max_span * total_correct, "max_span": max_span, "total_correct": total_correct, "details": trial_details}


# ═══════════════════════════════════════════════════════════════
# FIAR (8 games for speed, vs AI of varying skill)
# ═══════════════════════════════════════════════════════════════

def create_board(): return [['.']*9 for _ in range(4)]
def board_text(b):
    cols = "  " + " ".join(str(i+1) for i in range(9))
    rows = [f"{i+1} {' '.join(b[i])}" for i in range(4)]
    return cols + "\n" + "\n".join(rows)

def check_win(b, p):
    for r in range(4):
        for c in range(9):
            if b[r][c] != p: continue
            for dr, dc in [(0,1),(1,0),(1,1),(1,-1)]:
                if all(0<=r+dr*k<4 and 0<=c+dc*k<9 and b[r+dr*k][c+dc*k]==p for k in range(4)):
                    return True
    return False

def ai_move(b, skill, rng):
    empty = [(r,c) for r in range(4) for c in range(9) if b[r][c]=='.']
    if not empty: return None
    # Check for wins/blocks
    for r,c in empty:
        b[r][c] = 'O'
        if check_win(b, 'O'): b[r][c] = '.'; return (r,c)
        b[r][c] = '.'
    for r,c in empty:
        b[r][c] = 'X'
        if check_win(b, 'X'):
            b[r][c] = '.'
            if rng.random() < skill: return (r,c)
        b[r][c] = '.'
    if rng.random() < skill:
        # Heuristic: prefer center columns
        scored = [(abs(c-4) + rng.random()*2, (r,c)) for r,c in empty]
        scored.sort()
        return scored[0][1]
    return rng.choice(empty)

def run_fiar(persona, n_games=8, seed=42):
    print(f"\n  FIAR — {persona['name']}")
    rng = random.Random(seed + hash(persona["id"]))
    system = f"""{persona['prompt']}

Playing Four-in-a-Row on a 4×9 board. You are X. Free placement (any empty cell).
Get 4 in a row to win. Return ONLY JSON: {{ "row": 1-4, "col": 1-9 }}"""

    history = []
    wins, losses, draws = 0, 0, 0
    game_details = []

    for gi in range(n_games):
        skill = 0.3 + (gi / n_games) * 0.5
        board = create_board()
        result = "draw"
        player_first = gi % 2 == 0
        turn_is_player = player_first

        if not player_first:
            mv = ai_move(board, skill, rng)
            if mv: board[mv[0]][mv[1]] = 'O'

        for turn in range(18):
            empty = [(r,c) for r in range(4) for c in range(9) if board[r][c]=='.']
            if not empty: break

            if turn_is_player:
                raw = call_claude(system, f"Game {gi+1}. {board_text(board)}\nYour move (X):", history, max_tokens=80)
                history.append({"role": "user", "content": f"Game board shown. Your move:"})
                history.append({"role": "assistant", "content": raw})
                if len(history) > 12: history = history[-12:]

                p = parse_json(raw, {})
                r = (int(p.get("row",0)) if isinstance(p,dict) else 0) - 1
                c = (int(p.get("col",0)) if isinstance(p,dict) else 0) - 1
                if 0<=r<4 and 0<=c<9 and board[r][c]=='.':
                    board[r][c] = 'X'
                else:
                    mv = rng.choice(empty)
                    board[mv[0]][mv[1]] = 'X'

                if check_win(board, 'X'): result = "win"; wins += 1; break
            else:
                mv = ai_move(board, skill, rng)
                if mv:
                    board[mv[0]][mv[1]] = 'O'
                    if check_win(board, 'O'): result = "loss"; losses += 1; break

            turn_is_player = not turn_is_player
            time.sleep(0.15)

        if result == "draw": draws += 1
        game_details.append({"game": gi, "skill": skill, "result": result})
        print(f"    game {gi+1}: {result} (skill={skill:.2f})")
        time.sleep(0.2)

    perf = sum(100*g["skill"] if g["result"]=="win" else 30*g["skill"] if g["result"]=="draw" else -50*g["skill"] for g in game_details) / n_games
    return {"win_rate": wins/n_games, "perf_score": perf, "wins": wins, "losses": losses, "draws": draws, "details": game_details}


# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("="*70)
    print("PHASE 1 REMAINING: TOL + N-back + Corsi + FIAR")
    print(f"5 personas × 4 tasks | Model: {MODEL_ID}")
    print("="*70)

    # Load existing Phase 1 data
    existing = json.load(open(Path(__file__).parent / "phase1_results.json"))
    print(f"Loaded existing: WCST({len(existing['wcst'])}), Two-Step({len(existing['two_step'])}), Maze({len(existing['maze'])})")

    all_tol, all_nback, all_corsi, all_fiar = {}, {}, {}, {}

    for persona in PERSONAS:
        pid = persona["id"]
        t0 = time.time()

        all_tol[pid] = run_tol(persona)
        print(f"  TOL {pid}: weighted={all_tol[pid]['weighted_score']}, opt={all_tol[pid]['proportion_optimal']:.0%}")

        all_nback[pid] = run_nback(persona)
        print(f"  N-back {pid}: d'={all_nback[pid]['dprime']:.2f}")

        all_corsi[pid] = run_corsi(persona)
        print(f"  Corsi {pid}: score={all_corsi[pid]['corsi_score']}, span={all_corsi[pid]['max_span']}")

        all_fiar[pid] = run_fiar(persona)
        print(f"  FIAR {pid}: winrate={all_fiar[pid]['win_rate']:.0%}, perf={all_fiar[pid]['perf_score']:.1f}")

        print(f"  --- {persona['name']}: {time.time()-t0:.0f}s ---")

    # ═══════════════════════════════════════════════════════════════
    # FULL 7-TASK ANALYSIS
    # ═══════════════════════════════════════════════════════════════

    print("\n" + "="*70)
    print("FULL 7-TASK COGNITIVE PROFILE")
    print("="*70)

    # Extract one score per task per persona (matching Lin & Ma DVs)
    def get_mb(d):
        return d.get("mb_index", d.get("model_based_index", 0))

    tasks = ["WCST", "TwoStep", "Maze", "TOL", "N-back", "Corsi", "FIAR"]
    scores = {}
    for p in PERSONAS:
        pid = p["id"]
        scores[pid] = [
            -existing["wcst"][pid]["perseverative_errors"],  # negate (higher=better)
            get_mb(existing["two_step"][pid]),
            existing["maze"][pid]["construal_effect"],
            all_tol[pid]["weighted_score"],
            all_nback[pid]["dprime"],
            all_corsi[pid]["corsi_score"],
            all_fiar[pid]["perf_score"],
        ]

    # Print score matrix
    print(f"\n{'Persona':<10} " + " ".join(f"{t:>8}" for t in tasks))
    print("-" * 72)
    for p in PERSONAS:
        row = " ".join(f"{v:>8.2f}" for v in scores[p["id"]])
        print(f"{p['id']:<10} {row}")

    # Task means
    print(f"\nTask Means (LLM) vs Human Reference:")
    means = [sum(scores[p["id"]][i] for p in PERSONAS) / len(PERSONAS) for i in range(7)]
    refs = ["2.45 (neg)", "2.16", "0.614", "56.85", "1.80", "53.5", "-2.79 (Elo)"]
    for i, t in enumerate(tasks):
        print(f"  {t:>8}: LLM={means[i]:>8.2f} | Human={refs[i]}")

    # Correlation matrix
    print(f"\n7-Task Correlation Matrix:")
    def pearson(x, y):
        n = len(x); mx, my = sum(x)/n, sum(y)/n
        sx = math.sqrt(sum((xi-mx)**2 for xi in x)/(n-1)) if n > 1 else 1
        sy = math.sqrt(sum((yi-my)**2 for yi in y)/(n-1)) if n > 1 else 1
        if sx < 1e-10 or sy < 1e-10: return 0.0
        return sum((xi-mx)*(yi-my) for xi, yi in zip(x, y))/(n-1)/(sx*sy)

    cols = [[scores[p["id"]][i] for p in PERSONAS] for i in range(7)]
    print(f"{'':>10} " + " ".join(f"{t:>8}" for t in tasks))
    for i in range(7):
        row = " ".join(f"{pearson(cols[i], cols[j]):>8.3f}" for j in range(7))
        print(f"{tasks[i]:>10} {row}")

    print(f"\nLin & Ma reference correlations (selected):")
    print(f"  TOL-FIAR: 0.280 | TOL-Corsi: 0.215 | FIAR-Corsi: 0.355")
    print(f"  WCST-TwoStep: 0.179 | TOL-TwoStep: 0.166 | FIAR-TwoStep: 0.185")

    # Individual differences (SD)
    print(f"\nIndividual Differences (SD across 5 personas):")
    for i, t in enumerate(tasks):
        vals = [scores[p["id"]][i] for p in PERSONAS]
        sd = math.sqrt(sum((v - means[i])**2 for v in vals) / 4)
        print(f"  {t:>8}: SD={sd:.3f}")

    # Save
    output = {
        **existing,
        "tol": {pid: {k:v for k,v in r.items() if k != "details"} for pid, r in all_tol.items()},
        "nback": {pid: {k:v for k,v in r.items() if k != "blocks"} for pid, r in all_nback.items()},
        "corsi": {pid: {k:v for k,v in r.items() if k != "details"} for pid, r in all_corsi.items()},
        "fiar": {pid: {k:v for k,v in r.items() if k != "details"} for pid, r in all_fiar.items()},
    }
    out = Path(__file__).parent / "phase1_full_results.json"
    json.dump(output, open(out, "w"), indent=2)
    print(f"\nSaved to {out}")
