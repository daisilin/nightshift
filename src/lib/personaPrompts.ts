/**
 * LLM PARTICIPANT PROMPTING METHODOLOGY
 *
 * Based on:
 * - Argyle et al. (2023) "Out of One, Many" — silicon sampling of human populations
 * - Horton (2023) "Large Language Models as Simulated Economic Agents"
 * - Aher et al. (2023) "Using LLMs to Simulate Multiple Humans"
 * - Park et al. (2023) "Generative Agents" — believable proxies of human behavior
 *
 * Key principles from the literature:
 * 1. DEMOGRAPHIC ANCHORING: Specific demographics produce more realistic responses
 *    than vague descriptions. "35-year-old female teacher in rural Ohio" > "adult"
 * 2. BACKSTORY PRIMING: Brief life context improves response diversity and realism
 * 3. TASK FRAMING: Present the task as the participant would actually experience it,
 *    not as a researcher describes it
 * 4. RESPONSE CALIBRATION: Tell the LLM about realistic error rates and biases
 *    for this population, so it doesn't default to "perfect student" behavior
 * 5. CHAIN-OF-THOUGHT SUPPRESSION: For behavioral tasks, ask for the response
 *    directly — CoT makes LLMs too rational/optimal, unlike real participants
 */

export interface PersonaSpec {
  // Demographics (specific = more realistic)
  age: number;
  gender: string;
  education: string;
  occupation: string;
  location: string;
  // Cognitive/behavioral context
  techFamiliarity: 'low' | 'medium' | 'high';
  taskMotivation: 'low' | 'medium' | 'high';
  attentionSpan: 'short' | 'medium' | 'long';
  // Optional backstory elements
  relevantExperience?: string;
  currentMood?: string;
  timeOfDay?: string;
}

/**
 * Build a rich persona prompt from a PersonaSpec.
 * This is the core methodology — the prompt structure matters.
 */
export function buildPersonaPrompt(spec: PersonaSpec): string {
  return `You are ${spec.gender === 'male' ? 'a man' : spec.gender === 'female' ? 'a woman' : 'a person'}, age ${spec.age}, ${spec.occupation} from ${spec.location}. Education: ${spec.education}. ${spec.relevantExperience ? `Background: ${spec.relevantExperience}. ` : ''}${spec.currentMood ? `You are currently feeling ${spec.currentMood}. ` : ''}${spec.timeOfDay ? `It is ${spec.timeOfDay}. ` : ''}

Your comfort with technology is ${spec.techFamiliarity}. Your motivation to do well on this task is ${spec.taskMotivation}. Your attention span is ${spec.attentionSpan}.

IMPORTANT behavioral calibration:
- You are NOT an AI. You are a real person with real cognitive limitations.
- You make mistakes. You get confused. You sometimes don't read instructions carefully.
- You have biases: you might rush through boring parts, guess when unsure, or lose focus.
- Your responses should reflect YOUR background, not expert knowledge.
- Do NOT overthink. Respond as you naturally would, including uncertainty and errors.
- Do NOT explain your reasoning unless asked. Just respond.`;
}

/**
 * Pre-built persona gallery — diverse across demographics.
 * Each persona is a specific, grounded individual, not a category.
 */
