/**
 * UNIFIED PARTICIPANT POOL
 *
 * Generates N diverse, coherent simulated participants for ANY population.
 * Each participant has:
 * - Full demographics (age, gender, education, occupation, location)
 * - Backstory (relevant experience, mood, motivation)
 * - Behavioral parameters (for parametric simulation)
 * - LLM prompt (for LLM-based simulation)
 *
 * Usage:
 *   const pool = await generatePool("college students in the US", 50);
 *   // pool[0].demographics.age = 19
 *   // pool[0].backstory = "freshman, first psych study, nervous"
 *   // pool[0].behavioral = { rtMultiplier: 1.0, ... }
 *   // pool[0].llmPrompt = "You are a 19-year-old freshman..."
 */

import { createRng, normalDraw } from './simulation';
import { buildPersonaPrompt, type PersonaSpec } from './personaPrompts';
import type { PersonaDefinition } from './types';
import { generateLatentProfile, type LatentProfile } from './latentModel';
import { callClaudeApi } from './apiKey';

export interface SimulatedPerson {
  id: string;
  // Demographics
  demographics: {
    age: number;
    gender: string;
    education: string;
    occupation: string;
    location: string;
    ethnicity?: string;
    language?: string;
  };
  // Behavioral backstory
  backstory: string;
  techFamiliarity: 'low' | 'medium' | 'high';
  motivation: 'low' | 'medium' | 'high';
  attentionSpan: 'short' | 'medium' | 'long';
  // Parametric behavioral params (for fast simulation)
  behavioral: PersonaDefinition;
  // Latent cognitive profile (for cross-task correlations)
  latentProfile: LatentProfile;
  // LLM prompt (for LLM-based simulation)
  llmPrompt: string;
}

// ============================================================
// POPULATION TEMPLATES — seed data for generating diverse cohorts
// ============================================================

interface PopulationTemplate {
  ageRange: [number, number];
  genderDist: Record<string, number>; // probabilities
  educationOptions: string[];
  occupationOptions: string[];
  locationOptions: string[];
  backstoryTemplates: string[];
  // Behavioral calibration
  rtMultiplierRange: [number, number];
  accuracyOffsetRange: [number, number];
  variabilityRange: [number, number];
  fatigueRange: [number, number];
  lapseRange: [number, number];
  techFam: ('low' | 'medium' | 'high')[];
  motivationDist: ('low' | 'medium' | 'high')[];
  attentionDist: ('short' | 'medium' | 'long')[];
}

