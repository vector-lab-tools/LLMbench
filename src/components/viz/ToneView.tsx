"use client";

import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

// Hedging / epistemic uncertainty language
const HEDGING = new Set([
  "might", "may", "could", "perhaps", "possibly", "probably", "likely",
  "arguably", "seems", "seem", "appear", "appears", "seemingly",
  "apparently", "suggest", "suggests", "indicate", "indicates",
  "somewhat", "rather", "relatively", "generally", "often", "sometimes",
  "tend", "tends", "usually", "typically", "approximately", "roughly",
  "partially", "essentially", "virtually", "presumably", "supposedly",
  "allegedly", "conceivably", "potentially", "theoretically",
]);

// Confident / assertive language
const CONFIDENT = new Set([
  "clearly", "obviously", "certainly", "definitely", "undoubtedly",
  "absolutely", "always", "must", "will", "shall", "inevitably",
  "unquestionably", "indisputably", "evidently", "plainly", "surely",
  "necessarily", "demonstrably", "explicitly", "precisely", "exactly",
  "crucially", "fundamentally", "importantly", "significantly",
  "decisively", "directly", "conclusively",
]);

// Negation
const NEGATION = new Set([
  "not", "no", "never", "neither", "nor", "without", "hardly", "barely",
  "rarely", "seldom", "nothing", "nobody", "nowhere", "none",
  "scarcely", "lack", "lacks", "lacking", "absent", "fail", "fails",
  "impossible", "unable", "cannot", "can't", "won't", "don't", "doesn't",
  "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't",
]);

// Linguistic notes for each word — shown in tooltip
const WORD_NOTES: Record<string, string> = {
  // Hedging
  "might": "Modal verb expressing possibility without commitment.",
  "may": "Modal verb expressing permission or possibility.",
  "could": "Modal expressing contingent possibility.",
  "perhaps": "Adverb signalling the speaker is not asserting with certainty.",
  "possibly": "Weaker than 'probably' — the speaker acknowledges doubt.",
  "probably": "Likely but not certain; signals epistemic reservation.",
  "likely": "Probable but hedged; avoids outright assertion.",
  "arguably": "Invites the reader to accept the claim on its merits rather than asserting it as fact.",
  "seems": "Evidential hedge — based on appearances, not certainty.",
  "appear": "Evidential hedge similar to 'seems'.",
  "appears": "Evidential hedge — inferred, not asserted.",
  "seemingly": "Qualifies a claim as appearing true without guaranteeing it.",
  "apparently": "Based on available evidence; signals indirect knowledge.",
  "suggest": "Weaker than 'show' or 'prove' — the evidence is incomplete.",
  "suggests": "Evidential hedge used to avoid overclaiming from data.",
  "indicate": "Points toward a conclusion without asserting it.",
  "indicates": "Signals evidence without claiming certainty.",
  "somewhat": "Scalar hedge — reduces the force of what follows.",
  "rather": "Scalar modifier softening a claim.",
  "relatively": "Frames the claim as contextual, not absolute.",
  "generally": "Signals the claim holds in most but not all cases.",
  "often": "Frequency hedge — true frequently but not always.",
  "sometimes": "Weaker frequency hedge; allows for exceptions.",
  "tend": "Dispositional hedge — a tendency, not a rule.",
  "tends": "Dispositional hedge.",
  "usually": "High-frequency hedge leaving room for exceptions.",
  "typically": "Signals a norm while allowing deviation.",
  "approximately": "Signals numerical imprecision.",
  "roughly": "Informal numerical hedge.",
  "potentially": "Marks possibility without asserting actuality.",
  "theoretically": "Claims valid in theory; may not hold in practice.",
  "presumably": "Based on reasonable assumption rather than direct knowledge.",
  // Confident
  "clearly": "Presupposes the claim is self-evident — often rhetorical.",
  "obviously": "Strong presupposition; can imply the reader should already agree.",
  "certainly": "Asserts truth without qualification.",
  "definitely": "Emphatic assertion of certainty.",
  "undoubtedly": "Eliminates the possibility of doubt — strong claim.",
  "absolutely": "Emphatic intensifier; admits no qualification.",
  "always": "Universal quantifier — a very strong claim.",
  "must": "Deontic or epistemic necessity — no alternative admitted.",
  "will": "Asserts a future state as certain.",
  "shall": "Formal assertion of future certainty or obligation.",
  "inevitably": "Claims the outcome is logically or causally forced.",
  "evidently": "Presupposes visibility of evidence — sometimes rhetorical.",
  "plainly": "Signals the claim is unmistakably true.",
  "surely": "Invites agreement by presupposing shared belief.",
  "necessarily": "Claims logical or causal entailment.",
  "explicitly": "The claim is stated outright rather than inferred.",
  "precisely": "Claims exactness — strong factual assertion.",
  "exactly": "Asserts complete accuracy.",
  "crucially": "Marks the claim as load-bearing for the argument.",
  "fundamentally": "Claims the point is basic and non-negotiable.",
  "significantly": "Asserts importance or magnitude without qualification.",
  // Negation
  "not": "Grammatical negation — inverts the truth value of what follows.",
  "no": "Absolute negation of quantity or existence.",
  "never": "Temporal universal negation — no exceptions admitted.",
  "neither": "Negates both of two alternatives.",
  "nor": "Extends a negation to an additional item.",
  "without": "Negates the presence or use of something.",
  "hardly": "Near-negation — almost none or almost never.",
  "barely": "Near-negation — only just; very little.",
  "rarely": "Near-negation by frequency — exceptions exist but are uncommon.",
  "seldom": "Formal near-negation by frequency.",
  "nothing": "Absolute negation of content or existence.",
  "nobody": "Absolute negation of persons.",
  "nowhere": "Absolute negation of place.",
  "none": "Negates all members of a set.",
  "scarcely": "Near-negation — only just; implies near-absence.",
  "lack": "Asserts the absence of something.",
  "lacks": "Third-person assertion of absence.",
  "lacking": "Ongoing absence.",
  "absent": "Formal negation of presence.",
  "fail": "Asserts non-achievement.",
  "fails": "Third-person assertion of non-achievement.",
  "impossible": "Absolute negation of possibility.",
  "unable": "Negates capacity.",
  "cannot": "Negates ability or permission.",
};

