"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { computeTokenEntropy } from "@/lib/metrics/text-metrics";
import type { TokenLogprob } from "@/types/analysis";

interface TokenHeatmapProps {
  tokens: TokenLogprob[];
  isDark: boolean;
  /** When provided the component runs in controlled mode — external index drives the detail panel */
  controlledIndex?: number | null;
  onControlledIndexChange?: (i: number) => void;
  secondControlledIndex?: number | null;
  onSecondControlledIndexChange?: (i: number | null) => void;
  /** The other panel's tokens — used to show divergence notes in compare mode */
  siblingTokens?: TokenLogprob[] | null;
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

// ---- Detail panel sub-component ----

function TokenDetailPanel({
  activeToken,
  activeIndex,
  tokens,
  siblingTokens,
  label,
  isControlled,
  pinnedIndex,
}: {
  activeToken: TokenLogprob;
  activeIndex: number;
  tokens: TokenLogprob[];
  siblingTokens?: TokenLogprob[] | null;
  label?: string;
  isControlled: boolean;
  pinnedIndex: number | null;
}) {
  const entropy = computeTokenEntropy(activeToken);
  const chosenProb = Math.exp(activeToken.logprob);
  const siblingToken = siblingTokens?.[activeIndex] ?? null;
  const diverged = siblingToken && siblingToken.token !== activeToken.token;
  const notes: { color: string; text: string }[] = [];

  if (diverged && siblingToken) {
    const inAlts = activeToken.topAlternatives.some(a => a.token === siblingToken.token);
    notes.push({
      color: "text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30",
      text: `↔ Divergence point. The other panel chose "${siblingToken.token.trim()}" here; this panel chose "${activeToken.token.trim()}". ${inAlts ? "Both tokens were in each other's top alternatives — sampling chose differently at t>0, causing the outputs to branch from this position." : "The two panels made different lexical choices here, sending their continuations in different directions."}`,
    });
  }

  if (entropy > 2.0) {
    notes.push({
      color: "text-red-700 dark:text-red-400 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30",
      text: `High entropy (${entropy.toFixed(2)} bits): the model had no strong preference at this position — probability was spread across many alternatives. This is where stochastic sampling has the most impact; different runs will often choose differently here.`,
    });
  } else if (entropy > 1.2) {
    notes.push({
      color: "text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30",
      text: `Moderate uncertainty (${entropy.toFixed(2)} bits): several tokens were plausible here. At temperature > 0 the model samples from this distribution rather than always picking the most likely token.`,
    });
  }

  if (chosenProb < 0.5 && !diverged) {
    notes.push({
      color: "text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30",
      text: `The chosen token had only ${(chosenProb * 100).toFixed(1)}% probability — a less likely alternative was sampled. This is normal at temperature ≥ 1.0 and reflects genuine model uncertainty, not an error.`,
    });
  }

  const chosen = { token: activeToken.token, logprob: activeToken.logprob };
  const alternatives = activeToken.topAlternatives;
  const allEntries = [chosen, ...alternatives];
  const maxProb = Math.exp(chosen.logprob);
  const totalShown = allEntries.reduce((s, e) => s + Math.exp(e.logprob), 0);
  const otherPct = Math.max(0, 100 - totalShown * 100);

  return (
    <div className="bg-card border border-parchment rounded-sm shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-parchment/50 bg-cream/30">
        {label && (
          <div className="text-[9px] uppercase tracking-wide text-muted-foreground/50 mb-0.5">{label}</div>
        )}
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
              {entropy.toFixed(3)} bits
            </span>
          </span>
          <span className="text-caption text-muted-foreground">
            Chosen:{" "}
            <span className="font-mono text-foreground font-semibold">
              {(chosenProb * 100).toFixed(2)}%
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
      </div>

      {/* Explanatory notes */}
      {notes.length > 0 && (
        <div className="px-3 pb-3 space-y-1.5">
          {notes.map((n, i) => (
            <p key={i} className={`text-[10px] leading-relaxed px-2 py-1.5 rounded border ${n.color}`}>
              {n.text}
            </p>
          ))}
        </div>
      )}

      {!isControlled && pinnedIndex !== null && (
        <p className="text-[10px] text-muted-foreground/60 px-3 pb-2">
          Click the token again to unpin. ⌘/Ctrl+click to compare two tokens.
        </p>
      )}
    </div>
  );
}

// ---- Main component ----

export function TokenHeatmap({
  tokens,
  isDark,
  controlledIndex,
  onControlledIndexChange,
  secondControlledIndex,
  onSecondControlledIndexChange,
  siblingTokens,
}: TokenHeatmapProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [internalPinned, setInternalPinned] = useState<number | null>(null);
  const [internalSecond, setInternalSecond] = useState<number | null>(null);

  const isControlled = controlledIndex !== undefined;
  const pinnedIndex = isControlled ? controlledIndex : internalPinned;
  const secondIndex = isControlled ? (secondControlledIndex ?? null) : internalSecond;
  const activeIndex = pinnedIndex ?? hoveredIndex;
  const activeToken = activeIndex !== null ? tokens[activeIndex] : null;
  const secondToken = secondIndex !== null ? tokens[secondIndex] : null;

  const handleClick = (i: number, e: React.MouseEvent) => {
    const isModifier = e.metaKey || e.ctrlKey;
    if (isControlled) {
      if (isModifier) {
        // Toggle second selection
        onSecondControlledIndexChange?.(secondIndex === i ? null : i);
      } else {
        onControlledIndexChange?.(i);
        // Clear second on plain click
        onSecondControlledIndexChange?.(null);
      }
    } else {
      if (isModifier) {
        setInternalSecond(prev => prev === i ? null : i);
      } else {
        setInternalPinned(prev => prev === i ? null : i);
        setInternalSecond(null);
      }
    }
  };

  return (
    <div className="flex gap-4 items-start px-4 py-4">
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
                activeIndex === i && "ring-2 ring-burgundy",
                secondIndex === i && "ring-2 ring-purple-500"
              )}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
              onClick={(e) => handleClick(i, e)}
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
          <span className="text-muted-foreground/50 ml-2">⌘/Ctrl+click to pin a second token</span>
        </div>
      </div>

