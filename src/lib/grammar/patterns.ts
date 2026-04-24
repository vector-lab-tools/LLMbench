/**
 * Grammar Probe — pattern library.
 *
 * A "pattern" is a rhetorical construction we can count in generated prose,
 * investigate via continuation logprobs, and (later) steer in activation
 * space via Vectorscope. Each preset bundles:
 *   - a label and short description
 *   - one or more regexes for counting occurrences (Phase A, D, E)
 *   - canonical scaffolds for forced-continuation probes (Phase B, C)
 *   - suggested "suppress" tokens for logit-bias experiments
 *
 * The library is intentionally small at launch — four presets covering a
 * spread of rhetorical registers. Users can add their own via the UI.
 */

export interface GrammarPattern {
  id: string;
  label: string;
  shortLabel: string;         // for tight UI chips
  description: string;
  category: "antithesis" | "hedging" | "parallelism" | "modality";
  /**
   * One or more regexes, combined with OR for counting.
   * All regexes run with `g` and `i` flags added automatically; authors do not
   * need to include them in the source string.
   */
  regexes: string[];
  /**
   * Scaffolds ending mid-construction, designed to elicit the pattern's Y
   * term when fed to a model (Phase B continuation logprobs / Phase C forced
   * completion). Should end with a trailing space.
   */
  scaffolds: string[];
  /**
   * Tokens the construction typically relies on. Used as defaults for the
   * logit-bias "suppress" experiment. Rough approximations — the exact token
   * IDs are provider-specific.
   */
  suppressTokens: string[];
  /**
   * Short methodological note explaining why this pattern is worth probing.
   */
  note: string;
  /**
   * Regex that, when applied to a scaffold, captures group 1 as the pattern's
   * *X term* — the thing the construction denies / asserts against. Required
   * for the Phase B geometric analysis (cosine of X vs top-K Y expansions).
   *
   * Patterns that do not have a well-defined X (hedging, tricolon, modal
   * stacking) OMIT this field. The UI disables the scatter view for those.
   */
  xExtractor?: string;
}

