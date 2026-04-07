"use client";

import { useMemo, useState, useCallback } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Word sets ────────────────────────────────────────────────────────────────
// Hyland (2005) Metadiscourse: Exploring Interaction in Writing. Continuum.

// HEDGES — reduce force of a claim; signal epistemic tentativeness (Hyland 2005: 52)
const HEDGING = new Set([
  "might", "may", "could", "perhaps", "possibly", "probably", "likely",
  "arguably", "seems", "seem", "appear", "appears", "seemingly",
  "apparently", "suggest", "suggests", "indicate", "indicates",
  "somewhat", "rather", "relatively", "generally", "often", "sometimes",
  "tend", "tends", "usually", "typically", "approximately", "roughly",
  "partially", "essentially", "virtually", "presumably", "supposedly",
  "allegedly", "conceivably", "potentially", "theoretically",
]);

// BOOSTERS — increase force or certainty; close down alternatives (Hyland 2005: 52)
const CONFIDENT = new Set([
  "clearly", "obviously", "certainly", "definitely", "undoubtedly",
  "absolutely", "always", "must", "will", "shall", "inevitably",
  "unquestionably", "indisputably", "evidently", "plainly", "surely",
  "necessarily", "demonstrably", "explicitly", "precisely", "exactly",
  "directly", "conclusively",
]);

// LIMITING — restrict, deny or exclude (negative markers + near-negators / downtoners)
const NEGATION = new Set([
  "not", "no", "never", "neither", "nor", "without", "hardly", "barely",
  "rarely", "seldom", "nothing", "nobody", "nowhere", "none",
  "scarcely", "lack", "lacks", "lacking", "absent", "fail", "fails",
  "impossible", "unable", "cannot", "can't", "won't", "don't", "doesn't",
  "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't",
]);

// ATTITUDE MARKERS — express writer's evaluation or stance toward content (Hyland 2005: 53)
const EVALUATIVE = new Set([
  // Epistemic importance
  "important", "crucial", "fundamental", "essential", "critical", "necessary",
  "key", "central", "vital", "significant", "decisive",
  // Positive evaluation
  "valuable", "useful", "effective", "powerful", "compelling", "remarkable",
  "striking", "notable", "profound", "interesting", "fascinating",
  // Negative evaluation
  "problematic", "concerning", "troubling", "controversial", "questionable",
  "inadequate", "insufficient", "flawed", "challenging", "complex", "limited",
  // Epistemic stance
  "surprising", "unexpected", "curious", "unfortunate", "regrettable",
]);

// INTENSIFIERS — amplify force of adjacent words; sub-type of Boosters (Hyland 2005: 52)
const INTENSIFIERS = new Set([
  "very", "extremely", "highly", "deeply", "greatly", "profoundly",
  "exceptionally", "especially", "particularly", "considerably",
  "substantially", "enormously", "tremendously", "thoroughly", "entirely",
  "utterly", "wholly", "strongly", "immensely", "vastly",
]);

// SELF-MENTIONS — explicit author references; signal authorial presence (Hyland 2005: 53)
const SELF_MENTIONS = new Set([
  "i", "we", "my", "our", "me", "us", "myself", "ourselves",
]);

// ENGAGEMENT MARKERS — address reader directly; build inclusive relationship (Hyland 2005: 53)
const ENGAGEMENT = new Set([
  "you", "your", "yourself", "consider", "note", "notice", "observe",
  "imagine", "see", "recall", "remember", "think", "suppose",
  "ask", "question", "wonder", "examine", "look", "compare",
]);

