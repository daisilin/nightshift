"""
Baseline Multi-Turn Experiment: WCST + Two-Step
================================================
Tests the new multi-turn infrastructure with faithful task implementations.
Runs via AWS Bedrock (Sonnet 4.6).

WCST: 64 trials, rule switches after 10 correct, feedback per trial
  Reference (Lin & Ma): mean perseverative errors = 2.45

Two-Step: 80 trials, 70/30 transitions, drifting rewards
  Reference (Lin & Ma): mean model-based weight = 2.162
  Key signature: interaction between transition type and reward on stay probability
"""

import json, time, os, sys, math, random
from pathlib import Path
from collections import defaultdict

import boto3
from botocore.config import Config

bedrock = boto3.client(
    "bedrock-runtime",
    region_name="us-west-2",
    config=Config(read_timeout=120, retries={"max_attempts": 3}),
)
MODEL_ID = "us.anthropic.claude-sonnet-4-6"

# ─── Personas (identity-driven) ───

PERSONAS = [
    {
        "id": "emma",
        "name": "Emma, 19, psych student",
        "prompt": """You are Emma, a 19-year-old psychology sophomore at a large Midwestern state university. You're doing this study for course credit. You've done 3 other psych studies this semester and are getting tired of them. You tend to check your phone between trials. You go with your gut and respond quickly — thinking too long feels uncomfortable. You're cooperative and tend to go along with what's asked. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."""
    },
    {
        "id": "james",
        "name": "James, 22, CS senior",
        "prompt": """You are James, a 22-year-old computer science senior at a private East Coast university. You enjoy puzzles and competitive games. You're an analytical thinker who looks for patterns and optimal strategies. You think things through carefully before responding — you'd rather be slow and right than fast and wrong. You can focus deeply on a task even when there are distractions. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."""
    },
    {
        "id": "dorothy",
        "name": "Dorothy, 71, retired teacher",
        "prompt": """You are Dorothy, a 71-year-old retired high school teacher from Vermont. You read everything twice — a habit from 35 years of grading papers. You're not comfortable with computers; your grandson helped set you up. You process information more slowly than you used to but compensate by being very deliberate. You get tired after about 20 minutes of sustained concentration. You tend to agree with statements rather than disagree. You are participating in a research study. Do the task as YOU would — with your actual level of effort, focus, and understanding. Don't explain your reasoning unless asked. Just respond."""
    },
]


def call_claude(system: str, user: str, messages: list = None, max_tokens: int = 300) -> str:
    """Single Bedrock API call with retry."""
    if messages is None:
        messages = [{"role": "user", "content": user}]
    else:
        messages = list(messages) + [{"role": "user", "content": user}]

    for attempt in range(3):
        try:
            body = json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "system": system,
                "messages": messages,
            })
            resp = bedrock.invoke_model(
                modelId=MODEL_ID,
                contentType="application/json",
                accept="application/json",
                body=body,
            )
            data = json.loads(resp["body"].read())
            return data["content"][0]["text"]
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt + random.random())
                print(f"    retry {attempt+1}: {e}", file=sys.stderr)
            else:
                print(f"    API error: {e}", file=sys.stderr)
                return ""


def parse_json(raw: str, fallback=None):
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first >= 0 and last > first:
        try:
            return json.loads(cleaned[first:last+1])
        except json.JSONDecodeError:
            pass
    return fallback


# ═══════════════════════════════════════════════════════════════════
# WCST
# ═══════════════════════════════════════════════════════════════════

COLORS = ['red', 'green', 'yellow', 'blue']
SHAPES = ['triangle', 'star', 'cross', 'circle']
KEY_CARDS = [
    {"color": "red", "shape": "triangle", "number": 1},
    {"color": "green", "shape": "star", "number": 2},
    {"color": "yellow", "shape": "cross", "number": 3},
    {"color": "blue", "shape": "circle", "number": 4},
]
RULE_ORDER = ['color', 'shape', 'number', 'color', 'shape', 'number']


def describe_card(c):
    return f"{c['number']} {c['color']} {c['shape']}{'s' if c['number'] > 1 else ''}"


def random_card():
    return {
        "color": random.choice(COLORS),
        "shape": random.choice(SHAPES),
        "number": random.randint(1, 4),
    }