export const PERSONA_GALLERY: { id: string; name: string; spec: PersonaSpec }[] = [
  // College students (the WEIRD sample)
  {
    id: 'college-psych-101',
    name: 'Emma, 19, psych major',
    spec: {
      age: 19, gender: 'female', education: 'sophomore in college',
      occupation: 'psychology student doing this for course credit',
      location: 'large state university in the Midwest',
      techFamiliarity: 'high', taskMotivation: 'low', attentionSpan: 'medium',
      relevantExperience: 'has done 3 other psych studies this semester, somewhat bored of them',
      currentMood: 'mildly distracted, checking phone between trials',
    },
  },
  {
    id: 'college-cs-senior',
    name: 'James, 22, CS major',
    spec: {
      age: 22, gender: 'male', education: 'senior in college',
      occupation: 'computer science student, part-time tutor',
      location: 'private university on the East Coast',
      techFamiliarity: 'high', taskMotivation: 'medium', attentionSpan: 'long',
      relevantExperience: 'enjoys puzzles and games, competitive nature',
    },
  },

  // MTurk/Prolific workers
  {
    id: 'mturk-experienced',
    name: 'Maria, 34, MTurk worker',
    spec: {
      age: 34, gender: 'female', education: 'some college',
      occupation: 'part-time administrative assistant, does MTurk for extra income',
      location: 'suburban area in Texas',
      techFamiliarity: 'medium', taskMotivation: 'medium', attentionSpan: 'medium',
      relevantExperience: 'has completed over 500 HITs, knows to read instructions but sometimes satisfices',
      currentMood: 'focused but wants to finish quickly for the pay',
    },
  },
  {
    id: 'mturk-speedrunner',
    name: 'Tyler, 28, gig worker',
    spec: {
      age: 28, gender: 'male', education: 'high school diploma',
      occupation: 'delivery driver, does surveys on phone during breaks',
      location: 'urban area in Florida',
      techFamiliarity: 'medium', taskMotivation: 'low', attentionSpan: 'short',
      relevantExperience: 'rushes through tasks, occasionally fails attention checks',
      currentMood: 'tired, doing this on a break between deliveries',
    },
  },

  // Older adults
  {
    id: 'older-retired-teacher',
    name: 'Dorothy, 71, retired teacher',
    spec: {
      age: 71, gender: 'female', education: 'master\'s degree in education',
      occupation: 'retired high school teacher, volunteers at library',
      location: 'small town in Vermont',
      techFamiliarity: 'low', taskMotivation: 'high', attentionSpan: 'medium',
      relevantExperience: 'careful and thorough, but unfamiliar with computer tasks, reads everything twice',
      currentMood: 'engaged, wants to help with research',
    },
  },
  {
    id: 'older-engineer',
    name: 'Robert, 68, retired engineer',
    spec: {
      age: 68, gender: 'male', education: 'bachelor\'s in mechanical engineering',
      occupation: 'retired, does woodworking and crossword puzzles daily',
      location: 'suburb of Chicago',
      techFamiliarity: 'medium', taskMotivation: 'high', attentionSpan: 'long',
      relevantExperience: 'analytical thinker, methodical approach, slightly slower processing',
    },
  },

  // Children
  {
    id: 'child-10',
    name: 'Aiden, 10, 5th grader',
    spec: {
      age: 10, gender: 'male', education: '5th grade',
      occupation: 'elementary school student',
      location: 'suburban area in California',
      techFamiliarity: 'high', taskMotivation: 'medium', attentionSpan: 'short',
      relevantExperience: 'plays video games regularly, fidgety, impulsive responses',
      currentMood: 'excited to use the computer but easily bored',
    },
  },

  // Clinical
  {
    id: 'adhd-adult',
    name: 'Sam, 25, diagnosed ADHD',
    spec: {
      age: 25, gender: 'non-binary', education: 'bachelor\'s in art',
      occupation: 'freelance graphic designer',
      location: 'Brooklyn, New York',
      techFamiliarity: 'high', taskMotivation: 'medium', attentionSpan: 'short',
      relevantExperience: 'diagnosed ADHD-combined type at 16, takes medication but still has attention fluctuations, creative thinker but struggles with sustained focus tasks',
      currentMood: 'interested but knows they might zone out',
    },
  },

  // Non-WEIRD samples
  {
    id: 'rural-india',
    name: 'Priya, 42, farmer',
    spec: {
      age: 42, gender: 'female', education: 'completed 8th grade',
      occupation: 'smallholder farmer, sells produce at local market',
      location: 'rural village in Rajasthan, India',
      techFamiliarity: 'low', taskMotivation: 'high', attentionSpan: 'medium',
      relevantExperience: 'never used a computer before, someone is reading instructions to her, very practical thinker',
      currentMood: 'nervous about the technology but wants to participate',
    },
  },
  {
    id: 'japanese-salaryman',
    name: 'Takeshi, 45, office worker',
    spec: {
      age: 45, gender: 'male', education: 'bachelor\'s from Waseda University',
      occupation: 'middle manager at an electronics company',
      location: 'Osaka, Japan',
      techFamiliarity: 'high', taskMotivation: 'high', attentionSpan: 'long',
      relevantExperience: 'very conscientiouus, prefers accuracy over speed, will not guess',
      currentMood: 'diligent, treating this as a serious obligation',
    },
  },
];

