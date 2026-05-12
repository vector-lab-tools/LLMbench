"use client";

import { useState, useCallback } from "react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import type { OutputProvenance, ProviderSlot } from "@/types/ai-settings";
import { generateOllamaLogprobs, type HarmonyChannel } from "@/lib/ai/ollama-browser";
import { getModelDisplayName } from "@/lib/ai/config";
import { buildSystemPrompt } from "@/lib/ai/system-prompts";
import type { TokenLogprob } from "@/types/analysis";

export interface PanelOutput {
  text: string;
  provenance: OutputProvenance;
  /**
   * Optional cached logprob tokens captured at generation time.
   *
   * For Ollama, the browser-direct path requests `logprobs` and
   * `top_logprobs` in the *same* /v1/chat/completions call that returns
   * the text, so we get a token-aligned distribution effectively for
   * free. Caching the tokens here means the Probs view can render them
   * without a second generation — which, crucially, at temperature > 0
   * would diverge from the displayed text, leaving the heatmap
   * describing a sample that was never on screen.
   *
   * For other providers we still fetch logprobs on demand via
   * `/api/analyse/logprobs` after the user opens Probs — those server
   * routes can't piggyback on the original generation path without a
   * bigger refactor — and the temperature-drift problem exists there
   * too in principle. Worth following up on the other providers, but
   * the Ollama case is where it's most visible because David's typical
   * Ollama temperature is 0.7+.
   */
  tokens?: TokenLogprob[];
  /**
   * Harmony-format channels the model emitted before its visible answer
   * (`thought`, `commentary`, …). Surfaced behind a chevron in the panel
   * UI so the researcher can inspect the model's reasoning if they want
   * to, but excluded from every analytical path (heatmap, pixel map,
   * entropy curve, 3D net) so analysis describes the *visible* answer
   * only. Currently populated by the Ollama browser-direct path; other
   * providers don't expose channel-structured output through their APIs.
   */
  hiddenChannels?: HarmonyChannel[];
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

      // Routing decision: Ollama slots run from the browser directly
      // (so a deployed LLMbench can reach a local Ollama once the
      // user has set OLLAMA_ORIGINS=*); other providers go through
      // the server-side /api/generate route as before. The
      // server-side route accepts a `panel: "A"|"B"|"both"` field
      // (added in v2.15.21) that skips one slot, so when one side
      // is Ollama we can ask the server to handle the other side
      // only and run Ollama in parallel from the browser.
      //
      // Comparison is case-insensitive and trimmed because David hit
      // a real-world case (v2.15.36) where slot A landed on the
      // server-side ollama path while slot B took the browser-direct
      // path, despite both being configured as Ollama in the UI —
      // most likely cause was a non-canonical provider string (older
      // localStorage migration, accidental whitespace) that failed
      // the strict `=== "ollama"` check on the client but matched
      // the server's equivalent. Defensive normalisation prevents
      // the fork from skewing again.
      const isOllama = (s: ProviderSlot) =>
        typeof s?.provider === "string" &&
        s.provider.trim().toLowerCase() === "ollama";
      const aOllama = isOllama(slotA);
      const bOllama = isOllama(slotB);

      const buildResult = (panel: { error?: string; text?: string; provenance?: Record<string, unknown>; responseTimeMs?: number; tokens?: TokenLogprob[]; hiddenChannels?: HarmonyChannel[] } | undefined): PanelResult | null => {
        if (!panel) return null;
        const generatedAt = (panel.provenance as { generatedAt?: string } | undefined)?.generatedAt
          || new Date().toISOString();
        const provenance = { ...(panel.provenance ?? {}), generatedAt };
        if (panel.error) {
          return { error: panel.error, provenance: { ...provenance, responseTimeMs: 0 } } as PanelResult;
        }
        return {
          text: panel.text ?? "",
          provenance: { ...provenance, responseTimeMs: panel.responseTimeMs ?? 0 },
          // Forward cached Ollama tokens (if any) so Compare's Probs view
          // can render them without a second generation. See PanelOutput.tokens.
          ...(panel.tokens && panel.tokens.length > 0 ? { tokens: panel.tokens } : {}),
          // Hidden harmony channels for the chevron UI in CompareMode.
          ...(panel.hiddenChannels && panel.hiddenChannels.length > 0 ? { hiddenChannels: panel.hiddenChannels } : {}),
        } as PanelResult;
      };

