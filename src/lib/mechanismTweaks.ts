/**
 * MECHANISM TWEAKS — hypothesis-driven processing modifications
 *
 * A MechanismTweak modifies HOW the LLM participant processes a task,
 * based on a cognitive theory the researcher wants to test.
 *
 * Two categories:
 * 1. GENERAL TWEAKS: apply to all tasks (e.g. limited WM, satisficing)
 *    These are the "humanized baseline" — always-on cognitive constraints.
 *
 * 2. HYPOTHESIS TWEAKS: task-specific processing changes the researcher
 *    selects to test a specific mechanism (e.g. serial attention for construal).
 *    These are the "independent variable" in the simulation.
 *
 * Design principle: tweaks describe WHAT CHANGES in the processing pipeline,
 * not what behavior to produce. The behavior should EMERGE from the tweak.
 */

export interface MechanismTweak {
  id: string;
  name: string;
  description: string;
  citation: string;
  category: 'general' | 'hypothesis';
  /** System prompt text prepended to task instructions */
  primer: string;
  /** Structural parameter overrides (optional) */
  params?: {
    contextWindow?: number;
    temperature?: number;
  };
  /** Processing pipeline modification (optional) */
  processing?: {
    /** 'serial-attention': walk through stimulus step-by-step */
    type: 'serial-attention' | 'feedback-uncertainty' | 'context-truncation' | 'none';
    /** Config for the processing type */
    config?: Record<string, any>;
  };
  /** Which task categories this tweak is relevant for */
  relevantTasks?: string[];
}

/**
 * Built-in tweaks library — grounded in published literature.
 */
export const TWEAK_LIBRARY: MechanismTweak[] = [
  // ════════════════════════════════════════════
  // GENERAL TWEAKS (humanized baseline)
  // ════════════════════════════════════════════
  {
    id: 'wm-limit',
    name: 'Working memory limit',
    description: 'Limits information retention to ~7 items, matching human WM capacity.',
    citation: 'Miller, 1956',
    category: 'general',
    primer: 'Your working memory holds only about 7 items at once. Older information fades unless actively rehearsed.',
    params: { contextWindow: 10 },
  },
  {
    id: 'satisficing',
    name: 'Satisficing',
    description: 'Commit to good-enough answers rather than exhaustive optimization.',
    citation: 'Simon, 1956',
    category: 'general',
    primer: 'You satisfice rather than optimize — you commit to good-enough answers instead of exhaustive search.',
  },
  {
    id: 'availability-bias',
    name: 'Availability heuristic',
    description: 'Recent and vivid information weighs more than base rates.',
    citation: 'Tversky & Kahneman, 1973',
    category: 'general',
    primer: 'You weight recent, vivid, or memorable information more heavily than statistical base rates.',
  },
  {
    id: 'vigilance-decay',
    name: 'Vigilance decay',
    description: 'Sustained attention decreases over time-on-task.',
    citation: 'Mackworth, 1948',
    category: 'general',
    primer: 'Your sustained attention decays with time-on-task. Early-trial accuracy exceeds late-trial as fatigue accumulates.',
  },
  {
    id: 'perseveration',
    name: 'Rule perseveration',
    description: 'Persist with prior rules/strategies even when evidence suggests change.',
    citation: 'Grant & Berg, 1948',
    category: 'general',
    primer: 'You tend to persist with your current strategy. Rule changes require multiple clear disconfirmations before you update.',
  },

  // ════════════════════════════════════════════
  // HYPOTHESIS TWEAKS (researcher-selectable)
  // ════════════════════════════════════════════
  {
    id: 'serial-attention',
    name: 'Serial attention allocation',
    description: 'Process stimulus sequentially (position by position), not all at once. Simulates foveal gaze. Awareness tracks what was attended.',
    citation: 'Ho et al., 2022 (value-guided construal)',
    category: 'hypothesis',
    primer: '',
    processing: {
      type: 'serial-attention',
      config: { radius: 3, nSteps: 8 },
    },
    relevantTasks: ['maze-construal'],
  },
  {
    id: 'model-based-control',
    name: 'Model-based planning',
    description: 'Plan via an internal causal model of task structure. Weight common transitions more than rare ones.',
    citation: 'Daw et al., 2011',
    category: 'hypothesis',
    primer: 'You plan through an internal model of task structure. When acting, you imagine downstream consequences: current choice → next state → likely reward. You weight common transitions more heavily than rare ones when inferring task structure.',
    relevantTasks: ['two-step'],
  },
  {
    id: 'feedback-uncertainty',
    name: 'Feedback uncertainty',
    description: 'Occasionally miss or misremember trial feedback, creating uncertainty that drives exploration.',
    citation: 'Daw et al., 2006; nightshift empirical finding',
    category: 'hypothesis',
    primer: '',
    processing: {
      type: 'feedback-uncertainty',
      config: { omitRate: 0.2 },
    },
    relevantTasks: ['two-step'],
  },
  {
    id: 'bounded-optimality',
    name: 'Bounded optimality',
    description: 'Trade accuracy for cognitive cost — spend computation on decisions that matter.',
    citation: 'Gershman, Horvitz & Tenenbaum, 2015',
    category: 'hypothesis',
    primer: 'You practice bounded optimality: the best use of limited cognitive resources. You spend more computation on decisions that matter and satisfice on routine ones.',
    relevantTasks: ['tower-of-london', 'four-in-a-row'],
  },
  {
    id: 'capacity-limited-encoding',
    name: 'Capacity-limited encoding',
    description: 'Severely truncate context at probe time, simulating encoding decay.',
    citation: 'Cowan, 2001',
    category: 'hypothesis',
    primer: '',
    processing: {
      type: 'context-truncation',
      config: { probeContext: 4 },
    },
    relevantTasks: ['maze-construal', 'n-back', 'corsi-block'],
  },
];

/**
 * Get tweaks relevant to a specific task.
 */
export function getRelevantTweaks(paradigmId: string): MechanismTweak[] {
  return TWEAK_LIBRARY.filter(t =>
    t.category === 'general' || !t.relevantTasks || t.relevantTasks.includes(paradigmId)
  );
}

/**
 * Combine selected tweaks into a single system prompt prefix + param overrides.
 */
export function combineTweaks(tweakIds: string[]): {
  systemPrefix: string;
  params: { contextWindow?: number; temperature?: number };
  processing: MechanismTweak['processing'][];
} {
  const selected = tweakIds
    .map(id => TWEAK_LIBRARY.find(t => t.id === id))
    .filter((t): t is MechanismTweak => !!t);

  const primers = selected.map(t => t.primer).filter(Boolean);
  const systemPrefix = primers.length > 0
    ? 'Cognitive constraints (from psychology literature):\n' +
      primers.map((p, i) => `${i + 1}. ${p}`).join('\n') +
      '\nEmbody these limits naturally.'
    : '';

  const params: { contextWindow?: number; temperature?: number } = {};
  for (const t of selected) {
    if (t.params?.contextWindow) params.contextWindow = t.params.contextWindow;
    if (t.params?.temperature) params.temperature = t.params.temperature;
  }

  const processing = selected
    .map(t => t.processing)
    .filter((p): p is NonNullable<typeof p> => !!p && p.type !== 'none');

  return { systemPrefix, params, processing };
}

/**
 * Get the default "humanized baseline" tweak set.
 * These are always-on general cognitive constraints.
 */
export function getBaselineTweakIds(): string[] {
  return ['wm-limit', 'satisficing'];
}