export const DEFAULT_PATTERNS: GrammarPattern[] = [
  {
    id: "not-x-but-y",
    label: "Not X but Y (antithesis)",
    shortLabel: "Not X but Y",
    description:
      "The rhetorical construction that denies one term in order to assert another. The paradigmatic LLM 'nuance' move.",
    category: "antithesis",
    regexes: [
      // "not just/merely/only ... but ..."
      "\\bnot\\s+(?:just|merely|only|simply)\\s+[^,.;:!?]{1,120}?\\s+but\\s+",
      // bare "not ... but ..." (tighter bound to avoid runaway matches)
      "\\bnot\\s+[^,.;:!?]{1,80}?\\s+but\\s+(?:rather\\s+|also\\s+)?",
      // "It is not X; it is Y." / "It is not X. It is Y."
      "\\b(?:it|this|that)\\s+is\\s+not\\s+[^,.;:!?]{1,80}[;.]\\s*(?:it|this|that)\\s+is\\s+",
    ],
    scaffolds: [
      "Democracy is not just a system of government, but a ",
      "The question is not whether we can, but ",
      "Artificial intelligence is not merely a tool, but ",
      "This is not a story about defeat, but ",
      "Education is not merely the transmission of knowledge, but ",
      "The crisis we face is not economic, but ",
      "What the city needs is not more highways, but ",
      "Poetry is not an ornament of language, but ",
    ],
    suppressTokens: ["not", "just", "merely", "only", "simply"],
    // Captures X (group 1) as the text between the negation marker and " but ".
    // Tolerates optional intensifiers (just/merely/only/simply), optional
    // articles, and a trailing comma before "but". Non-greedy to avoid
    // swallowing downstream clauses.
    xExtractor: "\\bnot\\s+(?:just\\s+|merely\\s+|only\\s+|simply\\s+)?([^,.;:!?]+?)\\s*,?\\s+but\\s+",
    note:
      "Appears with striking regularity across LLM outputs, especially in explanatory and op-ed registers. The construction promises nuance while flattening toward a stable geometric direction in embedding space. Phase B's geometry view plots logprob rank against cosine(X, Y-phrase) to make this collapse visible in one chart.",
  },
  {
    id: "hedging-triplet",
    label: "Hedging triplet (Hyland)",
    shortLabel: "Hedges",
    description:
      "Epistemic hedges that mark a claim as tentative — perhaps, may, might, could, seems, appears, suggests.",
    category: "hedging",
    regexes: [
      "\\b(?:perhaps|possibly|presumably|arguably)\\b",
      "\\b(?:may|might|could|would)\\s+(?:be|have|well|also|still)\\b",
      "\\b(?:seems|appears|suggests|indicates|tends)\\s+to\\b",
      "\\b(?:it\\s+(?:is|seems)\\s+(?:possible|likely|probable|reasonable)\\s+that)\\b",
    ],
    scaffolds: [
      "One interpretation of this finding is that ",
      "It is worth noting that ",
      "A cautious reading would suggest that ",
      "This result ",
    ],
    suppressTokens: ["perhaps", "may", "might", "seems", "appears", "suggests"],
    note:
      "Hyland (2005) classifies hedges as one of five metadiscourse markers that stage the writer's stance. LLMs tend to over-produce hedges in expository prose — a tell of RLHF-trained politeness. Measure prevalence across registers, perturb with explicit 'be direct' instructions, and observe whether the pattern flexes or persists.",
  },
  {
    id: "tricolon",
    label: "Tricolon / parallelism",
    shortLabel: "Tricolon",
    description:
      "Three-part parallel structures: A, B, and C; not A, not B, not C; what it is, what it does, what it means.",
    category: "parallelism",
    regexes: [
      // simple A, B, and C (conjunct lists of three nouns/phrases up to moderate length)
      "\\b(?:\\w[\\w\\s'-]{1,40}),\\s+(?:\\w[\\w\\s'-]{1,40}),\\s+and\\s+(?:\\w[\\w\\s'-]{1,40})\\b",
      // anaphoric "not X, not Y, not Z"
      "\\bnot\\s+\\w[\\w\\s-]{0,30},\\s+not\\s+\\w[\\w\\s-]{0,30},\\s+(?:and\\s+)?not\\s+",
      // anaphoric "it is ... it is ... it is ..."
      "\\b(?:it\\s+is\\s+\\w[\\w\\s-]{1,30}[.;]\\s+){2}it\\s+is\\s+",
    ],
    scaffolds: [
      "The three things to note about this are ",
      "What this reveals is ",
      "We need to understand this as ",
    ],
    suppressTokens: [",", "and"],
    note:
      "Tricolons give prose a rhythmic, speech-like cadence. LLMs favour them in summary and explanatory modes because they present information as already-resolved into three tidy beats. A high tricolon rate at T=0 is a sign that the model is reaching for rhetorical closure, not openness.",
  },
  {
    id: "modal-stack",
    label: "Modal stacking",
    shortLabel: "Modals",
    description:
      "Sequences of modal verbs (can, will, should, must, could, would) in a short window, often signalling prescriptive or anticipatory prose.",
    category: "modality",
    regexes: [
      // two or more modals within ~8 words
      "\\b(?:can|will|should|must|could|would|might|may|shall)\\b[\\w\\s,'-]{1,40}\\b(?:can|will|should|must|could|would|might|may|shall)\\b",
    ],
    scaffolds: [
      "If we want to address this, we ",
      "Going forward, organisations ",
      "The responsible path ",
    ],
    suppressTokens: ["should", "must", "can", "will"],
    note:
      "Modal stacking is the LLM register of 'guidance' writing — the voice of thought leadership, policy brief, best practices post. Probes here reveal how quickly a model defaults to prescription when asked to discuss a topic, and how stubbornly it holds that register under perturbation.",
  },
];

export function compilePatternRegex(pattern: GrammarPattern): RegExp {
  const combined = pattern.regexes.map(r => `(?:${r})`).join("|");
  return new RegExp(combined, "gi");
}

export function countMatches(text: string, pattern: GrammarPattern): number {
  if (!text) return 0;
  try {
    const re = compilePatternRegex(pattern);
    const matches = text.match(re);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

export interface MatchSpan {
  start: number;
  end: number;
  text: string;
}

export function findMatchSpans(text: string, pattern: GrammarPattern, cap = 50): MatchSpan[] {
  if (!text) return [];
  const spans: MatchSpan[] = [];
  try {
    const re = compilePatternRegex(pattern);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null && spans.length < cap) {
      spans.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width matches
    }
  } catch {
    // ignore bad regex
  }
  return spans;
}
