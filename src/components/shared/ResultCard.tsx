"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ResultCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  panel?: "A" | "B";
  children: ReactNode;
  footer?: ReactNode;
}

const PANEL_TINT = {
  A: "border-l-blue-400/50",
  B: "border-l-amber-400/50",
} as const;

export function ResultCard({ title, subtitle, badge, badgeColor, panel, children, footer }: ResultCardProps) {
  return (
    <div className={cn(
      "bg-card border border-parchment/50 rounded-sm overflow-hidden",
      panel && `border-l-2 ${PANEL_TINT[panel]}`
    )}>
      <div className="px-5 py-3 border-b border-parchment/30 flex items-center gap-3">
        <span className="text-body-sm font-medium text-foreground">{title}</span>
        {subtitle && (
          <span className="text-caption text-muted-foreground">{subtitle}</span>
        )}
        {badge && (
          <span className={cn(
            "ml-auto text-caption font-medium px-2 py-0.5 rounded-sm",
            badgeColor || "bg-cream text-muted-foreground"
          )}>
            {badge}
          </span>
        )}
      </div>
      <div className="px-5 py-4">
        {children}
      </div>
      {footer}
    </div>
  );
}

interface MetricBoxProps {
  label: string;
  value: string | number;
  unit?: string;
  tooltip?: string;
}

// Standard explanations for common metric labels
const METRIC_TOOLTIPS: Record<string, string> = {
  "Avg Vocabulary Diversity": "Ratio of unique words to total words. Higher values mean the model uses more varied language; lower values indicate repetition.",
  "Vocabulary Diversity": "Ratio of unique words to total words. Higher = more varied language, lower = more repetitive.",
  "Vocab Diversity": "Ratio of unique words to total words. Higher = more varied language, lower = more repetitive.",
  "Avg Pairwise Overlap": "Average percentage of shared vocabulary between all pairs of runs. Lower values mean more variation between runs.",
  "Jaccard Similarity": "Set-based similarity measure: shared words divided by total unique words across both outputs. 100% = identical vocabulary, 0% = no words in common.",
  "Word Overlap": "Percentage of vocabulary shared between the two outputs.",
  "Mean Entropy": "Average uncertainty across all token positions. Higher entropy means the model was less certain about its word choices overall.",
  "Avg Probability": "Average confidence the model had in its chosen tokens. Higher = more confident choices.",
  "Max Entropy Token": "The token position where the model was most uncertain about what to generate next.",
  "Avg Words": "Average word count across all runs.",
  "Avg Sent. Length": "Average number of words per sentence.",
  "Runs": "Number of times the prompt was sent to the model.",
  "Temperatures": "Number of different temperature settings tested.",
  "Word Count Range": "Range from the shortest to the longest output across temperature settings.",
  "Diversity Range": "Range of vocabulary diversity scores across temperature settings.",
  "Base Words": "Word count of the output from the unmodified base prompt.",
  "Avg Overlap with Base": "Average vocabulary overlap between each variation's output and the base prompt output.",
  "Shared Words": "Words that appear in both outputs.",
  "Unique to A": "Words that appear only in Panel A's output.",
  "Unique to B": "Words that appear only in Panel B's output.",
  "Total Tokens": "Total number of tokens (sub-word units) in the model's response.",
  "Successful": "Number of prompt variations that produced a valid response.",
};

export function MetricBox({ label, value, unit, tooltip }: MetricBoxProps) {
  const explanation = tooltip || METRIC_TOOLTIPS[label];

  return (
    <div
      className="bg-muted/50 rounded-sm px-3 py-2 text-center group relative"
      title={explanation}
    >
      <div className="text-display-md font-bold text-foreground tabular-nums">
        {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
        {unit && <span className="text-caption text-muted-foreground ml-0.5">{unit}</span>}
      </div>
      <div className="text-caption text-muted-foreground mt-0.5">
        {label}
        {explanation && <span className="ml-0.5 text-muted-foreground/50 cursor-help">?</span>}
      </div>
    </div>
  );
}
