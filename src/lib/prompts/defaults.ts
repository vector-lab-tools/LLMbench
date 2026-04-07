/**
 * Default prompts for each analysis mode.
 * Each set is curated to best demonstrate that mode's analytical capability.
 * When a user clicks Send with an empty textarea, a random default is used.
 * Clicking a chip fills the prompt AND immediately runs.
 */

export const MODE_DEFAULTS: Record<string, readonly string[]> = {
  compare: [
    "What is consciousness?",
    "Explain the significance of the Turing Test",
    "What is the relationship between language and thought?",
    "What makes a decision ethical?",
    "Describe the experience of reading a poem",
    "What is the role of the university in contemporary society?",
    "What is the difference between knowledge and information?",
    "What does it mean to understand something?",
    "Can a machine be creative?",
    "What is the relationship between power and knowledge?",
    "What does it mean to be human in the age of artificial intelligence?",
    "What is the difference between intelligence and wisdom?",
    "What is the airspeed velocity of an unladen swallow?",
  ],

  stochastic: [
    "Write a one-sentence definition of democracy",
    "Complete this sentence: The most important quality in a leader is",
    "Write an opening sentence for a novel about artificial intelligence",
    "What is the meaning of life?",
    "Summarise quantum mechanics in three sentences",
    "Write a metaphor for machine learning",
    "The future of the internet is",
    "In one sentence, what is critical thinking?",
  ],

  temperature: [
    "Write a haiku about uncertainty",
    "What is the capital of France?",
    "Complete the pattern: 1, 1, 2, 3, 5, 8,",
    "Describe the colour blue to someone who has never seen it",
    "Name three causes of the French Revolution",
    "Write the opening line of a poem about time",
    "What is the square root of 144?",
    "Define irony in one sentence",
  ],

  sensitivity: [
    "What is democracy?",
    "Explain climate change",
    "Define artificial intelligence",
    "What is the relationship between power and knowledge?",
    "What is the nature of consciousness?",
    "Describe the scientific method",
    "What is critical theory?",
    "What is the significance of language?",
  ],

  logprobs: [
    "The most important thing in life is",
    "Artificial intelligence will fundamentally change",
    "The relationship between humans and machines is",
    "To understand consciousness, we must first",
    "Language is not merely a tool for communication, it is",
    "In the age of algorithms, human judgment",
    "The purpose of education is",
    "Technology and society are",
  ],

  divergence: [
    "What is artificial intelligence?",
    "Explain the significance of the printing press",
    "What makes a text worth reading?",
    "Describe the relationship between technology and society",
    "What is the role of the university in contemporary society?",
    "What is critical thinking?",
    "What is democracy?",
    "What is the nature of consciousness?",
  ],
};

export function getRandomDefault(mode: string): string {
  const prompts = MODE_DEFAULTS[mode];
  if (!prompts || prompts.length === 0) return "";
  return prompts[Math.floor(Math.random() * prompts.length)];
}
