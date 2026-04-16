/**
 * SHARED TASK INSTRUCTIONS
 *
 * Single source of truth for task instructions used by BOTH:
 * - Browser preview components (what researchers see/read)
 * - LLM system prompts (what simulated participants receive)
 *
 * This ensures parity between the experiment a researcher can try
 * and the experiment LLM participants actually do. Any difference
 * between modalities (text vs visual) should be TRANSPARENT, not
 * hidden in different instruction strings.
 *
 * For each task, we provide:
 * - instructions: what the participant is told (modality-neutral)
 * - responseFormat: how to respond (differs for browser vs LLM)
 * - feedbackFormat: what feedback looks like
 */

export interface TaskInstruction {
  /** Modality-neutral instructions shown to all participants. */
  instructions: string;
  /** What the LLM should return (JSON format). Browser ignores this. */
  llmResponseFormat: string;
  /** Feedback wording (used by both browser and LLM). */
  feedbackCorrect: string;
  feedbackIncorrect: string;
}

export const TASK_INSTRUCTIONS: Record<string, TaskInstruction> = {
  'wcst': {
    instructions: `You are doing the Wisconsin Card Sorting Test.

Four key cards are always visible:
  Card 1: 1 red triangle
  Card 2: 2 green stars
  Card 3: 3 yellow crosses
  Card 4: 4 blue circles

Each trial, you see a stimulus card. Sort it by matching it to one of the 4 key cards.
The matching rule (by color, shape, or number) is HIDDEN — figure it out from feedback.
The rule may CHANGE without warning after you've been getting it right.`,
    llmResponseFormat: '{ "choice": 1-4, "reasoning": "brief thought" }',
    feedbackCorrect: 'Correct',
    feedbackIncorrect: 'Incorrect',
  },

  'two-step': {
    instructions: `You are playing a space exploration game.

1. Choose between two spaceships (A or B).
2. Your spaceship takes you to one of two planets (Red Planet or Purple Planet).
3. On the planet, choose between two aliens.
4. Each alien might give you treasure or nothing.

Your goal: earn as much treasure as possible. Pay attention to which spaceships go where, and which aliens give treasure. Try to figure out the pattern.`,
    llmResponseFormat: '{ "choice": "A" or "B", "reasoning": "brief thought" }',
    feedbackCorrect: 'You found treasure!',
    feedbackIncorrect: 'No treasure this time.',
  },

  'maze-construal': {
    instructions: `You see a maze on screen.
- Blue dot (S) is you
- Yellow square (G) is the goal
- Black walls (#) block your path
- Numbered shapes (0-9) are obstacles you cannot pass through
- Open spaces (.) are free to move through

Navigate from S to G. Plan your route carefully.`,
    llmResponseFormat: 'Think aloud about your route. Then rate awareness of each obstacle 0.0-1.0.',
    feedbackCorrect: 'You reached the goal!',
    feedbackIncorrect: 'Path blocked.',
  },

  'tower-of-london': {
    instructions: `You see colored balls on pegs. Rearrange them to match the goal configuration.
You can only move the top ball from any peg. Use as few moves as possible.`,
    llmResponseFormat: '{ "moves": ["move description", ...], "total_moves": number }',
    feedbackCorrect: 'Solved optimally!',
    feedbackIncorrect: 'Not optimal — try fewer moves.',
  },

  'corsi-block': {
    instructions: `Blocks light up one at a time in a sequence. After the sequence finishes, reproduce the sequence in the same order. The sequences get longer as you get them right.`,
    llmResponseFormat: '{ "recalled_sequence": [numbers], "confidence": 0-1 }',
    feedbackCorrect: 'Correct sequence!',
    feedbackIncorrect: 'Wrong sequence.',
  },

  'n-back': {
    instructions: `Letters appear one at a time. For each letter, decide if it matches the letter shown N positions back. Respond "match" or "no match" for each letter (starting from position N+1).`,
    llmResponseFormat: '{ "responses": ["match" or "no-match" for each], "confidence": 0-1 }',
    feedbackCorrect: 'Correct!',
    feedbackIncorrect: 'Incorrect.',
  },

  'four-in-a-row': {
    instructions: `You are playing Four-in-a-Row on a 4×9 board.
You are X, the opponent is O. You can place your piece on ANY empty cell (free placement).
Get 4 in a row (horizontal, vertical, or diagonal) to win. You're playing against a computer opponent.`,
    llmResponseFormat: '{ "row": 1-4, "col": 1-9 }',
    feedbackCorrect: 'You win!',
    feedbackIncorrect: 'Opponent wins.',
  },

  'stroop': {
    instructions: `Words appear on screen one at a time. Each word is printed in a color. Your job is to name the INK COLOR, not the word itself. Go as fast as you can while trying to be accurate.`,
    llmResponseFormat: '{ "response": "color name", "confidence": 0-1 }',
    feedbackCorrect: 'Correct!',
    feedbackIncorrect: 'Incorrect.',
  },
};

/**
 * Get instruction text for a task. Falls back to generic if not defined.
 */
export function getTaskInstruction(paradigmId: string): TaskInstruction {
  return TASK_INSTRUCTIONS[paradigmId] ?? {
    instructions: 'You are doing a cognitive task in a research study. Follow the instructions for each trial.',
    llmResponseFormat: '{ "response": "your answer" }',
    feedbackCorrect: 'Correct',
    feedbackIncorrect: 'Incorrect',
  };
}
