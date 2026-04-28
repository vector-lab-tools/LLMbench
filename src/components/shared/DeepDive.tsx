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
          "w-full flex items-center gap-2 px-5 py-1.5 text-left",
          // Header is roughly half the previous size — the panel content
          // below remains at its original sizing for readability. The
          // collapsed-row was visually competing with the section content;
          // shrinking it puts emphasis back on the data.
          "text-[10px] uppercase tracking-wider font-semibold",
          "transition-colors",
          open
            ? "bg-burgundy/5 text-burgundy border-b border-parchment/50"
            : "bg-cream/40 text-muted-foreground hover:bg-cream/70 hover:text-foreground"
        )}
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        <span>{label}</span>
        {summary && (
          <span className="ml-auto text-[10px] tracking-normal normal-case font-normal text-muted-foreground/70">{summary}</span>
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
