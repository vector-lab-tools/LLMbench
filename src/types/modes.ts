import type { LucideIcon } from "lucide-react";

export type TabId =
  | "compare"
  | "stochastic"
  | "sensitivity"
  | "temperature"
  | "logprobs"
  | "divergence"
  | "grammar"
  | "sampling";

export type GroupId = "compare" | "analyse" | "investigate";

export interface TabGroup {
  id: GroupId;
  label: string;
  description: string;
  icon: LucideIcon;
  tabs: Array<{ id: TabId; label: string; description: string }>;
}
