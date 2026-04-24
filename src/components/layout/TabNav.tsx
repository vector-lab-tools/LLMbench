"use client";

import { cn } from "@/lib/utils";
import { SplitSquareHorizontal, FlaskConical, Microscope } from "lucide-react";
import type { TabId, GroupId, TabGroup } from "@/types/modes";

export type { TabId, GroupId };

const GROUPS: TabGroup[] = [
  {
    id: "compare",
    label: "Compare",
    description: "Side-by-side model comparison",
    icon: SplitSquareHorizontal,
    tabs: [
      { id: "compare", label: "Dual Panel", description: "Compare two model outputs side by side" },
    ],
  },
  {
    id: "analyse",
    label: "Analyse",
    description: "Empirical analysis of model behaviour",
    icon: FlaskConical,
    tabs: [
      { id: "stochastic", label: "Stochastic Variation", description: "Same prompt, multiple runs" },
      { id: "temperature", label: "Temperature Gradient", description: "Same prompt across temperatures" },
      { id: "sensitivity", label: "Prompt Sensitivity", description: "Micro-variations of a prompt" },
      { id: "logprobs", label: "Token Probabilities", description: "Per-token probability distributions" },
      { id: "divergence", label: "Cross-Model Divergence", description: "Quantitative model comparison" },
    ],
  },
  {
    id: "investigate",
    label: "Investigate",
    description: "Pattern-specific investigations of rhetorical grammar",
    icon: Microscope,
    tabs: [
      { id: "grammar", label: "Grammar", description: "Probe generation behaviour for rhetorical patterns (Not X but Y, hedging, parallelism…)" },
      { id: "sampling", label: "Sampling", description: "Autoregressive generation as data — real logprobs, counterfactual forks, A/B divergence" },
    ],
  },
];

function getGroup(tabId: TabId): GroupId {
  for (const group of GROUPS) {
    if (group.tabs.some(t => t.id === tabId)) return group.id;
  }
  return "compare";
}

interface TabNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function TabNav({ activeTab, onTabChange }: TabNavProps) {
  const activeGroup = getGroup(activeTab);
  const currentGroup = GROUPS.find(g => g.id === activeGroup)!;

  return (
    <div className="bg-card border-b border-parchment">
      <div className="px-6 flex items-center gap-0">
        {/* "Mode:" label */}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mr-2 select-none">
          Mode
        </span>

        {/* Group tabs as compact pill toggles */}
        <div className="flex items-center gap-0 border border-parchment rounded-sm overflow-hidden my-1.5">
          {GROUPS.map(group => {
            const Icon = group.icon;
            const isActive = group.id === activeGroup;
            return (
              <button
                key={group.id}
                onClick={() => onTabChange(group.tabs[0].id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 text-caption font-medium",
                  "transition-all duration-150 border-r border-parchment last:border-r-0",
                  isActive
                    ? "bg-burgundy text-white"
                    : "bg-card text-muted-foreground hover:text-foreground hover:bg-cream/50"
                )}
              >
                <Icon size={12} />
                {group.label}
              </button>
            );
          })}
        </div>

        {/* Sub-tabs (inline, after a separator) */}
        {currentGroup.tabs.length > 1 && (
          <>
            <div className="h-4 w-px bg-parchment mx-3" />
            <div className="flex items-center gap-0.5">
              {currentGroup.tabs.map(tab => {
                const isActive = tab.id === activeTab;
                return (
                  <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                      "px-2.5 py-1 text-caption font-medium rounded-sm",
                      "transition-all duration-150",
                      isActive
                        ? "bg-burgundy/10 text-burgundy"
                        : "text-muted-foreground hover:text-foreground hover:bg-cream/50"
                    )}
                    title={tab.description}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
