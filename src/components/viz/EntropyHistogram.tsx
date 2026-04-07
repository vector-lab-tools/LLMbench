"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { computeTokenEntropy } from "@/lib/metrics/text-metrics";
import type { TokenLogprob } from "@/types/analysis";

interface EntropyHistogramProps {
  tokens: TokenLogprob[];
  isDark: boolean;
}

const BINS = [
  {
    label: "Very Low",
    max: 0.5,
    bg: "bg-slate-200 dark:bg-slate-700",
    text: "text-slate-600 dark:text-slate-300",
    border: "border-slate-300 dark:border-slate-600",
    description: "The model was highly confident — only one or two tokens were even considered. These positions contributed almost no uncertainty to the output.",
    example: "Common function words, proper names mid-sentence, or strongly constrained grammatical positions.",
  },
  {
    label: "Low",
    max: 1.0,
    bg: "bg-blue-200 dark:bg-blue-900",
    text: "text-blue-700 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-800",
    description: "A small set of tokens competed, but one was clearly preferred. The model had a strong prior but acknowledged some alternatives.",
    example: "Adjective choices, topic-specific nouns, or verb tense selections.",
  },
  {
    label: "Medium",
    max: 1.5,
    bg: "bg-yellow-200 dark:bg-yellow-900",
    text: "text-yellow-700 dark:text-yellow-300",
    border: "border-yellow-300 dark:border-yellow-800",
    description: "Genuine competition between several plausible tokens. The model's choice here reflects real stylistic or semantic decisions.",
    example: "Synonyms with similar frequency, discourse markers, or structural choices like list vs. prose.",
  },
  {
    label: "High",
    max: 2.0,
    bg: "bg-orange-200 dark:bg-orange-900",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-300 dark:border-orange-800",
    description: "The model was uncertain across many options. These tokens represent moments where context was insufficient to strongly constrain the output.",
    example: "Open-ended continuations, topic transitions, or the first token of a new idea.",
  },
  {
    label: "Very High",
    max: Infinity,
    bg: "bg-red-200 dark:bg-red-900",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-300 dark:border-red-800",
    description: "Maximum uncertainty — probability spread nearly evenly across many tokens. The model was essentially guessing. High temperatures amplify this effect.",
    example: "Creative generation tasks, ambiguous pronouns, or positions after a highly unusual preceding token.",
  },
];

export function EntropyHistogram({ tokens }: EntropyHistogramProps) {
  const [selectedBin, setSelectedBin] = useState<number | null>(null);

  const { counts, maxCount, tokenEntropies } = useMemo(() => {
    const tokenEntropies = tokens.map(t => ({ token: t, entropy: computeTokenEntropy(t) }));
    const counts = BINS.map((bin, i) => {
      const min = i === 0 ? 0 : BINS[i - 1].max;
      return tokenEntropies.filter(({ entropy }) => entropy >= min && entropy < bin.max).length;
    });
    return { counts, maxCount: Math.max(...counts, 1), tokenEntropies };
  }, [tokens]);

  const total = tokens.length;

  const selectedBinTokens = selectedBin !== null
    ? (() => {
        const min = selectedBin === 0 ? 0 : BINS[selectedBin - 1].max;
        const max = BINS[selectedBin].max;
        return tokenEntropies
          .filter(({ entropy }) => entropy >= min && entropy < max)
          .sort((a, b) => b.entropy - a.entropy);
      })()
    : [];

  return (
    <div className="space-y-3">
      {/* Header + description */}
      <div>
        <div className="text-caption font-medium text-muted-foreground">
          Entropy Distribution{" "}
          <span className="font-normal text-muted-foreground/70">({total} tokens)</span>
        </div>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5 leading-relaxed">
          <span className="text-muted-foreground/80 font-medium">Entropy</span> measures how spread out the model&apos;s probability was across candidate tokens at each position.
          A language model does not simply pick the next word — it assigns a probability to every possible token and samples from that distribution.
          When one token has near-100% probability, entropy is close to zero (the model was certain).
          When probability is spread across many tokens, entropy is high (the model was genuinely undecided).
          Each bar below shows how many tokens in this response fell into a given certainty band.{" "}
          <span className="text-muted-foreground/80">Click a bar to see which tokens landed there.</span>
        </p>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-2 h-20">
        {BINS.map((bin, i) => {
          const count = counts[i];
          const pct = total > 0 ? (count / total) * 100 : 0;
          const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
          const isSelected = selectedBin === i;
          const isDisabled = count === 0;

          return (
            <button
              key={i}
              className={`flex-1 flex flex-col items-center gap-0.5 group transition-opacity ${
                isDisabled ? "opacity-40 cursor-default" : "cursor-pointer hover:opacity-80"
              }`}
              onClick={() => !isDisabled && setSelectedBin(isSelected ? null : i)}
              disabled={isDisabled}
              title={`${bin.label}: ${count} tokens (${pct.toFixed(1)}%) — click to explore`}
            >
              {/* Count above bar */}
              <span className={`text-[10px] tabular-nums leading-none ${isSelected ? bin.text : "text-muted-foreground"}`}>
                {count}
              </span>
              {/* Bar */}
              <div className="w-full flex items-end" style={{ height: "52px" }}>
                <div
                  className={`w-full rounded-t-sm transition-all ${bin.bg} ${
                    isSelected ? `ring-2 ring-offset-1 ${bin.border}` : ""
                  }`}
                  style={{ height: `${Math.max(height, count > 0 ? 4 : 0)}%` }}
                />
              </div>
              {/* Percentage */}
              <span className={`text-[10px] tabular-nums leading-none font-medium ${bin.text}`}>
                {pct.toFixed(0)}%
              </span>
              {/* Label */}
              <span className={`text-[9px] leading-none text-center truncate w-full ${
                isSelected ? bin.text : "text-muted-foreground/70"
              }`}>
                {bin.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Expanded detail panel when a bin is selected */}
      {selectedBin !== null && (
        <div className={`rounded-sm border p-3 ${BINS[selectedBin].border} bg-card`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <span className={`text-caption font-semibold ${BINS[selectedBin].text}`}>
                {BINS[selectedBin].label} Entropy
              </span>
              <span className="text-caption text-muted-foreground ml-2">
                {selectedBin === 0 ? "0 – 0.5 bits" :
                 selectedBin === 4 ? "2.0+ bits" :
                 `${BINS[selectedBin - 1].max.toFixed(1)} – ${BINS[selectedBin].max.toFixed(1)} bits`}
              </span>
            </div>
            <button
              onClick={() => setSelectedBin(null)}
              className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">
            {BINS[selectedBin].description}
          </p>
          <p className="text-[10px] text-muted-foreground/60 italic mb-3">
            Common examples: {BINS[selectedBin].example}
          </p>

          {/* Token list */}
          {selectedBinTokens.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wide">
                Tokens in this band — highest entropy first ({selectedBinTokens.length} total)
              </div>
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                {selectedBinTokens.slice(0, 60).map(({ token, entropy }, j) => (
                  <span
                    key={j}
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono ${BINS[selectedBin].bg} ${BINS[selectedBin].text}`}
                    title={`"${token.token}" — ${entropy.toFixed(3)} bits, chosen probability ${(Math.exp(token.logprob) * 100).toFixed(1)}%`}
                  >
                    <span className="max-w-[80px] truncate">{token.token || "↵"}</span>
                    <span className="opacity-60">{entropy.toFixed(2)}</span>
                  </span>
                ))}
                {selectedBinTokens.length > 60 && (
                  <span className="text-[10px] text-muted-foreground/50 self-center">
                    …and {selectedBinTokens.length - 60} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