type ToneCategory = "hedging" | "confident" | "negation" | "neutral";

interface TokenEntry {
  token: string;
  category: ToneCategory;
  clean: string;
  wordIndex: number; // position among word tokens only
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

const TONE_STYLES: Record<ToneCategory, { bg: string; text: string; border: string; label: string; description: string }> = {
  hedging: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-800 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-700",
    label: "Hedging",
    description: "Epistemic uncertainty — the model is qualifying its confidence rather than asserting outright.",
  },
  confident: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-700",
    label: "Confident",
    description: "Assertive language — the model is stating something as certain or self-evident.",
  },
  negation: {
    bg: "bg-orange-100 dark:bg-orange-900/40",
    text: "text-orange-800 dark:text-orange-300",
    border: "border-orange-300 dark:border-orange-700",
    label: "Negation",
    description: "Negative framing — the model is denying, excluding, or asserting absence.",
  },
  neutral: { bg: "", text: "", border: "", label: "", description: "" },
};

function classifyWord(word: string): ToneCategory {
  const clean = word.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
  if (!clean) return "neutral";
  if (HEDGING.has(clean)) return "hedging";
  if (CONFIDENT.has(clean)) return "confident";
  if (NEGATION.has(clean)) return "negation";
  return "neutral";
}

export function ToneView({ text, fontSize, fontFamily, isDark }: ToneViewProps) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { tokens, counts, frequencyMap, totalWords } = useMemo(() => {
    let wordIndex = 0;
    const tokens: TokenEntry[] = [...text.matchAll(/[a-zA-Z'-]+|[^a-zA-Z'-]+/g)].map(m => {
      const token = m[0];
      const isWord = /[a-zA-Z]/.test(token);
      const clean = token.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
      const category = classifyWord(token);
      const entry: TokenEntry = { token, category, clean, wordIndex: isWord ? wordIndex : wordIndex };
      if (isWord) wordIndex++;
      return entry;
    });
    const totalWords = wordIndex;

    const counts = { hedging: 0, confident: 0, negation: 0 };
    const frequencyMap = new Map<string, number>();
    for (const { category, clean } of tokens) {
      if (category !== "neutral" && clean) {
        counts[category]++;
        frequencyMap.set(clean, (frequencyMap.get(clean) || 0) + 1);
      }
    }
    return { tokens, counts, frequencyMap, totalWords };
  }, [text]);

  const total = counts.hedging + counts.confident + counts.negation;

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLSpanElement>, index: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const above = rect.top > window.innerHeight / 2;
    setTooltip({ index, x: rect.left + rect.width / 2, y: above ? rect.top : rect.bottom, above });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  // Build tooltip content
  const tooltipContent = tooltip !== null ? (() => {
    const entry = tokens[tooltip.index];
    if (!entry || entry.category === "neutral") return null;
    const style = TONE_STYLES[entry.category];
    const freq = frequencyMap.get(entry.clean) || 1;
    const note = WORD_NOTES[entry.clean];

    // Context: up to 6 tokens before and after (raw tokens, preserve spaces)
    const before = tokens.slice(Math.max(0, tooltip.index - 8), tooltip.index).map(t => t.token).join("");
    const after = tokens.slice(tooltip.index + 1, tooltip.index + 9).map(t => t.token).join("");
    const contextBefore = before.length > 40 ? "…" + before.slice(-40) : (tooltip.index > 0 ? "…" : "") + before;
    const contextAfter = after.length > 40 ? after.slice(0, 40) + "…" : after + (tooltip.index < tokens.length - 1 ? "…" : "");

    return { entry, style, freq, note, contextBefore, contextAfter };
  })() : null;

  return (
    <div className="flex flex-col h-full">
      {/* Legend bar */}
      <div className="px-4 py-1.5 border-b border-parchment/30 flex flex-wrap items-center gap-4 text-[10px] bg-cream/20">
        <span className="text-muted-foreground font-medium">Register view</span>
        {(["hedging", "confident", "negation"] as const).map(cat => (
          <span key={cat} className="flex items-center gap-1.5">
            <span className={cn("px-1.5 py-0.5 rounded text-[10px]", TONE_STYLES[cat].bg, TONE_STYLES[cat].text)}>
              {TONE_STYLES[cat].label}
            </span>
            <span className="text-muted-foreground">{counts[cat]}</span>
          </span>
        ))}
        {total > 0 && (
          <span className="text-muted-foreground ml-auto">
            {total} marked of {totalWords} words
          </span>
        )}
      </div>

      {/* Text */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 leading-relaxed whitespace-pre-wrap"
        style={{ fontSize, fontFamily }}
      >
        {tokens.map(({ token, category }, i) => {
          if (category === "neutral") return <span key={i}>{token}</span>;
          const style = TONE_STYLES[category];
          return (
            <span
              key={i}
              className={cn("rounded-sm px-0.5 cursor-help underline decoration-dotted decoration-1 underline-offset-2", style.bg, style.text)}
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
          <div className="text-[10px] text-muted-foreground mb-1">Tone balance</div>
          <div className="flex h-2 rounded-full overflow-hidden bg-muted/20">
            {counts.hedging > 0 && (
              <div className="bg-blue-400/60 dark:bg-blue-600/60" style={{ width: `${(counts.hedging / total) * 100}%` }} />
            )}
            {counts.confident > 0 && (
              <div className="bg-emerald-400/60 dark:bg-emerald-600/60" style={{ width: `${(counts.confident / total) * 100}%` }} />
            )}
            {counts.negation > 0 && (
              <div className="bg-orange-400/60 dark:bg-orange-600/60" style={{ width: `${(counts.negation / total) * 100}%` }} />
            )}
          </div>
          <div className="flex gap-3 mt-1 text-[9px] text-muted-foreground/70">
            <span className="text-blue-600 dark:text-blue-400">{Math.round((counts.hedging / total) * 100)}% hedging</span>
            <span className="text-emerald-600 dark:text-emerald-400">{Math.round((counts.confident / total) * 100)}% confident</span>
            <span className="text-orange-600 dark:text-orange-400">{Math.round((counts.negation / total) * 100)}% negation</span>
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
            ...(tooltipContent ? (tooltip.above
              ? { bottom: window.innerHeight - tooltip.y + 6 }
              : { top: tooltip.y + 6 }
            ) : {}),
          }}
        >
          {/* Category header */}
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

          {/* Context window */}
          <div className="font-mono text-[10px] bg-muted/30 rounded px-2 py-1.5 mb-2 leading-relaxed break-words">
            <span className="text-muted-foreground">{tooltipContent.contextBefore}</span>
            <span className={cn("font-bold px-0.5 rounded", tooltipContent.style.bg, tooltipContent.style.text)}>
              {tooltipContent.entry.token}
            </span>
            <span className="text-muted-foreground">{tooltipContent.contextAfter}</span>
          </div>

          {/* Category description */}
          <p className="text-[10px] text-muted-foreground leading-relaxed mb-1.5">
            {tooltipContent.style.description}
          </p>

          {/* Per-word linguistic note */}
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