def correct_match(stimulus, rule):
    for i, kc in enumerate(KEY_CARDS):
        if stimulus[rule] == kc[rule]:
            return i + 1
    return 1


WCST_SYSTEM = """You are doing the Wisconsin Card Sorting Test in a research study.

Four key cards are always visible:
  Card 1: 1 red triangle
  Card 2: 2 green stars
  Card 3: 3 yellow crosses
  Card 4: 4 blue circles

Each trial, you see a stimulus card. Sort it by matching it to one of the 4 key cards.
The matching rule (by color, shape, or number) is HIDDEN — figure it out from feedback.
The rule may CHANGE without warning after you've been getting it right.

Return ONLY JSON: { "choice": 1-4, "reasoning": "brief thought" }"""


def run_wcst(persona, n_trials=64):
    print(f"\n  WCST — {persona['name']}")
    system = f"{persona['prompt']}\n\n{WCST_SYSTEM}"
    history = []

    rule_idx = 0
    rule = RULE_ORDER[rule_idx]
    prev_rule = None
    consec = 0
    categories = 0
    pers_errors = 0
    total_errors = 0
    details = []

    for t in range(n_trials):
        stimulus = random_card()
        correct = correct_match(stimulus, rule)

        # Build stimulus with feedback from previous trial
        user_msg = ""
        if t > 0:
            prev = details[-1]
            user_msg += f"{'Correct!' if prev['correct'] else 'Incorrect.'}\n\n"
        user_msg += f"Trial {t+1}/{n_trials}. Stimulus card: {describe_card(stimulus)}. Which key card? (1-4)"

        raw = call_claude(system, user_msg, history, max_tokens=150)
        parsed = parse_json(raw, {})

        # Parse choice
        choice = parsed.get("choice", 0) if isinstance(parsed, dict) else 0
        if not isinstance(choice, int) or choice < 1 or choice > 4:
            m = __import__('re').search(r'[1-4]', raw)
            choice = int(m.group()) if m else 1

        is_correct = choice == correct
        is_pers = False
        if not is_correct:
            total_errors += 1
            if prev_rule and correct_match(stimulus, prev_rule) == choice:
                is_pers = True
                pers_errors += 1

        details.append({
            "trial": t, "rule": rule, "correct_answer": correct,
            "choice": choice, "correct": is_correct, "perseverative": is_pers,
        })

        # Update conversation history (keep last 20 exchanges)
        history.append({"role": "user", "content": user_msg})
        history.append({"role": "assistant", "content": raw})
        if len(history) > 40:
            history = history[-40:]

        # Rule switching
        if is_correct:
            consec += 1
            if consec >= 10 and rule_idx < len(RULE_ORDER) - 1:
                prev_rule = rule
                rule_idx += 1
                rule = RULE_ORDER[rule_idx]
                categories += 1
                consec = 0
        else:
            consec = 0

        if t % 16 == 15:
            acc = sum(1 for d in details if d["correct"]) / len(details)
            print(f"    trial {t+1}: acc={acc:.2f}, pers_errors={pers_errors}, categories={categories}")

        time.sleep(0.2)

    return {
        "perseverative_errors": pers_errors,
        "total_errors": total_errors,
        "categories_completed": categories,
        "accuracy": (n_trials - total_errors) / n_trials,
        "details": details,
    }


# ═══════════════════════════════════════════════════════════════════
# TWO-STEP TASK
# ═══════════════════════════════════════════════════════════════════

PLANETS = ["Red Planet", "Purple Planet"]
ALIENS = [["Alien Alpha", "Alien Beta"], ["Alien Gamma", "Alien Delta"]]

TWO_STEP_SYSTEM = """You are playing a space exploration game in a research study.

1. Choose between two spaceships (A or B).
2. Your spaceship takes you to one of two planets (Red Planet or Purple Planet).
3. On the planet, choose between two aliens.
4. Each alien might give you treasure or nothing.

Your goal: earn as much treasure as possible. Pay attention to which spaceships go where, and which aliens give treasure. Try to figure out the pattern.

After each trial you'll see what happened. Use that information to make better choices.

Return ONLY JSON: { "choice": "A" or "B", "reasoning": "brief thought" }"""


