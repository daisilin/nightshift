# nightshift — Behavioral Research Platform

## What This Is

An overnight experiment iteration system for behavioral researchers. Three pillars:
1. **Task Bank** — Classic cognitive paradigms (games + surveys)
2. **Persona Bank** — Simulated populations with documented behavioral priors
3. **Computation Engine** — Deterministic simulation + real metrics

**What nightshift IS**: A calibratable synthetic cohort engine for rapid experiment design iteration.  
**What nightshift is NOT**: A replacement for human data collection or a validated population simulator.

Simulation catches bad designs early — ceiling effects, low power, wrong task for the question. It does NOT prove that results will replicate with real humans.

## Honest Limitations

- **Generic trial generator**: Tower of London, Rush Hour, Stroop etc. share the same RT/accuracy model with different parameter defaults. They do not implement distinct cognitive processes.
- **Latent loadings from one paper**: Factor structure is from Lin & Ma (Nature Comms). Other papers may have different structures.
- **LLM personas are priors, not evidence**: `agentPersona.ts` generates plausible profiles, not calibrated ones.
- **No empirical validation yet**: Synthetic data has not been compared to any real human dataset.

## Roadmap (from senior review)

### Phase 1: Gold Benchmark (highest leverage)
- Pick ONE paradigm (Tower of London or Stroop)
- Find ONE public human dataset (or use your own pilot data)
- Report synthetic vs real: MAE, ICC, correlation structure agreement
- This becomes the honesty backbone

### Phase 2: Faithful Task Implementations
- Split "demo paradigms" (generic behavioral sim) from "paper-faithful paradigms" (task-specific models)
- Tower of London: implement move-counting, state-space search depth
- Stroop: implement congruency proportion effects, RT distribution shape matching
- Label which are demo vs faithful in the UI

### Phase 3: Validation Layer
- For each paradigm: expected vs observed summary statistics
- Tolerance bands, not point estimates
- CI coverage checks

### Phase 4: Academic gstack Skills
- Portable slash commands: /prereg, /methods, /analysis, /review
- Artifact outputs: preregistration section, methods paragraph, OSF manifest
- Frozen seeds + git SHA per reproduction run

## Current Architecture

```
Landing → select tasks + personas + brief (or drop paper)
    ↓
Dispatch → instant simulation (shared latent profiles across battery)
    ↓
Report → analysis pipeline (Claude-planned, dynamically rendered)
       → analysis chat (iterate with Claude)
       → playable previews (Stroop, ToL, FIAR, Chess, Survey)
       → peer review (simulated Reviewer 2)
       → design editor (tweak params, re-simulate instantly)
```

## Tech Stack
- React 19 + TypeScript + Tailwind CSS v4 + Vite
- Framer Motion for animations
- Claude API for design proposals, analysis planning, peer review
- Deterministic simulation engine (seeded PRNG, 91 tests)
- Vercel deployment with serverless API proxy

## Test Coverage: 91 tests
- Simulation: RNG, behavioral trials, survey responses, participants, pilots, batteries
- Metrics: mean, SD, CI, Cohen's d, Cronbach's alpha, ceiling/floor, SNR, outliers
- Analysis pipeline: registry, executor, descriptive, reliability, effects, quality, correlation matrix, factor analysis
- State: reducer actions (START_EXPERIMENT, START_BATTERY, UPDATE_BATTERY_TASK, etc.)
- Integration: 5-task battery → full pipeline → verify shapes + non-trivial values
