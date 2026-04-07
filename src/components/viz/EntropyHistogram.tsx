"use client";

import { useMemo } from "react";
import { computeTokenEntropy } from "@/lib/metrics/text-metrics";
import type { TokenLogprob } from "@/types/analysis";

interface EntropyHistogramProps {
  tokens: TokenLogprob[];
  isDark: boolean;
}

const BINS = [
  { label: "Very Low", max: 0.5, bg: "bg-slate-200 dark:bg-slate-700", text: "text-slate-600 dark:text-slate-300" },
  { label: "Low",      max: 1.0, bg: "bg-blue-200 dark:bg-blue-900",   text: "text-blue-700 dark:text-blue-300" },
  { label: "Medium",   max: 1.5, bg: "bg-yellow-200 dark:bg-yellow-900", text: "text-yellow-700 dark:text-yellow-300" },
  { label: "High",     max: 2.0, bg: "bg-orange-200 dark:bg-orange-900", text: "text-orange-700 dark:text-orange-300" },
  { label: "Very High",max: Infinity, bg: "bg-red-200 dark:bg-red-900", text: "text-red-700 dark:text-red-300" },
];

export function EntropyHistogram({ tokens }: EntropyHistogramProps) {
  const { counts, maxCount } = useMemo(() => {
    const entropies = tokens.map(computeTokenEntropy);
    const counts = BINS.map((bin, i) => {
      const min = i === 0 ? 0 : BINS[i - 1].max;
      return entropies.filter(e => e >= min && e < bin.max).length;
    });
    return { counts, maxCount: Math.max(...counts, 1) };
  }, [tokens]);

  const total = tokens.length;

  return (
    <div>
      <div className="text-caption font-medium text-muted-foreground mb-2">
        Entropy Distribution ({total} tokens)
      </div>
      <div className="flex items-end gap-2 h-20">
        {BINS.map((bin, i) => {
          const count = counts[i];
          const pct = total > 0 ? (count / total) * 100 : 0;
          const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
              {/* Count above bar */}
              <span className="text-[10px] tabular-nums text-muted-foreground leading-none">
                {count}
              </span>
              {/* Bar */}
              <div className="w-full flex items-end" style={{ height: "52px" }}>
                <div
                  className={`w-full rounded-t-sm transition-all ${bin.bg}`}
                  style={{ height: `${Math.max(height, count > 0 ? 4 : 0)}%` }}
                  title={`${bin.label}: ${count} tokens (${pct.toFixed(1)}%)`}
                />
              </div>
              {/* Percentage below bar */}
              <span className={`text-[10px] tabular-nums leading-none ${bin.text}`}>
                {pct.toFixed(0)}%
              </span>
              {/* Label */}
              <span className="text-[9px] text-muted-foreground/70 leading-none text-center truncate w-full text-center">
                {bin.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