const TEMPLATES: Record<string, PopulationTemplate> = {
  'college-student': {
    ageRange: [18, 24],
    genderDist: { female: 0.55, male: 0.42, 'non-binary': 0.03 },
    educationOptions: ['freshman', 'sophomore', 'junior', 'senior', 'first-year grad student'],
    occupationOptions: ['psychology student (course credit)', 'biology major', 'engineering student', 'undeclared major', 'pre-med student', 'art student', 'econ major'],
    locationOptions: ['large state university in the Midwest', 'private university on the East Coast', 'UC campus in California', 'community college in Texas', 'liberal arts college in New England'],
    backstoryTemplates: [
      'first psych study, a bit nervous about what to expect',
      'has done 4 studies this semester, getting tired of them',
      'genuinely interested in cognitive science, taking notes',
      'doing this for extra credit, wants to finish quickly',
      'stayed up late studying, running on coffee',
      'competitive person, wants to score well even though it doesn\'t matter',
      'checking phone between trials, partially distracted',
      'finds the tasks kind of fun, treating it like a game',
    ],
    rtMultiplierRange: [0.85, 1.15], accuracyOffsetRange: [-0.05, 0.05],
    variabilityRange: [0.8, 1.2], fatigueRange: [0.05, 0.25], lapseRange: [0.01, 0.05],
    techFam: ['high', 'high', 'medium'], motivationDist: ['low', 'medium', 'medium', 'high'],
    attentionDist: ['short', 'medium', 'medium', 'long'],
  },

  'mturk-worker': {
    ageRange: [22, 55],
    genderDist: { female: 0.45, male: 0.52, 'non-binary': 0.03 },
    educationOptions: ['high school diploma', 'some college', 'associate degree', 'bachelor\'s degree', 'master\'s degree'],
    occupationOptions: ['full-time MTurk worker', 'part-time office worker + MTurk', 'stay-at-home parent + surveys', 'retail worker doing tasks on break', 'freelancer between gigs'],
    locationOptions: ['suburban Florida', 'rural Ohio', 'urban California', 'small town in Pennsylvania', 'suburban Texas'],
    backstoryTemplates: [
      'experienced worker, 2000+ HITs completed, efficient but sometimes satisfices',
      'new to online surveys, reads everything carefully',
      'doing this while watching TV, split attention',
      'motivated by the pay, rushes through easy parts',
      'actually enjoys cognitive tasks, takes them seriously',
      'skeptical of researchers, gives honest but minimal effort',
    ],
    rtMultiplierRange: [0.90, 1.20], accuracyOffsetRange: [-0.08, 0.02],
    variabilityRange: [1.0, 1.4], fatigueRange: [0.15, 0.35], lapseRange: [0.03, 0.10],
    techFam: ['medium', 'high'], motivationDist: ['low', 'medium', 'medium'],
    attentionDist: ['short', 'medium', 'medium'],
  },

  'older-adult': {
    ageRange: [65, 82],
    genderDist: { female: 0.55, male: 0.45 },
    educationOptions: ['high school diploma', 'some college', 'bachelor\'s degree', 'master\'s degree', 'professional degree'],
    occupationOptions: ['retired teacher', 'retired engineer', 'retired nurse', 'retired accountant', 'retired military', 'retired small business owner'],
    locationOptions: ['retirement community in Arizona', 'suburb of Chicago', 'small town in Vermont', 'assisted living in Florida', 'rural area in the South'],
    backstoryTemplates: [
      'wants to help with research, very diligent and careful',
      'unfamiliar with computers, someone helped set up the task',
      'sharp mind but slower processing, prefers accuracy over speed',
      'mild hearing loss, may miss verbal instructions',
      'does crossword puzzles daily, enjoys cognitive challenges',
      'gets fatigued more quickly, needs breaks between tasks',
    ],
    rtMultiplierRange: [1.2, 1.6], accuracyOffsetRange: [-0.10, -0.02],
    variabilityRange: [1.1, 1.5], fatigueRange: [0.25, 0.45], lapseRange: [0.02, 0.06],
    techFam: ['low', 'low', 'medium'], motivationDist: ['medium', 'high', 'high'],
    attentionDist: ['medium', 'medium', 'long'],
  },

  'child': {
    ageRange: [7, 12],
    genderDist: { female: 0.50, male: 0.50 },
    educationOptions: ['2nd grade', '3rd grade', '4th grade', '5th grade', '6th grade'],
    occupationOptions: ['elementary school student'],
    locationOptions: ['suburban school in California', 'urban school in New York', 'rural school in Iowa', 'private school in Connecticut'],
    backstoryTemplates: [
      'excited to use the computer, wiggly and energetic',
      'shy, doesn\'t want to get answers wrong',
      'easily distracted, looking around the room',
      'competitive, wants to beat their classmates',
      'methodical for their age, takes time on each response',
      'rushes through to get back to recess',
    ],
    rtMultiplierRange: [1.1, 1.4], accuracyOffsetRange: [-0.15, -0.05],
    variabilityRange: [1.3, 1.8], fatigueRange: [0.30, 0.50], lapseRange: [0.05, 0.15],
    techFam: ['medium', 'high'], motivationDist: ['low', 'medium', 'high'],
    attentionDist: ['short', 'short', 'medium'],
  },

  'clinical-adhd': {
    ageRange: [18, 40],
    genderDist: { female: 0.40, male: 0.55, 'non-binary': 0.05 },
    educationOptions: ['some college', 'bachelor\'s degree', 'in college', 'trade school'],
    occupationOptions: ['freelance designer', 'barista', 'software developer', 'artist', 'student'],
    locationOptions: ['urban area', 'college town', 'suburban area'],
    backstoryTemplates: [
      'diagnosed ADHD-combined type, on medication but still has fluctuations',
      'diagnosed ADHD-inattentive, unmedicated, uses coping strategies',
      'recently diagnosed, still learning what works for them',
      'has good days and bad days, today is medium',
      'hyperfocuses on interesting tasks but zones out on boring ones',
    ],
    rtMultiplierRange: [0.9, 1.2], accuracyOffsetRange: [-0.12, -0.03],
    variabilityRange: [1.5, 2.0], fatigueRange: [0.20, 0.40], lapseRange: [0.08, 0.18],
    techFam: ['medium', 'high'], motivationDist: ['low', 'medium', 'medium'],
    attentionDist: ['short', 'short', 'medium'],
  },
};

