# nightshift — Behavioral Research Platform

## What This Is

An overnight experiment iteration system for behavioral researchers. Three pillars:
1. **Task Bank** — Classic cognitive paradigms (games + surveys) every cogsci researcher knows
2. **Persona Bank** — Simulated populations with documented behavioral priors
3. **Computation Engine** — Deterministic simulation + real metrics. Claude proposes; system computes.

**Framing**: Compress weeks of pre-pilot iteration into overnight agent runs. Simulation catches bad designs early — does NOT replace real human data.

**Architecture**: Claude proposes structured designs → System simulates with personas → System computes metrics → Report shows charts + numbers → Claude interprets

---

## Task Bank (8 paradigms)

| Task | Category | DVs | Difficulty axis |
|------|----------|-----|-----------------|
| Tower of London | planning | moves, planning time | # moves (2-7) |
| Four-in-a-Row | strategic planning | move quality, think time | board size |
| Corsi Block | visuospatial WM | span, accuracy | sequence length (2-9) |
| Rush Hour | constraint planning | moves, time, optimality | # blockers |
| Stroop | cognitive control | RT, accuracy, interference | % congruent |
| N-back | working memory | hits, false alarms, d' | n level (1-3) |
| Likert Survey | survey | item responses, subscales | # items |
| Forced-Choice Survey | survey | proportions, consistency | # options |

v1 uses a shared generative scaffold per paradigmType (behavioral / survey) with paradigm-specific parameterization. Adding a task = adding a config object.

## Persona Bank (5 populations)

| Persona | RT | Accuracy | Variability | Fatigue | Lapse | Survey bias |
|---------|-----|----------|-------------|---------|-------|-------------|
| College student | 1.0x | baseline | 1.0x | low | low | low acquiescence |
| MTurk worker | 1.05x | -0.03 | 1.2x | medium | medium | moderate |
| Older adult (65+) | 1.4x | -0.05 | 1.3x | high | low | high acquiescence |
| Child (8-12) | 1.25x | -0.10 | 1.6x | high | high | extreme responding |
| Clinical (ADHD) | 1.1x | -0.08 | 1.8x | high | very high | — |

**These are illustrative multipliers for simulation, not population estimates.** Personas are editable priors — tunable assumptions for stress-testing designs, not empirical claims.

---

## Build Order

### Phase 1: Types + Banks + Simulation + Metrics (pure computation, no UI)
### Phase 2: AI layer (structured JSON) + State management
### Phase 3: Report components (MetricCard, DistributionChart, PersonaComparison)
### Phase 4: Pages (Landing with task picker, Dispatch 4-step, Report dashboard)
### Phase 5: Deploy

## Honesty Labels
- Reports: "Synthetic pilots with tunable assumptions — for stress-testing designs, not scientific claims."
- Personas: "Illustrative multipliers, not population estimates."
- overallScore: "Heuristic composite — transparent weighted sum, not objective science."
