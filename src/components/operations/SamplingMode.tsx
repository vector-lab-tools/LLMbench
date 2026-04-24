"use client";

/**
 * Sampling Probe — Investigate-tier mode.
 *
 * Autoregressive generation as data. One HTTP call per token. Each step's
 * full top-K distribution is stored client-side so the user can:
 *   - re-softmax under any T and top-p without a new API call,
 *   - click any non-chosen top-K token to fork a counterfactual branch,
 *   - compare two models in lockstep (dual-panel: Jaccard + KL per step),
 *   - export the full trace as a bundle.
 *
 * Requires a logprobs-capable slot: Gemini 2.0, OpenAI, OpenRouter, HF.
 */

import { useState, useCallback, useMemo, Fragment } from "react";
import {
  AlertCircle, Play, StepForward, RotateCcw, Download, Microscope, GitBranch,
} from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { ModelSelector, type PanelSelection } from "@/components/shared/ModelSelector";
import { DeepDive } from "@/components/shared/DeepDive";
import type { ProviderSlot } from "@/types/ai-settings";
import type {
  SamplingStep, SamplingBranch, SamplingTrace, SamplingStepResponse,
} from "@/lib/sampling/types";
import { SAMPLING_PROVIDERS, type SamplingSlotPayload } from "@/lib/sampling/provider";
import { resample } from "@/lib/sampling/resample";
import {
  entropyBits, surprisalBits, rankOf, jaccard, klDivergenceBits, perplexity,
} from "@/lib/sampling/metrics";
import { downloadBundle, downloadTrajectoryCsv } from "@/lib/sampling/export";

interface SamplingModeProps {
  isDark: boolean;
  pendingPrompt?: string;
}

const DEFAULT_TOP_K = 40;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TOP_P = 0.9;
const DEFAULT_MAX_STEPS = 40;
const VERSION = "2.15.0";

const SAMPLE_PROMPT = "Democracy is";

function slotPayload(slot: ProviderSlot): SamplingSlotPayload {
  return {
    provider: slot.provider,
    model: slot.model,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
    customModelId: slot.customModelId,
  };
}

function freshId() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyTrace(prompt: string, slots: { A: ProviderSlot | null; B: ProviderSlot | null }): SamplingTrace {
  const rootId = "main";
  return {
    prompt,
    branches: {
      [rootId]: {
        id: rootId, parentId: null, forkStepIndex: null, forkChoice: null,
        panel: "A", steps: [], label: "main",
      },
    },
    activeBranchId: rootId,
    params: {
      temperature: DEFAULT_TEMPERATURE,
      topP: DEFAULT_TOP_P,
      topK: DEFAULT_TOP_K,
      maxSteps: DEFAULT_MAX_STEPS,
    },
    slots: {
      A: slots.A ? { provider: slots.A.provider, model: slots.A.customModelId || slots.A.model } : null,
      B: slots.B ? { provider: slots.B.provider, model: slots.B.customModelId || slots.B.model } : null,
    },
  };
}

function branchPrefix(branch: SamplingBranch, prompt: string): string {
  return prompt + branch.steps.map(s => s.chosenToken).join("");
}

/** Colour a cell by surprisal (bits): cream → burgundy gradient. */
function surprisalColour(bits: number, max = 10): string {
  if (!Number.isFinite(bits)) return "bg-muted/20 text-muted-foreground/40";
  const t = Math.min(1, Math.max(0, bits / max));
  if (t < 0.15) return "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300";
  if (t < 0.35) return "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200";
  if (t < 0.6) return "bg-amber-200 dark:bg-amber-800/50 text-amber-900 dark:text-amber-100";
  return "bg-burgundy/30 text-burgundy dark:text-amber-100";
}

