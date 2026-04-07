"use client";

import { cn } from "@/lib/utils";
import { SplitSquareHorizontal, FlaskConical } from "lucide-react";
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
    <div className="bg-card">
      {/* Group tabs */}
      <div className="px-6 flex gap-0 border-b border-parchment">
        {GROUPS.map(group => {
          const Icon = group.icon;
          const isActive = group.id === activeGroup;
          return (
            <button
              key={group.id}
              onClick={() => onTabChange(group.tabs[0].id)}
              className={cn(
                "flex items-center gap-2 px-5 py-2.5 font-sans text-body-sm font-semibold",
                "border-b-[3px] transition-all duration-200",
                isActive
                  ? "border-burgundy text-burgundy bg-background"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-cream/30"
              )}
            >
              <Icon size={15} />
              {group.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tabs for active group (skip if only one tab) */}
      {currentGroup.tabs.length > 1 && (
        <div className="px-6 flex gap-1 py-1 border-b border-parchment bg-muted/30">
          {currentGroup.tabs.map(tab => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={cn(
                  "px-4 py-1.5 font-sans text-body-sm font-medium rounded-sm",
                  "transition-all duration-200",
                  isActive
                    ? "text-primary-foreground bg-burgundy shadow-editorial"
                    : "text-muted-foreground hover:text-foreground hover:bg-cream/50"
                )}
                title={tab.description}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
