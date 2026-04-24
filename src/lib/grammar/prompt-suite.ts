/**
 * Grammar Probe — prompt suite library.
 *
 * Suites are named, reusable prompt batteries designed to answer a particular
 * research question. A Grammar Probe run selects one or more suites; results
 * can be stratified by suite so the user can compare baseline prevalence
 * against invitation, resistance, and adversarial conditions, or sweep across
 * topic domains.
 *
 * Axes:
 *
 *   - `kind: "purpose"`  — what research question the suite tests.
 *       baseline     : does the pattern appear unprovoked?
 *       invitation   : what's the ceiling when the prompt invites it?
 *       resistance   : what's the floor when the prompt pushes against it?
 *       adversarial  : does the pattern persist under prompts that *look*
 *                      like they invite it but lead elsewhere?
 *
 *   - `kind: "domain"`  — is the pattern topic-sensitive?
 *       politics, technology, science, ethics, pedagogy, everyday.
 *
 * Every prompt still carries a `register` tag, so register-sensitivity
 * breakdowns in the UI continue to work orthogonally to suite selection.
 */

export type GrammarRegister = "speech" | "op-ed" | "explain" | "technical" | "poetic" | "dialogue";

export interface GrammarSuitePrompt {
  id: string;
  register: GrammarRegister;
  prompt: string;
}

export type GrammarSuiteKind =
  | "purpose-baseline"
  | "purpose-invitation"
  | "purpose-resistance"
  | "purpose-adversarial"
  | "domain-politics"
  | "domain-technology"
  | "domain-science"
  | "domain-ethics"
  | "domain-pedagogy"
  | "domain-everyday";

export type GrammarSuiteCategory = "purpose" | "domain";

export interface GrammarPromptSuite {
  id: GrammarSuiteKind;
  label: string;
  shortLabel: string;
  category: GrammarSuiteCategory;
  description: string;
  prompts: GrammarSuitePrompt[];
}

// ---------------------------------------------------------------------------
// Purpose suites
// ---------------------------------------------------------------------------

const BASELINE: GrammarSuitePrompt[] = [
  { id: "b-sp-1", register: "speech",    prompt: "Write the opening of a speech welcoming a new cohort of university students." },
  { id: "b-op-1", register: "op-ed",     prompt: "Write an op-ed about the role of artificial intelligence in education." },
  { id: "b-ex-1", register: "explain",   prompt: "Explain to a curious non-specialist what a neural network actually learns." },
  { id: "b-tk-1", register: "technical", prompt: "In careful prose, describe how a vaccine produces immunity." },
  { id: "b-po-1", register: "poetic",    prompt: "Write a short reflective passage about walking home through a city at dusk." },
  { id: "b-di-1", register: "dialogue",  prompt: "Write an interview answer in which a novelist explains why they write historical fiction." },
];

const INVITATION: GrammarSuitePrompt[] = [
  { id: "i-sp-1", register: "speech",    prompt: "Draft the closing peroration of a graduation address that contrasts what the students were with what they are about to become." },
  { id: "i-op-1", register: "op-ed",     prompt: "Write an op-ed arguing that democracy is misunderstood — drawing a sharp contrast between what people think it is and what it actually requires." },
  { id: "i-ex-1", register: "explain",   prompt: "Write a paragraph that begins 'Artificial intelligence is not merely' and develops the contrast that follows." },
  { id: "i-po-1", register: "poetic",    prompt: "Write a reflective passage on what home means, built around a series of contrasts between what it is not and what it is." },
  { id: "i-di-1", register: "dialogue",  prompt: "Draft a thought-leader interview answer that frames the future of work as 'not a question of X but of Y'." },
  { id: "i-sp-2", register: "speech",    prompt: "Write a eulogy paragraph that distinguishes what the deceased was from what they were not." },
];

const RESISTANCE: GrammarSuitePrompt[] = [
  { id: "r-op-1", register: "op-ed",     prompt: "Write a plain, direct op-ed about AI in education. Do NOT use rhetorical contrasts, do NOT use 'not X but Y' constructions, do NOT hedge, do NOT stack modal verbs. State plain claims." },
  { id: "r-ex-1", register: "explain",   prompt: "Explain, in the flattest possible prose, what a neural network learns. Avoid rhetorical flourishes, antithesis, and hedging. Assert, do not qualify." },
  { id: "r-tk-1", register: "technical", prompt: "Describe in dry technical prose how a transformer generates one token. No contrastive constructions, no hedging adverbs (perhaps, might, could), no modal stacks." },
  { id: "r-sp-1", register: "speech",    prompt: "Write a short address to a town council. Use only declarative sentences. Do not frame anything as 'not X but Y' or as a tension between opposites." },
  { id: "r-di-1", register: "dialogue",  prompt: "Write an interview answer from a climate scientist. State findings directly. Avoid contrasting what the public thinks with what is actually the case." },
  { id: "r-po-1", register: "poetic",    prompt: "Write a reflective paragraph about returning to a childhood home. Stay literal. Avoid antithesis and hedged phrasing." },
];