export default function SamplingMode({ pendingPrompt }: SamplingModeProps) {
  const { slots, getSlotLabel, isSlotConfigured } = useProviderSettings();
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("A");
  const [prompt, setPrompt] = useState(pendingPrompt || SAMPLE_PROMPT);
  const [trace, setTrace] = useState<SamplingTrace | null>(null);
  const [traceB, setTraceB] = useState<SamplingTrace | null>(null); // dual-panel B trace (shared prefix/steps)
  const [status, setStatus] = useState<"idle" | "stepping" | "running" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);

  const slotAConfigured = isSlotConfigured("A");
  const slotBConfigured = isSlotConfigured("B");
  const slotA = slots.A;
  const slotB = slots.B;

  const slotACapable = SAMPLING_PROVIDERS.has(slotA.provider);
  const slotBCapable = slotBConfigured && SAMPLING_PROVIDERS.has(slotB.provider);

  const dualPanel = panelSelection === "both" && slotBCapable;
  const useB = panelSelection === "B" && slotBCapable;
  const primarySlotPanel: "A" | "B" = useB ? "B" : "A";

  const activeBranch = useMemo(() => trace?.branches[trace.activeBranchId] ?? null, [trace]);
  const activeBranchB = useMemo(
    () => traceB?.branches[traceB.activeBranchId] ?? null, [traceB]
  );

  // -------------------- API call --------------------

  const fetchStep = useCallback(async (
    slot: ProviderSlot, prefix: string, topK: number
  ): Promise<SamplingStepResponse> => {
    const res = await fetch("/api/investigate/sampling-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, slot: slotPayload(slot), topK }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data as SamplingStepResponse;
  }, []);

  // -------------------- Advance one step --------------------

  const advanceOne = useCallback(async () => {
    const current = trace ?? emptyTrace(prompt, { A: slotA, B: dualPanel ? slotB : null });
    if (!trace) setTrace(current);
    if (dualPanel && !traceB) {
      setTraceB(emptyTrace(prompt, { A: slotA, B: slotB }));
    }

    setStatus("stepping");
    setErrorMsg(null);
    try {
      const slotForA = primarySlotPanel === "A" ? slotA : slotB;
      const branchA = current.branches[current.activeBranchId];
      const prefixA = branchPrefix(branchA, current.prompt);
      const respA = await fetchStep(slotForA, prefixA, current.params.topK);

      // Choose argmax of the re-softmaxed distribution as "chosen" token.
      const distA = resample(respA.distribution, current.params.temperature, current.params.topP);
      const chosenA = distA[0]?.token ?? (respA.chosen?.token ?? "");
      if (!chosenA) throw new Error("Provider returned no token.");

      const newStepA: SamplingStep = {
        id: freshId(),
        prefix: prefixA,
        rawDistribution: respA.distribution,
        chosenToken: chosenA,
        provenance: respA.provenance,
      };

      setTrace(prev => {
        const t = prev ?? current;
        const b = t.branches[t.activeBranchId];
        return {
          ...t,
          branches: {
            ...t.branches,
            [b.id]: { ...b, steps: [...b.steps, newStepA] },
          },
        };
      });

      // Dual-panel: also advance B against the same prefix.
      if (dualPanel && traceB) {
        const branchB = traceB.branches[traceB.activeBranchId];
        const prefixB = branchPrefix(branchB, traceB.prompt);
        const respB = await fetchStep(slotB, prefixB, current.params.topK);
        const distB = resample(respB.distribution, current.params.temperature, current.params.topP);
        const chosenB = distB[0]?.token ?? (respB.chosen?.token ?? "");
        const newStepB: SamplingStep = {
          id: freshId(), prefix: prefixB, rawDistribution: respB.distribution,
          chosenToken: chosenB, provenance: respB.provenance,
        };
        setTraceB(prev => {
          const t = prev!;
          const b = t.branches[t.activeBranchId];
          return { ...t, branches: { ...t.branches, [b.id]: { ...b, steps: [...b.steps, newStepB] } } };
        });
      }

      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Step failed");
      setStatus("error");
    }
  }, [trace, traceB, prompt, slotA, slotB, dualPanel, primarySlotPanel, fetchStep]);

  // -------------------- Run until maxSteps --------------------

  const runToEnd = useCallback(async () => {
    setStatus("running");
    setErrorMsg(null);
    try {
      let current = trace ?? emptyTrace(prompt, { A: slotA, B: dualPanel ? slotB : null });
      if (!trace) setTrace(current);
      let currentB = traceB;
      if (dualPanel && !currentB) {
        currentB = emptyTrace(prompt, { A: slotA, B: slotB });
        setTraceB(currentB);
      }

      while (true) {
        const branch = current.branches[current.activeBranchId];
        if (branch.steps.length >= current.params.maxSteps) break;

        const slotForA = primarySlotPanel === "A" ? slotA : slotB;
        const prefixA = branchPrefix(branch, current.prompt);
        const respA = await fetchStep(slotForA, prefixA, current.params.topK);
        const distA = resample(respA.distribution, current.params.temperature, current.params.topP);
        const chosenA = distA[0]?.token ?? (respA.chosen?.token ?? "");
        if (!chosenA) break;
        const newStepA: SamplingStep = {
          id: freshId(), prefix: prefixA, rawDistribution: respA.distribution,
          chosenToken: chosenA, provenance: respA.provenance,
        };
        current = {
          ...current,
          branches: { ...current.branches, [branch.id]: { ...branch, steps: [...branch.steps, newStepA] } },
        };
        setTrace(current);

        if (dualPanel && currentB) {
          const branchB = currentB.branches[currentB.activeBranchId];
          const prefixB = branchPrefix(branchB, currentB.prompt);
          const respB = await fetchStep(slotB, prefixB, current.params.topK);
          const distB = resample(respB.distribution, current.params.temperature, current.params.topP);
          const chosenB = distB[0]?.token ?? (respB.chosen?.token ?? "");
          if (!chosenB) break;
          const newStepB: SamplingStep = {
            id: freshId(), prefix: prefixB, rawDistribution: respB.distribution,
            chosenToken: chosenB, provenance: respB.provenance,
          };
          currentB = {
            ...currentB,
            branches: { ...currentB.branches, [branchB.id]: { ...branchB, steps: [...branchB.steps, newStepB] } },
          };
          setTraceB(currentB);
        }

        // Stop on sentence-terminating punctuation.
        if (/[.!?]\s*$/.test(branchPrefix(current.branches[current.activeBranchId], current.prompt))) break;
      }
      setStatus("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Run failed");
      setStatus("error");
    }
  }, [trace, traceB, prompt, slotA, slotB, dualPanel, primarySlotPanel, fetchStep]);

  // -------------------- Fork a branch --------------------

  const fork = useCallback((stepIndex: number, forkToken: string) => {
    setTrace(prev => {
      if (!prev) return prev;
      const parent = prev.branches[prev.activeBranchId];
      if (stepIndex < 0 || stepIndex >= parent.steps.length) return prev;
      const parentStep = parent.steps[stepIndex];
      const newId = freshId();
      const newBranch: SamplingBranch = {
        id: newId,
        parentId: parent.id,
        forkStepIndex: stepIndex,
        forkChoice: forkToken,
        panel: parent.panel,
        label: `${parent.label}→${forkToken.trim().slice(0, 8)}`,
        steps: [
          ...parent.steps.slice(0, stepIndex),
          // Replace the step at stepIndex with one whose chosen is the fork choice;
          // reuse the cached raw distribution.
          {
            ...parentStep,
            id: freshId(),
            chosenToken: forkToken,
          },
        ],
      };
      return {
        ...prev,
        branches: { ...prev.branches, [newId]: newBranch },
        activeBranchId: newId,
      };
    });
    setSelectedStepIndex(null);
  }, []);

  // -------------------- Slider updates --------------------

  const updateParams = (patch: Partial<SamplingTrace["params"]>) => {
    setTrace(prev => prev ? { ...prev, params: { ...prev.params, ...patch } } : prev);
    setTraceB(prev => prev ? { ...prev, params: { ...prev.params, ...patch } } : prev);
  };

  const reset = () => {
    setTrace(null); setTraceB(null); setStatus("idle"); setErrorMsg(null); setSelectedStepIndex(null);
  };

  // -------------------- Branch-scoped derived views --------------------

  const inspectedStepIndex = selectedStepIndex !== null && activeBranch
    ? Math.min(selectedStepIndex, activeBranch.steps.length - 1)
    : (activeBranch && activeBranch.steps.length > 0 ? activeBranch.steps.length - 1 : null);

  const inspectedStep = (activeBranch && inspectedStepIndex !== null)
    ? activeBranch.steps[inspectedStepIndex] : null;

  const inspectedDist = useMemo(() => {
    if (!trace || !inspectedStep) return [];
    return resample(inspectedStep.rawDistribution, trace.params.temperature, trace.params.topP);
  }, [trace, inspectedStep]);

  const inspectedDistB = useMemo(() => {
    if (!traceB || !dualPanel || inspectedStepIndex === null) return [];
    const stepB = activeBranchB?.steps[inspectedStepIndex];
    if (!stepB) return [];
    return resample(stepB.rawDistribution, traceB.params.temperature, traceB.params.topP);
  }, [traceB, dualPanel, activeBranchB, inspectedStepIndex]);

  // Per-step surprisal/entropy for the active branch under current T/topP.
  const stepMetrics = useMemo(() => {
    if (!trace || !activeBranch) return [];
    return activeBranch.steps.map(s => {
      const d = resample(s.rawDistribution, trace.params.temperature, trace.params.topP);
      const entry = d.find(t => t.token === s.chosenToken);
      const p = entry?.softmaxP ?? 0;
      return {
        step: s,
        dist: d,
        entropy: entropyBits(d),
        surprisal: surprisalBits(p),
        rank: rankOf(s.chosenToken, d),
        p,
      };
    });
  }, [trace, activeBranch]);

  const totalSurprisal = stepMetrics.reduce((s, m) => s + (Number.isFinite(m.surprisal) ? m.surprisal : 0), 0);
  const branchPerplexity = perplexity(stepMetrics.map(m => m.surprisal));

  // -------------------- Guards & messages --------------------

  const capabilityError = !slotAConfigured
    ? "Configure Panel A before running Sampling Probe."
    : !slotACapable
      ? `Panel A (${slotA.provider}) does not expose next-token logprobs. Switch to Gemini 2.0, OpenAI, OpenRouter, or Hugging Face.`
      : (panelSelection === "both" && !slotBCapable)
        ? "Panel B is either not configured or uses a provider without logprobs. Dual-panel requires both panels be logprobs-capable."
        : null;

  const canRun = status !== "running" && status !== "stepping" && !capabilityError && prompt.length > 0;

  // -------------------- Render --------------------

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Toolbar */}
      <div className="px-4 py-2 border-b border-border bg-cream/20 flex flex-wrap items-center gap-2">
        <Microscope className="w-4 h-4 text-burgundy" />
        <span className="font-display text-body-sm font-semibold">Sampling Probe</span>
        <span className="text-caption text-muted-foreground">
          autoregressive generation · real logprobs · counterfactual forks
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ModelSelector value={panelSelection} onChange={setPanelSelection} />
          {trace && (
            <button
              type="button"
              onClick={() => downloadBundle(trace, VERSION)}
              className="btn-editorial-ghost flex items-center gap-1 text-caption"
              title="Export sampling trace bundle"
            >
              <Download className="w-3 h-3" /> Bundle
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Capability guard */}
        {capabilityError && (
          <div className="border border-burgundy/40 bg-burgundy/5 rounded-sm p-3 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-burgundy mt-0.5 shrink-0" />
            <div className="text-caption text-foreground">{capabilityError}</div>
          </div>
        )}

        {/* Prompt row */}
        <div className="border border-parchment/60 rounded-sm p-3 bg-card/40 space-y-2">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={status === "running" || status === "stepping" || !!trace}
            rows={2}
            className="w-full text-caption font-mono bg-background border border-parchment/60 rounded-sm p-2 disabled:opacity-60"
            placeholder="Start the prefix the model will continue from."
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button" onClick={runToEnd} disabled={!canRun}
              className="btn-editorial-ghost flex items-center gap-1 text-caption disabled:opacity-50"
            >
              <Play className="w-3 h-3" /> Run
            </button>
            <button
              type="button" onClick={advanceOne} disabled={!canRun}
              className="btn-editorial-ghost flex items-center gap-1 text-caption disabled:opacity-50"
            >
              <StepForward className="w-3 h-3" /> Step
            </button>
            <button
              type="button" onClick={reset} disabled={!trace || status === "running"}
              className="btn-editorial-ghost flex items-center gap-1 text-caption disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
            <div className="ml-4 flex items-center gap-3 text-caption">
              <Slider
                label="T" min={0.1} max={2} step={0.1}
                value={trace?.params.temperature ?? DEFAULT_TEMPERATURE}
                onChange={v => updateParams({ temperature: v })}
              />
              <Slider
                label="top-p" min={0.1} max={1} step={0.05}
                value={trace?.params.topP ?? DEFAULT_TOP_P}
                onChange={v => updateParams({ topP: v })}
              />
              <Slider
                label="top-K" min={5} max={50} step={5} integer
                value={trace?.params.topK ?? DEFAULT_TOP_K}
                onChange={v => updateParams({ topK: v })}
              />
              <Slider
                label="max" min={5} max={100} step={5} integer
                value={trace?.params.maxSteps ?? DEFAULT_MAX_STEPS}
                onChange={v => updateParams({ maxSteps: v })}
              />
            </div>
          </div>
          {errorMsg && (
            <div className="text-caption text-red-700 dark:text-red-300">Error: {errorMsg}</div>
          )}
          {status === "running" && (
            <div className="text-caption text-muted-foreground italic">Sampling…</div>
          )}
        </div>

        {/* Main content: only when we have a trace */}
        {trace && activeBranch && activeBranch.steps.length > 0 && (
          <>
            {/* Generation strip */}
            <div className="border border-parchment/60 rounded-sm p-3 bg-card/40">
              <div className="flex items-baseline justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                  Generation — click a token to inspect, click a top-K entry to fork
                </div>
                <div className="text-[10px] font-mono text-muted-foreground">
                  {activeBranch.steps.length} tokens · Σsurprisal {totalSurprisal.toFixed(2)} bits · perplexity {Number.isFinite(branchPerplexity) ? branchPerplexity.toFixed(2) : "—"}
                </div>
              </div>
              <div className="font-mono text-body-sm leading-7 whitespace-pre-wrap break-words">
                <span className="text-muted-foreground">{trace.prompt}</span>
                {stepMetrics.map((m, i) => (
                  <button
                    key={m.step.id}
                    type="button"
                    onClick={() => setSelectedStepIndex(i)}
                    className={`${surprisalColour(m.surprisal)} px-0.5 rounded-sm ${
                      inspectedStepIndex === i ? "ring-2 ring-burgundy ring-offset-1" : ""
                    } hover:ring-1 hover:ring-burgundy/50`}
                    title={`rank ${m.rank} · p=${(m.p * 100).toFixed(1)}% · surprisal ${Number.isFinite(m.surprisal) ? m.surprisal.toFixed(2) : "—"} bits`}
                  >{m.step.chosenToken}</button>
                ))}
              </div>
              <div className="text-caption text-muted-foreground mt-2 italic">
                Shading: green (low surprisal, expected) → burgundy (high surprisal, rare). Branch: <span className="font-mono">{activeBranch.label}</span>.
              </div>
            </div>

            {/* Inspector row: top-K distribution(s) */}
            {inspectedStep && (
              <div className={`grid gap-3 ${dualPanel ? "md:grid-cols-2" : "grid-cols-1"}`}>
                <TopKPanel
                  title={`${getSlotLabel(primarySlotPanel)} · step ${(inspectedStepIndex ?? 0) + 1}`}
                  dist={inspectedDist}
                  chosenToken={inspectedStep.chosenToken}
                  onFork={(token) => inspectedStepIndex !== null && fork(inspectedStepIndex, token)}
                />
                {dualPanel && inspectedDistB.length > 0 && (
                  <TopKPanel
                    title={`${getSlotLabel("B")} · step ${(inspectedStepIndex ?? 0) + 1}`}
                    dist={inspectedDistB}
                    chosenToken={activeBranchB?.steps[inspectedStepIndex!]?.chosenToken ?? ""}
                    /* forking from Panel B in dual-panel mode is deferred — we branch Panel A's trace only */
                    onFork={null}
                    divergenceNote={`Jaccard(A,B) = ${(jaccard(inspectedDist, inspectedDistB) * 100).toFixed(1)}%  ·  KL(A‖B) = ${klDivergenceBits(inspectedDist, inspectedDistB).toFixed(2)} bits`}
                  />
                )}
              </div>
            )}

            {/* Trajectory: entropy + surprisal curves */}
            <div className="border border-parchment/60 rounded-sm p-3 bg-card/40">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-2">
                Trajectory
              </div>
              <TrajectoryChart
                metrics={stepMetrics}
                onSelectStep={setSelectedStepIndex}
                selectedIndex={inspectedStepIndex}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => activeBranch && trace && downloadTrajectoryCsv(trace, activeBranch.id)}
                  className="btn-editorial-ghost flex items-center gap-1 text-[10px] px-2 py-0.5"
                >
                  <Download className="w-3 h-3" /> Trajectory CSV
                </button>
                <span className="text-caption text-muted-foreground">
                  Green line: entropy H (bits) over returned top-K. Red bars: surprisal of the chosen token (−log₂p).
                </span>
              </div>
            </div>

            {/* Branches */}
            <BranchList trace={trace} onSwitch={id => {
              setTrace(prev => prev ? { ...prev, activeBranchId: id } : prev);
              setSelectedStepIndex(null);
            }} />

            {/* Deep Dive */}
            <DeepDive label="Deep Dive — trajectory, rank histogram, full transcripts" defaultOpen={false}>
              <DeepDivePanels trace={trace} traceB={traceB} dualPanel={dualPanel}
                              getSlotLabel={getSlotLabel} />
            </DeepDive>
          </>
        )}

        {/* Empty state */}
        {!trace && !capabilityError && (
          <div className="text-caption text-muted-foreground border border-dashed border-parchment/60 rounded-sm p-4 text-center">
            Enter a prompt, press <strong>Run</strong> to sample until punctuation, or <strong>Step</strong> to advance one token at a time.
            Every top-K distribution is stored locally so you can adjust T / top-p without re-calling the model.
          </div>
        )}
      </div>
    </div>
  );
}