// ── Per-word linguistic notes ────────────────────────────────────────────────
const WORD_NOTES: Record<string, string> = {
  // Hedges
  "might": "Epistemic modal — possibility without commitment.",
  "may": "Epistemic or deontic modal — possibility or permission.",
  "could": "Contingent possibility — conditions required.",
  "perhaps": "Adverb signalling uncertainty; no commitment to truth.",
  "possibly": "Weaker than 'probably' — genuine doubt acknowledged.",
  "probably": "High likelihood but not certainty; epistemic reservation.",
  "likely": "Probable but hedged; avoids outright assertion.",
  "arguably": "Invites the reader to accept the claim on its merits; the writer does not assert it as fact.",
  "seems": "Evidential hedge — inference from appearance, not direct knowledge.",
  "appear": "Evidential hedge — inferred from observation.",
  "appears": "Evidential — inferred, not asserted.",
  "seemingly": "Qualifies appearance without guaranteeing reality.",
  "apparently": "Based on available evidence; indirect knowledge.",
  "suggest": "Weaker than 'show' or 'prove' — evidence is incomplete.",
  "suggests": "Evidential hedge against overclaiming from data.",
  "indicate": "Points toward a conclusion without asserting it.",
  "indicates": "Evidence without certainty.",
  "somewhat": "Scalar hedge — reduces the force of what follows.",
  "rather": "Scalar modifier softening a claim.",
  "relatively": "Frames the claim as contextual, not absolute.",
  "generally": "True in most cases, with admitted exceptions.",
  "often": "Frequency hedge — true frequently but not always.",
  "sometimes": "Weak frequency hedge — allows many exceptions.",
  "tend": "Dispositional hedge — a tendency, not a rule.",
  "tends": "Dispositional hedge — habitual but not invariable.",
  "usually": "High-frequency hedge leaving room for exceptions.",
  "typically": "Signals a norm while allowing deviation.",
  "approximately": "Signals numerical imprecision.",
  "roughly": "Informal numerical hedge.",
  "potentially": "Possibility without actuality.",
  "theoretically": "Valid in theory; may not hold in practice.",
  "presumably": "Based on assumption rather than direct knowledge.",
  // Boosters
  "clearly": "Presupposes self-evidence — often rhetorical; can assume reader agreement.",
  "obviously": "Strong presupposition; risks appearing dismissive of alternatives.",
  "certainly": "Asserts truth without qualification.",
  "definitely": "Emphatic assertion — no uncertainty admitted.",
  "undoubtedly": "Eliminates the possibility of doubt.",
  "absolutely": "Emphatic; admits no qualification.",
  "always": "Universal quantifier — an extremely strong claim.",
  "must": "Epistemic or deontic necessity — no alternative admitted.",
  "will": "Asserts future state as certain.",
  "shall": "Formal assertion of future certainty or obligation.",
  "inevitably": "Claims the outcome is causally or logically forced.",
  "evidently": "Presupposes visible evidence — sometimes rhetorical.",
  "plainly": "Claims the truth is unmistakable.",
  "surely": "Invites agreement by presupposing shared belief.",
  "necessarily": "Claims logical or causal entailment.",
  "explicitly": "Stated outright rather than inferred.",
  "precisely": "Claims exactness.",
  "exactly": "Asserts complete accuracy.",
  "directly": "Asserts without intermediary or qualification.",
  "conclusively": "Claims the matter is settled.",
  // Limiting
  "not": "Grammatical negation — restricts the truth of what follows.",
  "no": "Absolute restriction of quantity or existence.",
  "never": "Temporal universal restriction — no exceptions.",
  "neither": "Restricts both of two alternatives.",
  "nor": "Extends a restriction to an additional item.",
  "without": "Marks absence or exclusion.",
  "hardly": "Near-negation / downtoner — almost none or almost never.",
  "barely": "Near-negation — only just; very little.",
  "rarely": "Near-negation by frequency.",
  "seldom": "Formal near-negation by frequency.",
  "nothing": "Absolute restriction of content or existence.",
  "nobody": "Absolute restriction of persons.",
  "nowhere": "Absolute restriction of place.",
  "none": "Restricts all members of a set.",
  "scarcely": "Near-negation — implies near-absence.",
  "lack": "Marks absence of something.",
  "lacks": "Third-person absence marker.",
  "lacking": "Ongoing absence.",
  "absent": "Formal absence marker.",
  "fail": "Marks non-achievement.",
  "fails": "Third-person non-achievement.",
  "impossible": "Absolute restriction of possibility.",
  "unable": "Restricts capacity.",
  "cannot": "Restricts ability or permission.",
  // Evaluative / Attitude markers
  "important": "Evaluates the following as mattering — a common epistemic claim.",
  "crucial": "Strong positive evaluation of importance — load-bearing for argument.",
  "fundamental": "Claims the point is basic and constitutive.",
  "essential": "Claims necessity — nothing could function without this.",
  "critical": "Strong evaluation — failure here affects the whole.",
  "necessary": "Claims required status.",
  "key": "Informal evaluative marker for importance.",
  "central": "Spatial metaphor for importance — places claim at the core.",
  "vital": "Life-or-death metaphor for importance.",
  "significant": "Evaluates magnitude or importance.",
  "decisive": "Claims the point settles or determines the outcome.",
  "valuable": "Positive evaluation of worth.",
  "useful": "Positive evaluation of utility.",
  "effective": "Positive evaluation of function.",
  "powerful": "Positive evaluation of force or impact.",
  "compelling": "Positive evaluation — difficult to resist.",
  "notable": "Evaluates as worthy of attention.",
  "profound": "Positive evaluation of depth.",
  "interesting": "Mild positive attitude marker — worth attending to.",
  "fascinating": "Strong positive attitude — compels attention.",
  "striking": "Positive evaluation — stands out.",
  "problematic": "Negative evaluation — signals a difficulty or concern.",
  "concerning": "Negative attitude marker — the writer expresses worry.",
  "troubling": "Negative attitude — the writer is unsettled.",
  "controversial": "Negative-neutral evaluation — contested in the field.",
  "questionable": "Negative evaluation of credibility or method.",
  "inadequate": "Negative evaluation — falls short of a standard.",
  "insufficient": "Negative evaluation — not enough.",
  "flawed": "Negative evaluation — contains defects.",
  "challenging": "Mild negative evaluation — difficult.",
  "surprising": "Attitude marker — the writer signals violation of expectation.",
  "unexpected": "Attitude marker — the result or claim defies prior assumptions.",
  "unfortunate": "Negative attitude — the writer expresses regret.",
  // Intensifiers
  "very": "General amplifier — increases the force of adjacent word.",
  "extremely": "Strong amplifier — near maximum force.",
  "highly": "Amplifier common in academic writing; less informal than 'very'.",
  "deeply": "Amplifier with connotations of depth or internalisation.",
  "greatly": "Amplifier of degree or scale.",
  "profoundly": "Amplifier suggesting depth of impact or significance.",
  "exceptionally": "Amplifier marking deviation from norm — above and beyond.",
  "especially": "Focuses and amplifies a specific instance.",
  "particularly": "Selective amplifier — marks this case as standing out.",
  "considerably": "Quantitative amplifier — a significant amount.",
  "substantially": "Quantitative amplifier — a large portion.",
  "thoroughly": "Completeness amplifier — all the way through.",
  "entirely": "Amplifier of totality.",
  "utterly": "Emphatic totality amplifier.",
  "wholly": "Formal totality amplifier.",
  "strongly": "Amplifier of force or commitment.",
  // Self-mentions
  "i": "First-person singular — marks individual authorial presence; signals personal stance or experience.",
  "we": "First-person plural — signals collective authorship or invites the reader into a shared perspective.",
  "my": "Possessive first-person — indicates personal ownership of claim, method, or argument.",
  "our": "Possessive plural — collective ownership; may signal the model adopting an inclusive 'we'.",
  "me": "Object first-person — marks the author as recipient of an action.",
  "us": "Object plural — the author and others as a group.",
  "myself": "Reflexive first-person — emphatic or exclusive self-reference.",
  "ourselves": "Reflexive plural — collective self-reference.",
  // Engagement markers
  "you": "Second-person direct address — draws the reader in; creates interpersonal immediacy.",
  "your": "Possessive second-person — attributes a perspective or action to the reader.",
  "consider": "Reader directive — invites evaluation rather than asserting a conclusion.",
  "note": "Reader directive — signals an item the writer deems worth attending to.",
  "notice": "Reader directive — prompts the reader to observe something specific.",
  "observe": "Reader directive — formal invitation to attend to evidence.",
  "imagine": "Reader directive — asks the reader to construct a hypothetical mental scenario.",
  "recall": "Reader directive — assumes prior shared knowledge; addresses reader memory.",
  "remember": "Reader directive — prompts recollection; assumes common ground.",
  "suppose": "Conditional reader directive — invites hypothetical reasoning.",
  "examine": "Reader directive — invites analytic attention.",
  "compare": "Reader directive — invites contrastive analysis.",
};

