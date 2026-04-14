# nightshift

**Simulate behavioral experiments before you run them.**

nightshift is a research prototyping platform that lets you design, simulate, and analyze behavioral experiments in minutes. Drop a paper, let AI interns propose experimental designs, simulate hundreds of participants, and iterate on your methodology before touching a single real subject.

Built for cognitive science researchers who want to de-risk study designs and explore parameter spaces cheaply.

---

## What it does

1. **Drop a paper or describe what you want to study** — nightshift extracts the paradigm, population, and key methodology
2. **Design agents propose experiments** — three AI interns (Scout, Analyst, Reviewer) each propose a design variant with different priorities
3. **Parametric simulation runs instantly** — generates thousands of trials using a psychologically-grounded participant model (Big Five, cognitive tempo, attentional control, response styles)
4. **Analysis pipeline auto-runs** — descriptive stats, reliability, condition effects, correlation matrices, exploratory factor analysis
5. **Analysis agent interprets results** — Opus compares simulated data to paper benchmarks, suggests follow-ups
6. **Iterate with feedback** — type "increase N to 100" or "add a third condition" → agents re-design and re-simulate

---

## Validated papers

| Paper | Paradigm | What nightshift replicates |
|-------|----------|---------------------------|
| Ho et al. (Nature, 2022) — *People construct simplified mental representations* | Maze Construal | High/low construal awareness effect (simulated: 0.52 vs paper: 0.61) |
| Kösester et al. (2021) — *Cognitive Components of Planning* | 6-task planning battery | Correlation structure, 3-factor EFA, task intercorrelations |

---

## Getting started

### Option 1: Use the live demo

[nightshift.vercel.app](https://nightshift.vercel.app) — click "⚙ api key" in the top-right and paste your [Anthropic API key](https://console.anthropic.com). Your key is stored only in your browser's localStorage and goes directly to Anthropic through this app's proxy.

### Option 2: Deploy your own (recommended for researchers)

1. Fork this repo on GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → import your fork
3. Add environment variable: `ANTHROPIC_API_KEY` = `sk-ant-...`
4. Deploy — done in ~2 minutes

Everyone you share the URL with will use your key. You can monitor usage in [Anthropic Console](https://console.anthropic.com/usage).

### Option 3: Run locally

```bash
git clone https://github.com/daisilin/nightshift
cd nightshift
npm install
```

Create a `.env` file:
```
ANTHROPIC_API_KEY=sk-ant-...
```

Start the dev server:
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The `/api/claude` proxy runs via Vite's dev server using the env var.

---

## API key options

| Setup | Where key lives | Who pays |
|-------|----------------|----------|
| Browser modal (demo) | Your localStorage | You (your key) |
| Vercel env var (your deploy) | Vercel secrets | You (your key, shared with your users) |
| Local `.env` | Your machine | You |

The `/api/claude` proxy prefers `ANTHROPIC_API_KEY` from the server environment. If that's not set, it accepts a key sent from the browser (the modal flow). This means: if you deploy with an env var, the modal key is ignored; if you deploy without one, users must bring their own.

---

## Simulation modes

**Parametric (default, instant)**
Uses a generative model with psychologically-grounded individual differences:
- Big Five personality traits (Costa & McCrae, 1992)
- Cognitive tempo (Kagan, 1966; Salthouse, 1996)
- Attentional control (Engle et al., 1999)
- Response style biases (acquiescence, extreme responding)
- Latent factor structure for realistic cross-task correlations

For the maze-construal paradigm, uses BFS-computed construal probabilities on paper-reproduced mazes from Ho et al. (12 mazes, 7 tetromino obstacles each).

**LLM agents (slower, richer)**
Each participant is a Claude instance roleplaying a persona. Generates chain-of-thought responses and awareness probes. Cap is 10 participants due to API cost.

---

## Architecture

```
LandingPage → design agent (Sonnet) → experiment config
    ↓
DispatchPage → parametric simulation / LLM agents
    ↓
ReportPage → analysis pipeline (pure TS) → analysis agent (Opus)
    ↓
Iteration → feedback → adjusted params → DispatchPage
```

**Key files:**
| File | What |
|------|------|
| `src/lib/simulation.ts` | Parametric participant simulation |
| `src/lib/mazeSimulation.ts` | BFS construal probabilities + maze trial simulation |
| `src/lib/latentModel.ts` | Individual difference model (Big Five → task performance) |
| `src/lib/personaPrompts.ts` | Identity-driven LLM persona construction |
| `src/lib/analysis/` | Analysis pipeline (descriptive, effects, multivariate, construal) |
| `src/components/report/AnalysisChat.tsx` | Opus-powered analysis agent |
| `api/claude.ts` | Vercel serverless proxy for Anthropic API |

---

## Running tests

```bash
npm test
```

262 tests covering simulation calibration, construal effect size, maze structure validation, analysis pipeline steps, and persona trait generation.

To run the end-to-end test against AWS Bedrock (requires AWS credentials):
```bash
cd nightshift
npx tsx scripts/e2e-bedrock.ts
```

---

## Tech stack

- **React 19 + TypeScript + Vite**
- **Tailwind CSS v4** + Framer Motion
- **Claude API** (Sonnet for design/simulation, Opus for analysis)
- **Vitest** (262 tests)
- **Vercel** (serverless API proxy + hosting)

---

## Author

[Daisy Lin](https://daisilin.github.io) — PhD candidate in Computational Neuroscience (NYU). Building interfaces that help researchers explore experimental design space before committing to costly data collection.
