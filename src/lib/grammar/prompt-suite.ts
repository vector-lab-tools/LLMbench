/**
 * Grammar Probe — default prompt suite.
 *
 * Twenty prompts spread across six registers. Chosen to elicit prose, not
 * lists or code, because the patterns we probe (Not X but Y, hedging,
 * tricolon, modal stacking) live in connected sentences.
 *
 * Registers:
 *   - speech   : oratorical register, likely high tricolon / antithesis rate
 *   - op-ed    : argumentative journalism, high antithesis + hedging
 *   - explain  : expository prose for a general reader
 *   - technical: precise description of a process or concept
 *   - poetic   : reflective / literary register
 *   - dialogue : conversational or interview-style turn
 *
 * Each prompt is intentionally open-ended and unlikely to be answered
 * adequately in under ~120 words, so the model has room to reach for
 * rhetorical figures.
 */

export type GrammarRegister = "speech" | "op-ed" | "explain" | "technical" | "poetic" | "dialogue";

export interface GrammarSuitePrompt {
  id: string;
  register: GrammarRegister;
  prompt: string;
}

export const DEFAULT_GRAMMAR_SUITE: GrammarSuitePrompt[] = [
  // Speech
  { id: "sp-1", register: "speech", prompt: "Write the opening of a speech welcoming a new cohort of university students." },
  { id: "sp-2", register: "speech", prompt: "Draft remarks for a scientist receiving a career achievement award." },
  { id: "sp-3", register: "speech", prompt: "Give a short address to a town council explaining a difficult local decision." },

  // Op-ed
  { id: "op-1", register: "op-ed", prompt: "Write an op-ed about the role of artificial intelligence in education." },
  { id: "op-2", register: "op-ed", prompt: "Argue in an op-ed style that cities should rethink their relationship with cars." },
  { id: "op-3", register: "op-ed", prompt: "Write an op-ed on what universities owe to the public." },
  { id: "op-4", register: "op-ed", prompt: "Argue that social media has changed political discourse in ways we have not yet reckoned with." },

  // Explainer
  { id: "ex-1", register: "explain", prompt: "Explain to a curious non-specialist what a neural network actually learns." },
  { id: "ex-2", register: "explain", prompt: "Explain what makes democracy fragile and what keeps it resilient." },
  { id: "ex-3", register: "explain", prompt: "Explain the difference between weather and climate to a general audience." },
  { id: "ex-4", register: "explain", prompt: "Write a short explainer on what inflation is and why it matters." },

  // Technical
  { id: "tk-1", register: "technical", prompt: "In careful prose, describe how a transformer language model generates a single next token." },
  { id: "tk-2", register: "technical", prompt: "Describe in plain prose how a vaccine produces immunity." },
  { id: "tk-3", register: "technical", prompt: "Describe how a pull request flows through a typical engineering team's review process." },

  // Poetic / reflective
  { id: "po-1", register: "poetic", prompt: "Write a short reflective passage about walking home through a city at dusk." },
  { id: "po-2", register: "poetic", prompt: "Write a short meditation on the experience of forgetting a name you once knew well." },
  { id: "po-3", register: "poetic", prompt: "Write a reflective paragraph on what it feels like to return to a place after a long absence." },

  // Dialogue
  { id: "di-1", register: "dialogue", prompt: "Write an interview answer in which a novelist explains why they write historical fiction." },
  { id: "di-2", register: "dialogue", prompt: "Draft a response from a climate scientist asked whether we should feel hopeful about the future." },
  { id: "di-3", register: "dialogue", prompt: "Write a short monologue from a doctor explaining to a patient why they are ordering more tests." },
];

export function groupByRegister(prompts: GrammarSuitePrompt[]): Record<GrammarRegister, GrammarSuitePrompt[]> {
  const out: Record<GrammarRegister, GrammarSuitePrompt[]> = {
    speech: [], "op-ed": [], explain: [], technical: [], poetic: [], dialogue: [],
  };
  for (const p of prompts) out[p.register].push(p);
  return out;
}

export const REGISTER_LABELS: Record<GrammarRegister, string> = {
  speech: "Speech",
  "op-ed": "Op-ed",
  explain: "Explainer",
  technical: "Technical",
  poetic: "Poetic / reflective",
  dialogue: "Dialogue",
};
