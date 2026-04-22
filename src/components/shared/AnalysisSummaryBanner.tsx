"use client";

export type SummaryLevel = "low" | "moderate" | "high";

export interface AnalysisSummaryBannerProps {
  level: SummaryLevel;
  label: string;
  summary: string;
}

const levelConfig: Record<SummaryLevel, { border: string; text: string }> = {
  low: {
    border: "border-l-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  moderate: {
    border: "border-l-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  high: {
    border: "border-l-burgundy",
    text: "text-burgundy",
  },
};

export function AnalysisSummaryBanner({ level, label, summary }: AnalysisSummaryBannerProps) {
  const { border, text } = levelConfig[level];
  return (
    <div
      className={`border-l-4 ${border} bg-card border border-parchment/50 rounded-sm px-4 py-3 flex items-baseline gap-3`}
    >
      <span className={`text-caption font-bold shrink-0 uppercase tracking-wide ${text}`}>
        {label}
      </span>
      <p className="text-body-sm text-muted-foreground leading-snug">{summary}</p>
    </div>
  );
}
