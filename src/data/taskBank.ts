import type { ParadigmDefinition } from '../lib/types';

export const taskBank: ParadigmDefinition[] = [
  // === PLANNING ===
  {
    id: 'tower-of-london',
    name: 'Tower of London',
    emoji: '🏗',
    category: 'planning',
    paradigmType: 'behavioral',
    description: 'Classic planning task — move discs to match a goal configuration in minimum moves',
    defaultParams: {
      type: 'behavioral', difficulty: 0.5, nTrials: 30, nConditions: 3,
      conditionLabels: ['3-move', '4-move', '5-move'],
      withinSubject: true, rtRange: [2000, 15000], baseAccuracy: 0.85,
    },
    dependentVariables: [
      { name: 'planningTime', type: 'continuous', unit: 'ms', expectedRange: [1000, 20000], higherIsBetter: false },
      { name: 'accuracy', type: 'binary', unit: 'proportion', expectedRange: [0, 1], higherIsBetter: true },
    ],
  },
  {
    id: 'four-in-a-row',
    name: 'Four-in-a-Row',
    emoji: '🎯',
    category: 'planning',
    paradigmType: 'behavioral',
    description: 'Strategic planning on a 4x9 board — free placement, 4-in-a-row to win',
    defaultParams: {
      type: 'behavioral', difficulty: 0.6, nTrials: 20, nConditions: 2,
      conditionLabels: ['vs-random', 'vs-skilled'],
      withinSubject: true, rtRange: [1000, 12000], baseAccuracy: 0.70,
    },
    dependentVariables: [
      { name: 'thinkTime', type: 'continuous', unit: 'ms', expectedRange: [500, 15000], higherIsBetter: false },
      { name: 'moveQuality', type: 'continuous', unit: 'score', expectedRange: [0, 1], higherIsBetter: true },
    ],
  },
  {
    id: 'rush-hour',
    name: 'Rush Hour',
    emoji: '🚗',
    category: 'planning',
    paradigmType: 'behavioral',
    description: 'Slide blocking vehicles to free the target car — measures constraint-based planning',
    defaultParams: {
      type: 'behavioral', difficulty: 0.5, nTrials: 24, nConditions: 3,
      conditionLabels: ['easy', 'medium', 'hard'],
      withinSubject: true, rtRange: [3000, 30000], baseAccuracy: 0.80,
    },
    dependentVariables: [
      { name: 'solutionTime', type: 'continuous', unit: 'ms', expectedRange: [2000, 60000], higherIsBetter: false },
      { name: 'movesOverOptimal', type: 'continuous', unit: 'moves', expectedRange: [0, 20], higherIsBetter: false },
    ],
  },

  // === MEMORY ===
  {
    id: 'corsi-block',
    name: 'Corsi Block',
    emoji: '🧩',
    category: 'memory',
    paradigmType: 'behavioral',
    description: 'Visuospatial working memory — reproduce sequences of highlighted blocks',
    defaultParams: {
      type: 'behavioral', difficulty: 0.5, nTrials: 36, nConditions: 6,
      conditionLabels: ['span-3', 'span-4', 'span-5', 'span-6', 'span-7', 'span-8'],
      withinSubject: true, rtRange: [500, 5000], baseAccuracy: 0.90,
    },
    dependentVariables: [
      { name: 'accuracy', type: 'binary', unit: 'proportion', expectedRange: [0, 1], higherIsBetter: true },
      { name: 'responseTime', type: 'continuous', unit: 'ms', expectedRange: [300, 6000], higherIsBetter: false },
    ],
  },
  {
    id: 'n-back',
    name: 'N-back',
    emoji: '🔢',
    category: 'memory',
    paradigmType: 'behavioral',
    description: 'Working memory — detect when current stimulus matches N items back',
    defaultParams: {
      type: 'behavioral', difficulty: 0.5, nTrials: 60, nConditions: 3,
      conditionLabels: ['1-back', '2-back', '3-back'],
      withinSubject: true, rtRange: [200, 1200], baseAccuracy: 0.85,
    },
    dependentVariables: [
      { name: 'hitRate', type: 'continuous', unit: 'proportion', expectedRange: [0, 1], higherIsBetter: true },
      { name: 'falseAlarmRate', type: 'continuous', unit: 'proportion', expectedRange: [0, 1], higherIsBetter: false },
      { name: 'rt', type: 'continuous', unit: 'ms', expectedRange: [150, 1500], higherIsBetter: false },
    ],
  },

  // === COGNITIVE CONTROL ===
  {
    id: 'stroop',
    name: 'Stroop',
    emoji: '🎨',
    category: 'control',
    paradigmType: 'behavioral',
    description: 'Name the ink color while ignoring the word — measures cognitive control',
    defaultParams: {
      type: 'behavioral', difficulty: 0.5, nTrials: 80, nConditions: 2,
      conditionLabels: ['congruent', 'incongruent'],
      withinSubject: true, rtRange: [300, 1200], baseAccuracy: 0.92,
    },
    dependentVariables: [
      { name: 'rt', type: 'continuous', unit: 'ms', expectedRange: [250, 1500], higherIsBetter: false },
      { name: 'accuracy', type: 'binary', unit: 'proportion', expectedRange: [0, 1], higherIsBetter: true },
    ],
  },

  // === COMPLEX PLANNING ===
  {
    id: 'chess',
    name: 'Chess Puzzles',
    emoji: '♟',
    category: 'planning',
    paradigmType: 'behavioral',
    description: 'Tactical chess puzzles — find the best move in a given position',
    defaultParams: {
      type: 'behavioral', difficulty: 0.6, nTrials: 20, nConditions: 3,
      conditionLabels: ['1-move', '2-move', '3-move'],
      withinSubject: true, rtRange: [5000, 60000], baseAccuracy: 0.65,
    },
    dependentVariables: [
      { name: 'solutionTime', type: 'continuous', unit: 'ms', expectedRange: [3000, 120000], higherIsBetter: false },
      { name: 'accuracy', type: 'binary', unit: 'proportion', expectedRange: [0, 1], higherIsBetter: true },
    ],
  },
  {
    id: 'two-step',
    name: 'Two-Step Task',
    emoji: '🎲',
    category: 'learning',
    paradigmType: 'behavioral',
    description: 'Sequential decision-making — reveals model-based vs model-free reasoning',
    defaultParams: {
      type: 'behavioral', difficulty: 0.5, nTrials: 200, nConditions: 2,
      conditionLabels: ['common-transition', 'rare-transition'],
      withinSubject: true, rtRange: [300, 2000], baseAccuracy: 0.60,
    },
    dependentVariables: [
      { name: 'rt', type: 'continuous', unit: 'ms', expectedRange: [200, 3000], higherIsBetter: false },
      { name: 'stayProbability', type: 'continuous', unit: 'proportion', expectedRange: [0, 1], higherIsBetter: true },
    ],
  },

  // === SURVEYS ===
  {
    id: 'likert-survey',
    name: 'Likert Survey',
    emoji: '📋',
    category: 'survey',
    paradigmType: 'survey',
    description: 'Standard Likert scale questionnaire with subscales and reverse-coded items',
    defaultParams: {
      type: 'survey', nItems: 20, scalePoints: 5, nSubscales: 3,
      subscaleNames: ['Factor A', 'Factor B', 'Factor C'],
      reverseCodedIndices: [2, 5, 8, 13, 17],
    },
    dependentVariables: [
      { name: 'subscaleScore', type: 'continuous', unit: 'mean', expectedRange: [1, 5], higherIsBetter: true },
      { name: 'itemResponse', type: 'ordinal', unit: 'point', expectedRange: [1, 5], higherIsBetter: true },
    ],
  },
  {
    id: 'forced-choice',
    name: 'Forced-Choice Survey',
    emoji: '⚖',
    category: 'survey',
    paradigmType: 'survey',
    description: 'Binary or multiple forced-choice items — measures preferences and consistency',
    defaultParams: {
      type: 'survey', nItems: 15, scalePoints: 2, nSubscales: 2,
      subscaleNames: ['Risk preference', 'Time preference'],
      reverseCodedIndices: [3, 7, 11],
    },
    dependentVariables: [
      { name: 'choiceProportion', type: 'continuous', unit: 'proportion', expectedRange: [0, 1], higherIsBetter: true },
      { name: 'consistency', type: 'continuous', unit: 'proportion', expectedRange: [0, 1], higherIsBetter: true },
    ],
  },
];

export function getParadigm(id: string): ParadigmDefinition | undefined {
  return taskBank.find(t => t.id === id);
}
