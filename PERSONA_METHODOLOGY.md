# nightshift — LLM Participant Simulation Methodology

## Core Principle: Identity-Driven, Not Behavior-Injected

We simulate **people**, not behavioral parameters. The LLM receives a complete human identity — demographics, backstory, current mental state, motivation — and its behavior in any experiment **emerges from who it is**, just like real participants.

We do NOT:
- Tell the LLM to "make mistakes" or "be inaccurate"
- Inject paper-specific error rates or RT distributions
- Hardcode behavioral parameters into the persona prompt
- Instruct the model to "respond like a human" (it responds AS a human)

We DO:
- Build a specific, named person with rich life context
- Let cognitive limitations emerge from their identity
- Use the same persona across different tasks (generalization)
- Vary within-population diversity through demographics, mood, and motivation

## Why This Generalizes

A 19-year-old checking her phone between trials will:
- Miss details in a maze (Ho et al. construal task)
- Have a smaller Stroop interference effect (fast but sloppy)
- Give more random survey responses (satisficing)
- Show shorter Corsi span (not paying full attention)

We didn't program any of those behaviors. They all follow from **"19-year-old, low motivation, medium attention span, checking phone."** The same persona works for any paradigm.

This is the key innovation: instead of calibrating a parametric model to each paper's specific findings, we build a realistic person and let the LLM's world knowledge about human cognition produce appropriate behavior.

## Persona Construction

### Layer 1: Demographics (from Argyle et al., 2023)
Specific demographics produce more realistic responses than vague ones.

```
"19-year-old female psychology sophomore at a large Midwest university"
>> better than >>
"young adult college student"
```

Fields: age, gender, education, occupation, location.

### Layer 2: Backstory (from Park et al., 2023)
Brief life context creates consistent identity that affects behavior.

```
"Has done 3 other psych studies this semester. Tends to check her phone
between trials. Took intro psych last year."
```

This creates **implicit behavioral predictions**:
- 3 prior studies → experienced with the format, less careful
- Checking phone → divided attention, more lapses
- Intro psych → might second-guess herself on certain tasks

### Layer 3: Current State (from Aher et al., 2023)
Within-session variation from mood, time of day, fatigue.

```
"It's late afternoon. You're feeling mildly distracted, thinking about dinner plans."
```

This produces realistic **within-person noise** — the same person performs differently at 9 AM vs 4 PM, which is exactly what real data shows.

### Layer 4: Motivation and Attention
General dispositional factors that affect task engagement.

```
"Your motivation for this task is low. Your typical attention span is medium."
```

These are NOT behavioral parameters — they're descriptions of the person. A low-motivation participant doesn't "randomly press buttons" because we told them to; they do it because they're optimizing for finishing quickly.

## Population Templates

### College Students (WEIRD sample)
Age 18-24. High tech familiarity. Variable motivation (course credit vs genuine interest). Medium attention span. Some have prior study experience, some are naive.

**Why they behave the way they do:** Fast but occasionally careless. Familiar with screens and interfaces. Some try hard (competitive types), others do the minimum (credit seekers). Phone-checking is endemic.

### MTurk/Prolific Workers
Age 22-55. Medium-high tech familiarity. Pay-motivated. Experienced with surveys. Variable attention (some are careful to maintain acceptance rates, others satisfice).

**Why they behave the way they do:** They've done hundreds of studies. They know how to skim instructions. They're balancing speed (more studies = more money) against accuracy (rejections hurt their rating). Some are doing this on their phone during a work break.

### Older Adults (65+)
Age 65-82. Low-medium tech familiarity. High motivation (want to help research). Long attention span but fatigue after ~20 min. Slower processing, more deliberate.

**Why they behave the way they do:** Slower processing speed is a normal aging effect. Higher acquiescence on surveys reflects generational response styles. They compensate for speed loss with accuracy — the speed-accuracy tradeoff shifts with age.

### Children (8-12)
Age 7-12. High tech familiarity (iPad generation). Variable motivation. Short attention span. Extreme response style on surveys.

**Why they behave the way they do:** Limited inhibitory control → impulsive responses. Scale compression → extreme ratings ("either awesome or terrible"). Short sustained attention → performance declines sharply after 10 minutes. Wiggly and distractible — not a parameter, just a reality of being 10.