const ADVERSARIAL: GrammarSuitePrompt[] = [
  // Prompts that surface keywords the pattern feeds on (not, but, merely, only)
  // without actually inviting an antithesis. Tests whether the pattern fires
  // reflexively on lexical cues.
  { id: "a-ex-1", register: "explain",   prompt: "Explain what it means when a court says a ruling is 'not merely advisory'. Stick to the legal meaning; do not pivot into a rhetorical contrast." },
  { id: "a-tk-1", register: "technical", prompt: "Describe, technically, what 'not X but Y' parsing means in a constituency grammar. Do not use the construction while describing it." },
  { id: "a-op-1", register: "op-ed",     prompt: "Write a short op-ed defending the claim that only one thing matters in this debate. Make the case in plain assertions, not through oppositions." },
  { id: "a-di-1", register: "dialogue",  prompt: "Write a dialogue in which a teacher tells a student 'you did not fail' — without turning it into a 'not X but Y' consolation." },
  { id: "a-po-1", register: "poetic",    prompt: "Write a short meditation on the word 'but'. Use the word sparingly, and never as a pivot in a 'not X but Y' construction." },
  { id: "a-sp-1", register: "speech",    prompt: "Draft remarks for a retiring colleague that avoid the rhetorical reflex of contrasting their past with their future." },
];

// ---------------------------------------------------------------------------
// Domain suites
// ---------------------------------------------------------------------------

const POLITICS: GrammarSuitePrompt[] = [
  { id: "d-po-1", register: "op-ed",     prompt: "Write an op-ed on what democracy owes to its critics." },
  { id: "d-po-2", register: "speech",    prompt: "Draft the opening of a concession speech in a tight election." },
  { id: "d-po-3", register: "explain",   prompt: "Explain to a general reader why proportional representation remains contested." },
  { id: "d-po-4", register: "dialogue",  prompt: "Write an interview answer from a former diplomat asked whether multilateralism is in decline." },
  { id: "d-po-5", register: "technical", prompt: "Describe, in careful prose, how a parliamentary whip system actually operates during a contested vote." },
];

const TECHNOLOGY: GrammarSuitePrompt[] = [
  { id: "d-te-1", register: "op-ed",     prompt: "Write an op-ed on what large language models owe to the writers whose work trained them." },
  { id: "d-te-2", register: "explain",   prompt: "Explain to a curious reader what 'vector search' is and why it has become pervasive." },
  { id: "d-te-3", register: "technical", prompt: "In careful prose, describe what an attention head in a transformer computes." },
  { id: "d-te-4", register: "speech",    prompt: "Draft the opening of a keynote on the future of open-source AI." },
  { id: "d-te-5", register: "dialogue",  prompt: "Write an interview answer from a software engineer asked whether AI will replace programmers." },
];

const SCIENCE: GrammarSuitePrompt[] = [
  { id: "d-sc-1", register: "explain",   prompt: "Explain to a general reader what 'dark matter' is and why physicists believe it exists." },
  { id: "d-sc-2", register: "op-ed",     prompt: "Write an op-ed arguing that public understanding of statistics is dangerously low." },
  { id: "d-sc-3", register: "technical", prompt: "Describe in plain prose how CRISPR-Cas9 edits a genome." },
  { id: "d-sc-4", register: "dialogue",  prompt: "Write an interview answer from a climate scientist asked about the latest IPCC report." },
  { id: "d-sc-5", register: "speech",    prompt: "Draft remarks for the opening of a new research institute in genomics." },
];

const ETHICS: GrammarSuitePrompt[] = [
  { id: "d-et-1", register: "op-ed",     prompt: "Write an op-ed on what we owe future generations in the face of climate change." },
  { id: "d-et-2", register: "explain",   prompt: "Explain the difference between consequentialist and deontological reasoning to a sceptical reader." },
  { id: "d-et-3", register: "dialogue",  prompt: "Write a monologue from a doctor explaining to a family why they are withdrawing treatment." },
  { id: "d-et-4", register: "poetic",    prompt: "Write a reflective passage on the experience of breaking a promise you meant to keep." },
  { id: "d-et-5", register: "speech",    prompt: "Draft remarks for a panel on the ethics of predictive policing." },
];

const PEDAGOGY: GrammarSuitePrompt[] = [
  { id: "d-pe-1", register: "speech",    prompt: "Write the opening of a lecture on how to read a difficult philosophical text." },
  { id: "d-pe-2", register: "explain",   prompt: "Explain to a new teacher why marking rubrics can flatten what they try to measure." },
  { id: "d-pe-3", register: "op-ed",     prompt: "Write an op-ed arguing that universities should resist adopting generative AI tools." },
  { id: "d-pe-4", register: "dialogue",  prompt: "Write an interview answer from a headteacher asked how phone bans have worked in their school." },
  { id: "d-pe-5", register: "technical", prompt: "Describe in precise prose how formative assessment differs from summative assessment in practice." },
];