      // Browser-direct Ollama call wrapped to match the panel-payload
      // shape so buildResult can consume it identically to the API
      // route's response.
      const callOllama = async (slot: ProviderSlot) => {
        const modelName = slot.customModelId || slot.model;
        const provenanceBase = {
          provider: slot.provider,
          model: modelName,
          modelDisplayName: getModelDisplayName(slot.provider, modelName),
          temperature: slot.temperature,
          systemPrompt: slot.systemPrompt,
        };
        try {
          // Request logprobs alongside text in the same /v1/chat/completions
          // call. Ollama returns them either way once supported (v0.4.x+),
          // and the cost on the wire is small relative to a second
          // generation. Caching the tokens with the text keeps the Probs
          // view consistent with what was displayed — at temperature > 0,
          // a second generation would produce a different sample and the
          // heatmap would describe text that was never on screen.
          const out = await generateOllamaLogprobs({
            baseUrl: slot.baseUrl || "http://127.0.0.1:11434",
            model: modelName,
            prompt,
            systemPrompt: buildSystemPrompt(slot.systemPrompt || undefined, noMarkdown),
            temperature: slot.temperature,
            topK: 5,
            disableThinking: slot.disableThinking,
          });
          return {
            text: out.text,
            responseTimeMs: out.responseTimeMs,
            provenance: provenanceBase,
            // Empty array → older Ollama or model that doesn't surface
            // logprobs; the Probs view will fall back to a re-fetch.
            tokens: out.tokens.length > 0 ? out.tokens : undefined,
            hiddenChannels: out.hiddenChannels,
          };
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : "Ollama call failed",
            provenance: provenanceBase,
          };
        }
      };

      try {
        // Fan out: Ollama slots → browser-direct, others → /api/generate
        // (with the panel field set to skip the Ollama side, or "both"
        // if neither is Ollama). All in parallel via Promise.all.
        const wantServer = !aOllama || !bOllama;
        const serverPanel: "A" | "B" | "both" =
          aOllama && bOllama ? "both" /* unused */ :
          aOllama ? "B" :
          bOllama ? "A" :
          "both";

        const serverPromise: Promise<Response | null> = wantServer
          ? fetch("/api/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt, slotA, slotB, noMarkdown, panel: serverPanel }),
            })
          : Promise.resolve(null);

        const ollamaPromiseA = aOllama ? callOllama(slotA) : Promise.resolve(null);
        const ollamaPromiseB = bOllama ? callOllama(slotB) : Promise.resolve(null);

        const [serverResp, ollamaA, ollamaB] = await Promise.all([
          serverPromise, ollamaPromiseA, ollamaPromiseB,
        ]);

        let serverData: { A?: unknown; B?: unknown; generatedAt?: string } = {};
        if (serverResp) {
          if (!serverResp.ok) {
            const errorData = await serverResp.json().catch(() => null);
            throw new Error(errorData?.error || `Server error: ${serverResp.status}`);
          }
          serverData = await serverResp.json();
        }

        // Merge: Ollama-side result wins if Ollama; otherwise take the
        // server's payload for that side.
        const panelA = aOllama ? ollamaA! : (serverData as { A?: Parameters<typeof buildResult>[0] }).A;
        const panelB = bOllama ? ollamaB! : (serverData as { B?: Parameters<typeof buildResult>[0] }).B;

        setState({
          isLoading: false,
          loadingA: false,
          loadingB: false,
          prompt,
          resultA: buildResult(panelA as Parameters<typeof buildResult>[0]),
          resultB: buildResult(panelB as Parameters<typeof buildResult>[0]),
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
      const retrySlot = panel === "A" ? slotA : slotB;

      const buildResult = (p: { error?: string; text?: string; provenance?: Record<string, unknown>; responseTimeMs?: number } | undefined): PanelResult | null => {
        if (!p) return null;
        const generatedAt = (p.provenance as { generatedAt?: string } | undefined)?.generatedAt || new Date().toISOString();
        const provenance = { ...(p.provenance ?? {}), generatedAt };
        if (p.error) return { error: p.error, provenance: { ...provenance, responseTimeMs: 0 } } as PanelResult;
        return { text: p.text ?? "", provenance: { ...provenance, responseTimeMs: p.responseTimeMs ?? 0 } } as PanelResult;
      };

      try {
        // Same Ollama-fork as the main dispatch (v2.15.34): if the
        // retried slot is Ollama, bypass /api/generate and call the
        // browser-direct client. Without this, "Retry Panel A" against
        // an Ollama slot from a deployed LLMbench would route through
        // Vercel and surface the server-side "Cannot connect to Ollama"
        // error — exactly the v2.15.36-shipped bug David spotted.
        let panelData: Parameters<typeof buildResult>[0];
        // Same case-insensitive provider check as dispatch — see comment
        // there for the rationale.
        const retryIsOllama =
          typeof retrySlot?.provider === "string" &&
          retrySlot.provider.trim().toLowerCase() === "ollama";
        if (retryIsOllama) {
          const modelName = retrySlot.customModelId || retrySlot.model;
          const provenanceBase = {
            provider: retrySlot.provider,
            model: modelName,
            modelDisplayName: getModelDisplayName(retrySlot.provider, modelName),
            temperature: retrySlot.temperature,
            systemPrompt: retrySlot.systemPrompt,
          };
          try {
            // Capture logprobs in the same call (see callOllama above for
            // the temperature-drift rationale). Retry must match dispatch
            // so a retried panel's Probs view also reads from cache.
            const out = await generateOllamaLogprobs({
              baseUrl: retrySlot.baseUrl || "http://127.0.0.1:11434",
              model: modelName,
              prompt: currentPrompt,
              systemPrompt: buildSystemPrompt(retrySlot.systemPrompt || undefined, noMarkdown),
              temperature: retrySlot.temperature,
              topK: 5,
              disableThinking: retrySlot.disableThinking,
            });
            panelData = {
              text: out.text,
              responseTimeMs: out.responseTimeMs,
              provenance: provenanceBase,
              ...(out.tokens.length > 0 ? { tokens: out.tokens } : {}),
              ...(out.hiddenChannels ? { hiddenChannels: out.hiddenChannels } : {}),
            };
          } catch (err) {
            panelData = {
              error: err instanceof Error ? err.message : "Ollama call failed",
              provenance: provenanceBase,
            };
          }
        } else {
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
          panelData = (panel === "A" ? data.A : data.B) as Parameters<typeof buildResult>[0];
        }

        setState((prev) => ({
          ...prev,
          isLoading: false,
          loadingA: panel === "A" ? false : prev.loadingA,
          loadingB: panel === "B" ? false : prev.loadingB,
          resultA: panel === "A" ? buildResult(panelData) : prev.resultA,
          resultB: panel === "B" ? buildResult(panelData) : prev.resultB,
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