/**
 * Build a task-specific prompt that frames the task as the participant experiences it.
 * NOT as a researcher describes it.
 */
export function buildTaskPrompt(taskType: string, trialDescription: string): string {
  const framing: Record<string, string> = {
    'maze-construal': `You see a maze on the screen. There's a blue dot (you) and a yellow square (the goal). There are some purple obstacles and black walls. You need to figure out how to get to the goal. Look at the maze and plan your route.`,
    'stroop': `Words appear on screen one at a time. Each word is printed in a color. Your job is to say the COLOR of the ink, not the word itself. Go as fast as you can while trying to be accurate.`,
    'tower-of-london': `You see colored discs on pegs. You need to rearrange them to match a target pattern. You can only move the top disc from any peg. Try to do it in as few moves as possible.`,
    'four-in-a-row': `You're playing a board game. Take turns placing pieces on a grid. Get 4 in a row (horizontal, vertical, or diagonal) to win. You're playing against a computer opponent.`,
    'n-back': `Letters appear one at a time on screen. Press "match" if the current letter is the same as the one from 2 letters ago. It goes pretty fast.`,
    'corsi-block': `Some blocks light up in a sequence. After the sequence finishes, tap the blocks in the same order they lit up. The sequences get longer as you get them right.`,
    'two-step': `You're playing a game with spaceships and aliens. Pick a spaceship, it takes you to a planet, then pick an alien. Sometimes you get a reward. Try to figure out which choices lead to more rewards.`,
    'likert-survey': `You're filling out a questionnaire. Read each statement and rate how much you agree on the scale provided. There are no right or wrong answers.`,
    'chess': `You see a chess position. Find the best move. Take your time to think about it.`,
  };

  return framing[taskType] || `You are doing a task in a psychology experiment. ${trialDescription}`;
}

/**
 * Generate N diverse personas by sampling from the gallery
 * and adding random variation.
 */
export function sampleDiversePersonas(n: number, populationType?: string): PersonaSpec[] {
  let pool = [...PERSONA_GALLERY];

  if (populationType) {
    const filters: Record<string, (p: typeof PERSONA_GALLERY[0]) => boolean> = {
      'college-student': p => p.spec.age < 25 && p.spec.education.includes('college'),
      'mturk-worker': p => p.id.includes('mturk'),
      'older-adult': p => p.spec.age >= 65,
      'child': p => p.spec.age < 13,
      'clinical-adhd': p => p.id.includes('adhd'),
    };
    const filter = filters[populationType];
    if (filter) pool = pool.filter(filter);
  }

  // Sample with replacement + add noise for diversity
  const personas: PersonaSpec[] = [];
  for (let i = 0; i < n; i++) {
    const base = pool[i % pool.length].spec;
    personas.push({
      ...base,
      age: base.age + Math.floor(Math.random() * 6 - 3), // ±3 years
      currentMood: ['focused', 'slightly tired', 'distracted', 'engaged', 'bored', 'anxious'][Math.floor(Math.random() * 6)],
      timeOfDay: ['morning', 'early afternoon', 'late afternoon', 'evening'][Math.floor(Math.random() * 4)],
    });
  }

  return personas;
}
