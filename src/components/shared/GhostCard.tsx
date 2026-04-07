"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GhostCardProps {
  title: string;
  panel?: "A" | "B";
}

const PANEL_TINT = {
  A: "border-l-blue-400/50",
  B: "border-l-amber-400/50",
} as const;

export function GhostCard({ title, panel }: GhostCardProps) {
  return (
    <div className={cn(
      "bg-card border border-parchment/50 rounded-sm overflow-hidden animate-pulse",
      panel && `border-l-2 ${PANEL_TINT[panel]}`
    )}>
      <div className="px-5 py-3 border-b border-parchment/30 flex items-center gap-3">
        <span className="text-body-sm font-medium text-muted-foreground/60">{title}</span>
        <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/40 ml-auto" />
      </div>
      <div className="px-5 py-4 space-y-2">
        <div className="h-3 bg-muted/40 rounded w-full" />
        <div className="h-3 bg-muted/40 rounded w-5/6" />
        <div className="h-3 bg-muted/40 rounded w-4/6" />
        <div className="h-3 bg-muted/40 rounded w-3/6" />
      </div>
    </div>
  );
}
