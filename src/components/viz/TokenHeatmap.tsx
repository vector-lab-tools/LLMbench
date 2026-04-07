"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { computeTokenEntropy } from "@/lib/metrics/text-metrics";
import type { TokenLogprob } from "@/types/analysis";

interface TokenHeatmapProps {
  tokens: TokenLogprob[];
  isDark: boolean;
}

function logprobToColor(logprob: number, isDark: boolean): string {
  const uncertainty = Math.min(1, Math.abs(logprob) / 5);

  if (isDark) {
    if (uncertainty < 0.1) return "bg-slate-700/30";
    if (uncertainty < 0.3) return "bg-blue-900/40";
    if (uncertainty < 0.5) return "bg-yellow-900/40";
    if (uncertainty < 0.7) return "bg-orange-900/50";
    return "bg-red-900/60";
  }

  if (uncertainty < 0.1) return "bg-slate-100";
  if (uncertainty < 0.3) return "bg-blue-100";
  if (uncertainty < 0.5) return "bg-yellow-100";
  if (uncertainty < 0.7) return "bg-orange-200";
  return "bg-red-200";
}

function logprobToTextColor(logprob: number, isDark: boolean): string {
  const uncertainty = Math.min(1, Math.abs(logprob) / 5);

  if (isDark) {
    if (uncertainty < 0.3) return "text-slate-300";
    if (uncertainty < 0.5) return "text-yellow-300";
    if (uncertainty < 0.7) return "text-orange-300";
    return "text-red-300";
  }

  if (uncertainty < 0.3) return "text-slate-700";
  if (uncertainty < 0.5) return "text-yellow-800";
  if (uncertainty < 0.7) return "text-orange-800";
  return "text-red-800";
}

export function TokenHeatmap({ tokens, isDark }: TokenHeatmapProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState<number | null>(null);

  const activeIndex = pinnedIndex ?? hoveredIndex;

  const activeToken = activeIndex !== null ? tokens[activeIndex] : null;

  return (
    <div className="space-y-4">
      {/* Heatmap text */}
      <div className="font-serif text-base leading-relaxed whitespace-pre-wrap">
        {tokens.map((token, i) => (
          <span
            key={i}
            className={cn(
              "cursor-pointer rounded-sm px-0.5 transition-all duration-100",
              logprobToColor(token.logprob, isDark),
              logprobToTextColor(token.logprob, isDark),
              activeIndex === i && "ring-2 ring-burgundy"
            )}
            onMouseEnter={() => setHoveredIndex(i)}
            onMouseLeave={() => setHoveredIndex(null)}
            onClick={() => setPinnedIndex(pinnedIndex === i ? null : i)}
          >
            {token.token}
          </span>
        ))}
      </div>

      {/* Detail panel for active token */}
      {activeToken !== null && activeIndex !== null && (
        <div className="bg-card border border-parchment rounded-sm p-4 shadow-sm">
          {/* Header row: position, entropy, context */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 pb-3 border-b border-parchment/50">
            <span className="text-caption text-muted-foreground">
              Position <span className="font-mono text-foreground">{activeIndex + 1}</span>
              <span className="text-muted-foreground/60"> / {tokens.length}</span>
            </span>
            <span className="text-caption text-muted-foreground">
              Entropy:{" "}
              <span className="font-mono text-foreground">
                {computeTokenEntropy(activeToken).toFixed(3)} bits
              </span>
            </span>
            <span className="text-caption text-muted-foreground">
              Chosen probability:{" "}
              <span className="font-mono text-foreground">
                {(Math.exp(activeToken.logprob) * 100).toFixed(2)}%
              </span>
            </span>
            {/* Context: up to 3 tokens before and after */}
            {(activeIndex > 0 || activeIndex < tokens.length - 1) && (
              <span className="text-caption text-muted-foreground font-mono">
                …{tokens.slice(Math.max(0, activeIndex - 3), activeIndex).map(t => t.token).join("")}
                <span className="text-burgundy font-bold not-italic">[{activeToken.token}]</span>
                {tokens.slice(activeIndex + 1, activeIndex + 4).map(t => t.token).join("")}…
              </span>
            )}
          </div>

          {/* Probability bar chart */}
          <div className="space-y-1.5">
            <div className="text-caption text-muted-foreground mb-2">
              Probability distribution — tokens not rolled:
            </div>
            {/* Chosen token first */}
            {(() => {
              const chosen = { token: activeToken.token, logprob: activeToken.logprob };
              const alternatives = activeToken.topAlternatives;
              const allEntries = [chosen, ...alternatives];
              const maxProb = Math.exp(chosen.logprob); // chosen is always highest
              const totalShown = allEntries.reduce((s, e) => s + Math.exp(e.logprob), 0);
              const otherPct = Math.max(0, 100 - totalShown * 100);

              return (
                <>
                  {allEntries.map((entry, j) => {
                    const prob = Math.exp(entry.logprob);
                    const barWidth = maxProb > 0 ? (prob / maxProb) * 100 : 0;
                    const isChosen = j === 0;
                    return (
                      <div key={j} className={cn(
                        "flex items-center gap-2 rounded-sm px-2 py-1",
                        isChosen ? "bg-burgundy/8" : "hover:bg-cream/50"
                      )}>
                        <span className="text-caption text-muted-foreground w-4 tabular-nums text-right shrink-0">
                          {j + 1}
                        </span>
                        <span className={cn(
                          "text-caption font-mono w-24 truncate shrink-0",
                          isChosen ? "text-burgundy font-semibold" : "text-foreground"
                        )}>
                          &ldquo;{entry.token || "\\n"}&rdquo;
                        </span>
                        {/* Bar */}
                        <div className="flex-1 h-3 bg-muted/40 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all",
                              isChosen ? "bg-burgundy/60" : "bg-muted-foreground/30"
                            )}
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="text-caption tabular-nums text-muted-foreground w-12 text-right shrink-0">
                          {(prob * 100).toFixed(2)}%
                        </span>
                        {isChosen && (
                          <span className="text-[10px] text-burgundy/70 shrink-0">chosen</span>
                        )}
                      </div>
                    );
                  })}
                  {otherPct > 0.5 && (
                    <div className="flex items-center gap-2 px-2 py-1 text-caption text-muted-foreground/60">
                      <span className="w-4 shrink-0" />
                      <span className="font-mono w-24 shrink-0 italic">other</span>
                      <div className="flex-1 h-3 bg-muted/20 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-muted-foreground/15"
                          style={{ width: `${(otherPct / 100 / maxProb) * 100}%` }}
                        />
                      </div>
                      <span className="w-12 text-right shrink-0 tabular-nums">
                        {otherPct.toFixed(1)}%
                      </span>
                      <span className="w-12 shrink-0" />
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {pinnedIndex !== null && (
            <p className="text-[10px] text-muted-foreground/60 mt-3">
              Click the token again to unpin, or click another token to switch.
            </p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <span>Confidence:</span>
        <div className="flex items-center gap-1">
          <span className={cn("w-4 h-3 rounded-sm", isDark ? "bg-slate-700/30" : "bg-slate-100")} />
          <span>High</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn("w-4 h-3 rounded-sm", isDark ? "bg-yellow-900/40" : "bg-yellow-100")} />
          <span>Medium</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn("w-4 h-3 rounded-sm", isDark ? "bg-red-900/60" : "bg-red-200")} />
          <span>Low</span>
        </div>
        <span className="text-muted-foreground/60 ml-2">
          Click a token to pin its probability distribution
        </span>
      </div>
    </div>
  );
}
