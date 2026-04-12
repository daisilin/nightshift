import type { PersonaDefinition } from '../lib/types';

/**
 * Simulated participant personas.
 * These are ILLUSTRATIVE MULTIPLIERS for simulation, not population estimates.
 * They exist to stress-test experiment designs across different user profiles.
 */
export const personaBank: PersonaDefinition[] = [
  {
    id: 'college-student',
    name: 'College student',
    emoji: '🎓',
    description: 'Young adult, tech-comfortable, fast but sometimes careless',
    rtMultiplier: 1.0,
    accuracyOffset: 0.0,
    variabilityMultiplier: 1.0,
    fatigueRate: 0.15,
    attentionLapseRate: 0.02,
    acquiescenceBias: 0.1,
    extremeResponseStyle: 0.05,
  },
  {
    id: 'mturk-worker',
    name: 'MTurk worker',
    emoji: '🔧',
    description: 'Experienced with online studies, moderate engagement, some satisficing',
    rtMultiplier: 1.05,
    accuracyOffset: -0.03,
    variabilityMultiplier: 1.2,
    fatigueRate: 0.25,
    attentionLapseRate: 0.06,
    acquiescenceBias: 0.2,
    extremeResponseStyle: 0.1,
  },
  {
    id: 'older-adult',
    name: 'Older adult (65+)',
    emoji: '👴',
    description: 'Slower but more careful, higher fatigue, strong acquiescence bias',
    rtMultiplier: 1.4,
    accuracyOffset: -0.05,
    variabilityMultiplier: 1.3,
    fatigueRate: 0.35,
    attentionLapseRate: 0.03,
    acquiescenceBias: 0.35,
    extremeResponseStyle: 0.15,
  },
  {
    id: 'child',
    name: 'Child (8-12)',
    emoji: '🧒',
    description: 'High variability, frequent lapses, extreme responding on surveys',
    rtMultiplier: 1.25,
    accuracyOffset: -0.10,
    variabilityMultiplier: 1.6,
    fatigueRate: 0.40,
    attentionLapseRate: 0.10,
    acquiescenceBias: 0.15,
    extremeResponseStyle: 0.35,
  },
  {
    id: 'clinical-adhd',
    name: 'Clinical (ADHD profile)',
    emoji: '⚡',
    description: 'Fast but inaccurate, very high variability and attention lapses',
    rtMultiplier: 1.1,
    accuracyOffset: -0.08,
    variabilityMultiplier: 1.8,
    fatigueRate: 0.30,
    attentionLapseRate: 0.12,
    acquiescenceBias: 0.1,
    extremeResponseStyle: 0.1,
  },
];

export function getPersona(id: string): PersonaDefinition | undefined {
  return personaBank.find(p => p.id === id);
}