### Clinical (ADHD)
Age 18-40. High tech familiarity. Variable motivation (interested but can't sustain focus). Short attention span. High intra-individual variability.

**Why they behave the way they do:** ADHD is characterized by attention fluctuation, not constant inattention. They may hyperfocus on interesting trials and completely zone out on boring ones. Their RT distribution has a long right tail (occasional very slow responses when attention lapses). This isn't a "lapse rate parameter" — it's what ADHD brains do.

## What's NOT Paper-Specific

| Component | Paper-specific? | Why |
|-----------|----------------|-----|
| Persona demographics | No | Based on population literature, not any single study |
| Persona backstories | No | General human experiences, not task-specific |
| Persona prompt format | No | Identity-driven framework works for any task |
| Task framings | No | Written from naive participant perspective |
| Awareness probe framing | No | Standard memory probe, used across attention research |
| Population templates | No | Based on developmental/clinical literature, not calibrated to specific papers |

| Component | Paper-specific? | Why |
|-----------|----------------|-----|
| Parametric logistic coefficients | Yes (Ho et al.) | Calibrated to reproduce specific awareness distributions |
| Latent factor loadings | Yes (Lin & Ma) | Calibrated to reproduce specific inter-task correlations |
| RT range parameters | Partially | Based on general task norms, but ranges are paradigm-specific |

The parametric model is an explicit calibrated approximation — its paper-specificity is a feature, not a bug. The LLM personas are the general-purpose simulation engine.

## Validation Strategy

### Within-Population Consistency
The same persona should produce similar behavior across tasks within one session:
- If Emma is distracted on trial 1, she's probably still distracted on trial 5
- If Robert is methodical on the maze, he's methodical on N-back too

### Between-Population Differences
Known population differences should emerge naturally:
- Older adults slower than college students (processing speed)
- Children more variable than adults (inhibitory control)
- ADHD shows higher intra-individual variability
- MTurk workers show satisficing patterns

### Within-Population Diversity
Not all college students are the same:
- Emma (low motivation, checking phone) ≠ James (competitive, analytical)
- Maria (experienced, efficient) ≠ Tyler (rushed, sloppy)

### Cross-Paper Generalization
The acid test: do the same personas produce realistic data for DIFFERENT papers?
- Ho et al. maze → construal effects emerge from natural attention allocation
- Lin & Ma planning battery → factor structure emerges from diverse cognitive profiles
- Classic Stroop → interference effects emerge from task demands
- Survey studies → acquiescence and extreme response styles emerge from persona traits

## Relationship to Parametric Model

The parametric model (`simulation.ts`) and LLM personas serve different purposes:

| | Parametric | LLM Personas |
|---|-----------|-------------|
| Speed | Instant (pure math) | Slow (API calls) |
| Cost | Free | ~$0.01/trial |
| Reproducibility | Deterministic (seeded) | Stochastic |
| Calibration | Tuned to specific papers | General-purpose |
| What it captures | Distributional properties (RT, accuracy) | Cognitive processes (strategies, attention, reasoning) |
| Best for | Quick iteration, benchmarking | Rich qualitative data, process validation |

The parametric model answers: "Does the data LOOK like real data?"
The LLM personas answer: "Does the behavior WORK like real behavior?"

Both are valuable. The parametric model provides fast quantitative benchmarks. The LLM personas provide qualitative validity and process-level insights that no parametric model can capture — like whether a participant's chain of thought reveals genuine spatial reasoning or just surface-level pattern matching.

## Chain of Thought as Data

LLM participants produce natural language while doing tasks. This is preserved as `metadata.cot` on each trial. It's NOT noise — it's data:

- **Navigation strategies**: "I'll go left first, then up" vs "I'll head straight for the goal"
- **Attention allocation**: Which obstacles does the participant mention?
- **Uncertainty**: "I think..." vs "Definitely..." vs "I'm not sure..."
- **Fatigue**: Later trials tend to have shorter, less detailed CoT
- **Individual differences**: Analytical participants describe systematic strategies; impulsive ones just start moving

This CoT data is available for analysis alongside quantitative measures, enabling mixed-methods research that would be impossible with parametric simulation alone.