// ============================================================
// PSYCHOLOGICAL TRAIT DISTRIBUTIONS BY POPULATION
// ============================================================
// Each array is [P(low), P(medium), P(high)] — must sum to 1.0.
// Based on population-level literature, NOT calibrated to any single paper.
//
// Sources:
// - Big Five norms: Costa & McCrae (1992), Soto et al. (2011)
// - Cognitive tempo: Kagan (1966), Salthouse (1996) aging effects
// - Attentional control: Kane & Engle (2003), Diamond (2013) development
// - Response styles: Paulhus (1991), Greenleaf (1992), Harzing (2006) cross-cultural

interface TraitDistribution {
  openness: [number, number, number];
  conscientiousness: [number, number, number];
  extraversion: [number, number, number];
  agreeableness: [number, number, number];
  neuroticism: [number, number, number];
  cognitiveTempo: [number, number, number]; // impulsive, moderate, reflective
  attentionalControl: [number, number, number];
  acquiescence: [number, number, number];
  extremeResponding: [number, number, number];
  socialDesirability: [number, number, number];
}

const TRAIT_DISTRIBUTIONS: Record<string, TraitDistribution> = {
  'college-student': {
    // Young adults: moderate on most traits, slightly higher openness/neuroticism
    openness:             [0.2, 0.5, 0.3],
    conscientiousness:    [0.3, 0.4, 0.3],
    extraversion:         [0.25, 0.45, 0.3],
    agreeableness:        [0.2, 0.5, 0.3],
    neuroticism:          [0.25, 0.4, 0.35],
    cognitiveTempo:       [0.35, 0.4, 0.25],  // skew impulsive (young)
    attentionalControl:   [0.25, 0.5, 0.25],
    acquiescence:         [0.3, 0.5, 0.2],
    extremeResponding:    [0.4, 0.45, 0.15],
    socialDesirability:   [0.3, 0.4, 0.3],
  },
  'mturk-worker': {
    // Experienced survey-takers: lower conscientiousness, higher acquiescence
    openness:             [0.3, 0.5, 0.2],
    conscientiousness:    [0.35, 0.4, 0.25],
    extraversion:         [0.3, 0.5, 0.2],
    agreeableness:        [0.25, 0.45, 0.3],
    neuroticism:          [0.3, 0.4, 0.3],
    cognitiveTempo:       [0.4, 0.35, 0.25],  // skew impulsive (efficiency pressure)
    attentionalControl:   [0.3, 0.45, 0.25],
    acquiescence:         [0.2, 0.4, 0.4],    // high acquiescence (satisficing)
    extremeResponding:    [0.35, 0.45, 0.2],
    socialDesirability:   [0.4, 0.4, 0.2],
  },
  'older-adult': {
    // Higher conscientiousness/agreeableness, lower openness, reflective tempo
    openness:             [0.3, 0.5, 0.2],
    conscientiousness:    [0.1, 0.4, 0.5],    // higher with age (Roberts et al., 2006)
    extraversion:         [0.3, 0.45, 0.25],
    agreeableness:        [0.1, 0.4, 0.5],    // higher with age
    neuroticism:          [0.35, 0.4, 0.25],   // lower with age (emotional regulation)
    cognitiveTempo:       [0.1, 0.35, 0.55],   // strongly reflective (processing speed decline)
    attentionalControl:   [0.25, 0.45, 0.3],
    acquiescence:         [0.15, 0.35, 0.5],   // high (generational, Harzing 2006)
    extremeResponding:    [0.4, 0.45, 0.15],
    socialDesirability:   [0.15, 0.35, 0.5],   // high (generational norms)
  },
  'child': {
    // Low conscientiousness, impulsive tempo, low attentional control, extreme responding
    openness:             [0.15, 0.35, 0.5],   // high (curious, explorative)
    conscientiousness:    [0.5, 0.35, 0.15],   // low (executive function still developing)
    extraversion:         [0.2, 0.35, 0.45],   // high (energetic)
    agreeableness:        [0.25, 0.45, 0.3],
    neuroticism:          [0.3, 0.4, 0.3],
    cognitiveTempo:       [0.55, 0.3, 0.15],   // strongly impulsive (Diamond, 2013)
    attentionalControl:   [0.5, 0.35, 0.15],   // low (prefrontal cortex still maturing)
    acquiescence:         [0.25, 0.4, 0.35],
    extremeResponding:    [0.1, 0.3, 0.6],     // very high (lack of scale differentiation)
    socialDesirability:   [0.4, 0.4, 0.2],     // lower (less social awareness)
  },
  'clinical-adhd': {
    // Low conscientiousness, impulsive, low attentional control
    openness:             [0.15, 0.4, 0.45],   // high (creative, divergent thinking)
    conscientiousness:    [0.5, 0.35, 0.15],   // low (executive dysfunction)
    extraversion:         [0.2, 0.45, 0.35],
    agreeableness:        [0.25, 0.5, 0.25],
    neuroticism:          [0.2, 0.35, 0.45],   // high (emotional dysregulation)
    cognitiveTempo:       [0.6, 0.25, 0.15],   // strongly impulsive
    attentionalControl:   [0.55, 0.3, 0.15],   // low (core deficit)
    acquiescence:         [0.3, 0.45, 0.25],
    extremeResponding:    [0.25, 0.4, 0.35],
    socialDesirability:   [0.4, 0.4, 0.2],
  },
};

