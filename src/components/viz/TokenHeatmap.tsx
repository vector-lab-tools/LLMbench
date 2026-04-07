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
    <div className="flex gap-4 items-start">
      {/* Left: heatmap text */}
      <div className="flex-1 min-w-0">
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

        {/* Legend */}
        <div className="flex items-center gap-3 text-caption text-muted-foreground mt-4">
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
        </div>
      </div>

      {/* Right: detail panel — always visible */}
      <div className="w-72 shrink-0 sticky top-4 self-start">
        <div className="bg-card border border-parchment rounded-sm shadow-sm overflow-hidden">
          {activeToken !== null && activeIndex !== null ? (
            <>
              {/* Header */}
              <div className="px-3 py-2 border-b border-parchment/50 bg-cream/30">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span className="text-caption text-muted-foreground">
                    Position{" "}
                    <span className="font-mono text-foreground font-semibold">
                      {activeIndex + 1}
                    </span>
                    <span className="text-muted-foreground/60"> / {tokens.length}</span>
                  </span>
                  <span className="text-caption text-muted-foreground">
                    Entropy:{" "}
                    <span className="font-mono text-foreground font-semibold">
                      {computeTokenEntropy(activeToken).toFixed(3)} bits
                    </span>
                  </span>
                  <span className="text-caption text-muted-foreground">
                    Chosen:{" "}
                    <span className="font-mono text-foreground font-semibold">
                      {(Math.exp(activeToken.logprob) * 100).toFixed(2)}%
                    </span>
                  </span>
                </div>
                {/* Context window */}
                {(activeIndex > 0 || activeIndex < tokens.length - 1) && (
                  <p className="text-[10px] text-muted-foreground font-mono mt-1 truncate">
                    …{tokens.slice(Math.max(0, activeIndex - 3), activeIndex).map(t => t.token).join("")}
                    <span className="text-burgundy font-bold">[{activeToken.token}]</span>
                    {tokens.slice(activeIndex + 1, activeIndex + 4).map(t => t.token).join("")}…
                  </p>
                )}
              </div>

              {/* Probability bar chart */}
              <div className="p-3 space-y-1">
                <div className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wide">
                  Probability distribution
                </div>
                {(() => {
                  const chosen = { token: activeToken.token, logprob: activeToken.logprob };
                  const alternatives = activeToken.topAlternatives;
                  const allEntries = [chosen, ...alternatives];
                  const maxProb = Math.exp(chosen.logprob);
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
                            "flex items-center gap-1.5 rounded-sm px-1.5 py-1",
                            isChosen ? "bg-burgundy/8" : "hover:bg-cream/50"
                          )}>
                            <span className="text-[10px] text-muted-foreground w-3 tabular-nums text-right shrink-0">
                              {j + 1}
                            </span>
                            <span className={cn(
                              "text-[10px] font-mono w-20 truncate shrink-0",
                              isChosen ? "text-burgundy font-semibold" : "text-foreground"
                            )}>
                              &ldquo;{entry.token || "\\n"}&rdquo;
                            </span>
                            <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden min-w-0">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  isChosen ? "bg-burgundy/60" : "bg-muted-foreground/30"
                                )}
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground w-10 text-right shrink-0">
                              {(prob * 100).toFixed(2)}%
                            </span>
                          </div>
                        );
                      })}
                      {otherPct > 0.5 && (
                        <div className="flex items-center gap-1.5 px-1.5 py-1 text-[10px] text-muted-foreground/60">
                          <span className="w-3 shrink-0" />
                          <span className="font-mono w-20 shrink-0 italic">other</span>
                          <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-muted-foreground/15"
                              style={{ width: `${(otherPct / 100 / maxProb) * 100}%` }}
                            />
                          </div>
                          <span className="w-10 text-right shrink-0 tabular-nums">
                            {otherPct.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {pinnedIndex !== null && (
                <p className="text-[10px] text-muted-foreground/60 px-3 pb-2">
                  Click the token again to unpin.
                </p>
              )}
            </>
          ) : (
            /* Placeholder when nothing is selected */
            <div className="p-6 text-center">
              <div className="text-caption text-muted-foreground/50 mb-1">Token analysis</div>
              <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                Hover over a token to preview its probability distribution, or click to pin it here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
