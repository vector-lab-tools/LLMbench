"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { TokenLogprob } from "@/types/analysis";

interface TokenHeatmapProps {
  tokens: TokenLogprob[];
  isDark: boolean;
}

function logprobToColor(logprob: number, isDark: boolean): string {
  // logprob is negative; closer to 0 = higher confidence
  // Map to a 0-1 scale where 0 = certain, 1 = very uncertain
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
            title={`p=${Math.exp(token.logprob).toFixed(4)} (logprob=${token.logprob.toFixed(3)})`}
          >
            {token.token}
          </span>
        ))}
      </div>

      {/* Tooltip/detail for active token */}
      {activeIndex !== null && tokens[activeIndex] && (
        <div className="bg-card border border-parchment rounded-sm p-4 shadow-sm">
          <div className="flex items-center gap-4 mb-3">
            <div>
              <span className="text-caption text-muted-foreground">Token</span>
              <div className="text-body-sm font-mono font-bold text-foreground">
                &ldquo;{tokens[activeIndex].token}&rdquo;
              </div>
            </div>
            <div>
              <span className="text-caption text-muted-foreground">Probability</span>
              <div className="text-body-sm font-mono text-foreground tabular-nums">
                {(Math.exp(tokens[activeIndex].logprob) * 100).toFixed(2)}%
              </div>
            </div>
            <div>
              <span className="text-caption text-muted-foreground">Log Prob</span>
              <div className="text-body-sm font-mono text-foreground tabular-nums">
                {tokens[activeIndex].logprob.toFixed(4)}
              </div>
            </div>
            <div>
              <span className="text-caption text-muted-foreground">Position</span>
              <div className="text-body-sm font-mono text-foreground tabular-nums">
                {activeIndex + 1} / {tokens.length}
              </div>
            </div>
          </div>

          {/* Top alternatives */}
          {tokens[activeIndex].topAlternatives.length > 0 && (
            <div>
              <span className="text-caption text-muted-foreground">Alternative tokens (the dice not rolled):</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {tokens[activeIndex].topAlternatives.map((alt, j) => (
                  <div key={j} className="bg-muted/50 rounded px-2 py-1 text-caption">
                    <span className="font-mono text-foreground">&ldquo;{alt.token}&rdquo;</span>
                    <span className="text-muted-foreground ml-1.5">
                      {(Math.exp(alt.logprob) * 100).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
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
      </div>
    </div>
  );
}