// ============================================================
// POOL GENERATION
// ============================================================

function sampleFrom<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function sampleRange(range: [number, number], rng: () => number): number {
  return range[0] + rng() * (range[1] - range[0]);
}

function sampleGender(dist: Record<string, number>, rng: () => number): string {
  const r = rng();
  let cumulative = 0;
  for (const [gender, prob] of Object.entries(dist)) {
    cumulative += prob;
    if (r < cumulative) return gender;
  }
  return 'female';
}

/**
 * Generate N diverse participants for a population type.
 * Each participant is unique — different age, background, behavioral params.
 * All share a latent cognitive profile cohort for cross-task correlations.
 */
export function generatePool(
  populationType: string,
  n: number,
  seed: number = 42,
): SimulatedPerson[] {
  const template = TEMPLATES[populationType] ?? TEMPLATES['college-student'];
  const rng = createRng(seed);
  const latentProfiles = Array.from({ length: n }, () => generateLatentProfile(rng));
  const pool: SimulatedPerson[] = [];

  for (let i = 0; i < n; i++) {
    const age = Math.round(sampleRange(template.ageRange, rng));
    const gender = sampleGender(template.genderDist, rng);
    const education = sampleFrom(template.educationOptions, rng);
    const occupation = sampleFrom(template.occupationOptions, rng);
    const location = sampleFrom(template.locationOptions, rng);
    const backstory = sampleFrom(template.backstoryTemplates, rng);
    const techFamiliarity = sampleFrom(template.techFam, rng);
    const motivation = sampleFrom(template.motivationDist, rng);
    const attentionSpan = sampleFrom(template.attentionDist, rng);

    const rtMult = Math.round(sampleRange(template.rtMultiplierRange, rng) * 100) / 100;
    const accOffset = Math.round(sampleRange(template.accuracyOffsetRange, rng) * 100) / 100;
    const variability = Math.round(sampleRange(template.variabilityRange, rng) * 100) / 100;
    const fatigue = Math.round(sampleRange(template.fatigueRange, rng) * 100) / 100;
    const lapse = Math.round(sampleRange(template.lapseRange, rng) * 1000) / 1000;

    // Generate psychologically grounded trait profile
    const traitLevels: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
    const tempoLevels: ('impulsive' | 'moderate' | 'reflective')[] = ['impulsive', 'moderate', 'reflective'];

    // Population-specific trait distributions
    // These are based on literature, not calibrated to any specific paper
    const traitWeights = TRAIT_DISTRIBUTIONS[populationType] ?? TRAIT_DISTRIBUTIONS['college-student'];
    const sampleTrait = (weights: number[]) => {
      const r = rng();
      return r < weights[0] ? 'low' : r < weights[0] + weights[1] ? 'medium' : 'high';
    };
    const sampleTempo = (weights: number[]) => {
      const r = rng();
      return r < weights[0] ? 'impulsive' : r < weights[0] + weights[1] ? 'moderate' : 'reflective';
    };

    const spec: PersonaSpec = {
      age, gender, education, occupation, location,
      techFamiliarity, taskMotivation: motivation, attentionSpan,
      relevantExperience: backstory,
      currentMood: sampleFrom(['focused', 'slightly tired', 'engaged', 'distracted', 'neutral', 'anxious'], rng),
      timeOfDay: sampleFrom(['morning', 'early afternoon', 'late afternoon', 'evening'], rng),
      // Psychological trait dimensions
      personality: {
        openness: sampleTrait(traitWeights.openness) as 'low' | 'medium' | 'high',
        conscientiousness: sampleTrait(traitWeights.conscientiousness) as 'low' | 'medium' | 'high',
        extraversion: sampleTrait(traitWeights.extraversion) as 'low' | 'medium' | 'high',
        agreeableness: sampleTrait(traitWeights.agreeableness) as 'low' | 'medium' | 'high',
        neuroticism: sampleTrait(traitWeights.neuroticism) as 'low' | 'medium' | 'high',
      },
      cognitiveTempo: sampleTempo(traitWeights.cognitiveTempo) as 'impulsive' | 'moderate' | 'reflective',
      attentionalControl: sampleTrait(traitWeights.attentionalControl) as 'low' | 'medium' | 'high',
      responseStyle: {
        acquiescence: sampleTrait(traitWeights.acquiescence) as 'low' | 'medium' | 'high',
        extremeResponding: sampleTrait(traitWeights.extremeResponding) as 'low' | 'medium' | 'high',
        socialDesirability: sampleTrait(traitWeights.socialDesirability) as 'low' | 'medium' | 'high',
      },
    };

    pool.push({
      id: `p-${populationType}-${i}`,
      demographics: { age, gender, education, occupation, location },
      backstory,
      techFamiliarity,
      motivation,
      attentionSpan,
      behavioral: {
        id: `${populationType}-${i}`,
        name: `${gender === 'female' ? 'F' : gender === 'male' ? 'M' : 'NB'}, ${age}, ${occupation.slice(0, 20)}`,
        emoji: age < 13 ? '🧒' : age > 65 ? '👴' : '🧑',
        description: `${backstory.slice(0, 50)}...`,
        rtMultiplier: rtMult,
        accuracyOffset: accOffset,
        variabilityMultiplier: variability,
        fatigueRate: fatigue,
        attentionLapseRate: lapse,
        acquiescenceBias: populationType === 'older-adult' ? 0.25 + rng() * 0.15 : 0.05 + rng() * 0.15,
        extremeResponseStyle: populationType === 'child' ? 0.2 + rng() * 0.2 : 0.03 + rng() * 0.1,
      },
      latentProfile: latentProfiles[i],
      llmPrompt: buildPersonaPrompt(spec),
    });
  }

  return pool;
}

