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
          "w-full flex items-center gap-2 px-5 py-3 text-left",
          "text-body-sm font-medium text-muted-foreground",
          "hover:bg-cream/50 transition-colors"
        )}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{label}</span>
        {summary && (
          <span className="ml-auto text-caption text-muted-foreground/70">{summary}</span>
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