// ── Types ────────────────────────────────────────────────────────────────────
type ToneCategory = "hedging" | "confident" | "negation" | "evaluative" | "intensifiers" | "self_mentions" | "engagement" | "neutral";

interface TokenEntry {
  token: string;
  category: ToneCategory;
  clean: string;
  wordIndex: number;
}

interface TooltipState {
  index: number;
  x: number;
  y: number;
  above: boolean;
}

interface ToneViewProps {
  text: string;
  fontSize: number;
  fontFamily: string;
  isDark: boolean;
}

// ── Styles ───────────────────────────────────────────────────────────────────
const TONE_STYLES: Record<ToneCategory, { bg: string; text: string; border: string; bar: string; label: string; description: string }> = {
  hedging: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-800 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-700",
    bar: "bg-blue-400/60 dark:bg-blue-600/60",
    label: "Hedges",
    description: "Reduce force of a claim; signal epistemic tentativeness.",
  },
  confident: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-700",
    bar: "bg-emerald-400/60 dark:bg-emerald-600/60",
    label: "Boosters",
    description: "Increase force or certainty; close down alternatives.",
  },
  negation: {
    bg: "bg-orange-100 dark:bg-orange-900/40",
    text: "text-orange-800 dark:text-orange-300",
    border: "border-orange-300 dark:border-orange-700",
    bar: "bg-orange-400/60 dark:bg-orange-600/60",
    label: "Limiting",
    description: "Restrict, deny or exclude — marking absence or non-applicability.",
  },
  evaluative: {
    bg: "bg-purple-100 dark:bg-purple-900/40",
    text: "text-purple-800 dark:text-purple-300",
    border: "border-purple-300 dark:border-purple-700",
    bar: "bg-purple-400/60 dark:bg-purple-600/60",
    label: "Attitude",
    description: "Express writer's evaluation or stance toward the content.",
  },
  intensifiers: {
    bg: "bg-amber-100 dark:bg-amber-900/40",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-700",
    bar: "bg-amber-400/60 dark:bg-amber-600/60",
    label: "Intensifiers",
    description: "Amplify force of adjacent words — a sub-type of Boosters.",
  },
  self_mentions: {
    bg: "bg-rose-100 dark:bg-rose-900/40",
    text: "text-rose-800 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-700",
    bar: "bg-rose-400/60 dark:bg-rose-600/60",
    label: "Self-mentions",
    description: "Explicit author references — signal authorial presence and personal stance.",
  },
  engagement: {
    bg: "bg-teal-100 dark:bg-teal-900/40",
    text: "text-teal-800 dark:text-teal-300",
    border: "border-teal-300 dark:border-teal-700",
    bar: "bg-teal-400/60 dark:bg-teal-600/60",
    label: "Engagement",
    description: "Address the reader directly — build inclusive or dialogic relationship.",
  },
  neutral: { bg: "", text: "", border: "", bar: "", label: "", description: "" },
};