/**
 * Generate a pool from a free-text description using Claude.
 * "50 bilingual children ages 6-8 in low-income urban schools"
 * → Claude identifies the closest template + adjustments
 * → generatePool creates the cohort
 */
export async function generatePoolFromDescription(
  description: string,
  n: number,
): Promise<{ pool: SimulatedPerson[]; populationType: string; explanation: string }> {
  try {
    const res = await callClaudeApi({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 200,
        system: `Given a population description, identify the closest type and any adjustments needed.
Available types: college-student, mturk-worker, older-adult, child, clinical-adhd
Return JSON: { "type": "closest-type", "explanation": "why and what adjustments" }`,
        messages: [{ role: 'user', content: description }],
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    const parsed = first >= 0 ? JSON.parse(raw.slice(first, last + 1)) : { type: 'college-student', explanation: 'default' };

    return {
      pool: generatePool(parsed.type, n),
      populationType: parsed.type,
      explanation: parsed.explanation,
    };
  } catch {
    return {
      pool: generatePool('college-student', n),
      populationType: 'college-student',
      explanation: 'fallback to college students',
    };
  }
}

/** Quick stats about a pool */
export function poolStats(pool: SimulatedPerson[]): {
  n: number;
  ageRange: [number, number];
  genderDist: Record<string, number>;
  meanRtMult: number;
  meanAccOffset: number;
} {
  const ages = pool.map(p => p.demographics.age);
  const genders: Record<string, number> = {};
  pool.forEach(p => { genders[p.demographics.gender] = (genders[p.demographics.gender] || 0) + 1; });

  return {
    n: pool.length,
    ageRange: [Math.min(...ages), Math.max(...ages)],
    genderDist: Object.fromEntries(Object.entries(genders).map(([g, c]) => [g, Math.round(c / pool.length * 100) / 100])),
    meanRtMult: Math.round(pool.reduce((s, p) => s + p.behavioral.rtMultiplier, 0) / pool.length * 100) / 100,
    meanAccOffset: Math.round(pool.reduce((s, p) => s + p.behavioral.accuracyOffset, 0) / pool.length * 1000) / 1000,
  };
}
