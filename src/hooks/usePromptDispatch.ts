"use client";

import { useState, useCallback } from "react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import type { OutputProvenance } from "@/types/ai-settings";

export interface PanelOutput {
  text: string;
  provenance: OutputProvenance;
}

export interface PanelError {
  error: string;
  provenance: OutputProvenance;
}

export type PanelResult = PanelOutput | PanelError;

export function isPanelOutput(result: PanelResult): result is PanelOutput {
  return "text" in result;
}

export interface DispatchState {
  isLoading: boolean;
  loadingA: boolean;
  loadingB: boolean;
  prompt: string | null;
  resultA: PanelResult | null;
  resultB: PanelResult | null;
  error: string | null;
}

export function usePromptDispatch() {
  const { slots, noMarkdown } = useProviderSettings();

  const [state, setState] = useState<DispatchState>({
    isLoading: false,
    loadingA: false,
    loadingB: false,
    prompt: null,
    resultA: null,
    resultB: null,
    error: null,
  });

  const dispatch = useCallback(
    async (prompt: string) => {
      if (!prompt.trim()) return;

      setState({
        isLoading: true,
        loadingA: true,
        loadingB: true,
        prompt,
        resultA: null,
        resultB: null,
        error: null,
      });

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            slotA: slots.A,
            slotB: slots.B,
            noMarkdown,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.error || `Server error: ${response.status}`
          );
        }

        const data = await response.json();
        const now = data.generatedAt || new Date().toISOString();

        const resultA: PanelResult = data.A.error
          ? {
              error: data.A.error,
              provenance: { ...data.A.provenance, responseTimeMs: 0, generatedAt: now },
            }
          : {
              text: data.A.text,
              provenance: {
                ...data.A.provenance,
                responseTimeMs: data.A.responseTimeMs,
                generatedAt: now,
              },
            };

        const resultB: PanelResult = data.B.error
          ? {
              error: data.B.error,
              provenance: { ...data.B.provenance, responseTimeMs: 0, generatedAt: now },
            }
          : {
              text: data.B.text,
              provenance: {
                ...data.B.provenance,
                responseTimeMs: data.B.responseTimeMs,
                generatedAt: now,
              },
            };

        setState({
          isLoading: false,
          loadingA: false,
          loadingB: false,
          prompt,
          resultA,
          resultB,
          error: null,
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          loadingA: false,
          loadingB: false,
          error: err instanceof Error ? err.message : "Generation failed",
        }));
      }
    },
    [slots]
  );

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      loadingA: false,
      loadingB: false,
      prompt: null,
      resultA: null,
      resultB: null,
      error: null,
    });
  }, []);

  // Load pre-existing state (for restoring saved comparisons)
  const loadState = useCallback(
    (prompt: string, resultA: PanelResult | null, resultB: PanelResult | null) => {
      setState({
        isLoading: false,
        loadingA: false,
        loadingB: false,
        prompt,
        resultA,
        resultB,
        error: null,
      });
    },
    []
  );

  return { ...state, dispatch, reset, loadState };
}
