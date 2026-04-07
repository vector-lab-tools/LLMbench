"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DeepDiveProps {
  label?: string;
  summary?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function DeepDive({ label = "Deep Dive", summary, children, defaultOpen = false }: DeepDiveProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-parchment">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2 px-5 py-2.5 text-left",
          "text-caption font-semibold",
          "transition-colors",
          open
            ? "bg-burgundy/5 text-burgundy border-b border-parchment/50"
            : "bg-cream/40 text-muted-foreground hover:bg-cream/70 hover:text-foreground"
        )}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{label}</span>
        {summary && (
          <span className="ml-auto text-caption font-normal text-muted-foreground/70">{summary}</span>
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}