def generate_reward_schedule(n_trials, seed=42):
    rng = random.Random(seed)
    probs = [0.4, 0.6, 0.6, 0.4]
    schedule = []
    for _ in range(n_trials):
        schedule.append(list(probs))
        for i in range(4):
            probs[i] += rng.gauss(0, 0.025)
            probs[i] = max(0.25, min(0.75, probs[i]))
    return schedule


def run_two_step(persona, n_trials=80, seed=42):
    print(f"\n  Two-Step — {persona['name']}")
    rng = random.Random(seed + hash(persona["id"]))
    reward_schedule = generate_reward_schedule(n_trials, seed)

    system = f"{persona['prompt']}\n\n{TWO_STEP_SYSTEM}"
    history = []
    details = []

    for t in range(n_trials):
        # Stage 1: spaceship choice
        user_msg = ""
        if t > 0:
            prev = details[-1]
            planet_name = PLANETS[prev["planet"]]
            alien_name = ALIENS[prev["planet"]][prev["s2_choice"]]
            reward_str = "You found treasure!" if prev["rewarded"] else "No treasure this time."
            user_msg += f"Last trial: Spaceship {'A' if prev['s1_choice']==0 else 'B'} → {planet_name} ({prev['transition']}) → {alien_name} → {reward_str}\n\n"
        user_msg += f"Trial {t+1}/{n_trials}. Choose a spaceship: A or B."

        raw1 = call_claude(system, user_msg, history, max_tokens=150)
        parsed1 = parse_json(raw1, {})

        s1 = 0  # default A
        choice_raw = parsed1.get("choice", "") if isinstance(parsed1, dict) else ""
        if isinstance(choice_raw, str) and "B" in choice_raw.upper():
            s1 = 1

        # Determine transition
        is_common = rng.random() < 0.7
        planet = s1 if is_common else (1 - s1)
        transition = "common" if is_common else "rare"

        # Update history
        history.append({"role": "user", "content": user_msg})
        history.append({"role": "assistant", "content": raw1})

        # Stage 2: alien choice
        aliens = ALIENS[planet]
        s2_msg = f'You arrived at {PLANETS[planet]} ({transition} transition). Choose an alien: "{aliens[0]}" or "{aliens[1]}".'

        raw2 = call_claude(system, s2_msg, history, max_tokens=150)
        parsed2 = parse_json(raw2, {})

        s2 = 0  # default first alien
        s2_raw = (parsed2.get("choice", "") if isinstance(parsed2, dict) else raw2).lower()
        if aliens[1].lower() in s2_raw or "delta" in s2_raw or "gamma" in s2_raw.replace(aliens[0].lower(), ""):
            # Heuristic: check if second alien is mentioned
            if aliens[0].lower() not in s2_raw:
                s2 = 1
            elif s2_raw.index(aliens[1].lower()) < s2_raw.index(aliens[0].lower()) if aliens[0].lower() in s2_raw else True:
                s2 = 1

        # Reward
        alien_idx = planet * 2 + s2
        rewarded = rng.random() < reward_schedule[t][alien_idx]

        history.append({"role": "user", "content": s2_msg})
        history.append({"role": "assistant", "content": raw2})

        # Keep history manageable
        if len(history) > 30:
            history = history[-30:]

        details.append({
            "trial": t, "s1_choice": s1, "transition": transition,
            "planet": planet, "s2_choice": s2, "rewarded": rewarded,
        })

        if t % 20 == 19:
            rewards = sum(1 for d in details if d["rewarded"])
            print(f"    trial {t+1}: reward_rate={rewards/len(details):.2f}")

        time.sleep(0.2)

    # Compute model-based index
    counts = {"cr": 0, "cr_stay": 0, "cn": 0, "cn_stay": 0,
              "rr": 0, "rr_stay": 0, "rn": 0, "rn_stay": 0}
    for i in range(1, len(details)):
        prev, curr = details[i-1], details[i]
        stayed = curr["s1_choice"] == prev["s1_choice"]
        key = ("c" if prev["transition"] == "common" else "r") + ("r" if prev["rewarded"] else "n")
        counts[key] += 1
        if stayed:
            counts[key + "_stay"] += 1

    def rate(k):
        return counts[k + "_stay"] / counts[k] if counts[k] > 0 else 0.5

    s_cr, s_cn, s_rr, s_rn = rate("cr"), rate("cn"), rate("rr"), rate("rn")
    mb_index = (s_cr - s_cn) - (s_rr - s_rn)

    return {
        "model_based_index": mb_index,
        "stay_cr": s_cr, "stay_cn": s_cn, "stay_rr": s_rr, "stay_rn": s_rn,
        "reward_rate": sum(1 for d in details if d["rewarded"]) / len(details),
        "details": details,
    }