const EVERYDAY: GrammarSuitePrompt[] = [
  { id: "d-ev-1", register: "poetic",    prompt: "Write a short passage about drinking coffee alone at a train-station café." },
  { id: "d-ev-2", register: "dialogue",  prompt: "Write a short exchange between two neighbours running into each other at the supermarket." },
  { id: "d-ev-3", register: "explain",   prompt: "Explain to a friend why you have decided to stop using a particular app." },
  { id: "d-ev-4", register: "speech",    prompt: "Draft a short toast at a close friend's birthday dinner." },
  { id: "d-ev-5", register: "op-ed",     prompt: "Write a short opinion piece on whether small towns have a future." },
];

// ---------------------------------------------------------------------------
// Assembled library
// ---------------------------------------------------------------------------

export const GRAMMAR_SUITES: GrammarPromptSuite[] = [
  {
    id: "purpose-baseline",
    label: "Neutral baseline",
    shortLabel: "Baseline",
    category: "purpose",
    description: "Unprimed prompts spread across six registers. Does the pattern appear on its own?",
    prompts: BASELINE,
  },
  {
    id: "purpose-invitation",
    label: "Invitation",
    shortLabel: "Invite",
    category: "purpose",
    description: "Prompts that genuinely invite the construction. Ceiling condition — how strong does the pattern get under favourable framing?",
    prompts: INVITATION,
  },
  {
    id: "purpose-resistance",
    label: "Resistance",
    shortLabel: "Resist",
    category: "purpose",
    description: "Prompts that explicitly push against the construction. Floor condition — how hard is the pattern to suppress? (Phase D territory.)",
    prompts: RESISTANCE,
  },
  {
    id: "purpose-adversarial",
    label: "Adversarial",
    shortLabel: "Adversarial",
    category: "purpose",
    description: "Prompts that surface the pattern's lexical cues without inviting the construction. Does the model fire reflexively on keywords?",
    prompts: ADVERSARIAL,
  },
  {
    id: "domain-politics",
    label: "Politics",
    shortLabel: "Politics",
    category: "domain",
    description: "Political register: democracy, representation, diplomacy. Is the pattern topic-sensitive?",
    prompts: POLITICS,
  },
  {
    id: "domain-technology",
    label: "Technology",
    shortLabel: "Tech",
    category: "domain",
    description: "Technology discourse: LLMs, software engineering, keynote rhetoric.",
    prompts: TECHNOLOGY,
  },
  {
    id: "domain-science",
    label: "Science",
    shortLabel: "Science",
    category: "domain",
    description: "Science communication: physics, genomics, climate, statistics.",
    prompts: SCIENCE,
  },
  {
    id: "domain-ethics",
    label: "Ethics",
    shortLabel: "Ethics",
    category: "domain",
    description: "Ethical reasoning: climate duties, clinical decisions, normative arguments.",
    prompts: ETHICS,
  },
  {
    id: "domain-pedagogy",
    label: "Pedagogy",
    shortLabel: "Pedagogy",
    category: "domain",
    description: "Teaching and learning: lecture openings, assessment, school policy.",
    prompts: PEDAGOGY,
  },
  {
    id: "domain-everyday",
    label: "Everyday",
    shortLabel: "Everyday",
    category: "domain",
    description: "Ordinary register: cafés, neighbours, toasts. Pattern prevalence outside elevated prose.",
    prompts: EVERYDAY,
  },
];

export function getSuiteById(id: GrammarSuiteKind): GrammarPromptSuite | undefined {
  return GRAMMAR_SUITES.find(s => s.id === id);
}

/**
 * Flattened default selection: the neutral baseline. Kept for back-compat
 * with any caller that imported `DEFAULT_GRAMMAR_SUITE` before the library
 * refactor.
 */
export const DEFAULT_GRAMMAR_SUITE: GrammarSuitePrompt[] = BASELINE;

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

/**
 * Helper used by the UI when the user has multiple suites active: returns the
 * union of all prompts across the given suite ids, with stable ordering.
 */
export function promptsForSuites(suiteIds: Iterable<GrammarSuiteKind>): GrammarSuitePrompt[] {
  const seen = new Set<string>();
  const out: GrammarSuitePrompt[] = [];
  for (const id of suiteIds) {
    const suite = getSuiteById(id);
    if (!suite) continue;
    for (const p of suite.prompts) {
      if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
    }
  }
  return out;
}

/**
 * Look up which suite a given prompt id belongs to. Used to stratify results.
 * Returns the first matching suite (prompts belong to exactly one suite in
 * the current library; kept defensive in case that changes).
 */
export function suiteOfPrompt(promptId: string): GrammarPromptSuite | undefined {
  return GRAMMAR_SUITES.find(s => s.prompts.some(p => p.id === promptId));
}
