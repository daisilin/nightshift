/**
 * Paradigm-level caveats surfaced by the design agent during probing.
 *
 * Each entry describes what we know about LLM simulation of this task:
 * - `humanBenchmark`: key published result (for grounding probe questions)
 * - `llmDeviation`: what we observe in our own sims
 * - `probeQuestions`: things to ask the researcher before dispatching
 * - `faithfulness`: 'validated' (compared to humans), 'paper-faithful'
 *                  (task-specific model), or 'demo' (generic sim)
 */
export interface ParadigmCaveat {
  paradigmId: string;
  faithfulness: 'validated' | 'paper-faithful' | 'demo';
  humanBenchmark?: string;
  llmDeviation?: string;
  probeQuestions: string[];
}

export const paradigmCaveats: Record<string, ParadigmCaveat> = {
  'maze-construal': {
    paradigmId: 'maze-construal',
    faithfulness: 'validated',
    humanBenchmark: 'Ho et al. (Nature 2022): construal effect=0.614 (high=0.787, low=0.173), N=161.',
    llmDeviation: 'Construal effect is usually absent or weak (our sim: ~0.013). LLMs can\'t "see" the maze — awareness probing via text doesn\'t capture visual simplification.',
    probeQuestions: [
      'Ho et al. used visual mazes — LLMs get text descriptions. Do you want to (a) compare against our text-adapted benchmark (~0.01), (b) test whether *any* prompt format reproduces the effect, or (c) document the absence as a finding?',
      'Which model family do you want to run? Qwen is closest to the paper effect in our sims; Sonnet is most accurate overall but shows almost no construal effect.',
    ],
  },
  'wcst': {
    paradigmId: 'wcst',
    faithfulness: 'validated',
    humanBenchmark: 'Lin & Ma (Nat Comms): 2.45 perseverative errors (SEM=0.17), N=476, 64 trials.',
    llmDeviation: 'LLMs perseverate ~2× human (≈5.5 errors) in text. No perceptual salience when the sorting dimension changes.',
    probeQuestions: [
      'LLMs show ~2× human perseveration on text-WCST. Is that a bug to fix, or is the 2× gap *itself* what you want to study?',
      'Do you want 64 trials (paper protocol) or fewer for a fast pilot? Fewer trials inflate the noise in perseveration counts.',
    ],
  },
  'two-step': {
    paradigmId: 'two-step',
    faithfulness: 'paper-faithful',
    humanBenchmark: 'Lin & Ma: model-based weight=2.16, stay-after-reward≈0.75.',
    llmDeviation: 'Stay-after-reward ≈0.90 (too deterministic). Partially corrected by removing transition labels from feedback — standard protocol.',
    probeQuestions: [
      'Include transition labels in feedback? (Default: NO — standard protocol, and it reduces the stay-after-reward inflation we see in LLMs.)',
      '80 trials per participant is standard. Keep that, or pilot with fewer?',
    ],
  },
  'corsi-block': {
    paradigmId: 'corsi-block',
    faithfulness: 'validated',
    humanBenchmark: 'Lin & Ma: Corsi score=53.5 (N=476).',
    llmDeviation: 'Score is almost perfectly determined by context window (r=0.99). ctx=10–12 tokens matches human span 6–7.',
    probeQuestions: [
      'Corsi is essentially a context-window measurement for LLMs. Do you want to vary ctx across participants to study span, or hold it constant?',
    ],
  },
  'tower-of-london': {
    paradigmId: 'tower-of-london',
    faithfulness: 'paper-faithful',
    humanBenchmark: 'Humans solve 3-move puzzles well, degrade at 5+.',
    llmDeviation: 'LLMs solve 2–3 move puzzles reliably; accuracy drops sharply above 3 moves. No gradual degradation like humans.',
    probeQuestions: [
      'TOL accuracy falls off a cliff at 4+ moves for LLMs. Do you want to stay in the easy range (comparable to humans) or stress-test the boundary?',
    ],
  },
  'n-back': {
    paradigmId: 'n-back',
    faithfulness: 'validated',
    humanBenchmark: 'Human d\'≈0.80 at 2-back.',
    llmDeviation: 'Naturally human-like: d\'≈0.76. One of the tasks where LLM and human performance converge.',
    probeQuestions: [
      'N-back is one of the few tasks where LLMs behave human-like. Do you want to use it as a positive-control baseline alongside a task where they diverge?',
    ],
  },
  'stroop': {
    paradigmId: 'stroop',
    faithfulness: 'demo',
    humanBenchmark: 'Classic interference effect: incongruent RT > congruent RT by ~50–100ms.',
    llmDeviation: 'Text-based Stroop does not produce a meaningful interference effect. The visual color–word conflict is the whole paradigm.',
    probeQuestions: [
      'Stroop is fundamentally visual. In our text adaptation you usually won\'t see the interference effect. Is that acceptable, or do you need a different paradigm for inhibition?',
    ],
  },
  'four-in-a-row': {
    paradigmId: 'four-in-a-row',
    faithfulness: 'paper-faithful',
    humanBenchmark: 'Lin & Ma: move quality loads on planning factor r≈0.4–0.6.',
    llmDeviation: 'LLMs play reasonably against random opponents; quality drops sharply against a skilled opponent.',
    probeQuestions: [
      'Include a skilled-opponent condition to stress planning depth, or just random?',
    ],
  },
  'rush-hour': {
    paradigmId: 'rush-hour',
    faithfulness: 'demo',
    probeQuestions: [
      'Rush Hour uses the generic behavioral sim (not a custom solver). Is that fine for your design, or do you need trial-by-trial move sequences?',
    ],
  },
  'chess': {
    paradigmId: 'chess',
    faithfulness: 'demo',
    probeQuestions: [
      'The chess paradigm here is a generic behavioral sim, not a board-state evaluator. For real chess analysis you\'d want to swap in a Stockfish-scored trial generator. Is that a blocker?',
    ],
  },
  'likert-survey': {
    paradigmId: 'likert-survey',
    faithfulness: 'demo',
    probeQuestions: [
      'Survey responses in parametric mode use personality-weighted priors (Big Five + response biases). For real scale development, you\'ll want LLM-agent mode with persona-grounded responses. Which do you need?',
    ],
  },
  'forced-choice': {
    paradigmId: 'forced-choice',
    faithfulness: 'demo',
    probeQuestions: [
      'Forced-choice uses the generic trial model. What\'s the underlying dimension you want the choices to vary on?',
    ],
  },
};

/**
 * Returns a compact, prompt-ready caveat block for the selected paradigms.
 * Only includes entries we actually have — silently skips unknown ids.
 */
export function buildCaveatBlock(paradigmIds: string[]): string {
  const relevant = paradigmIds
    .map(id => paradigmCaveats[id])
    .filter(Boolean) as ParadigmCaveat[];
  if (relevant.length === 0) return '';

  return relevant.map(c => {
    const parts = [
      `[${c.paradigmId}] faithfulness=${c.faithfulness}`,
      c.humanBenchmark ? `  human: ${c.humanBenchmark}` : '',
      c.llmDeviation ? `  llm-sim: ${c.llmDeviation}` : '',
      `  probes:\n${c.probeQuestions.map(q => `    - ${q}`).join('\n')}`,
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n\n');
}
