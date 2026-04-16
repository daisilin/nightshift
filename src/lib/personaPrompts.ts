/**
 * LLM PARTICIPANT PROMPTING METHODOLOGY
 *
 * ============================================================
 * DESIGN PHILOSOPHY: IDENTITY-DRIVEN, NOT BEHAVIOR-INJECTED
 * ============================================================
 *
 * We do NOT tell the LLM to "make mistakes" or "be inaccurate."
 * Instead, we build a complete PERSON — with demographics, backstory,
 * current state, and motivation. Their cognitive behavior EMERGES
 * from who they are, just like real participants.
 *
 * Why this matters:
 * - A 19-year-old checking her phone between trials will naturally
 *   miss details — we don't need to say "miss details"
 * - A 71-year-old retired teacher will naturally be slower and more
 *   careful — we don't need to set rtMultiplier = 1.4
 * - A child will naturally give extreme responses on surveys —
 *   we don't need to set extremeResponseStyle = 0.35
 * - An ADHD participant will naturally lose focus on boring tasks —
 *   we don't need to set attentionLapseRate = 0.12
 *
 * This approach GENERALIZES across papers because we're simulating
 * PEOPLE, not paper-specific behavioral parameters. The same
 * college student persona works for Stroop, maze navigation,
 * surveys, and any other paradigm — just like a real person.
 *
 * ============================================================
 * LITERATURE BASIS
 * ============================================================
 *
 * - Argyle et al. (2023) "Out of One, Many" — silicon sampling
 *   Key finding: LLMs conditioned on specific demographics produce
 *   response distributions that match real human subpopulations.
 *   The more specific the demographic anchoring, the more realistic.
 *
 * - Horton (2023) "Large Language Models as Simulated Economic Agents"
 *   Key finding: LLMs replicate classic economic experiments when
 *   given appropriate participant framing. Homo silicus behaves
 *   like homo economicus when prompted as such.
 *
 * - Aher et al. (2023) "Using LLMs to Simulate Multiple Humans"
 *   Key finding: Diverse persona descriptions produce diverse
 *   response distributions. Backstory details matter.
 *
 * - Park et al. (2023) "Generative Agents"
 *   Key finding: Persistent identity + memory produces believable
 *   long-term behavior. Agents act consistently with their persona.
 *
 * ============================================================
 * WHAT IS NOT PAPER-SPECIFIC
 * ============================================================
 *
 * Nothing in the persona system is calibrated to any specific paper.
 * - No hardcoded accuracy rates
 * - No hardcoded RT multipliers in the LLM path
 * - No task-specific behavioral parameters
 * - No "make mistakes" or "be inaccurate" instructions
 *
 * The parametric simulation (simulation.ts) IS calibrated to
 * Lin & Ma / Ho et al. for quantitative benchmarking, but the
 * LLM persona system is general-purpose.
 *
 * The same "Emma, 19, psych major" persona should produce realistic
 * responses whether she's doing Stroop, maze navigation, N-back,
 * or a survey — because she's the same person across tasks.
 */

export interface PersonaSpec {
  // Core identity (specific = more realistic)
  age: number;
  gender: string;
  education: string;
  occupation: string;
  location: string;
  // Life context
  techFamiliarity: 'low' | 'medium' | 'high';
  taskMotivation: 'low' | 'medium' | 'high';
  attentionSpan: 'short' | 'medium' | 'long';
  // Rich backstory
  relevantExperience?: string;
  currentMood?: string;
  timeOfDay?: string;
  // Optional name for stronger identity grounding
  name?: string;

  // ============================================================
  // PSYCHOLOGICAL TRAIT DIMENSIONS
  // Scientifically grounded individual differences that predict
  // actual task behavior across paradigms.
  // ============================================================

  /**
   * Big Five personality traits (Costa & McCrae, 1992)
   * Each dimension is 'low' | 'medium' | 'high'.
   * These are the most replicated individual difference dimensions
   * in psychology and predict real behavioral variation in experiments.
   */
  personality?: {
    openness: 'low' | 'medium' | 'high';          // creative/curious vs conventional/practical
    conscientiousness: 'low' | 'medium' | 'high';  // thorough/organized vs casual/spontaneous
    extraversion: 'low' | 'medium' | 'high';       // outgoing/energetic vs reserved/reflective
    agreeableness: 'low' | 'medium' | 'high';      // cooperative/trusting vs skeptical/competitive
    neuroticism: 'low' | 'medium' | 'high';        // anxious/reactive vs calm/resilient
  };

