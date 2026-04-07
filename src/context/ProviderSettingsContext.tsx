"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { ProviderSlot, ProviderSlots } from "@/types/ai-settings";
import { DEFAULT_SLOT_A, DEFAULT_SLOT_B } from "@/types/ai-settings";
import { getModelDisplayName } from "@/lib/ai/config";

const STORAGE_KEY = "llmbench-provider-settings";

interface ProviderSettingsContextValue {
  slots: ProviderSlots;
  updateSlot: (panel: "A" | "B", updates: Partial<ProviderSlot>) => void;
  getSlotLabel: (panel: "A" | "B") => string;
  isSlotConfigured: (panel: "A" | "B") => boolean;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
}

const ProviderSettingsContext =
  createContext<ProviderSettingsContextValue | null>(null);

function loadSlots(): ProviderSlots {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const slotA = { ...DEFAULT_SLOT_A, ...parsed.A };
      const slotB = { ...DEFAULT_SLOT_B, ...parsed.B };
      // Ensure enabled is always a boolean (old stored data may lack it)
      if (typeof slotA.enabled !== "boolean") slotA.enabled = true;
      if (typeof slotB.enabled !== "boolean") slotB.enabled = true;
      return { A: slotA, B: slotB };
    }
  } catch {
    // Ignore storage errors
  }
  return { A: { ...DEFAULT_SLOT_A }, B: { ...DEFAULT_SLOT_B } };
}

function saveSlots(slots: ProviderSlots) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slots));
  } catch {
    // Ignore storage errors
  }
}

export function ProviderSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [slots, setSlots] = useState<ProviderSlots>({
    A: { ...DEFAULT_SLOT_A },
    B: { ...DEFAULT_SLOT_B },
  });
  const [showSettings, setShowSettings] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setSlots(loadSlots());
    setLoaded(true);
  }, []);

  // Save to localStorage on change (skip initial mount)
  useEffect(() => {
    if (loaded) {
      saveSlots(slots);
    }
  }, [slots, loaded]);

  const updateSlot = useCallback(
    (panel: "A" | "B", updates: Partial<ProviderSlot>) => {
      setSlots((prev) => ({
        ...prev,
        [panel]: { ...prev[panel], ...updates },
      }));
    },
    []
  );

  const getSlotLabel = useCallback(
    (panel: "A" | "B") => {
      const slot = slots[panel];
      return getModelDisplayName(slot.provider, slot.customModelId || slot.model);
    },
    [slots]
  );

  const isSlotConfigured = useCallback(
    (panel: "A" | "B") => {
      const slot = slots[panel];
      if (!slot.enabled) return false;
      if (slot.provider === "ollama") return true;
      return !!slot.apiKey;
    },
    [slots]
  );

  return (
    <ProviderSettingsContext.Provider
      value={{
        slots,
        updateSlot,
        getSlotLabel,
        isSlotConfigured,
        showSettings,
        setShowSettings,
      }}
    >
      {children}
    </ProviderSettingsContext.Provider>
  );
}

export function useProviderSettings() {
  const context = useContext(ProviderSettingsContext);
  if (!context) {
    throw new Error(
      "useProviderSettings must be used within a ProviderSettingsProvider"
    );
  }
  return context;
}