# ═══════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 70)
    print("BASELINE MULTI-TURN EXPERIMENT")
    print(f"Model: {MODEL_ID}")
    print(f"Personas: {len(PERSONAS)}")
    print("=" * 70)

    wcst_results = {}
    ts_results = {}

    for persona in PERSONAS:
        t0 = time.time()
        wcst_results[persona["id"]] = run_wcst(persona)
        print(f"  WCST done in {time.time()-t0:.0f}s")

        t0 = time.time()
        ts_results[persona["id"]] = run_two_step(persona)
        print(f"  Two-Step done in {time.time()-t0:.0f}s")

    # ─── WCST Summary ───
    print("\n" + "=" * 70)
    print("WCST RESULTS")
    print("=" * 70)
    print(f"{'Persona':<20} {'Pers.Errors':>12} {'Total Err':>10} {'Categories':>11} {'Accuracy':>9}")
    print("-" * 62)
    total_pers = 0
    for pid, r in wcst_results.items():
        print(f"{pid:<20} {r['perseverative_errors']:>12} {r['total_errors']:>10} {r['categories_completed']:>11} {r['accuracy']:>9.1%}")
        total_pers += r['perseverative_errors']
    mean_pers = total_pers / len(wcst_results)
    print(f"\nMean perseverative errors: {mean_pers:.1f}")
    print(f"Reference (Lin & Ma, n=476): 2.45 (SEM=0.17)")

    # ─── Two-Step Summary ───
    print("\n" + "=" * 70)
    print("TWO-STEP RESULTS")
    print("=" * 70)
    print(f"{'Persona':<20} {'MB Index':>9} {'Stay CR':>8} {'Stay CN':>8} {'Stay RR':>8} {'Stay RN':>8} {'Reward':>7}")
    print("-" * 68)
    mb_indices = []
    for pid, r in ts_results.items():
        print(f"{pid:<20} {r['model_based_index']:>9.3f} {r['stay_cr']:>8.2f} {r['stay_cn']:>8.2f} {r['stay_rr']:>8.2f} {r['stay_rn']:>8.2f} {r['reward_rate']:>7.1%}")
        mb_indices.append(r['model_based_index'])

    print(f"\nMean MB index: {sum(mb_indices)/len(mb_indices):.3f}")
    print(f"Reference pattern (humans):")
    print(f"  Model-based: Stay(CR) > Stay(RR) and Stay(RN) > Stay(CN)")
    print(f"  Model-free:  Stay after reward > Stay after no reward (regardless of transition)")
    print(f"  MB index > 0 = model-based; ~0 = model-free; < 0 = confused")

    # ─── Cross-Task Summary ───
    print("\n" + "=" * 70)
    print("CROSS-TASK COMPARISON")
    print("=" * 70)
    print(f"{'Persona':<20} {'WCST Pers.Err':>14} {'Two-Step MB':>12}")
    print("-" * 46)
    for persona in PERSONAS:
        pid = persona["id"]
        print(f"{pid:<20} {wcst_results[pid]['perseverative_errors']:>14} {ts_results[pid]['model_based_index']:>12.3f}")

    print(f"\nLin & Ma reference correlations:")
    print(f"  WCST-TwoStep: r = 0.179 (p < 0.01)")
    print(f"  WCST loaded 0.62 on inhibition factor")
    print(f"  Two-Step loaded 0.83 on inhibition factor")

    # Save
    output = {
        "wcst": {pid: {k: v for k, v in r.items() if k != "details"} for pid, r in wcst_results.items()},
        "two_step": {pid: {k: v for k, v in r.items() if k != "details"} for pid, r in ts_results.items()},
        "wcst_details": {pid: r["details"] for pid, r in wcst_results.items()},
        "two_step_details": {pid: r["details"] for pid, r in ts_results.items()},
    }
    out_path = Path(__file__).parent / "baseline_multiturn_results.json"
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\nRaw data saved to {out_path}")