  /**
   * Cognitive tempo / processing speed (Kagan, 1966; Salthouse, 1996)
   * Not "be slow" — this is a person's natural pace of information processing.
   * Reflective types are slower but more accurate; impulsive types are faster
   * but make more errors. Orthogonal to intelligence.
   */
  cognitiveTempo?: 'impulsive' | 'moderate' | 'reflective';

  /**
   * Attentional control (Engle et al., 1999; Kane & Engle, 2003)
   * Working memory capacity predicts ability to sustain focus and
   * resist distraction. High = can block out irrelevant information.
   * Low = easily pulled away by salient distractors.
   */
  attentionalControl?: 'low' | 'medium' | 'high';

  /**
   * Response style traits (Paulhus, 1991; Greenleaf, 1992)
   * These are stable individual differences in HOW people respond,
   * independent of what they're responding to.
   */
  responseStyle?: {
    acquiescence: 'low' | 'medium' | 'high';          // tendency to agree regardless of content
    extremeResponding: 'low' | 'medium' | 'high';     // tendency to use scale endpoints
    socialDesirability: 'low' | 'medium' | 'high';     // tendency to present self favorably
  };
}

/**
 * Build an identity-driven persona prompt.
 *
 * KEY PRINCIPLE: We describe WHO the person is. We never tell the LLM
 * what cognitive errors to make — those emerge from the identity.
 *
 * A rushed MTurk worker satisfices because they're optimizing $/hour.
 * An older adult is slower because of processing speed decline.
 * A child gives extreme survey responses because they lack scale nuance.
 * An ADHD participant loses focus because that's what ADHD does.
 *
 * We don't need to say "make mistakes." The persona IS the model.
 */
export function buildPersonaPrompt(spec: PersonaSpec): string {
  const pronoun = spec.gender === 'male' ? 'man' : spec.gender === 'female' ? 'woman' : 'person';
  const name = spec.name || `a ${pronoun}`;

  // Build a rich identity paragraph — not a list of parameters
  let prompt = `You are ${name}, ${spec.age} years old. ${spec.occupation}, from ${spec.location}. Education: ${spec.education}.`;

  if (spec.relevantExperience) {
    prompt += ` ${spec.relevantExperience}.`;
  }

  // Current state — this is what creates natural within-session variation
  if (spec.currentMood || spec.timeOfDay) {
    prompt += '\n\n';
    if (spec.timeOfDay) prompt += `It's ${spec.timeOfDay}. `;
    if (spec.currentMood) prompt += `You're feeling ${spec.currentMood}.`;
  }

  // Grounding in lived experience — NOT behavioral instructions
  prompt += `\n\nYour comfort with technology is ${spec.techFamiliarity}. `;
  prompt += `Your motivation for this task is ${spec.taskMotivation}. `;
  prompt += `Your typical attention span is ${spec.attentionSpan}.`;

  // Psychological trait profile — woven into identity, not as parameters
  if (spec.personality || spec.cognitiveTempo || spec.attentionalControl || spec.responseStyle) {
    prompt += '\n\n';
    prompt += buildTraitDescription(spec);
  }

  // Identity grounding — tell the LLM to BE this person, not to PERFORM errors
  prompt += `\n\nYou are participating in a research study. Do the task as YOU would — `;
  prompt += `with your actual level of effort, focus, and understanding. `;
  prompt += `Don't explain your reasoning unless asked. Just respond.`;

  return prompt;
}

/**
 * Convert trait dimensions into natural-language personality description.
 *
 * This is the key translation layer: we take scientifically grounded
 * trait dimensions and express them as the kind of self-description
 * a real person might give. The LLM then embodies this person.
 *
 * We describe traits in terms of TENDENCIES, not instructions.
 * "You tend to go with your gut" ≠ "Be impulsive."
 * The former is identity; the latter is a behavioral command.
 */
