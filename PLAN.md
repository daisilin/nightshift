# nightshift — Plan Doc

## What This Is

An agent-intern workspace inspired by Karpathy's autoresearch, designed for **non-operators** — specifically researchers, PMs, designers, and founders who have open-ended questions but don't want to manually orchestrate agents.

## The Story

> What if 5 years of my PhD could happen in a week?

A cognitive science PhD student spends years designing behavioral experiments, collecting pilot data, validating metrics, and iterating on study design. nightshift replaces that loop:

1. You describe what you want to research — messy, incomplete, human
2. Three agent interns explore it from different angles **in parallel**
3. You wake up to a **synthesized visual report** — not a chat log
4. You give feedback (useful / shallow / wrong / go deeper)
5. **Feedback shapes the next round** — the system evolves, like autoresearch

## Why This Exists Instead of Claude

| Claude alone | nightshift |
|---|---|
| One conversation thread | 3 parallel research angles |
| Ephemeral — gone when you close the tab | Persistent sessions that compound |
| Raw text response | Structured report: synthesis, agreements, disagreements, confidence |
| No feedback loop | Per-finding feedback → better next round |
| User does all the thinking | Interns propose, user steers |
| Same experience every time | System learns what you find useful |

## The Autoresearch Connection

Karpathy's autoresearch loop: `mutate code → run experiment → evaluate → keep/discard → repeat`

nightshift's loop: `brief → dispatch interns → report → feedback → iterate with learning`

Same evolutionary spirit, but for **research questions** instead of code, and designed for **non-engineers**.

## Current State (What Exists)

**Working:**
- 3 pages: Landing (brief input) → Dispatch (live progress) → Report (synthesis + feedback)
- 3 intern personas (Scout/Analyst/Contrarian) with parallel Claude API calls
- Synthesis engine that finds agreements, disagreements, open questions
- Per-finding feedback buttons
- Session history with localStorage persistence
- 17 tests for intern logic and state management
- Vercel serverless function for deployment
- Warm light-mode design (DM Serif Display + Nunito Sans + orchid palette)

**Broken / Missing:**
1. ~~ESLint errors~~ (2 trivial fixes)
2. ~~Vitest jsdom compatibility~~ (config fix)
3. **Iteration loop** — "iterate with feedback" button doesn't actually use feedback to shape the next round
4. **No test script** in package.json
5. **Not deployed** — needs Vercel deploy + API key as env var

## What To Fix / Build (Priority Order)

### Phase 1: Fix bugs (10 min)
- Fix 2 ESLint errors (unused vars)
- Fix vitest config (jsdom ESM issue)
- Add "test" script to package.json
- Verify all 17 tests pass

### Phase 2: The iteration loop — THE missing product feature (30 min)
This is what makes nightshift a product instead of a demo.

When user clicks "iterate with feedback →":
1. Collect all finding feedback from the current round
2. Build a **refined brief** that includes:
   - Original question
   - What was useful (go deeper on these)
   - What was wrong (avoid these directions)
   - Open questions to prioritize
3. Start a NEW session (round 2) with this refined brief
4. Interns now research **informed by previous round's feedback**
5. Report shows **what changed since last round** (diff view)

This is the evolutionary loop. Each round gets better because feedback is selection pressure.

### Phase 3: "What changed" diff view (20 min)
In round 2+ reports, show:
- New findings not in previous round
- Findings that got deeper based on "go deeper" feedback
- Directions that were dropped based on "wrong direction" feedback
- Confidence changes between rounds

This makes the evolution VISIBLE.

### Phase 4: Deploy to Vercel (5 min)
- Push all fixes
- Deploy via Vercel website
- Add ANTHROPIC_API_KEY as env var
- Verify it works from any browser

### Phase 5: Case study for portfolio (separate doc)
- Why this interaction model
- Connection to cognitive science research
- The autoresearch parallel
- Screenshots of the report

## What We're NOT Building (Scope Control)
- No actual experiment code generation (future feature)
- No real overnight scheduling (the "overnight" is metaphorical in the demo)
- No user accounts / auth
- No sharing / collaboration
- No custom intern creation

## Success Criteria
1. Full loop works: brief → dispatch → report → feedback → iterate → round 2 report with diff
2. Deployed on Vercel, accessible from any browser
3. All tests pass
4. A hiring manager can play with it in 3 minutes and understand the thesis
