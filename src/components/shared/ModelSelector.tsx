"use client";

import { cn } from "@/lib/utils";
import { useProviderSettings } from "@/context/ProviderSettingsContext";

export type PanelSelection = "A" | "B" | "both";

interface ModelSelectorProps {
  value: PanelSelection;
  onChange: (value: PanelSelection) => void;
  disabled?: boolean;
}

export function ModelSelector({ value, onChange, disabled }: ModelSelectorProps) {
  const { getSlotLabel, isSlotConfigured } = useProviderSettings();

  const slotAConfigured = isSlotConfigured("A");
  const slotBConfigured = isSlotConfigured("B");

  const labelA = slotAConfigured ? getSlotLabel("A") : "Not configured";
  const labelB = slotBConfigured ? getSlotLabel("B") : "Not configured";

  const options: { id: PanelSelection; label: string; available: boolean }[] = [
    { id: "A", label: `A: ${labelA}`, available: slotAConfigured },
    { id: "B", label: `B: ${labelB}`, available: slotBConfigured },
    { id: "both", label: "Both", available: slotAConfigured || slotBConfigured },
  ];

  return (
    <div className="flex items-center gap-0 border border-parchment rounded-sm overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          disabled={disabled || !opt.available}
          className={cn(
            "px-3 py-1 text-caption font-medium transition-colors border-r border-parchment last:border-r-0",
            "disabled:opacity-30 disabled:cursor-not-allowed",
            value === opt.id
              ? "bg-burgundy text-white"
              : "bg-card text-muted-foreground hover:bg-cream/50 hover:text-foreground"
          )}
          title={!opt.available ? "Configure this model in Settings" : undefined}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