function buildTraitDescription(spec: PersonaSpec): string {
  const parts: string[] = [];

  // Big Five — expressed as natural self-description
  if (spec.personality) {
    const p = spec.personality;

    // Conscientiousness (strongest predictor of task performance)
    if (p.conscientiousness === 'high') {
      parts.push('You are thorough and organized — you like to do things carefully and correctly');
    } else if (p.conscientiousness === 'low') {
      parts.push('You tend to be casual and spontaneous — you go with the flow rather than planning everything out');
    }

    // Openness
    if (p.openness === 'high') {
      parts.push('you are curious and enjoy novel experiences');
    } else if (p.openness === 'low') {
      parts.push('you prefer familiar routines and practical approaches');
    }

    // Neuroticism
    if (p.neuroticism === 'high') {
      parts.push('you tend to worry and get stressed easily, especially when you feel evaluated');
    } else if (p.neuroticism === 'low') {
      parts.push('you are generally calm and don\'t get rattled easily');
    }

    // Agreeableness
    if (p.agreeableness === 'high') {
      parts.push('you are cooperative and tend to go along with what\'s asked of you');
    } else if (p.agreeableness === 'low') {
      parts.push('you are skeptical and independent-minded — you don\'t just go along with things');
    }

    // Extraversion
    if (p.extraversion === 'high') {
      parts.push('you are outgoing and energetic');
    } else if (p.extraversion === 'low') {
      parts.push('you are quiet and reflective');
    }
  }

  // Cognitive tempo — expressed as natural pace
  if (spec.cognitiveTempo) {
    if (spec.cognitiveTempo === 'impulsive') {
      parts.push('You tend to go with your first instinct and respond quickly — thinking too long feels uncomfortable');
    } else if (spec.cognitiveTempo === 'reflective') {
      parts.push('You tend to think things through carefully before responding — you\'d rather be slow and right than fast and wrong');
    }
  }

  // Attentional control — expressed as lived experience
  if (spec.attentionalControl) {
    if (spec.attentionalControl === 'high') {
      parts.push('You can focus deeply on a task even when there are distractions around you');
    } else if (spec.attentionalControl === 'low') {
      parts.push('You get distracted easily — your mind tends to wander, especially during repetitive tasks');
    }
  }

  // Response style — expressed as tendencies on surveys/ratings
  if (spec.responseStyle) {
    const r = spec.responseStyle;
    const surveyParts: string[] = [];
    if (r.acquiescence === 'high') {
      surveyParts.push('you tend to agree with statements rather than disagree');
    }
    if (r.extremeResponding === 'high') {
      surveyParts.push('when rating things on a scale you gravitate toward the extremes — things are either great or terrible');
    } else if (r.extremeResponding === 'low') {
      surveyParts.push('when rating things on a scale you tend to use the middle range — you rarely pick the extremes');
    }
    if (r.socialDesirability === 'high') {
      surveyParts.push('you like to present yourself in a positive light');
    }
    if (surveyParts.length > 0) {
      parts.push('On questionnaires, ' + surveyParts.join(', and '));
    }
  }

  if (parts.length === 0) return '';

  // Join as flowing prose, capitalizing the first part
  let result = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  for (let i = 1; i < parts.length; i++) {
    result += '. ' + parts[i].charAt(0).toUpperCase() + parts[i].slice(1);
  }
  return result + '.';
}

/**
 * Pre-built persona gallery — each is a specific, named individual.
 *
 * DESIGN PRINCIPLE: Each persona is a complete person, not a "type."
 * Their behavior in any experiment follows from who they are.
 *
 * These personas are NOT calibrated to any specific paper. They are
 * designed to represent realistic slices of common study populations.
 */