      {/* Right: detail panel(s) */}
      <div className="w-72 shrink-0 sticky top-4 self-start space-y-2">
        {activeToken !== null && activeIndex !== null ? (
          <TokenDetailPanel
            activeToken={activeToken}
            activeIndex={activeIndex}
            tokens={tokens}
            siblingTokens={siblingTokens}
            label={secondToken ? "Primary selection" : undefined}
            isControlled={isControlled}
            pinnedIndex={pinnedIndex}
          />
        ) : (
          <div className="bg-card border border-parchment rounded-sm shadow-sm overflow-hidden">
            <div className="p-6 text-center">
              <div className="text-caption text-muted-foreground/50 mb-1">Token analysis</div>
              <p className="text-[10px] text-muted-foreground/40 leading-relaxed">
                Hover or click to inspect a token. ⌘/Ctrl+click to compare two positions.
              </p>
            </div>
          </div>
        )}

        {secondToken !== null && secondIndex !== null ? (
          <TokenDetailPanel
            activeToken={secondToken}
            activeIndex={secondIndex}
            tokens={tokens}
            siblingTokens={siblingTokens}
            label="Second selection (⌘/Ctrl+click)"
            isControlled={isControlled}
            pinnedIndex={secondIndex}
          />
        ) : activeToken !== null && pinnedIndex !== null ? (
          /* Ghost slot — shown when a token is pinned but no second selected yet */
          <div className="bg-card/40 border border-dashed border-parchment/60 rounded-sm overflow-hidden">
            <div className="p-4 text-center">
              <div className="text-[10px] text-muted-foreground/30 font-mono mb-1">⌘ / Ctrl + click</div>
              <p className="text-[10px] text-muted-foreground/30 leading-relaxed">
                Pin a second token to compare two positions side by side
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
