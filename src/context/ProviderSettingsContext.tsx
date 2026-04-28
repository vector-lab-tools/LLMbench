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
const NO_MARKDOWN_KEY = "llmbench-no-markdown";
// App-wide opt-in: when true, Compare auto-fetches logprobs alongside the
// main generation if both active slots are logprobs-capable. Avoids the
// "switch to probs view → second API request" round-trip and lets users
// keep diff and probs views in sync from a single submit.
const AUTO_LOGPROBS_KEY = "llmbench-auto-fetch-logprobs";

interface ProviderSettingsContextValue {
  slots: ProviderSlots;
  updateSlot: (panel: "A" | "B", updates: Partial<ProviderSlot>) => void;
  getSlotLabel: (panel: "A" | "B") => string;
  isSlotConfigured: (panel: "A" | "B") => boolean;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  noMarkdown: boolean;
  setNoMarkdown: (value: boolean) => void;
  autoFetchLogprobs: boolean;
  setAutoFetchLogprobs: (value: boolean) => void;
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
  const [noMarkdown, setNoMarkdownState] = useState(true); // default: on
  // Logprobs are a first-class capability of LLMbench — defaulting auto-fetch
  // ON means that whenever both active slots support it, the probs view
  // opens with data already loaded rather than triggering a second model
  // request. Power users can still turn this off in Settings.
  const [autoFetchLogprobs, setAutoFetchLogprobsState] = useState(true);

  const setNoMarkdown = useCallback((value: boolean) => {
    setNoMarkdownState(value);
    try { localStorage.setItem(NO_MARKDOWN_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  }, []);

  const setAutoFetchLogprobs = useCallback((value: boolean) => {
    setAutoFetchLogprobsState(value);
    try { localStorage.setItem(AUTO_LOGPROBS_KEY, JSON.stringify(value)); } catch { /* ignore */ }
  }, []);

  // Load from localStorage on mount
  useEffect(() => {
    setSlots(loadSlots());
    try {
      const stored = localStorage.getItem(NO_MARKDOWN_KEY);
      if (stored !== null) setNoMarkdownState(JSON.parse(stored));
    } catch { /* ignore */ }
    try {
      const stored = localStorage.getItem(AUTO_LOGPROBS_KEY);
      if (stored !== null) setAutoFetchLogprobsState(JSON.parse(stored));
    } catch { /* ignore */ }
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
        noMarkdown,
        setNoMarkdown,
        autoFetchLogprobs,
        setAutoFetchLogprobs,
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