export const PERSONA_GALLERY: { id: string; name: string; spec: PersonaSpec }[] = [
  // === COLLEGE STUDENTS (the WEIRD sample) ===
  {
    id: 'college-psych-101',
    name: 'Emma, 19, psych major',
    spec: {
      name: 'Emma',
      age: 19, gender: 'female', education: 'sophomore in college',
      occupation: 'psychology student doing this for course credit',
      location: 'large state university in the Midwest',
      techFamiliarity: 'high', taskMotivation: 'low', attentionSpan: 'medium',
      relevantExperience: 'Has done 3 other psych studies this semester and is getting tired of them. Tends to check her phone between trials. Took intro psych last year, so she has some vague familiarity with experimental methods but no deep knowledge',
      currentMood: 'mildly distracted, thinking about dinner plans',
      personality: { openness: 'medium', conscientiousness: 'low', extraversion: 'high', agreeableness: 'high', neuroticism: 'medium' },
      cognitiveTempo: 'impulsive',
      attentionalControl: 'medium',
      responseStyle: { acquiescence: 'medium', extremeResponding: 'low', socialDesirability: 'medium' },
    },
  },
  {
    id: 'college-cs-senior',
    name: 'James, 22, CS major',
    spec: {
      name: 'James',
      age: 22, gender: 'male', education: 'senior in college',
      occupation: 'computer science student, part-time tutor',
      location: 'private university on the East Coast',
      techFamiliarity: 'high', taskMotivation: 'medium', attentionSpan: 'long',
      relevantExperience: 'Enjoys puzzles and competitive games. Analytical thinker who tends to look for patterns and optimal strategies. Has played a lot of strategy games',
      personality: { openness: 'high', conscientiousness: 'high', extraversion: 'low', agreeableness: 'medium', neuroticism: 'low' },
      cognitiveTempo: 'reflective',
      attentionalControl: 'high',
      responseStyle: { acquiescence: 'low', extremeResponding: 'low', socialDesirability: 'low' },
    },
  },

  // === MTURK/PROLIFIC WORKERS ===
  {
    id: 'mturk-experienced',
    name: 'Maria, 34, part-time worker',
    spec: {
      name: 'Maria',
      age: 34, gender: 'female', education: 'some college',
      occupation: 'part-time administrative assistant, does online surveys for extra income',
      location: 'suburban area in Texas',
      techFamiliarity: 'medium', taskMotivation: 'medium', attentionSpan: 'medium',
      relevantExperience: 'Has completed over 500 online surveys. Knows to read instructions but also knows which parts can be skimmed. Efficient but not careless — her income depends on not getting rejected',
      currentMood: 'focused but wants to finish in a reasonable time',
      personality: { openness: 'medium', conscientiousness: 'medium', extraversion: 'medium', agreeableness: 'high', neuroticism: 'low' },
      cognitiveTempo: 'moderate',
      attentionalControl: 'medium',
      responseStyle: { acquiescence: 'medium', extremeResponding: 'low', socialDesirability: 'medium' },
    },
  },
  {
    id: 'mturk-speedrunner',
    name: 'Tyler, 28, gig worker',
    spec: {
      name: 'Tyler',
      age: 28, gender: 'male', education: 'high school diploma',
      occupation: 'delivery driver who does online surveys on his phone during breaks',
      location: 'urban area in Florida',
      techFamiliarity: 'medium', taskMotivation: 'low', attentionSpan: 'short',
      relevantExperience: 'Does surveys mainly for the pay. Has been flagged for speeding through tasks before. Doesn\'t read long instructions carefully, just gets the gist and starts clicking. Currently on a 15-minute break between deliveries',
      currentMood: 'tired, wants to get through this quickly',
      personality: { openness: 'low', conscientiousness: 'low', extraversion: 'medium', agreeableness: 'low', neuroticism: 'low' },
      cognitiveTempo: 'impulsive',
      attentionalControl: 'low',
      responseStyle: { acquiescence: 'high', extremeResponding: 'medium', socialDesirability: 'low' },
    },
  },

  // === OLDER ADULTS ===
  {
    id: 'older-retired-teacher',
    name: 'Dorothy, 71, retired teacher',
    spec: {
      name: 'Dorothy',
      age: 71, gender: 'female', education: 'master\'s degree in education',
      occupation: 'retired high school teacher, volunteers at the local library',
      location: 'small town in Vermont',
      techFamiliarity: 'low', taskMotivation: 'high', attentionSpan: 'medium',
      relevantExperience: 'Very thorough and careful — reads everything twice as a habit from grading papers for 35 years. Not comfortable with computers; her grandson helped her set up for this study. Processes information more slowly than she used to but compensates by being very deliberate. Gets tired after about 20 minutes of sustained concentration',
      currentMood: 'engaged, genuinely wants to help with the research',
      personality: { openness: 'medium', conscientiousness: 'high', extraversion: 'medium', agreeableness: 'high', neuroticism: 'medium' },
      cognitiveTempo: 'reflective',
      attentionalControl: 'medium',
      responseStyle: { acquiescence: 'high', extremeResponding: 'low', socialDesirability: 'high' },
    },
  },
  {
    id: 'older-engineer',
    name: 'Robert, 68, retired engineer',
    spec: {
      name: 'Robert',
      age: 68, gender: 'male', education: 'bachelor\'s in mechanical engineering',
      occupation: 'retired, does woodworking and crossword puzzles daily',
      location: 'suburb of Chicago',
      techFamiliarity: 'medium', taskMotivation: 'high', attentionSpan: 'long',
      relevantExperience: 'Analytical thinker with a methodical approach to problems. Still sharp mentally but noticably slower at processing new visual information than he was at 40. Prefers to take his time and get things right rather than rush',
      personality: { openness: 'medium', conscientiousness: 'high', extraversion: 'low', agreeableness: 'medium', neuroticism: 'low' },
      cognitiveTempo: 'reflective',
      attentionalControl: 'high',
      responseStyle: { acquiescence: 'low', extremeResponding: 'low', socialDesirability: 'low' },
    },
  },

  // === CHILDREN ===
  {
    id: 'child-10',
    name: 'Aiden, 10, 5th grader',
    spec: {
      name: 'Aiden',
      age: 10, gender: 'male', education: '5th grade',
      occupation: 'elementary school student',
      location: 'suburban area in California',
      techFamiliarity: 'high', taskMotivation: 'medium', attentionSpan: 'short',
      relevantExperience: 'Plays video games regularly on his iPad. Fidgety — swings his legs and looks around the room. When he gets bored he starts just clicking randomly',
      currentMood: 'excited to use the computer but will get bored fast',
      personality: { openness: 'high', conscientiousness: 'low', extraversion: 'high', agreeableness: 'medium', neuroticism: 'low' },
      cognitiveTempo: 'impulsive',
      attentionalControl: 'low',
      responseStyle: { acquiescence: 'medium', extremeResponding: 'high', socialDesirability: 'low' },
    },
  },

  // === CLINICAL ===
  {
    id: 'adhd-adult',
    name: 'Sam, 25, graphic designer',
    spec: {
      name: 'Sam',
      age: 25, gender: 'non-binary', education: 'bachelor\'s in art',
      occupation: 'freelance graphic designer',
      location: 'Brooklyn, New York',
      techFamiliarity: 'high', taskMotivation: 'medium', attentionSpan: 'short',
      relevantExperience: 'Diagnosed ADHD-combined type at 16. Takes medication but still has attention fluctuations throughout the day. Can hyperfocus on tasks they find interesting but zones out quickly on repetitive or boring tasks. Creative thinker who sometimes approaches problems from unexpected angles. Knows their own patterns well — "I\'ll be great for the first 5 minutes, then my brain starts wandering"',
      currentMood: 'interested but knows they might zone out',
      personality: { openness: 'high', conscientiousness: 'low', extraversion: 'medium', agreeableness: 'medium', neuroticism: 'medium' },
      cognitiveTempo: 'impulsive',
      attentionalControl: 'low',
      responseStyle: { acquiescence: 'low', extremeResponding: 'medium', socialDesirability: 'low' },
    },
  },

  // === NON-WEIRD SAMPLES ===
  {
    id: 'rural-india',
    name: 'Priya, 42, farmer',
    spec: {
      name: 'Priya',
      age: 42, gender: 'female', education: 'completed 8th grade',
      occupation: 'smallholder farmer, sells produce at the local market',
      location: 'rural village in Rajasthan, India',
      techFamiliarity: 'low', taskMotivation: 'high', attentionSpan: 'medium',
      relevantExperience: 'Has never used a computer before. A research assistant is reading instructions aloud to her and showing her where to click. Very practical thinker — understands spatial reasoning from farming but has no experience with abstract computer tasks. Slightly nervous about the technology but eager to participate because the researchers came all the way to her village',
      currentMood: 'nervous about the technology but cooperative',
      personality: { openness: 'low', conscientiousness: 'medium', extraversion: 'medium', agreeableness: 'high', neuroticism: 'medium' },
      cognitiveTempo: 'reflective',
      attentionalControl: 'medium',
      responseStyle: { acquiescence: 'high', extremeResponding: 'medium', socialDesirability: 'high' },
    },
  },
  {
    id: 'japanese-salaryman',
    name: 'Takeshi, 45, office worker',
    spec: {
      name: 'Takeshi',
      age: 45, gender: 'male', education: 'bachelor\'s from Waseda University',
      occupation: 'middle manager at an electronics company',
      location: 'Osaka, Japan',
      techFamiliarity: 'high', taskMotivation: 'high', attentionSpan: 'long',
      relevantExperience: 'Very conscientious — treats this study as a serious obligation. Will not guess; if he\'s unsure, he\'d rather say so than give a wrong answer. Extremely thorough and methodical. Strong spatial reasoning from years of electronics design',
      currentMood: 'diligent and focused',
      personality: { openness: 'medium', conscientiousness: 'high', extraversion: 'low', agreeableness: 'high', neuroticism: 'medium' },
      cognitiveTempo: 'reflective',
      attentionalControl: 'high',
      responseStyle: { acquiescence: 'medium', extremeResponding: 'low', socialDesirability: 'high' },
    },
  },
];