// -------------------- subcomponents -----------------------------------------

function Slider({ label, value, onChange, min, max, step, integer = false }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; integer?: boolean;
}) {
  return (
    <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
      <span>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-20 accent-burgundy"
      />
      <span className="w-8 text-right text-foreground">
        {integer ? value : value.toFixed(step < 1 ? 2 : 1)}
      </span>
    </label>
  );
}

function TopKPanel({ title, dist, chosenToken, onFork, divergenceNote }: {
  title: string;
  dist: { token: string; softmaxP: number; logprob: number; rank: number }[];
  chosenToken: string;
  onFork: ((token: string) => void) | null;
  divergenceNote?: string;
}) {
  const max = dist[0]?.softmaxP ?? 0.0001;
  const cumulative: number[] = [];
  let cum = 0;
  for (const d of dist) { cum += d.softmaxP; cumulative.push(cum); }
  return (
    <div className="border border-parchment/60 rounded-sm p-2 bg-card">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">{title}</div>
        {divergenceNote && <div className="text-[10px] font-mono text-muted-foreground">{divergenceNote}</div>}
      </div>
      <div className="space-y-0.5">
        {dist.slice(0, 20).map((d, i) => {
          const isChosen = d.token === chosenToken;
          const w = max > 0 ? (d.softmaxP / max) * 100 : 0;
          return (
            <div key={`${d.token}-${i}`} className="grid grid-cols-[24px_140px_1fr_56px_56px] gap-1 items-center text-[11px]">
              <div className="text-muted-foreground font-mono text-right pr-1">{d.rank}</div>
              <button
                type="button"
                onClick={onFork && !isChosen ? () => onFork(d.token) : undefined}
                disabled={!onFork || isChosen}
                className={`font-mono truncate text-left px-1 rounded-sm ${
                  isChosen ? "bg-burgundy/20 text-burgundy font-semibold" :
                  onFork ? "hover:bg-amber-100 dark:hover:bg-amber-900/30 cursor-pointer text-foreground" :
                  "text-foreground"
                }`}
                title={onFork && !isChosen ? `Fork branch at this token: "${d.token}"` : d.token}
              >{JSON.stringify(d.token)}</button>
              <div className="bg-parchment/30 dark:bg-parchment/10 h-2 rounded-sm overflow-hidden">
                <div className={`h-full ${isChosen ? "bg-burgundy" : "bg-amber-500/70"}`} style={{ width: `${w}%` }} />
              </div>
              <div className="font-mono text-muted-foreground text-right">{(d.softmaxP * 100).toFixed(1)}%</div>
              <div className="font-mono text-muted-foreground/70 text-right text-[10px]">{d.logprob.toFixed(2)}</div>
            </div>
          );
        })}
      </div>
      {onFork && (
        <div className="text-[10px] text-muted-foreground mt-1 italic">
          Click any non-chosen token to fork a counterfactual branch from this step.
        </div>
      )}
    </div>
  );
}

