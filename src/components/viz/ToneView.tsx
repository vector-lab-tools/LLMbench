"use client";

import { useMemo } from "react";
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
  "rarely", "seldom", "nothing", "nobody", "nowhere", "none", "nor",
  "scarcely", "lack", "lacks", "lacking", "absent", "fail", "fails",
  "impossible", "unable", "cannot", "can't", "won't", "don't", "doesn't",
  "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't",
]);

type ToneCategory = "hedging" | "confident" | "negation" | "neutral";

interface ToneViewProps {
  text: string;
  fontSize: number;
  fontFamily: string;
  isDark: boolean;
}

const TONE_STYLES: Record<ToneCategory, { bg: string; text: string; label: string; description: string }> = {
  hedging: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-800 dark:text-blue-300",
    label: "Hedging",
    description: "Epistemic uncertainty — the model is qualifying its confidence",
  },
  confident: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-800 dark:text-emerald-300",
    label: "Confident",
    description: "Assertive language — the model is stating something as certain",
  },
  negation: {
    bg: "bg-orange-100 dark:bg-orange-900/40",
    text: "text-orange-800 dark:text-orange-300",
    label: "Negation",
    description: "Negative framing — the model is denying or excluding",
  },
  neutral: { bg: "", text: "", label: "", description: "" },
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
  const { tokens, counts } = useMemo(() => {
    const tokens = [...text.matchAll(/[a-zA-Z'-]+|[^a-zA-Z'-]+/g)].map(m => ({
      token: m[0],
      category: classifyWord(m[0]),
    }));
    const counts = { hedging: 0, confident: 0, negation: 0 };
    for (const { category } of tokens) {
      if (category !== "neutral") counts[category]++;
    }
    return { tokens, counts };
  }, [text]);

  const total = counts.hedging + counts.confident + counts.negation;

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
            {total} marked ({counts.hedging} / {counts.confident} / {counts.negation})
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
              className={cn("rounded-sm px-0.5", style.bg, style.text)}
              title={`${style.label}: ${style.description}`}
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
              <div
                className="bg-blue-400/60 dark:bg-blue-600/60 transition-all"
                style={{ width: `${(counts.hedging / total) * 100}%` }}
                title={`Hedging: ${counts.hedging}`}
              />
            )}
            {counts.confident > 0 && (
              <div
                className="bg-emerald-400/60 dark:bg-emerald-600/60 transition-all"
                style={{ width: `${(counts.confident / total) * 100}%` }}
                title={`Confident: ${counts.confident}`}
              />
            )}
            {counts.negation > 0 && (
              <div
                className="bg-orange-400/60 dark:bg-orange-600/60 transition-all"
                style={{ width: `${(counts.negation / total) * 100}%` }}
                title={`Negation: ${counts.negation}`}
              />
            )}
          </div>
          <div className="flex gap-3 mt-1 text-[9px] text-muted-foreground/70">
            <span className="text-blue-600 dark:text-blue-400">{Math.round((counts.hedging / total) * 100)}% hedging</span>
            <span className="text-emerald-600 dark:text-emerald-400">{Math.round((counts.confident / total) * 100)}% confident</span>
            <span className="text-orange-600 dark:text-orange-400">{Math.round((counts.negation / total) * 100)}% negation</span>
          </div>
        </div>
      )}
    </div>
  );
}