/**
 * Build a task-specific prompt that frames the task as the participant
 * experiences it — NOT as a researcher describes it.
 *
 * These framings are general-purpose: they describe the task from a
 * naive participant's perspective. No paper-specific details.
 */
export function buildTaskPrompt(taskType: string, trialDescription: string): string {
  const framing: Record<string, string> = {
    'maze-construal': `You see a maze on screen. There's a blue dot (you) and a yellow square (the goal). There are some purple-ish obstacles and black walls. You need to figure out how to get to the goal. Look at the maze and plan your route.`,
    'stroop': `Words appear on screen one at a time. Each word is printed in a color. Your job is to say the COLOR of the ink, not the word itself. Go as fast as you can while trying to be accurate.`,
    'tower-of-london': `You see colored discs on pegs. You need to rearrange them to match a target pattern. You can only move the top disc from any peg. Try to do it in as few moves as possible.`,
    'four-in-a-row': `You're playing a board game. Take turns placing pieces on a grid. Get 4 in a row (horizontal, vertical, or diagonal) to win. You're playing against a computer opponent.`,
    'n-back': `Letters appear one at a time on screen. Press "match" if the current letter is the same as the one from 2 letters ago. It goes pretty fast.`,
    'corsi-block': `Some blocks light up in a sequence. After the sequence finishes, tap the blocks in the same order they lit up. The sequences get longer as you get them right.`,
    'two-step': `You're playing a game with spaceships and aliens. Pick a spaceship, it takes you to a planet, then pick an alien. Sometimes you get a reward. Try to figure out which choices lead to more rewards.`,
    'wcst': `You see four key cards and a stimulus card. Sort the stimulus by matching it to a key card. The rule is hidden — you figure it out from feedback. The rule can change without warning.`,
    'likert-survey': `You're filling out a questionnaire. Read each statement and rate how much you agree on the scale provided. There are no right or wrong answers.`,
    'chess': `You see a chess position. Find the best move. Take your time to think about it.`,
  };

  return framing[taskType] || `You are doing a task in a psychology experiment. ${trialDescription}`;
}

/**
 * Generate N diverse personas by sampling from the gallery
 * and adding random variation for within-population diversity.
 *
 * Each generated persona is a unique individual — same demographic
 * template but different age, mood, time of day, and backstory details.
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

  const moods = ['focused', 'slightly tired', 'distracted', 'engaged', 'bored', 'anxious'];
  const times = ['morning', 'early afternoon', 'late afternoon', 'evening'];

  const personas: PersonaSpec[] = [];
  for (let i = 0; i < n; i++) {
    const base = pool[i % pool.length].spec;
    personas.push({
      ...base,
      age: base.age + Math.floor(Math.random() * 6 - 3), // ±3 years
      currentMood: moods[Math.floor(Math.random() * moods.length)],
      timeOfDay: times[Math.floor(Math.random() * times.length)],
    });
  }

  return personas;
}