function TrajectoryChart({ metrics, onSelectStep, selectedIndex }: {
  metrics: { entropy: number; surprisal: number; p: number }[];
  onSelectStep: (i: number) => void;
  selectedIndex: number | null;
}) {
  if (metrics.length === 0) return null;
  const w = 640, h = 120, pad = 20;
  const maxBits = Math.max(
    4,
    ...metrics.map(m => Math.max(
      Number.isFinite(m.entropy) ? m.entropy : 0,
      Number.isFinite(m.surprisal) ? m.surprisal : 0,
    ))
  );
  const xStep = (w - 2 * pad) / Math.max(1, metrics.length - 1);
  const y = (bits: number) => h - pad - (Number.isFinite(bits) ? (bits / maxBits) * (h - 2 * pad) : 0);

  const entropyPath = metrics.map((m, i) => `${i === 0 ? "M" : "L"}${pad + i * xStep},${y(m.entropy)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" preserveAspectRatio="none">
      {/* Surprisal bars */}
      {metrics.map((m, i) => {
        const x = pad + i * xStep - 2;
        const barH = h - pad - y(m.surprisal);
        return (
          <g key={i} onClick={() => onSelectStep(i)} style={{ cursor: "pointer" }}>
            <rect
              x={x} y={y(m.surprisal)} width={4} height={Math.max(0, barH)}
              className={selectedIndex === i ? "fill-burgundy" : "fill-burgundy/60"}
            />
          </g>
        );
      })}
      {/* Entropy line */}
      <path d={entropyPath} fill="none" className="stroke-emerald-600 dark:stroke-emerald-400" strokeWidth={1.5} />
      {/* Axes */}
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} className="stroke-muted-foreground/40" strokeWidth={0.5} />
      <line x1={pad} y1={pad} x2={pad} y2={h - pad} className="stroke-muted-foreground/40" strokeWidth={0.5} />
      <text x={pad + 2} y={pad + 8} fontSize={9} className="fill-muted-foreground">{maxBits.toFixed(1)} bits</text>
    </svg>
  );
}

function BranchList({ trace, onSwitch }: { trace: SamplingTrace; onSwitch: (id: string) => void }) {
  const branches = Object.values(trace.branches);
  if (branches.length <= 1) return null;
  return (
    <div className="border border-parchment/60 rounded-sm p-2 bg-card/40">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1">
        <GitBranch className="w-3 h-3" /> Branches
      </div>
      <div className="flex flex-wrap gap-1">
        {branches.map(b => (
          <button
            key={b.id} type="button" onClick={() => onSwitch(b.id)}
            className={`text-[10px] font-mono px-2 py-0.5 rounded-sm border ${
              b.id === trace.activeBranchId
                ? "bg-burgundy text-white border-burgundy"
                : "bg-card border-parchment/60 text-foreground hover:bg-cream/40"
            }`}
            title={b.parentId ? `forked from ${b.parentId} at step ${(b.forkStepIndex ?? 0) + 1}` : "root branch"}
          >
            {b.label} · {b.steps.length}t
          </button>
        ))}
      </div>
    </div>
  );
}

function DeepDivePanels({ trace, traceB, dualPanel, getSlotLabel }: {
  trace: SamplingTrace;
  traceB: SamplingTrace | null;
  dualPanel: boolean;
  getSlotLabel: (panel: "A" | "B") => string;
}) {
  const branch = trace.branches[trace.activeBranchId];
  const branchB = dualPanel && traceB ? traceB.branches[traceB.activeBranchId] : null;

  const { temperature, topP } = trace.params;
  const rankBins = [0, 1, 2, 3, 4, 5, 10, 20, 50];

  const rankHistogram = useMemo(() => {
    const bins = new Array(rankBins.length).fill(0);
    for (const s of branch.steps) {
      const dist = resample(s.rawDistribution, temperature, topP);
      const r = rankOf(s.chosenToken, dist);
      if (r < 0) { bins[bins.length - 1]++; continue; }
      let placed = false;
      for (let i = 0; i < rankBins.length - 1; i++) {
        if (r <= rankBins[i]) { bins[i]++; placed = true; break; }
      }
      if (!placed) bins[bins.length - 1]++;
    }
    return bins;
    // rankBins is stable module scope
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.steps, temperature, topP]);

  const maxRank = Math.max(1, ...rankHistogram);

  const divergenceSeries = useMemo(() => {
    if (!dualPanel || !branchB) return [];
    const n = Math.min(branch.steps.length, branchB.steps.length);
    const out: { i: number; jaccard: number; kl: number; disagree: boolean }[] = [];
    for (let i = 0; i < n; i++) {
      const a = resample(branch.steps[i].rawDistribution, temperature, topP);
      const b = resample(branchB.steps[i].rawDistribution, temperature, topP);
      const j = jaccard(a, b);
      const kl = klDivergenceBits(a, b);
      const disagree = branch.steps[i].chosenToken !== branchB.steps[i].chosenToken;
      out.push({ i, jaccard: j, kl, disagree });
    }
    return out;
  }, [dualPanel, branch, branchB, temperature, topP]);

  return (
    <div className="space-y-3 text-caption">
      <div>
        <div className="font-semibold text-foreground mb-1">Rank-of-chosen histogram — {getSlotLabel("A")}</div>
        <div className="text-muted-foreground mb-1">Where does the chosen token sit in the distribution at each step?</div>
        <div className="grid grid-cols-[60px_1fr_60px] gap-1 items-center">
          {rankHistogram.map((n, i) => {
            const label = i === 0 ? "rank 0" : i === rankHistogram.length - 1 ? `>${rankBins[i - 1]}` : `≤${rankBins[i]}`;
            return (
              <Fragment key={i}>
                <div className="text-[10px] font-mono text-muted-foreground">{label}</div>
                <div className="bg-parchment/30 dark:bg-parchment/10 h-3 rounded-sm overflow-hidden">
                  <div className="h-full bg-burgundy/70" style={{ width: `${(n / maxRank) * 100}%` }} />
                </div>
                <div className="text-[10px] font-mono text-foreground text-right">{n}</div>
              </Fragment>
            );
          })}
        </div>
      </div>

      {dualPanel && divergenceSeries.length > 0 && (
        <div>
          <div className="font-semibold text-foreground mb-1">
            A/B divergence — {getSlotLabel("A")} vs {getSlotLabel("B")}
          </div>
          <div className="text-muted-foreground mb-1">
            Per-step Jaccard of top-K sets and KL(A‖B) in bits. ● marks steps where the two models chose different tokens.
          </div>
          <div className="overflow-x-auto">
            <table className="text-caption border-collapse">
              <thead className="bg-cream/40 dark:bg-burgundy/10">
                <tr>
                  <th className="px-2 py-0.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground/70">Step</th>
                  <th className="px-2 py-0.5 text-right text-[10px] uppercase tracking-wider text-muted-foreground/70">Jaccard</th>
                  <th className="px-2 py-0.5 text-right text-[10px] uppercase tracking-wider text-muted-foreground/70">KL (bits)</th>
                  <th className="px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">Disagree</th>
                </tr>
              </thead>
              <tbody>
                {divergenceSeries.map(d => (
                  <tr key={d.i} className="border-t border-parchment/40">
                    <td className="px-2 py-0.5 font-mono text-[11px]">{d.i + 1}</td>
                    <td className="px-2 py-0.5 text-right font-mono text-[11px]">{(d.jaccard * 100).toFixed(1)}%</td>
                    <td className="px-2 py-0.5 text-right font-mono text-[11px]">{Number.isFinite(d.kl) ? d.kl.toFixed(2) : "—"}</td>
                    <td className="px-2 py-0.5 text-center">{d.disagree ? "●" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <div className="font-semibold text-foreground mb-1">Full transcript — {getSlotLabel("A")}</div>
        <div className="font-mono text-[11px] bg-background/60 p-2 rounded-sm whitespace-pre-wrap break-words">
          {trace.prompt}{branch.steps.map(s => s.chosenToken).join("")}
        </div>
      </div>

      {dualPanel && branchB && (
        <div>
          <div className="font-semibold text-foreground mb-1">Full transcript — {getSlotLabel("B")}</div>
          <div className="font-mono text-[11px] bg-background/60 p-2 rounded-sm whitespace-pre-wrap break-words">
            {traceB!.prompt}{branchB.steps.map(s => s.chosenToken).join("")}
          </div>
        </div>
      )}
    </div>
  );
}
