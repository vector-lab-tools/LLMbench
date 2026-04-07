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
}

export function MetricBox({ label, value, unit }: MetricBoxProps) {
  return (
    <div className="bg-muted/50 rounded-sm px-3 py-2 text-center">
      <div className="text-display-md font-bold text-foreground tabular-nums">
        {typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
        {unit && <span className="text-caption text-muted-foreground ml-0.5">{unit}</span>}
      </div>
      <div className="text-caption text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
