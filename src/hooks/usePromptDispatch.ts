"use client";

import { useState, useCallback } from "react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import type { OutputProvenance, ProviderSlot } from "@/types/ai-settings";

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
  // Snapshot of the slot configuration that produced the current results.
  // Used by downstream views (e.g. logprobs fetch) so the data they
  // surface stays aligned with the displayed text even after the user
  // edits the slot selection in Settings — without this, switching from
  // Qwen → GPT-4o between the original generation and a probs click
  // would render Panel A's compare text from Qwen alongside a probs
  // distribution from GPT-4o, the two having nothing to do with each
  // other.
  executedSlots: { A: ProviderSlot; B: ProviderSlot } | null;
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
    executedSlots: null,
  });

  const dispatch = useCallback(
    async (prompt: string, temperatureOverride?: number) => {
      if (!prompt.trim()) return;

      const slotA = temperatureOverride !== undefined
        ? { ...slots.A, temperature: temperatureOverride }
        : slots.A;
      const slotB = temperatureOverride !== undefined
        ? { ...slots.B, temperature: temperatureOverride }
        : slots.B;

      setState({
        isLoading: true,
        loadingA: true,
        loadingB: true,
        prompt,
        resultA: null,
        resultB: null,
        error: null,
        // Snapshot the slot config used for this generation so any
        // follow-up view (logprobs, retry) operates on the same models.
        executedSlots: { A: slotA, B: slotB },
      });

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            slotA,
            slotB,
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

        // Build each panel result independently so one panel's failure
        // cannot prevent the other panel from displaying.
        const buildResult = (panel: { error?: string; text?: string; provenance?: Record<string, unknown>; responseTimeMs?: number } | undefined): PanelResult | null => {
          if (!panel) return null;
          const provenance = { ...(panel.provenance ?? {}), generatedAt: now };
          if (panel.error) {
            return { error: panel.error, provenance: { ...provenance, responseTimeMs: 0 } } as PanelResult;
          }
          return { text: panel.text ?? "", provenance: { ...provenance, responseTimeMs: panel.responseTimeMs ?? 0 } } as PanelResult;
        };

        setState({
          isLoading: false,
          loadingA: false,
          loadingB: false,
          prompt,
          resultA: buildResult(data.A),
          resultB: buildResult(data.B),
          error: null,
          executedSlots: { A: slotA, B: slotB },
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

  // Re-run generation for a single panel, leaving the other panel's
  // existing result untouched. Used by the per-panel retry button when
  // one side hit a transient error (rate limit, temporary capability
  // mismatch, etc.) and the user fixes the slot in Settings before
  // retrying. Calls the same /api/generate endpoint with `panel: "A"`
  // or `panel: "B"` so only the requested slot's provider is dispatched
  // (no re-billing of the working panel).
  const retryPanel = useCallback(
    async (panel: "A" | "B", temperatureOverride?: number) => {
      setState((prev) => {
        if (!prev.prompt) return prev;
        return {
          ...prev,
          isLoading: true,
          loadingA: panel === "A" ? true : prev.loadingA,
          loadingB: panel === "B" ? true : prev.loadingB,
          // Clear the failed side's result so the loading spinner takes
          // over the panel body cleanly.
          resultA: panel === "A" ? null : prev.resultA,
          resultB: panel === "B" ? null : prev.resultB,
          error: null,
        };
      });

      // Read the prompt from current state via a state-callback pattern:
      // we already used `prev.prompt` above to trigger the loading state,
      // but for the actual dispatch we need it directly.
      const currentPrompt = (await new Promise<string | null>((resolve) => {
        setState((prev) => { resolve(prev.prompt); return prev; });
      }));
      if (!currentPrompt) return;

      const slotA = temperatureOverride !== undefined ? { ...slots.A, temperature: temperatureOverride } : slots.A;
      const slotB = temperatureOverride !== undefined ? { ...slots.B, temperature: temperatureOverride } : slots.B;

      try {
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: currentPrompt,
            slotA,
            slotB,
            noMarkdown,
            panel,
          }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || `Server error: ${response.status}`);
        }
        const data = await response.json();
        const now = data.generatedAt || new Date().toISOString();
        const buildResult = (p: { error?: string; text?: string; provenance?: Record<string, unknown>; responseTimeMs?: number } | undefined): PanelResult | null => {
          if (!p) return null;
          const provenance = { ...(p.provenance ?? {}), generatedAt: now };
          if (p.error) return { error: p.error, provenance: { ...provenance, responseTimeMs: 0 } } as PanelResult;
          return { text: p.text ?? "", provenance: { ...provenance, responseTimeMs: p.responseTimeMs ?? 0 } } as PanelResult;
        };
        setState((prev) => ({
          ...prev,
          isLoading: false,
          loadingA: panel === "A" ? false : prev.loadingA,
          loadingB: panel === "B" ? false : prev.loadingB,
          resultA: panel === "A" ? buildResult(data.A) : prev.resultA,
          resultB: panel === "B" ? buildResult(data.B) : prev.resultB,
          error: null,
          // The retried panel is now executing under the latest slot
          // config, even if the other panel was generated earlier under
          // different slots. Update the snapshot for the retried side
          // only — the other side's snapshot remains pinned to whatever
          // produced its current text.
          executedSlots: prev.executedSlots
            ? {
                A: panel === "A" ? slotA : prev.executedSlots.A,
                B: panel === "B" ? slotB : prev.executedSlots.B,
              }
            : { A: slotA, B: slotB },
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          loadingA: panel === "A" ? false : prev.loadingA,
          loadingB: panel === "B" ? false : prev.loadingB,
          error: err instanceof Error ? err.message : "Retry failed",
        }));
      }
    },
    [slots, noMarkdown]
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
      executedSlots: null,
    });
  }, []);

  // Load pre-existing state (for restoring saved comparisons). Saved
  // comparisons predate the executedSlots snapshot, so we leave it null
  // — the UI treats null as "unknown" and falls back to current slots
  // for any follow-up analysis, which is the same behaviour as before.
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
        executedSlots: null,
      });
    },
    []
  );

  return { ...state, dispatch, retryPanel, reset, loadState };
}
