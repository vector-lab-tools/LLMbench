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
      "The core synthetic dialectic: denies one term in order to assert another. The paradigmatic LLM 'nuance' move.",
    category: "antithesis",
    regexes: [
      // Bare "not X but Y" — explicitly excludes just/merely/only so we
      // do not double-claim those with `not-just-x-but-y`. Mirrors Atlas's
      // grammar-of-vectors regex for this construction.
      "\\bnot\\s+(?!just\\b|merely\\b|only\\b|simply\\b)[^,.;:!?]{1,80}?\\s+but\\s+(?:rather\\s+|instead\\s+)?",
    ],
    scaffolds: [
      "Democracy is not a system of government, but a ",
      "The question is not whether we can, but ",
      "This is not a story about defeat, but ",
      "The crisis we face is not economic, but ",
      "What the city needs is not more highways, but ",
      "Poetry is not an ornament of language, but ",
    ],
    suppressTokens: ["not", "but"],
    // Captures X (group 1) as the text between "not" and " but ". Excludes
    // the intensifiers so this pattern and `not-just-x-but-y` have clean
    // non-overlapping extractors.
    xExtractor: "\\bnot\\s+(?!just\\b|merely\\b|only\\b|simply\\b)([^,.;:!?]+?)\\s*,?\\s+but\\s+",
    note:
      "Appears with striking regularity across LLM outputs, especially in explanatory and op-ed registers. The construction promises nuance while flattening toward a stable geometric direction in embedding space. Phase B's geometry view plots logprob rank against cosine(X, Y-phrase) to make this collapse visible in one chart. Aligns with Manifold Atlas's `not-x-but-y` grammar for cross-tool probing.",
  },
  {
    id: "not-just-x-but-y",
    label: "Not just X but Y (intensified antithesis)",
    shortLabel: "Not just X but Y",
    description:
      "The intensified antithesis. Concedes X to then gesture toward a more refined Y — softer than 'not X but Y' but geometrically the same move.",
    category: "antithesis",
    regexes: [
      "\\bnot\\s+(?:just|merely|only|simply)\\s+[^,.;:!?]{1,120}?\\s+but\\s+(?:rather\\s+|also\\s+|instead\\s+)?",
    ],
    scaffolds: [
      "Democracy is not just a system of government, but a ",
      "Artificial intelligence is not merely a tool, but ",
      "Education is not merely the transmission of knowledge, but ",
      "This is not just a product, but a ",
      "Writing is not just communication, but a ",
      "Leadership is not only about authority, but ",
    ],
    suppressTokens: ["not", "just", "merely", "only", "simply"],
    xExtractor: "\\bnot\\s+(?:just|merely|only|simply)\\s+([^,.;:!?]+?)\\s*,?\\s+but\\s+",
    note:
      "The characteristically RLHF-flavoured variant — the construction the model reaches for when it has been trained toward 'balance' and 'nuance'. Aligns with Manifold Atlas's `not-just-x-but-y` grammar.",
  },
  {
    id: "it-is-not-x-it-is-y",
    label: "It's not X, it's Y (false correction)",
    shortLabel: "It's not X, it's Y",
    description:
      "The false-correction: a pivot framed as self-correction where nothing was actually wrong. Simulates revision without revising. Characteristic of explainer prose.",
    category: "antithesis",
    regexes: [
      "\\b(?:it['\\u2019]s|it\\s+is|this\\s+isn['\\u2019]t|this\\s+is\\s+not)\\s+(?:that\\s+)?[^,.;:!?]{1,80}[,;.—–-]+\\s*(?:it['\\u2019]s|it\\s+is)\\s+",
    ],
    scaffolds: [
      "It's not a problem. It's ",
      "It's not about the money; it's ",
      "This isn't a crisis — it's ",
      "It is not merely a trend. It is ",
      "It's not what you said, it's ",
    ],
    suppressTokens: ["not", "it's", "it", "is"],
    xExtractor: "\\b(?:it['\\u2019]s|it\\s+is|this\\s+isn['\\u2019]t|this\\s+is\\s+not)\\s+(?:that\\s+)?([^,.;:!?—–-]+?)[,;.—–-]+\\s*(?:it['\\u2019]s|it\\s+is)\\s+",
    note:
      "Closely related to 'not X but Y' but structurally separate: the correction is staged as two clauses rather than one. A tell of explainer register, common in AI-assisted writing coaching. Aligns with Manifold Atlas's `it-is-not-x-it-is-y` grammar.",
  },
  {
    id: "while-x-y",
    label: "While X, Y (conciliation pivot)",
    shortLabel: "While X, Y",
    description:
      "Both-sides framing that gestures at balance while its weight sits firmly on Y. Also matches 'although' and 'though'. Beloved of the op-ed register.",
    category: "antithesis",
    regexes: [
      "\\b(?:while|although|though)\\s+[^,.;:!?]{1,120}?,\\s+",
    ],
    scaffolds: [
      "While tradition has its place, innovation ",
      "While the critics have a point, the reality is ",
      "Although technology has risks, its benefits ",
      "While no one denies the challenges, ",
      "Though the data is incomplete, ",
    ],
    suppressTokens: ["while", "although", "though"],
    // Captures the concession clause (X) between the pivot word and the comma.
    xExtractor: "\\b(?:while|although|though)\\s+([^,.;:!?]+?),\\s+",
    note:
      "Structurally a concession → assertion pivot. The tell is that the concession is near-uniformly rhetorical — the model is not genuinely torn, it has already decided. Geometrically: the Y half sits close to a conventional direction while X is decorative. Aligns with Manifold Atlas's `while-x-y` grammar.",
  },
  {
    id: "what-matters-is-not-x-but-y",
    label: "What matters is not X but Y (cleft emphasis)",
    shortLabel: "What matters…",
    description:
      "Cleft-emphasis variant of 'not X but Y' that adds rhetorical weight by framing the pair as a matter of stakes. Also matches 'what counts', 'what's important', 'what's really at stake'.",
    category: "antithesis",
    regexes: [
      "\\b(?:what\\s+(?:matters|counts|(?:is\\s+)?(?:important|really\\s+at\\s+stake)))\\s+(?:is\\s+)?not\\s+[^,.;:!?]{1,120}?\\s+but\\s+(?:rather\\s+|instead\\s+)?",
    ],
    scaffolds: [
      "What matters is not the price, but the ",
      "What really counts is not how often we speak, but ",
      "What's important is not where you start, but ",
      "What's really at stake is not convenience, but ",
      "What matters is not winning, but ",
    ],
    suppressTokens: ["what", "matters", "counts", "important", "not", "but"],
    xExtractor: "\\b(?:what\\s+(?:matters|counts|(?:is\\s+)?(?:important|really\\s+at\\s+stake)))\\s+(?:is\\s+)?not\\s+([^,.;:!?]+?)\\s*,?\\s+but\\s+",
    note:
      "The cleft puts the antithesis in a frame of moral stakes — a gesture toward significance that is then satisfied by a near-neighbour rotation. Aligns with Manifold Atlas's `what-matters-is-not-x-but-y` grammar.",
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