// ── Category info panels (shown on chip click) ────────────────────────────────
const CATEGORY_INFO: Record<Exclude<ToneCategory, "neutral">, { hylandTerm: string; detail: string; origin: string }> = {
  hedging: {
    hylandTerm: "Hedges",
    detail: "Hedges are linguistic devices that reduce the illocutionary force of a proposition, signalling that the writer cannot or will not commit fully to its truth. They indicate tentativeness, possibility, or indirectness. A high hedge density may signal appropriate epistemic caution — or strategic evasiveness. Examples: might, may, perhaps, seems, suggest, generally, approximately.",
    origin: "Hyland, K. (2005) Metadiscourse: Exploring Interaction in Writing. London: Continuum, p. 52. One of five Interactional metadiscourse categories; paired with Boosters.",
  },
  confident: {
    hylandTerm: "Boosters",
    detail: "Boosters allow writers to express certainty and close down alternatives, projecting conviction about what they claim. Where hedges indicate reservation, boosters assert commitment. Overuse can signal rhetorical overconfidence or a presupposition that the reader already agrees. Examples: clearly, certainly, must, obviously, always, will, undoubtedly.",
    origin: "Hyland, K. (2005) Metadiscourse: Exploring Interaction in Writing. London: Continuum, p. 52. Hyland's paired concept to Hedges in the Interactional dimension.",
  },
  negation: {
    hylandTerm: "Negative markers / Downtoners",
    detail: "Words that restrict the scope of an assertion by marking absence, denial, or exclusion. Includes grammatical negation markers (not, no, never, nothing) and near-negators or downtoners that weaken rather than fully negate (hardly, barely, scarcely, rarely). Note: the appearance of these markers in LLM output is a surface-level observation. Whether a language model performs logical negation in any philosophically robust sense is contested — see Berry (2026) 'Negative Vectors'.",
    origin: "Not a named Hyland category. Drawn from corpus linguistics: Biber et al. (1999) Grammar of Spoken and Written English distinguish 'negation' from 'downtoners'. The label 'Limiting' is used here to avoid the philosophical weight of 'negation'.",
  },
  evaluative: {
    hylandTerm: "Attitude markers",
    detail: "Attitude markers express the writer's affective or evaluative stance toward propositional content — signalling importance, surprise, agreement, or concern. They reveal what the model treats as worth emphasising, problematic, or compelling. Unlike Boosters (which express certainty), Attitude markers express value judgement or emotional stance. Examples: important, crucial, surprising, problematic, fascinating, unfortunate, key, remarkable.",
    origin: "Hyland, K. (2005) Metadiscourse: Exploring Interaction in Writing. London: Continuum, p. 53. One of five Interactional metadiscourse categories. Hyland's term is 'Attitude markers'; 'Evaluative' is used in the button label here for clarity.",
  },
  intensifiers: {
    hylandTerm: "Amplifiers (sub-type of Boosters)",
    detail: "Intensifiers amplify the force of the word or phrase they modify without themselves expressing certainty or evaluation. They operate as scalar maximisers (very, extremely, utterly) or selective focus markers (especially, particularly). In Hyland's model they fall within the Boosters category rather than forming a separate class, but separating them out allows finer-grained analysis of rhetorical amplification. Examples: very, extremely, highly, deeply, particularly, thoroughly, utterly.",
    origin: "Hyland, K. (2005) Metadiscourse: Exploring Interaction in Writing. London: Continuum, p. 52. Treated here as a distinct sub-category of Boosters for analytic granularity. Also discussed in Biber et al. (1999) Grammar of Spoken and Written English under 'amplifiers'.",
  },
  self_mentions: {
    hylandTerm: "Self-mentions",
    detail: "Self-mentions are first-person references (I, we, my, our, me, us) that signal the writer's presence in the text. Hyland found that their frequency varies dramatically by discipline: scientists suppress them to project objectivity; humanities writers use them to foreground interpretation. In LLM output, self-mentions are analytically distinctive: the model is not a person with prior experience, so any 'I' or 'we' performs a rhetorically constructed subjectivity. High self-mention density may indicate the model has adopted a persona — or responded to cues in the prompt to speak in first person.",
    origin: "Hyland, K. (2005) Metadiscourse: Exploring Interaction in Writing. London: Continuum, p. 53. One of five Interactional metadiscourse categories. Hyland's corpus found strong genre variation: science papers use fewer self-mentions than humanities essays by a factor of 10.",
  },
  engagement: {
    hylandTerm: "Engagement markers",
    detail: "Engagement markers explicitly address or involve the reader, using second-person reference (you, your) or reader directives (consider, note, imagine, recall). They create a dialogic relationship between writer and reader, positioning the reader as an active participant. In academic writing they signal collaborative inquiry rather than one-way information transfer. In LLM output, high engagement marker density may indicate the model is adopting an instructional or conversational register rather than a detached analytical one. Examples: you, your, consider, note, observe, imagine, suppose.",
    origin: "Hyland, K. (2005) Metadiscourse: Exploring Interaction in Writing. London: Continuum, p. 53. One of five Interactional metadiscourse categories. Hyland treats engagement markers as expressing the writer's positioning of the reader rather than the propositional content itself.",
  },
};

// ── Classification ────────────────────────────────────────────────────────────
const ACTIVE_CATEGORIES = ["hedging", "confident", "negation", "evaluative", "intensifiers", "self_mentions", "engagement"] as const;

function classifyWord(word: string): ToneCategory {
  const clean = word.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
  if (!clean) return "neutral";
  if (HEDGING.has(clean)) return "hedging";
  if (CONFIDENT.has(clean)) return "confident";
  if (NEGATION.has(clean)) return "negation";
  if (EVALUATIVE.has(clean)) return "evaluative";
  if (INTENSIFIERS.has(clean)) return "intensifiers";
  if (SELF_MENTIONS.has(clean)) return "self_mentions";
  if (ENGAGEMENT.has(clean)) return "engagement";
  return "neutral";
}

// ── Component ─────────────────────────────────────────────────────────────────
export function ToneView({ text, fontSize, fontFamily }: ToneViewProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<ToneCategory | null>(null);
  const [hiddenCategories, setHiddenCategories] = useState<ToneCategory[]>([]);

  const toggleHidden = useCallback((cat: ToneCategory) => {
    setHiddenCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }, []);

  const { tokens, counts, frequencyMap, totalWords } = useMemo(() => {
    let wordIndex = 0;
    const tokens: TokenEntry[] = [...text.matchAll(/[a-zA-Z'-]+|[^a-zA-Z'-]+/g)].map(m => {
      const token = m[0];
      const isWord = /[a-zA-Z]/.test(token);
      const clean = token.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
      const category = classifyWord(token);
      const entry: TokenEntry = { token, category, clean, wordIndex };
      if (isWord) wordIndex++;
      return entry;
    });
    const totalWords = wordIndex;
    const counts = { hedging: 0, confident: 0, negation: 0, evaluative: 0, intensifiers: 0, self_mentions: 0, engagement: 0 };
    const frequencyMap = new Map<string, number>();
    for (const { category, clean } of tokens) {
      if (category !== "neutral" && clean) {
        counts[category]++;
        frequencyMap.set(clean, (frequencyMap.get(clean) || 0) + 1);
      }
    }
    return { tokens, counts, frequencyMap, totalWords };
  }, [text]);

  const total = ACTIVE_CATEGORIES.reduce((s, c) => s + counts[c], 0);

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLSpanElement>, index: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const above = rect.top > window.innerHeight / 2;
    setTooltip({ index, x: rect.left + rect.width / 2, y: above ? rect.top : rect.bottom, above });
  }, []);

  const handleMouseLeave = useCallback(() => setTooltip(null), []);

  const tooltipContent = tooltip !== null ? (() => {
    const entry = tokens[tooltip.index];
    if (!entry || entry.category === "neutral") return null;
    const style = TONE_STYLES[entry.category];
    const freq = frequencyMap.get(entry.clean) || 1;
    const note = WORD_NOTES[entry.clean];
    const before = tokens.slice(Math.max(0, tooltip.index - 8), tooltip.index).map(t => t.token).join("");
    const after = tokens.slice(tooltip.index + 1, tooltip.index + 9).map(t => t.token).join("");
    const contextBefore = before.length > 40 ? "…" + before.slice(-40) : (tooltip.index > 0 ? "…" : "") + before;
    const contextAfter = after.length > 40 ? after.slice(0, 40) + "…" : after + (tooltip.index < tokens.length - 1 ? "…" : "");
    return { entry, style, freq, note, contextBefore, contextAfter };
  })() : null;

  return (
    <div className="flex flex-col h-full">
      {/* Legend bar */}
      <div className="px-4 py-1.5 border-b border-parchment/30 flex flex-wrap items-center gap-3 text-[10px] bg-cream/20">
        <span className="text-muted-foreground font-medium">Register view</span>
        {ACTIVE_CATEGORIES.map(cat => {
          const hidden = hiddenCategories.includes(cat);
          const selected = selectedCategory === cat;
          return (
            <span key={cat} className="flex items-center gap-1">
              {/* Label chip — click to toggle info */}
              <button
                onClick={() => setSelectedCategory(selected ? null : cat)}
                className={cn(
                  "px-1.5 py-0.5 rounded text-[10px] transition-opacity",
                  TONE_STYLES[cat].bg,
                  TONE_STYLES[cat].text,
                  hidden ? "opacity-30 line-through" : "",
                  selected ? "ring-1 " + TONE_STYLES[cat].border : ""
                )}
                title={`Click to ${selected ? "close" : "show"} description`}
              >
                {TONE_STYLES[cat].label}
              </button>
              {/* Count */}
              <span className={cn("text-muted-foreground", hidden ? "opacity-30" : "")}>
                {counts[cat]}
              </span>
              {/* Visibility toggle */}
              <button
                onClick={() => toggleHidden(cat)}
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                title={hidden ? `Show ${TONE_STYLES[cat].label} highlights` : `Hide ${TONE_STYLES[cat].label} highlights`}
              >
                {hidden
                  ? <EyeOff className="w-2.5 h-2.5" />
                  : <Eye className="w-2.5 h-2.5" />
                }
              </button>
            </span>
          );
        })}
        {total > 0 && (
          <span className="text-muted-foreground ml-auto">
            {total} marked of {totalWords} words
          </span>
        )}
      </div>

      {/* Category info panel */}
      {selectedCategory !== null && selectedCategory !== "neutral" && (
        <div className={cn(
          "px-4 py-3 border-b text-[10px] leading-relaxed space-y-1.5",
          TONE_STYLES[selectedCategory].border,
          "bg-card"
        )}>
          <div className="flex items-baseline gap-2">
            <span className={cn("font-semibold", TONE_STYLES[selectedCategory].text)}>
              {TONE_STYLES[selectedCategory].label}
            </span>
            <span className="text-muted-foreground/60 italic">
              Hyland (2005): {CATEGORY_INFO[selectedCategory].hylandTerm}
            </span>
          </div>
          <p className="text-muted-foreground">{CATEGORY_INFO[selectedCategory].detail}</p>
          <p className="text-muted-foreground/60 italic border-t border-parchment/30 pt-1.5">
            {CATEGORY_INFO[selectedCategory].origin}
          </p>
        </div>
      )}

      {/* Text */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 leading-relaxed whitespace-pre-wrap"
        style={{ fontSize, fontFamily }}
      >
        {tokens.map(({ token, category }, i) => {
          if (category === "neutral" || hiddenCategories.includes(category)) {
            return <span key={i}>{token}</span>;
          }
          const style = TONE_STYLES[category];
          return (
            <span
              key={i}
              className={cn(
                "rounded-sm px-0.5 cursor-help underline decoration-dotted decoration-1 underline-offset-2",
                style.bg, style.text
              )}
              onMouseEnter={(e) => handleMouseEnter(e, i)}
              onMouseLeave={handleMouseLeave}
            >
              {token}
            </span>
          );
        })}
      </div>

      {/* Footer: tone balance bar */}
      {total > 0 && (
        <div className="px-4 py-2 border-t border-parchment/30 bg-cream/20">
          <div className="text-[10px] text-muted-foreground mb-1">Register balance</div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted/20">
            {ACTIVE_CATEGORIES.map(cat => counts[cat] > 0 && (
              <div
                key={cat}
                className={TONE_STYLES[cat].bar}
                style={{ width: `${(counts[cat] / total) * 100}%` }}
                title={`${TONE_STYLES[cat].label}: ${counts[cat]}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-1 text-[9px] text-muted-foreground/70">
            {ACTIVE_CATEGORIES.map(cat => counts[cat] > 0 && (
              <span key={cat} className={TONE_STYLES[cat].text}>
                {Math.round((counts[cat] / total) * 100)}% {TONE_STYLES[cat].label.toLowerCase()}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Floating tooltip */}
      {tooltip !== null && tooltipContent !== null && (
        <div
          className={cn(
            "fixed z-50 w-72 bg-popover border rounded-sm shadow-lg p-3 pointer-events-none",
            tooltipContent.style.border
          )}
          style={{
            left: Math.min(Math.max(tooltip.x - 144, 8), window.innerWidth - 296),
            ...(tooltip.above
              ? { bottom: window.innerHeight - tooltip.y + 6 }
              : { top: tooltip.y + 6 }),
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", tooltipContent.style.bg, tooltipContent.style.text)}>
              {tooltipContent.style.label}
            </span>
            {tooltipContent.freq > 1 && (
              <span className="text-[10px] text-muted-foreground">
                appears {tooltipContent.freq}× in this output
              </span>
            )}
          </div>
          <div className="font-mono text-[10px] bg-muted/30 rounded px-2 py-1.5 mb-2 leading-relaxed break-words">
            <span className="text-muted-foreground">{tooltipContent.contextBefore}</span>
            <span className={cn("font-bold px-0.5 rounded", tooltipContent.style.bg, tooltipContent.style.text)}>
              {tooltipContent.entry.token}
            </span>
            <span className="text-muted-foreground">{tooltipContent.contextAfter}</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed mb-1.5">
            {tooltipContent.style.description}
          </p>
          {tooltipContent.note && (
            <p className="text-[10px] text-muted-foreground/70 leading-relaxed italic border-t border-parchment/40 pt-1.5">
              {tooltipContent.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
