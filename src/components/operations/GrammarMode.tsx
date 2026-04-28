"use client";

/**
 * Grammar Probe — Investigate tier, phase-aware rhetorical pattern probe.
 *
 * Scope of v1 (v2.10.0-alpha):
 *   - Shared inputs: pattern library, prompt suite, model selector.
 *   - Phase A (Prevalence): batch-generate each prompt × temperature × model,
 *     regex-count hits per run, aggregate by register and model.
 *   - Phases B–E: scaffolded as disabled tabs with a "Coming soon" note so
 *     the information architecture is visible.
 *
 * Generation runs through /api/investigate/grammar-prevalence (NDJSON stream).
 * Counting happens client-side so the same corpus can be re-evaluated against
 * different patterns without re-running the model.
 */

import { useState, useCallback, useMemo, useEffect } from "react";
import {
  AlertCircle, Microscope, Play, RotateCcw, Settings2, FileText, BarChart3, Download, Sigma,
} from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { ModelSelector, type PanelSelection } from "@/components/shared/ModelSelector";
import { DeepDive } from "@/components/shared/DeepDive";
import { GrammarDeepDive } from "@/components/operations/grammar/DeepDivePanels";
import {
  ForcedContinuationDeepDive,
  PerturbationDeepDive,
  TemperatureSweepDeepDive,
} from "@/components/operations/grammar/PhaseDeepDives";
import { fetchStreaming } from "@/lib/streaming";
import {
  DEFAULT_PATTERNS,
  countMatches,
  findMatchSpans,
} from "@/lib/grammar/patterns";
import {
  GRAMMAR_SUITES,
  promptsForSuites,
  suiteOfPrompt,
  REGISTER_LABELS,
  type GrammarSuitePrompt,
  type GrammarSuiteKind,
  type GrammarRegister,
} from "@/lib/grammar/prompt-suite";

type Phase = "prevalence" | "continuation" | "forced" | "perturbation" | "temperature";

interface RunRecord {
  runIndex: number;
  panel: "A" | "B";
  promptId: string;
  register?: string;
  prompt: string;
  temperature: number;
  text?: string;
  error?: string;
  provenance: {
    modelDisplayName: string;
    responseTimeMs: number;
    temperature: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamEvent = { type: string; [k: string]: any };

interface GrammarModeProps {
  isDark: boolean;
  pendingPrompt?: string;
}

const PHASES: { id: Phase; label: string; short: string; available: boolean; description: string }[] = [
  { id: "prevalence",   label: "A. Prevalence",           short: "A",     available: true,  description: "Regex-count pattern hits across the suite × temperatures × models." },
  { id: "continuation", label: "B. Continuation logprobs", short: "B",   available: true,  description: "For each pattern scaffold, inspect the top-K next-token distribution." },
  { id: "forced",       label: "C. Forced continuation",  short: "C",    available: true,  description: "For each scaffold, take the top-N Y tokens from Phase B and expand each into a short Y-phrase. Hand off to Manifold Atlas." },
  { id: "perturbation", label: "D. Perturbation",         short: "D",    available: true,  description: "Neutral vs anti-pattern vs pro-pattern framings. Measures whether the construction is structural (persists under suppression) or stylistic (flexes with instruction)." },
  { id: "temperature",  label: "E. Temperature sweep",    short: "E",    available: true,  description: "Prevalence vs T ∈ {0, 0.3, 0.7, 1.0, 1.5}. Is the pattern at the greedy centre?" },
];

const PREVALENCE_TEMPS = [0, 0.7];
const SWEEP_TEMPS = [0, 0.3, 0.7, 1.0, 1.5];
const CONTINUATION_TOP_K = 15;
const CONTINUATION_PROVIDERS = new Set(["google", "openai", "openai-compatible", "openrouter", "huggingface"]);

interface ContinuationTokenProb { token: string; logprob: number }
interface ContinuationResult {
  panel: "A" | "B";
  scaffoldId: string;
  scaffold: string;
  chosen: ContinuationTokenProb | null;
  distribution: ContinuationTokenProb[];
  error?: string;
  provenance?: { modelDisplayName: string; responseTimeMs: number };
}

// `pendingPrompt` is accepted for nav compatibility with the rest of the app
// (tutorial cards can deep-link into any mode with a pre-filled prompt).
// Grammar mode does not yet consume it.
export default function GrammarMode({ pendingPrompt: _pendingPrompt }: GrammarModeProps) {
  void _pendingPrompt;

  const { slots, getSlotLabel, isSlotConfigured, noMarkdown } = useProviderSettings();
  const [activePhase, setActivePhase] = useState<Phase>("prevalence");
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("A");
  const [patternId, setPatternId] = useState(DEFAULT_PATTERNS[0].id);
  // Multi-select set for Phase A / Phase E aggregations. `patternId` above
  // remains the *primary* pattern — the one Phase B (continuation, geometry)
  // operates on, and the one whose scaffolds seed the continuation probe.
  // The primary is always included in the selection set.
  const [selectedPatternIds, setSelectedPatternIds] = useState<Set<string>>(
    () => new Set([DEFAULT_PATTERNS[0].id])
  );
  // Suite selection: users tick one or more suites; `suite` is the derived
  // union of their prompts. `selectedPromptIds` then lets them refine.
  const [activeSuiteIds, setActiveSuiteIds] = useState<Set<GrammarSuiteKind>>(
    () => new Set<GrammarSuiteKind>(["purpose-baseline"])
  );
  const suite = useMemo<GrammarSuitePrompt[]>(
    () => promptsForSuites(activeSuiteIds),
    [activeSuiteIds]
  );
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(
    () => new Set(promptsForSuites(new Set(["purpose-baseline"])).map(p => p.id))
  );
  // When the suite set changes, default to selecting every prompt inside it.
  useEffect(() => {
    setSelectedPromptIds(new Set(suite.map(p => p.id)));
  }, [suite]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [showSuiteEditor, setShowSuiteEditor] = useState(false);
  const [isDone, setIsDone] = useState(false);

  // ---- Phase B state ----
  const [selectedScaffoldIdx, setSelectedScaffoldIdx] = useState<Set<number>>(new Set());
  const [continuationResults, setContinuationResults] = useState<ContinuationResult[]>([]);
  const [isContinuationLoading, setIsContinuationLoading] = useState(false);
  const [continuationProgress, setContinuationProgress] = useState<{ done: number; total: number } | null>(null);
  const [continuationError, setContinuationError] = useState<string | null>(null);

  // ---- Phase C (Forced continuation / Y-phrase expansion) state ----
  // Phase C takes Phase B's top-K next-token distributions (the candidate Y
  // tokens) and, for each (scaffold, Y-token) pair, asks the model to expand
  // the token into a short Y-phrase. The result is a harvestable
  // scaffold → Y-token → Y-phrase table that hands off to Manifold Atlas via
  // the grammar-probe bundle for higher-volume geometric scrutiny. The
  // backend is /api/investigate/grammar-expand; this UI drives it.
  interface ForcedExpansion {
    scaffoldId: string;
    scaffold: string;
    panel: "A" | "B";
    rank: number;
    token: string;
    tokenLogprob: number;
    phrase: string | null;
    error?: string;
  }
  const [forcedExpansions, setForcedExpansions] = useState<ForcedExpansion[]>([]);
  const [isForcedLoading, setIsForcedLoading] = useState(false);
  const [forcedProgress, setForcedProgress] = useState<{ done: number; total: number } | null>(null);
  const [forcedError, setForcedError] = useState<string | null>(null);
  const [forcedTopN, setForcedTopN] = useState(5);

  // ---- Phase D (Perturbation) state ----
  // Three framings per selected prompt: neutral (as-is), anti-pattern
  // (instruction prefix suppressing the construction), pro-pattern
  // (instruction prefix inviting it). We reuse /api/investigate/grammar-
  // prevalence with the framing baked into the prompt text, tag each
  // returned run by framing client-side, and render a delta table. If the
  // anti rate ≈ neutral rate, the construction is *structural* (survives
  // explicit suppression). If it collapses, the construction is *stylistic*.
  type PerturbationFraming = "neutral" | "anti" | "pro";
  interface PerturbationRun extends RunRecord { framing: PerturbationFraming }
  const [perturbationRuns, setPerturbationRuns] = useState<PerturbationRun[]>([]);
  const [isPerturbationLoading, setIsPerturbationLoading] = useState(false);
  const [perturbationProgress, setPerturbationProgress] = useState<{ done: number; total: number } | null>(null);
  const [perturbationError, setPerturbationError] = useState<string | null>(null);

  // ---- Phase E (temperature sweep) state ----
  const [sweepRuns, setSweepRuns] = useState<RunRecord[]>([]);
  const [isSweepLoading, setIsSweepLoading] = useState(false);
  const [sweepProgress, setSweepProgress] = useState<{ done: number; total: number } | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [isSweepDone, setIsSweepDone] = useState(false);

  const pattern = useMemo(
    () => DEFAULT_PATTERNS.find(p => p.id === patternId) || DEFAULT_PATTERNS[0],
    [patternId]
  );
  const selectedPatterns = useMemo(
    () => DEFAULT_PATTERNS.filter(p => selectedPatternIds.has(p.id)),
    [selectedPatternIds]
  );
  // Keep the primary inside the selection set. If the user clicks "primary"
  // on a currently-unselected chip, add it; if they deselect the primary
  // outright, silently promote the first remaining selection to primary.
  const togglePatternSelected = useCallback((id: string) => {
    setSelectedPatternIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Do not allow zero selection.
        if (next.size <= 1) return next;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    // If we just removed the primary, promote the first remaining.
    setPatternId(prevPrimary => {
      const next = new Set(selectedPatternIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (prevPrimary === id && !next.has(id)) {
        const first = DEFAULT_PATTERNS.find(p => next.has(p.id));
        return first ? first.id : prevPrimary;
      }
      return prevPrimary;
    });
  }, [selectedPatternIds]);
  const promotePatternToPrimary = useCallback((id: string) => {
    setSelectedPatternIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setPatternId(id);
  }, []);

  // Primary must always be a member of the selection set.
  useEffect(() => {
    if (!selectedPatternIds.has(patternId)) {
      setSelectedPatternIds(prev => {
        const next = new Set(prev);
        next.add(patternId);
        return next;
      });
    }
  }, [patternId, selectedPatternIds]);

  // When the pattern changes, default to selecting all scaffolds and clear stale results.
  useEffect(() => {
    setSelectedScaffoldIdx(new Set(pattern.scaffolds.map((_, i) => i)));
    setContinuationResults([]);
    setContinuationProgress(null);
    setContinuationError(null);
    setSweepRuns([]);
    setSweepProgress(null);
    setSweepError(null);
    setIsSweepDone(false);
  }, [pattern]);

  const selectedPrompts = useMemo(
    () => suite.filter(p => selectedPromptIds.has(p.id)),
    [suite, selectedPromptIds]
  );

  const slotAConfigured = isSlotConfigured("A");
  const slotBConfigured = isSlotConfigured("B");

  const handleRun = useCallback(async () => {
    if (isLoading || selectedPrompts.length === 0) return;
    const usingBoth = panelSelection === "both" && slotBConfigured;
    if (!slotAConfigured && !usingBoth) {
      setError("Configure at least one model in Settings before running.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setRuns([]);
    setIsDone(false);
    const totalExpected =
      selectedPrompts.length *
      PREVALENCE_TEMPS.length *
      (usingBoth ? 2 : 1);
    setProgress({ done: 0, total: totalExpected });

    try {
      const slotA = panelSelection === "B" ? slots.B : slots.A;
      const slotB = usingBoth ? slots.B : null;

      await fetchStreaming<StreamEvent>(
        "/api/investigate/grammar-prevalence",
        {
          prompts: selectedPrompts.map(p => ({ id: p.id, prompt: p.prompt, register: p.register })),
          temperatures: PREVALENCE_TEMPS,
          slotA,
          slotB,
          noMarkdown,
        },
        (event) => {
          if (event.type === "meta") {
            setProgress({ done: 0, total: event.totalRuns });
          } else if (event.type === "run") {
            const r = event;
            setRuns(prev => [
              ...prev,
              {
                runIndex: r.runIndex,
                panel: r.panel,
                promptId: r.promptId,
                register: r.register,
                prompt: r.prompt,
                temperature: r.temperature,
                text: r.result?.text,
                error: r.result?.error,
                provenance: r.result?.provenance,
              },
            ]);
            setProgress(p => p ? { ...p, done: p.done + 1 } : p);
          } else if (event.type === "done") {
            setIsDone(true);
          }
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, selectedPrompts, panelSelection, slotAConfigured, slotBConfigured, slots, noMarkdown]);

  const handleReset = useCallback(() => {
    setRuns([]);
    setProgress(null);
    setError(null);
    setIsDone(false);
  }, []);

  // ---- Phase B: continuation logprobs ----
  const toggleScaffold = (idx: number) => {
    setSelectedScaffoldIdx(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectedScaffolds = useMemo(
    () => pattern.scaffolds
      .map((text, idx) => ({ id: `s${idx}`, text, idx }))
      .filter(s => selectedScaffoldIdx.has(s.idx)),
    [pattern, selectedScaffoldIdx]
  );

  const handleRunContinuation = useCallback(async () => {
    if (isContinuationLoading || selectedScaffolds.length === 0) return;
    const usingBoth = panelSelection === "both" && slotBConfigured;
    if (!slotAConfigured && !usingBoth) {
      setContinuationError("Configure at least one model in Settings before running.");
      return;
    }
    // Capability gate: both active slots must support logprobs.
    const slotsInUse: typeof slots.A[] = [];
    if (panelSelection === "A" || panelSelection === "both") slotsInUse.push(slots.A);
    if (panelSelection === "B" || (panelSelection === "both" && slotBConfigured)) slotsInUse.push(slots.B);
    const unsupported = slotsInUse.find(s => !CONTINUATION_PROVIDERS.has(s.provider));
    if (unsupported) {
      setContinuationError(`Provider '${unsupported.provider}' does not expose continuation logprobs. Use Gemini (2.0), OpenAI, OpenRouter, or Hugging Face.`);
      return;
    }

    setIsContinuationLoading(true);
    setContinuationError(null);
    setContinuationResults([]);
    const total = selectedScaffolds.length * (usingBoth ? 2 : 1);
    setContinuationProgress({ done: 0, total });

    try {
      const slotA = panelSelection === "B" ? slots.B : slots.A;
      const slotB = usingBoth ? slots.B : null;

      await fetchStreaming<StreamEvent>(
        "/api/investigate/grammar-continuation",
        {
          scaffolds: selectedScaffolds.map(s => ({ id: s.id, text: s.text })),
          topK: CONTINUATION_TOP_K,
          slotA,
          slotB,
          noMarkdown,
        },
        (event) => {
          if (event.type === "meta") {
            setContinuationProgress({ done: 0, total: event.total });
          } else if (event.type === "scaffold") {
            setContinuationResults(prev => [
              ...prev,
              {
                panel: event.panel,
                scaffoldId: event.scaffoldId,
                scaffold: event.scaffold,
                chosen: event.result?.chosen ?? null,
                distribution: event.result?.distribution ?? [],
                error: event.result?.error,
                provenance: event.result?.provenance,
              },
            ]);
            setContinuationProgress(p => p ? { ...p, done: p.done + 1 } : p);
          }
        },
      );
    } catch (err) {
      setContinuationError(err instanceof Error ? err.message : "Continuation run failed");
    } finally {
      setIsContinuationLoading(false);
    }
  }, [
    isContinuationLoading, selectedScaffolds, panelSelection,
    slotAConfigured, slotBConfigured, slots, noMarkdown,
  ]);

  const handleContinuationReset = useCallback(() => {
    setContinuationResults([]);
    setContinuationProgress(null);
    setContinuationError(null);
  }, []);

  // ---- Bundle export ------------------------------------------------------
  // "Grammar data bundle": exports whatever Grammar Probe data the researcher
  // has generated so far — Phase A prevalence runs, Phase B top-K continuations,
  // and Phase E temperature sweeps — into a single analysable JSON document.
  // Previously this required embeddings and exported geometry scatter points;
  // since LLMbench's slot providers don't reliably expose embedding endpoints,
  // we now export the raw logprob + prose data and let downstream tools
  // (Manifold Atlas, notebooks) compute geometry against their own embedders.
  const handleDownloadBundle = useCallback(() => {
    const hasAny = runs.length > 0 || continuationResults.length > 0 || sweepRuns.length > 0;
    if (!hasAny) return;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

    const slotA = slots.A;
    const slotB = slots.B;
    const modelName = slotA.customModelId || slotA.model;

    const phases = (["A", "B", "C", "D", "E"] as const).filter(p => {
      if (p === "A") return runs.length > 0;
      if (p === "B") return continuationResults.length > 0;
      if (p === "C") return forcedExpansions.length > 0;
      if (p === "D") return perturbationRuns.length > 0;
      return sweepRuns.length > 0;
    });
    // `phase` (singular) is the dominant phase for importers that expect
    // a single identifier (e.g. Manifold Atlas checks `source.phase` when
    // routing between its geometry and prevalence views). `phases` (plural)
    // carries the full set so importers that support multi-phase bundles
    // can use it directly.
    const dominantPhase = phases.includes("B") ? "B" : phases[0] ?? null;

    // Extract X term from a scaffold using the pattern's xExtractor regex.
    // Used to build the canonical `probes[].x` field per the v1 spec
    // (vector-lab-design/GRAMMAR-PROBE-BUNDLE.md). Falls back to empty
    // string on any error or no match — Atlas treats empty x defensively.
    const extractXFromScaffold = (scaffold: string): string => {
      if (!pattern.xExtractor) return "";
      try {
        const re = new RegExp(pattern.xExtractor);
        const m = scaffold.match(re);
        return m?.[1]?.trim() ?? "";
      } catch {
        return "";
      }
    };

    // Canonical `probes[]` per Grammar Probe Bundle spec v1. Atlas's
    // importer is shaped to this exact contract: a flat array of probes,
    // each carrying its scaffold, the extracted X term, the chosen first
    // token, and a ranked ys[] of top-K alternatives. We derive from
    // continuationResults (Phase B) filtered to Panel A — the producing
    // slot is single-model in spec terms, so we report Panel A's data
    // and leave Panel B's continuation entries as an LLMbench-side
    // extension (in `continuationProbes` below) for tools that can use
    // the dual-panel data.
    const canonicalProbes = continuationResults
      .filter(c => c.panel === "A" && !c.error)
      .map(c => ({
        scaffoldId: c.scaffoldId,
        scaffold: c.scaffold,
        x: extractXFromScaffold(c.scaffold),
        chosen: c.chosen,
        ys: (c.distribution ?? []).map((d, i) => ({
          token: d.token,
          logprob: d.logprob,
          rank: i + 1,
        })),
        provenance: c.provenance
          ? { responseTimeMs: c.provenance.responseTimeMs }
          : undefined,
      }));

    const bundle = {
      format: "vector-lab.grammar-probe.v1",
      createdAt: now.toISOString(),
      source: {
        tool: "LLMbench",
        version: "2.15.25",
        // Spec field — singular, dominant phase (Atlas routes on this).
        phase: dominantPhase,
        // LLMbench extension — full set when the bundle covers multiple
        // phases. Spec consumers ignore unknown optional fields.
        phases,
      },
      pattern: {
        id: pattern.id,
        label: pattern.label,
        category: pattern.category,
        note: pattern.note,
      },
      // Canonical `model` field per spec v1 — flat single-model object
      // describing the slot that produced `probes[]`. The producing slot
      // for Phase B/C is Panel A; if the user runs both panels through
      // continuation, the dual-panel data is preserved in the LLMbench
      // extension `continuationProbes` below.
      model: {
        provider: slotA.provider,
        name: slotA.customModelId || slotA.model,
        displayName: getSlotLabel("A"),
      },
      // Canonical `parameters` per spec v1 — Phase B canonical values
      // for the run that produced `probes[]`. (Phase A and Phase E
      // sweep across multiple temperatures; the LLMbench extension
      // `parametersAll` below carries those for tools that need the
      // full sweep configuration.)
      parameters: {
        temperature: 0,
        topK: CONTINUATION_TOP_K,
        maxTokens: 1,
        noMarkdown,
      },
      // Canonical `probes[]` per spec v1.
      probes: canonicalProbes,
      // ---- LLMbench extensions below ----
      // The spec says consumers MUST ignore unknown optional fields, so
      // the rich phase-specific data we collect (multi-pattern, dual-
      // panel, sweep, perturbation) is preserved alongside the canonical
      // fields. Atlas's importer reads only the canonical fields; tools
      // that want the richer data can read these.
      selectedPatterns: selectedPatterns.map(p => ({
        id: p.id, label: p.label, category: p.category,
      })),
      models: {
        A: {
          provider: slotA.provider,
          name: slotA.customModelId || slotA.model,
          displayName: getSlotLabel("A"),
        },
        B: {
          provider: slotB.provider,
          name: slotB.customModelId || slotB.model,
          displayName: getSlotLabel("B"),
        },
      },
      parametersAll: {
        prevalenceTemperatures: PREVALENCE_TEMPS,
        sweepTemperatures: SWEEP_TEMPS,
        continuationTopK: CONTINUATION_TOP_K,
      },
      // Phase A: generated prose + per-pattern hit counts for every
      // selected construction (so downstream tools can re-score without
      // re-running the model).
      prevalenceRuns: runs.map(r => ({
        runIndex: r.runIndex,
        panel: r.panel,
        promptId: r.promptId,
        register: r.register,
        prompt: r.prompt,
        temperature: r.temperature,
        text: r.text,
        error: r.error,
        provenance: r.provenance,
        perPatternHits: Object.fromEntries(selectedPatterns.map(p => [
          p.id, r.text ? countMatches(r.text, p) : 0,
        ])),
      })),
      // Phase B: top-K next-token distributions per scaffold per panel.
      // This is the raw material downstream tools (e.g. Manifold Atlas)
      // can embed against their own embedder to reconstruct geometry.
      continuationProbes: continuationResults.map(c => ({
        scaffoldId: c.scaffoldId,
        panel: c.panel,
        scaffold: c.scaffold,
        chosen: c.chosen,
        distribution: c.distribution,
        provenance: c.provenance,
        error: c.error,
      })),
      // Phase C: forced-continuation Y-phrase expansions, one row per
      // (scaffold, top-N Y token) pair. Consumed by Manifold Atlas for
      // Grammar-of-Vectors cosine scrutiny.
      forcedExpansions: forcedExpansions.map(e => ({
        scaffoldId: e.scaffoldId,
        scaffold: e.scaffold,
        panel: e.panel,
        rank: e.rank,
        token: e.token,
        tokenLogprob: e.tokenLogprob,
        phrase: e.phrase,
        error: e.error,
      })),
      // Phase D: perturbation runs, tagged by framing (neutral/anti/pro).
      perturbationRuns: perturbationRuns.map(r => ({
        runIndex: r.runIndex,
        panel: r.panel,
        promptId: r.promptId,
        register: r.register,
        prompt: r.prompt,
        temperature: r.temperature,
        framing: r.framing,
        text: r.text,
        error: r.error,
        provenance: r.provenance,
        perPatternHits: Object.fromEntries(selectedPatterns.map(p => [
          p.id, r.text ? countMatches(r.text, p) : 0,
        ])),
      })),
      // Phase E: temperature sweep runs (same shape as Phase A but across
      // {0, 0.3, 0.7, 1.0, 1.5}).
      sweepRuns: sweepRuns.map(r => ({
        runIndex: r.runIndex,
        panel: r.panel,
        promptId: r.promptId,
        register: r.register,
        prompt: r.prompt,
        temperature: r.temperature,
        text: r.text,
        error: r.error,
        provenance: r.provenance,
        perPatternHits: Object.fromEntries(selectedPatterns.map(p => [
          p.id, r.text ? countMatches(r.text, p) : 0,
        ])),
      })),
    };

    const fname = `grammar-probe_${pattern.id}_${modelName.replace(/[^a-z0-9-]/gi, "-")}_${stamp}.grammar.json`;
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [runs, continuationResults, sweepRuns, forcedExpansions, perturbationRuns, pattern, selectedPatterns, slots, getSlotLabel, noMarkdown]);

  // ---- Phase C: Forced continuation / Y-phrase expansion -------------------
  // For each scaffold already probed in Phase B, take the top-N highest
  // logprob tokens (the candidate Ys) and ask the model to expand each one
  // into a short continuation phrase (via /api/investigate/grammar-expand).
  // The result is a (scaffold, Y-token, Y-phrase) table harvestable for
  // downstream cosine geometry in Manifold Atlas.
  const handleRunForced = useCallback(async () => {
    if (isForcedLoading) return;
    if (continuationResults.length === 0) {
      setForcedError("Run Phase B first — Phase C expands the top-K tokens returned by the continuation probe.");
      return;
    }
    const slot = panelSelection === "B" && slotBConfigured ? slots.B : slots.A;
    if (!isSlotConfigured(panelSelection === "B" ? "B" : "A")) {
      setForcedError("Configure a model slot before running Phase C.");
      return;
    }
    // Build (scaffold, token) pairs from Phase B results. Dedup by scaffold;
    // use one panel per scaffold to keep volume manageable.
    const byScaffold = new Map<string, ContinuationResult>();
    for (const r of continuationResults) {
      if (r.error || !r.distribution?.length) continue;
      // Prefer the panel we're running Phase C against; otherwise the first
      // one we see.
      const preferredPanel: "A" | "B" = panelSelection === "B" ? "B" : "A";
      if (!byScaffold.has(r.scaffoldId) || r.panel === preferredPanel) {
        byScaffold.set(r.scaffoldId, r);
      }
    }
    const pairs: { scaffoldId: string; scaffold: string; token: string; rank: number; logprob: number }[] = [];
    for (const r of byScaffold.values()) {
      const top = r.distribution.slice(0, forcedTopN);
      top.forEach((t, rank) => {
        pairs.push({
          scaffoldId: r.scaffoldId, scaffold: r.scaffold,
          token: t.token, rank, logprob: t.logprob,
        });
      });
    }
    if (pairs.length === 0) {
      setForcedError("No usable scaffolds from Phase B (all errored or returned empty distributions).");
      return;
    }

    setIsForcedLoading(true);
    setForcedError(null);
    setForcedExpansions([]);
    setForcedProgress({ done: 0, total: pairs.length });

    try {
      await fetchStreaming<StreamEvent>(
        "/api/investigate/grammar-expand",
        {
          pairs: pairs.map(p => ({ scaffoldId: p.scaffoldId, scaffold: p.scaffold, token: p.token })),
          slot,
          maxTokens: 6,
        },
        (event) => {
          if (event.type === "expansion") {
            // Match back to the originating pair to preserve rank and
            // logprob — the stream returns one event per pair in order.
            setForcedExpansions(prev => {
              const pair = pairs[prev.length];
              if (!pair) return prev;
              const exp: ForcedExpansion = {
                scaffoldId: event.scaffoldId,
                scaffold: pair.scaffold,
                panel: panelSelection === "B" ? "B" : "A",
                rank: pair.rank,
                token: event.token,
                tokenLogprob: pair.logprob,
                phrase: event.phrase ?? null,
                error: event.error,
              };
              return [...prev, exp];
            });
            setForcedProgress(p => p ? { ...p, done: p.done + 1 } : p);
          }
        }
      );
    } catch (err) {
      setForcedError(err instanceof Error ? err.message : "Phase C expansion failed");
    } finally {
      setIsForcedLoading(false);
    }
  }, [isForcedLoading, continuationResults, slots, panelSelection, slotBConfigured,
      isSlotConfigured, forcedTopN]);

  // ---- Phase D: Perturbation ---------------------------------------------
  // Reuses Phase A's prevalence backend. Each selected prompt becomes three
  // prompts (neutral / anti / pro) by prepending a framing directive; we tag
  // each returned run by its framing via a suffix on the promptId, then
  // aggregate per (pattern × framing) client-side.
  const handleRunPerturbation = useCallback(async () => {
    if (isPerturbationLoading || selectedPrompts.length === 0) return;
    const usingBoth = panelSelection === "both" && slotBConfigured;
    if (!slotAConfigured && !usingBoth) {
      setPerturbationError("Configure at least one model slot before running.");
      return;
    }
    // Framing instructions are keyed to the primary pattern: anti suppresses
    // its characteristic move; pro invites it explicitly. We use the
    // pattern's shortLabel as a human-readable cue so the model knows what
    // to suppress or use.
    const antiDirective =
      `Respond to the following request without using the "${pattern.shortLabel}" construction or any similar antithetical / contrastive framing. Be direct. Do not say "not X but Y" patterns, do not stage false dilemmas, do not build the response around contrast. `;
    const proDirective =
      `You may freely use the "${pattern.shortLabel}" construction, antithesis, and contrastive framing where it fits. `;

    const framings: { id: PerturbationFraming; prefix: string }[] = [
      { id: "neutral", prefix: "" },
      { id: "anti", prefix: antiDirective },
      { id: "pro", prefix: proDirective },
    ];

    // One temperature to keep volume manageable (Phase A runs 2, Phase E
    // runs 5; Phase D × 3 framings would blow up otherwise).
    const PERTURBATION_TEMP = 0.7;
    const expandedPrompts = framings.flatMap(f =>
      selectedPrompts.map(p => ({
        id: `${p.id}::${f.id}`,
        prompt: `${f.prefix}${p.prompt}`,
        register: p.register,
      }))
    );

    setIsPerturbationLoading(true);
    setPerturbationError(null);
    setPerturbationRuns([]);
    const total = expandedPrompts.length * (usingBoth ? 2 : 1);
    setPerturbationProgress({ done: 0, total });

    try {
      const slotAConfigForRun = panelSelection === "B" ? slots.B : slots.A;
      const slotBForRun = usingBoth ? slots.B : null;

      await fetchStreaming<StreamEvent>(
        "/api/investigate/grammar-prevalence",
        {
          prompts: expandedPrompts,
          temperatures: [PERTURBATION_TEMP],
          slotA: { ...slotAConfigForRun, temperature: PERTURBATION_TEMP, systemPrompt: "" },
          slotB: slotBForRun ? { ...slotBForRun, temperature: PERTURBATION_TEMP, systemPrompt: "" } : null,
          noMarkdown,
        },
        (event) => {
          if (event.type === "run") {
            const compoundId: string = event.promptId;
            const sep = "::";
            const idx = compoundId.lastIndexOf(sep);
            const basePromptId = idx >= 0 ? compoundId.slice(0, idx) : compoundId;
            const framing: PerturbationFraming = (idx >= 0 ? compoundId.slice(idx + sep.length) : "neutral") as PerturbationFraming;
            const originalPrompt = selectedPrompts.find(p => p.id === basePromptId)?.prompt ?? event.prompt;
            setPerturbationRuns(prev => [
              ...prev,
              {
                runIndex: prev.length,
                panel: event.panel,
                promptId: basePromptId,
                register: event.register,
                prompt: originalPrompt,
                temperature: event.temperature,
                text: event.result?.text,
                error: event.result?.error,
                provenance: event.result?.provenance,
                framing,
              },
            ]);
            setPerturbationProgress(p => p ? { ...p, done: p.done + 1 } : p);
          }
        }
      );
    } catch (err) {
      setPerturbationError(err instanceof Error ? err.message : "Perturbation run failed");
    } finally {
      setIsPerturbationLoading(false);
    }
  }, [isPerturbationLoading, selectedPrompts, panelSelection, slotAConfigured,
      slotBConfigured, slots, noMarkdown, pattern]);

  // ---- Phase E: Temperature sweep -----------------------------------------
  const handleRunSweep = useCallback(async () => {
    if (isSweepLoading || selectedPrompts.length === 0) return;
    const usingBoth = panelSelection === "both" && slotBConfigured;
    if (!slotAConfigured && !usingBoth) {
      setSweepError("Configure at least one model in Settings before running.");
      return;
    }

    setIsSweepLoading(true);
    setSweepError(null);
    setSweepRuns([]);
    setIsSweepDone(false);
    const totalExpected =
      selectedPrompts.length *
      SWEEP_TEMPS.length *
      (usingBoth ? 2 : 1);
    setSweepProgress({ done: 0, total: totalExpected });

    try {
      const slotA = panelSelection === "B" ? slots.B : slots.A;
      const slotB = usingBoth ? slots.B : null;

      await fetchStreaming<StreamEvent>(
        "/api/investigate/grammar-prevalence",
        {
          prompts: selectedPrompts.map(p => ({ id: p.id, prompt: p.prompt, register: p.register })),
          temperatures: SWEEP_TEMPS,
          slotA,
          slotB,
          noMarkdown,
        },
        (event) => {
          if (event.type === "meta") {
            setSweepProgress({ done: 0, total: event.totalRuns });
          } else if (event.type === "run") {
            const r = event;
            setSweepRuns(prev => [
              ...prev,
              {
                runIndex: r.runIndex,
                panel: r.panel,
                promptId: r.promptId,
                register: r.register,
                prompt: r.prompt,
                temperature: r.temperature,
                text: r.result?.text,
                error: r.result?.error,
                provenance: r.result?.provenance,
              },
            ]);
            setSweepProgress(p => p ? { ...p, done: p.done + 1 } : p);
          } else if (event.type === "done") {
            setIsSweepDone(true);
          }
        },
      );
    } catch (err) {
      setSweepError(err instanceof Error ? err.message : "Sweep failed");
    } finally {
      setIsSweepLoading(false);
    }
  }, [isSweepLoading, selectedPrompts, panelSelection, slotAConfigured, slotBConfigured, slots, noMarkdown]);

  const handleSweepReset = useCallback(() => {
    setSweepRuns([]);
    setSweepProgress(null);
    setSweepError(null);
    setIsSweepDone(false);
  }, []);

  // ---- Derived prevalence stats (per pattern, per run) ----
  type ScoredRun = RunRecord & { hitCount: number; matches: ReturnType<typeof findMatchSpans> };
  const scoredRuns: ScoredRun[] = useMemo(() => {
    return runs.map(r => ({
      ...r,
      hitCount: r.text ? countMatches(r.text, pattern) : 0,
      matches: r.text ? findMatchSpans(r.text, pattern, 20) : [],
    }));
  }, [runs, pattern]);

  interface CellSummary {
    panel: "A" | "B";
    promptId: string;
    temperature: number;
    hits: number;
    text: string | null;
    error: string | null;
  }
  const cells: CellSummary[] = scoredRuns.map(r => ({
    panel: r.panel,
    promptId: r.promptId,
    temperature: r.temperature,
    hits: r.hitCount,
    text: r.text ?? null,
    error: r.error ?? null,
  }));

  const aggregateBy = (predicate: (c: CellSummary) => boolean) => {
    const ms = cells.filter(predicate);
    if (ms.length === 0) return null;
    const textedRuns = ms.filter(c => c.text);
    const hits = ms.reduce((s, c) => s + c.hits, 0);
    const runsWithHit = textedRuns.filter(c => c.hits > 0).length;
    return {
      runs: textedRuns.length,
      hits,
      runsWithHit,
      avgHitsPerRun: textedRuns.length > 0 ? hits / textedRuns.length : 0,
      hitRate: textedRuns.length > 0 ? runsWithHit / textedRuns.length : 0,
    };
  };

  const overall = aggregateBy(() => true);

  // Panel A vs B
  const perPanel = (["A", "B"] as const).map(p => ({
    panel: p,
    label: getSlotLabel(p),
    stats: aggregateBy(c => c.panel === p),
  })).filter(x => x.stats && x.stats.runs > 0);

  // Per temperature
  const perTemp = PREVALENCE_TEMPS.map(t => ({
    temperature: t,
    stats: aggregateBy(c => c.temperature === t),
  })).filter(x => x.stats && x.stats.runs > 0);

  // Per suite (reflects which suite each prompt came from, stratified by
  // purpose/domain so the user can compare baseline vs invitation vs
  // resistance, or cross-domain prevalence).
  const perSuite = Array.from(activeSuiteIds)
    .map(id => {
      const s = GRAMMAR_SUITES.find(x => x.id === id);
      if (!s) return null;
      return {
        suite: s,
        stats: aggregateBy(c => suiteOfPrompt(c.promptId)?.id === id),
      };
    })
    .filter((x): x is { suite: typeof GRAMMAR_SUITES[number]; stats: ReturnType<typeof aggregateBy> } =>
      !!x && !!x.stats && x.stats.runs > 0
    );

  // Per register
  const registerOf = (promptId: string): GrammarRegister | undefined =>
    suite.find(p => p.id === promptId)?.register;
  const registers: GrammarRegister[] = ["speech", "op-ed", "explain", "technical", "poetic", "dialogue"];
  const perRegister = registers.map(r => ({
    register: r,
    stats: aggregateBy(c => registerOf(c.promptId) === r),
  })).filter(x => x.stats && x.stats.runs > 0);

  const verdict = (() => {
    if (!overall || overall.runs === 0) return null;
    const rate = overall.hitRate;
    if (rate >= 0.6) return { level: "high" as const, text: "Pattern is prevalent — appears in a majority of runs." };
    if (rate >= 0.25) return { level: "moderate" as const, text: "Pattern is common — present in a substantial minority of runs." };
    return { level: "low" as const, text: "Pattern is rare in this suite." };
  })();

  const levelColors = {
    low: "text-emerald-700 dark:text-emerald-400 border-l-emerald-400",
    moderate: "text-amber-700 dark:text-amber-400 border-l-amber-500",
    high: "text-burgundy border-l-burgundy",
  };

  const toggleSuite = (id: GrammarSuiteKind) => {
    setActiveSuiteIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Don't let the user deselect the last suite — leaves nothing to run.
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    if (on) setSelectedPromptIds(new Set(suite.map(p => p.id)));
    else setSelectedPromptIds(new Set());
  };

  const togglePrompt = (id: string) => {
    setSelectedPromptIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Heatmap intensity: 0–3+ hits → five-step gradient
  const heatColor = (hits: number, hasRun: boolean) => {
    if (!hasRun) return "bg-muted/20 text-muted-foreground/40";
    if (hits === 0) return "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300";
    if (hits === 1) return "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200";
    if (hits === 2) return "bg-amber-200 dark:bg-amber-800/50 text-amber-900 dark:text-amber-100";
    return "bg-burgundy/30 dark:bg-burgundy/40 text-burgundy dark:text-amber-100";
  };

  const cellFor = (panel: "A" | "B", promptId: string, temperature: number) =>
    cells.find(c => c.panel === panel && c.promptId === promptId && c.temperature === temperature);

  const panelsShown: ("A" | "B")[] = panelSelection === "both"
    ? (slotBConfigured ? ["A", "B"] : ["A"])
    : panelSelection === "B" ? ["B"] : ["A"];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background">
      {/* Sticky toolbar */}
      <div className="px-4 py-2 border-b border-border bg-cream/20 flex flex-wrap items-center gap-2">
        <Microscope className="w-4 h-4 text-burgundy" />
        <span className="font-display text-body-sm font-semibold">Grammar Probe</span>
        <span className="text-caption text-muted-foreground">
          — generation-side investigation of rhetorical patterns
        </span>
        <div className="flex-1" />
        <ModelSelector value={panelSelection} onChange={setPanelSelection} disabled={isLoading} />
      </div>

      {/* Phase tabs */}
      <div className="px-4 py-1.5 border-b border-border bg-card flex items-center gap-1 text-caption">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-semibold mr-2 select-none">Phase</span>
        {PHASES.map(phase => (
          <button
            key={phase.id}
            onClick={() => phase.available && setActivePhase(phase.id)}
            disabled={!phase.available}
            className={`px-2.5 py-1 text-caption font-medium rounded-sm transition-colors ${
              activePhase === phase.id
                ? "bg-burgundy/10 text-burgundy"
                : phase.available
                  ? "text-muted-foreground hover:text-foreground hover:bg-cream/50"
                  : "text-muted-foreground/40 cursor-not-allowed"
            }`}
            title={phase.description + (phase.available ? "" : " — coming soon")}
          >
            {phase.label}
            {!phase.available && <span className="ml-1 text-[9px] opacity-60">soon</span>}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-6xl mx-auto px-4 py-4">

          {activePhase !== "prevalence" && activePhase !== "continuation" && activePhase !== "temperature" && activePhase !== "forced" && activePhase !== "perturbation" && (
            <div className="border border-parchment/60 rounded-sm p-4 bg-cream/20 text-body-sm text-muted-foreground">
              <strong className="text-foreground">Coming soon.</strong> {PHASES.find(p => p.id === activePhase)?.description}
            </div>
          )}

          {activePhase === "continuation" && (
            <>
              <PatternPicker
                selectedIds={selectedPatternIds}
                primaryId={patternId}
                onToggle={togglePatternSelected}
                onPromote={promotePatternToPrimary}
                allowSingleSelectOnly
              />

              {/* Capability note */}
              <div className="mb-3 text-caption text-muted-foreground border-l-2 border-parchment/60 pl-2">
                Requires a provider that exposes next-token logprobs: Gemini 2.0, OpenAI, OpenRouter, or Hugging Face.
                Gemini 2.5 is <em>not</em> supported. Each scaffold consumes one token of output.
              </div>

              {/* Scaffold list */}
              <div className="mb-3 border border-parchment/60 rounded-sm bg-card">
                <div className="px-3 py-2 border-b border-parchment/60 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold flex items-center justify-between">
                  <span>Scaffolds</span>
                  <span className="text-muted-foreground/60 normal-case tracking-normal">
                    {selectedScaffolds.length} / {pattern.scaffolds.length} selected
                  </span>
                </div>
                <div className="divide-y divide-parchment/30">
                  {pattern.scaffolds.map((text, idx) => (
                    <label key={idx} className="flex items-start gap-2 px-3 py-1.5 text-caption hover:bg-cream/30 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedScaffoldIdx.has(idx)}
                        onChange={() => toggleScaffold(idx)}
                        className="mt-0.5 accent-burgundy"
                      />
                      <span className="font-mono text-[11px] text-foreground">{text}<span className="text-muted-foreground/50">▋</span></span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Controls */}
              <div className="mb-3 flex items-center gap-3 flex-wrap">
                <div className="text-caption text-muted-foreground">
                  Top-K: <span className="font-mono">{CONTINUATION_TOP_K}</span>
                  {" · "}
                  {selectedScaffolds.length * panelsShown.length} probes expected
                </div>
                <div className="flex-1" />
                <button
                  onClick={handleContinuationReset}
                  disabled={isContinuationLoading || continuationResults.length === 0}
                  className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5 disabled:opacity-30"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
                <button
                  onClick={handleRunContinuation}
                  disabled={isContinuationLoading || selectedScaffolds.length === 0 || (!slotAConfigured && !slotBConfigured)}
                  className="px-3 py-1 text-caption font-medium rounded-sm bg-burgundy text-white hover:bg-burgundy/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  {isContinuationLoading ? "Probing…" : "Run continuation"}
                </button>
              </div>

              {/* Progress */}
              {isContinuationLoading && continuationProgress && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-caption text-muted-foreground mb-1">
                    <span>Probing… {continuationProgress.done} / {continuationProgress.total}</span>
                    <span>{continuationProgress.total > 0 ? Math.round(100 * continuationProgress.done / continuationProgress.total) : 0}%</span>
                  </div>
                  <div className="h-1.5 bg-parchment/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-burgundy transition-all"
                      style={{ width: `${continuationProgress.total > 0 ? Math.round(100 * continuationProgress.done / continuationProgress.total) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {continuationError && (
                <div className="mb-3 border border-red-400 bg-red-50 dark:bg-red-900/30 rounded-sm p-2 text-caption flex items-start gap-2 text-red-800 dark:text-red-200">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{continuationError}</span>
                </div>
              )}

              {/* Results */}
              {continuationResults.length > 0 && (
                <div className="space-y-3">
                  {selectedScaffolds.map(s => {
                    const forScaffold = continuationResults.filter(r => r.scaffoldId === s.id);
                    if (forScaffold.length === 0) return null;
                    return (
                      <div key={s.id} className="border border-parchment/60 rounded-sm bg-card overflow-hidden">
                        <div className="px-3 py-2 border-b border-parchment/60 text-caption flex items-center gap-2">
                          <BarChart3 className="w-3.5 h-3.5 text-burgundy shrink-0" />
                          <span className="font-mono text-[11px] text-foreground truncate">{s.text}<span className="text-muted-foreground/50">▋</span></span>
                        </div>
                        <div className={`grid ${forScaffold.length > 1 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"} divide-x divide-parchment/30`}>
                          {forScaffold.map((r, i) => (
                            <ContinuationCard key={i} result={r} suppressTokens={pattern.suppressTokens} panelLabel={getSlotLabel(r.panel)} />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Initial-state helper */}
              {continuationResults.length === 0 && !isContinuationLoading && (
                <div className="text-caption text-muted-foreground border border-dashed border-parchment/60 rounded-sm p-4 text-center">
                  Select scaffolds and press <strong>Run continuation</strong> to fetch the top-{CONTINUATION_TOP_K} next-token distribution
                  at the opening of the construction. Tokens that the pattern typically relies on are highlighted in <span className="text-burgundy font-semibold">burgundy</span>.
                </div>
              )}

              {/* ---- Scaffold concentration + bundle export --------------- */}
              {continuationResults.length > 0 && (
                <div className="mt-5 pt-4 border-t border-parchment/60">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Sigma className="w-3.5 h-3.5 text-burgundy" />
                      <span className="text-caption font-semibold text-foreground">Scaffold concentration</span>
                      <span className="text-caption text-muted-foreground">— top-1 probability, entropy, cliché share</span>
                    </div>
                    <button
                      onClick={handleDownloadBundle}
                      disabled={
                        runs.length === 0 &&
                        continuationResults.length === 0 &&
                        sweepRuns.length === 0
                      }
                      className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5 disabled:opacity-30"
                      title="Export all Grammar Probe data (Phase A runs, Phase B distributions, Phase E sweep) as .grammar.json"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Grammar data bundle
                    </button>
                  </div>

                  <div className="text-caption text-muted-foreground border-l-2 border-parchment/60 pl-2 mb-2">
                    For each scaffold, how concentrated is the next-token distribution on the
                    antithesis slot filler? <strong>Top-1 p</strong> is the probability mass on the single
                    most-likely token; <strong>H</strong> is Shannon entropy (bits) over the returned top-{CONTINUATION_TOP_K};
                    <strong> cliché share</strong> is the summed probability of the pattern&apos;s expected slot tokens ({pattern.suppressTokens.slice(0,4).map(t => `"${t}"`).join(", ")}…).
                    High top-1 + low entropy + high cliché share = the model is parked in the construction&apos;s groove.
                  </div>

                  <ScaffoldConcentrationTable
                    results={continuationResults}
                    suppressTokens={pattern.suppressTokens}
                    getSlotLabel={getSlotLabel}
                  />
                </div>
              )}
            </>
          )}

          {activePhase === "forced" && (
            <>
              <ForcedContinuationPanel
                pattern={pattern}
                continuationResults={continuationResults}
                forcedExpansions={forcedExpansions}
                isForcedLoading={isForcedLoading}
                forcedProgress={forcedProgress}
                forcedError={forcedError}
                forcedTopN={forcedTopN}
                setForcedTopN={setForcedTopN}
                handleRunForced={handleRunForced}
                getSlotLabel={getSlotLabel}
                panelSelection={panelSelection}
              />
              {forcedExpansions.length > 0 && (
                <div className="mt-3">
                  <ForcedContinuationDeepDive
                    expansions={forcedExpansions}
                    pattern={pattern}
                  />
                </div>
              )}
            </>
          )}

          {activePhase === "perturbation" && (
            <>
              <PerturbationPanel
                pattern={pattern}
                selectedPatterns={selectedPatterns}
                selectedPrompts={selectedPrompts}
                perturbationRuns={perturbationRuns}
                isLoading={isPerturbationLoading}
                progress={perturbationProgress}
                error={perturbationError}
                onRun={handleRunPerturbation}
                patternId={patternId}
                selectedPatternIds={selectedPatternIds}
                togglePatternSelected={togglePatternSelected}
                promotePatternToPrimary={promotePatternToPrimary}
                panelSelection={panelSelection}
                getSlotLabel={getSlotLabel}
              />
              {perturbationRuns.length > 0 && (
                <div className="mt-3">
                  <PerturbationDeepDive
                    runs={perturbationRuns}
                    pattern={pattern}
                    selectedPrompts={selectedPrompts}
                  />
                </div>
              )}
            </>
          )}

          {activePhase === "temperature" && (
            <>
              <TemperatureSweepPanel
                pattern={pattern}
                patternId={patternId}
                setPatternId={setPatternId}
                selectedPatternIds={selectedPatternIds}
                selectedPatterns={selectedPatterns}
                togglePatternSelected={togglePatternSelected}
                promotePatternToPrimary={promotePatternToPrimary}
                suitePrompts={suite}
                selectedPrompts={selectedPrompts}
                selectedPromptIds={selectedPromptIds}
                setSelectedPromptIds={setSelectedPromptIds}
                panelSelection={panelSelection}
                slots={slots}
                getSlotLabel={getSlotLabel}
                slotAConfigured={slotAConfigured}
                slotBConfigured={slotBConfigured}
                sweepRuns={sweepRuns}
                isSweepLoading={isSweepLoading}
                sweepProgress={sweepProgress}
                sweepError={sweepError}
                isSweepDone={isSweepDone}
                onRun={handleRunSweep}
                onReset={handleSweepReset}
              />
              {sweepRuns.length > 0 && (
                <div className="mt-3">
                  <TemperatureSweepDeepDive
                    sweepRuns={sweepRuns}
                    selectedPatterns={selectedPatterns}
                    sweepTemps={SWEEP_TEMPS}
                  />
                </div>
              )}
            </>
          )}

          {activePhase === "prevalence" && (
            <>
              <PatternPicker
                selectedIds={selectedPatternIds}
                primaryId={patternId}
                onToggle={togglePatternSelected}
                onPromote={promotePatternToPrimary}
              />

              {/* Suite picker */}
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
                  Prompt suites
                </div>
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {GRAMMAR_SUITES.filter(s => s.category === "purpose").map(s => {
                    const active = activeSuiteIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleSuite(s.id)}
                        title={s.description}
                        className={`px-2.5 py-1 text-caption rounded-sm border transition-colors ${
                          active
                            ? "border-burgundy bg-burgundy/10 text-burgundy"
                            : "border-parchment bg-card text-muted-foreground hover:text-foreground hover:bg-cream/50"
                        }`}
                      >
                        {s.shortLabel}
                      </button>
                    );
                  })}
                  <div className="w-px h-6 bg-parchment/60 self-center mx-1" />
                  {GRAMMAR_SUITES.filter(s => s.category === "domain").map(s => {
                    const active = activeSuiteIds.has(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleSuite(s.id)}
                        title={s.description}
                        className={`px-2.5 py-1 text-caption rounded-sm border transition-colors ${
                          active
                            ? "border-burgundy bg-burgundy/10 text-burgundy"
                            : "border-parchment bg-card text-muted-foreground hover:text-foreground hover:bg-cream/50"
                        }`}
                      >
                        {s.shortLabel}
                      </button>
                    );
                  })}
                </div>
                <div className="text-caption text-muted-foreground leading-relaxed">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mr-1.5">Purpose</span>
                  baseline · invite · resist · adversarial
                  <span className="mx-2 text-muted-foreground/40">|</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mr-1.5">Domain</span>
                  politics, tech, science, ethics, pedagogy, everyday
                </div>
              </div>

              {/* Suite controls */}
              <div className="mb-3 flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setShowSuiteEditor(v => !v)}
                  className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
                  disabled={suite.length === 0}
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Prompts ({selectedPrompts.length}/{suite.length})
                </button>
                <div className="text-caption text-muted-foreground">
                  Temperatures: <span className="font-mono">0, 0.7</span>
                  {" · "}
                  {selectedPrompts.length * PREVALENCE_TEMPS.length * panelsShown.length} runs expected
                </div>
                <div className="flex-1" />
                <button
                  onClick={handleReset}
                  disabled={isLoading || runs.length === 0}
                  className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5 disabled:opacity-30"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
                <button
                  onClick={handleRun}
                  disabled={isLoading || selectedPrompts.length === 0 || (!slotAConfigured && !slotBConfigured)}
                  className="px-3 py-1 text-caption font-medium rounded-sm bg-burgundy text-white hover:bg-burgundy/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <Play className="w-3.5 h-3.5" />
                  {isLoading ? "Running…" : "Run prevalence"}
                </button>
              </div>

              {showSuiteEditor && (
                <div className="mb-4 border border-parchment/60 rounded-sm p-3 bg-card">
                  <div className="flex items-center gap-3 mb-2 text-caption">
                    <button onClick={() => toggleAll(true)}  className="text-burgundy hover:underline">Select all</button>
                    <button onClick={() => toggleAll(false)} className="text-burgundy hover:underline">Clear</button>
                    <span className="text-muted-foreground">Edit the prompt suite for this probe. Custom prompts coming soon.</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {suite.map(p => (
                      <label key={p.id} className="flex items-start gap-2 text-caption p-1.5 rounded-sm hover:bg-cream/40 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPromptIds.has(p.id)}
                          onChange={() => togglePrompt(p.id)}
                          className="mt-0.5 accent-burgundy"
                        />
                        <span className="min-w-0">
                          <span className="inline-block text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold mr-1.5">
                            {REGISTER_LABELS[p.register]}
                          </span>
                          <span className="text-foreground">{p.prompt}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress */}
              {isLoading && progress && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-caption text-muted-foreground mb-1">
                    <span>Generating… {progress.done} / {progress.total}</span>
                    <span>{progress.total > 0 ? Math.round(100 * progress.done / progress.total) : 0}%</span>
                  </div>
                  <div className="h-1.5 bg-parchment/40 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-burgundy transition-all"
                      style={{ width: `${progress.total > 0 ? Math.round(100 * progress.done / progress.total) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-3 border border-red-400 bg-red-50 dark:bg-red-900/30 rounded-sm p-2 text-caption flex items-start gap-2 text-red-800 dark:text-red-200">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Summary banner */}
              {runs.length > 0 && verdict && (
                <div className={`mb-4 pl-3 py-2 border-l-4 bg-card rounded-sm ${levelColors[verdict.level]}`}>
                  <div className="text-body-sm font-semibold">{verdict.text}</div>
                  <div className="text-caption text-muted-foreground mt-0.5">
                    {overall && (
                      <>
                        Hit rate: <strong className="text-foreground">{(overall.hitRate * 100).toFixed(0)}%</strong>
                        {" "}({overall.runsWithHit}/{overall.runs} runs)
                        {" · "}Total hits: <strong className="text-foreground">{overall.hits}</strong>
                        {" · "}Avg per run: <strong className="text-foreground">{overall.avgHitsPerRun.toFixed(2)}</strong>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Per-suite + per-panel + per-temperature + per-register quick stats */}
              {runs.length > 0 && perSuite.length > 1 && (
                <div className="mb-3 border border-parchment/60 rounded-sm p-3 bg-card">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
                    By suite <span className="text-muted-foreground/60 normal-case tracking-normal">— purpose & domain conditions</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                    {perSuite.map(({ suite: s, stats }) => (
                      <div key={s.id} className="flex justify-between text-caption py-0.5">
                        <span className="text-foreground">
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold mr-1.5">
                            {s.category}
                          </span>
                          {s.label}
                        </span>
                        <span className="font-mono text-muted-foreground">
                          {((stats!.hitRate) * 100).toFixed(0)}%{" "}
                          <span className="opacity-60">({stats!.runsWithHit}/{stats!.runs})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {runs.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  {perPanel.length > 0 && (
                    <div className="border border-parchment/60 rounded-sm p-3 bg-card">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">By model</div>
                      {perPanel.map(({ panel, label, stats }) => (
                        <div key={panel} className="flex justify-between text-caption py-0.5">
                          <span className="text-foreground truncate pr-2">{panel}: {label}</span>
                          <span className="font-mono text-muted-foreground">
                            {((stats!.hitRate) * 100).toFixed(0)}%{" "}
                            <span className="opacity-60">({stats!.runsWithHit}/{stats!.runs})</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {perTemp.length > 0 && (
                    <div className="border border-parchment/60 rounded-sm p-3 bg-card">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">By temperature</div>
                      {perTemp.map(({ temperature, stats }) => (
                        <div key={temperature} className="flex justify-between text-caption py-0.5">
                          <span className="text-foreground">T = {temperature.toFixed(1)}</span>
                          <span className="font-mono text-muted-foreground">
                            {((stats!.hitRate) * 100).toFixed(0)}%{" "}
                            <span className="opacity-60">({stats!.runsWithHit}/{stats!.runs})</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {perRegister.length > 0 && (
                    <div className="border border-parchment/60 rounded-sm p-3 bg-card">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">By register</div>
                      {perRegister.map(({ register, stats }) => (
                        <div key={register} className="flex justify-between text-caption py-0.5">
                          <span className="text-foreground">{REGISTER_LABELS[register]}</span>
                          <span className="font-mono text-muted-foreground">
                            {((stats!.hitRate) * 100).toFixed(0)}%{" "}
                            <span className="opacity-60">({stats!.runsWithHit}/{stats!.runs})</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Heatmap */}
              {runs.length > 0 && (
                <div className="mb-4 border border-parchment/60 rounded-sm bg-card overflow-hidden">
                  <div className="px-3 py-2 border-b border-parchment/60 text-caption text-muted-foreground flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Prevalence heatmap — each cell shows hits for one prompt × temperature × model</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-caption">
                      <thead>
                        <tr className="border-b border-parchment/60 text-left">
                          <th className="px-2 py-1.5 font-medium text-muted-foreground sticky left-0 bg-card z-10">Prompt</th>
                          {panelsShown.map(panel =>
                            PREVALENCE_TEMPS.map(t => (
                              <th key={`${panel}-${t}`} className="px-2 py-1.5 font-medium text-muted-foreground text-center whitespace-nowrap">
                                {panel} · T{t.toFixed(1)}
                              </th>
                            ))
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {suite.filter(p => selectedPromptIds.has(p.id)).map(p => {
                          const promptSuite = suiteOfPrompt(p.id);
                          return (
                          <tr key={p.id} className="border-b border-parchment/30 last:border-b-0">
                            <td className="px-2 py-1 sticky left-0 bg-card z-10">
                              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold flex items-center gap-1.5">
                                {activeSuiteIds.size > 1 && promptSuite && (
                                  <span
                                    className={`inline-block px-1 py-0.5 rounded-sm text-[8px] ${
                                      promptSuite.category === "purpose"
                                        ? "bg-burgundy/15 text-burgundy"
                                        : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                                    }`}
                                    title={promptSuite.description}
                                  >
                                    {promptSuite.shortLabel}
                                  </span>
                                )}
                                <span>{REGISTER_LABELS[p.register]}</span>
                              </div>
                              <div className="text-foreground text-[11px] truncate max-w-[340px]" title={p.prompt}>
                                {p.prompt}
                              </div>
                            </td>
                            {panelsShown.map(panel =>
                              PREVALENCE_TEMPS.map(t => {
                                const c = cellFor(panel, p.id, t);
                                const hasRun = !!c;
                                const hits = c?.hits ?? 0;
                                return (
                                  <td
                                    key={`${p.id}-${panel}-${t}`}
                                    className={`px-2 py-1 text-center font-mono text-[11px] ${heatColor(hits, hasRun)}`}
                                    title={
                                      c?.error ? `Error: ${c.error}`
                                      : c ? `${hits} hit${hits === 1 ? "" : "s"}\n\n${c.text?.slice(0, 200) ?? ""}${(c.text?.length ?? 0) > 200 ? "…" : ""}`
                                      : "No run yet"
                                    }
                                  >
                                    {c?.error ? "err" : hasRun ? hits : "—"}
                                  </td>
                                );
                              })
                            )}
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Deep dive — research-grade panels */}
              {isDone && runs.length > 0 && (
                <DeepDive label="Deep Dive — research panels" defaultOpen={false}>
                  <div className="space-y-3">
                    <GrammarDeepDive
                      runs={runs}
                      sweepRuns={sweepRuns}
                      selectedPatterns={selectedPatterns}
                      activeSuiteIds={activeSuiteIds}
                      prevalenceTemps={PREVALENCE_TEMPS}
                      sweepTemps={SWEEP_TEMPS}
                      getSlotLabel={getSlotLabel}
                    />
                    <details className="border border-parchment/60 rounded-sm bg-card/40">
                      <summary className="px-2 py-1.5 border-b border-parchment/40 bg-cream/30 dark:bg-burgundy/10 text-caption font-semibold text-foreground cursor-pointer">
                        Run-by-run matches (primary pattern)
                      </summary>
                      <div className="p-2 space-y-2 text-caption">
                        {scoredRuns
                          .filter(r => r.matches.length > 0)
                          .slice(0, 50)
                          .map((r, i) => (
                            <div key={i} className="border-l-2 border-burgundy/50 pl-2 py-1">
                              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                                {r.panel} · T{r.temperature.toFixed(1)} · {REGISTER_LABELS[(r.register as GrammarRegister) ?? "explain"]}
                              </div>
                              <div className="text-foreground text-[11px] mb-1 truncate" title={r.prompt}>{r.prompt}</div>
                              <ul className="list-disc pl-4 text-muted-foreground">
                                {r.matches.map((m, j) => (
                                  <li key={j}><span className="font-mono text-[11px]">“{m.text.trim()}”</span></li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        {scoredRuns.every(r => r.matches.length === 0) && (
                          <div className="text-muted-foreground italic">No matches of the primary pattern in any run.</div>
                        )}
                      </div>
                    </details>
                  </div>
                </DeepDive>
              )}

              {/* Initial state helper */}
              {runs.length === 0 && !isLoading && (
                <div className="text-caption text-muted-foreground border border-dashed border-parchment/60 rounded-sm p-4 text-center">
                  Choose a pattern, review the suite, and press <strong>Run prevalence</strong> to count how often the pattern appears
                  in generated prose across {selectedPrompts.length} prompts at {PREVALENCE_TEMPS.length} temperatures.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContinuationCard({
  result,
  suppressTokens,
  panelLabel,
}: {
  result: ContinuationResult;
  suppressTokens: string[];
  panelLabel: string;
}) {
  const suppressSet = new Set(suppressTokens.map(t => t.toLowerCase().trim()));
  const dist = result.distribution;
  // Entropy (bits) over returned top-K; a soft proxy, truncated.
  const probs = dist.map(d => Math.exp(d.logprob));
  const probSum = probs.reduce((s, p) => s + p, 0) || 1;
  const normProbs = probs.map(p => p / probSum);
  const entropyBits = -normProbs.reduce((s, p) => p > 0 ? s + p * Math.log2(p) : s, 0);
  const maxProb = Math.max(...probs, 0.0001);

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2 text-caption">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          {result.panel} · {panelLabel}
        </span>
        <span className="text-muted-foreground font-mono text-[10px]">
          H ≈ {entropyBits.toFixed(2)} bits
          {result.provenance && (
            <> · {result.provenance.responseTimeMs}ms</>
          )}
        </span>
      </div>

      {result.error ? (
        <div className="text-caption text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{result.error}</span>
        </div>
      ) : dist.length === 0 ? (
        <div className="text-caption text-muted-foreground italic">No distribution returned.</div>
      ) : (
        <div className="space-y-0.5">
          {dist.map((d, i) => {
            const p = Math.exp(d.logprob);
            const widthPct = Math.max(1.5, (p / maxProb) * 100);
            const isSuppress = suppressSet.has(d.token.toLowerCase().trim());
            const isChosen = result.chosen && d.token === result.chosen.token && i === 0;
            const display = d.token.replace(/\n/g, "⏎").replace(/\t/g, "⇥");
            return (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                <span
                  className={`font-mono truncate w-28 shrink-0 ${
                    isSuppress ? "text-burgundy font-semibold" : isChosen ? "text-foreground font-semibold" : "text-foreground"
                  }`}
                  title={JSON.stringify(d.token)}
                >
                  {display.length > 0 ? `"${display}"` : <span className="opacity-50">(empty)</span>}
                </span>
                <div className="flex-1 h-3 bg-parchment/40 rounded-sm overflow-hidden relative">
                  <div
                    className={`h-full ${isSuppress ? "bg-burgundy/80" : "bg-burgundy/40"} transition-all`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="font-mono tabular-nums text-muted-foreground w-14 text-right shrink-0">
                  {(p * 100).toFixed(1)}%
                </span>
                <span className="font-mono tabular-nums text-muted-foreground/60 w-16 text-right shrink-0 hidden sm:inline">
                  {d.logprob.toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---- PatternPicker (shared, multi-select) ---------------------------------
// Two explicit rows, because the picker expresses two independent decisions:
//
//   (1) Which constructions to count in every run (multi-select checkboxes).
//       Feeds Phase A hit rates, Phase E sweeps, the Deep Dive matrices.
//   (2) Which single construction is "primary" (radio select, chosen from the
//       currently-selected set). Feeds Phase B scaffolds / continuations.
//
// Separating them kills the earlier ambiguity where one ★ icon did different
// things depending on whether the chip was selected or not. In
// `allowSingleSelectOnly` mode (Phase B standalone view) row (1) is hidden and
// the primary picker acts as a plain radio row.
function PatternPicker({
  selectedIds,
  primaryId,
  onToggle,
  onPromote,
  allowSingleSelectOnly = false,
}: {
  selectedIds: Set<string>;
  primaryId: string;
  onToggle: (id: string) => void;
  onPromote: (id: string) => void;
  allowSingleSelectOnly?: boolean;
}) {
  const primary = DEFAULT_PATTERNS.find(p => p.id === primaryId) || DEFAULT_PATTERNS[0];
  const selectedPatterns = DEFAULT_PATTERNS.filter(p => selectedIds.has(p.id));

  return (
    <div className="mb-3 space-y-2">
      {/* Row 1: multi-select — what to count. Hidden in single-select mode. */}
      {!allowSingleSelectOnly && (
        <div>
          <div className="flex items-center justify-between mb-0.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
              Patterns to count
              <span className="ml-2 text-muted-foreground/60 normal-case tracking-normal font-normal">
                {selectedIds.size} of {DEFAULT_PATTERNS.length} selected
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => DEFAULT_PATTERNS.forEach(p => { if (!selectedIds.has(p.id)) onToggle(p.id); })}
                className="text-[10px] text-muted-foreground hover:text-burgundy px-1.5 py-0.5"
              >
                Select all
              </button>
              <span className="text-muted-foreground/30">·</span>
              <button
                type="button"
                onClick={() => DEFAULT_PATTERNS.forEach(p => {
                  // Never deselect the primary — selection must never drop below one.
                  if (selectedIds.has(p.id) && p.id !== primaryId) onToggle(p.id);
                })}
                className="text-[10px] text-muted-foreground hover:text-burgundy px-1.5 py-0.5"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="text-caption text-muted-foreground/80 mb-1.5 normal-case tracking-normal">
            Every generated run will be scored for each ticked pattern. Hit rates, co-occurrence, and register breakdowns in the Deep Dive are computed across all of them.
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_PATTERNS.map(p => {
              const isSelected = selectedIds.has(p.id);
              const isPrimary = p.id === primaryId;
              // Prevent deselecting the primary — instead of silently failing,
              // the button is greyed; user must promote a different pattern first.
              const lockedByPrimary = isPrimary;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { if (!lockedByPrimary) onToggle(p.id); }}
                  disabled={lockedByPrimary}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-caption rounded-sm border transition-colors ${
                    isSelected
                      ? "border-burgundy bg-burgundy/10 text-burgundy"
                      : "border-parchment bg-card text-muted-foreground hover:text-foreground hover:bg-cream/50"
                  } ${lockedByPrimary ? "cursor-default opacity-90" : "cursor-pointer"}`}
                  title={lockedByPrimary
                    ? `${p.description}\n\nThis is the primary construction — promote another before deselecting it.`
                    : p.description}
                >
                  <span
                    aria-hidden
                    className={`inline-flex items-center justify-center w-3 h-3 rounded-sm border ${
                      isSelected ? "border-burgundy bg-burgundy text-white" : "border-muted-foreground/40 bg-transparent"
                    }`}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 12 12" className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M2 6l3 3 5-6" />
                      </svg>
                    )}
                  </span>
                  <span>{p.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Row 2: primary radio — which pattern the continuation probe (Phase B)
          fetches scaffold-by-scaffold top-K distributions for. */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-0.5">
          {allowSingleSelectOnly ? "Pattern to probe" : "Primary pattern"}
        </div>
        <div className="text-caption text-muted-foreground/80 mb-1.5 normal-case tracking-normal">
          {allowSingleSelectOnly
            ? "The continuation view fetches a top-K next-token distribution for each of this pattern's scaffold sentences."
            : "The continuation view (Phase B) uses this pattern's scaffold sentences. Pick one of the constructions you selected above."}
        </div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Primary construction">
          {(allowSingleSelectOnly ? DEFAULT_PATTERNS : selectedPatterns).map(p => {
            const isPrimary = p.id === primaryId;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={isPrimary}
                onClick={() => onPromote(p.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-caption rounded-sm border transition-colors ${
                  isPrimary
                    ? "border-burgundy bg-burgundy text-white"
                    : "border-parchment bg-card text-muted-foreground hover:text-foreground hover:bg-cream/50"
                }`}
                title={p.description}
              >
                <span
                  aria-hidden
                  className={`inline-flex items-center justify-center w-3 h-3 rounded-full border ${
                    isPrimary ? "border-white bg-white" : "border-muted-foreground/40 bg-transparent"
                  }`}
                >
                  {isPrimary && <span className="w-1.5 h-1.5 rounded-full bg-burgundy" />}
                </span>
                <span>{p.shortLabel}</span>
              </button>
            );
          })}
          {!allowSingleSelectOnly && selectedPatterns.length === 0 && (
            <span className="text-caption text-muted-foreground italic px-1">
              Select at least one construction above.
            </span>
          )}
        </div>
      </div>

      {/* Description of the current primary */}
      <div className="text-caption text-muted-foreground leading-relaxed pt-1 border-t border-parchment/40">
        <strong className="text-foreground">{primary.label}.</strong> {primary.description}
      </div>
    </div>
  );
}

// ---- ScaffoldConcentrationTable -------------------------------------------
// Replaces the Geometry view (which required embedding models not reliably
// available through LLMbench's slot providers). Reuses the existing top-K
// logprob distributions already fetched by the Continuation probe and reports
// three concentration metrics per scaffold per panel:
//   top-1 p         — probability mass on the single most-likely token
//   H (bits)        — Shannon entropy over the returned top-K
//   cliché share    — summed probability of pattern.suppressTokens
// All three are embedding-free signals of "how parked is the model in this
// construction's groove".
function ScaffoldConcentrationTable({
  results,
  suppressTokens,
  getSlotLabel,
}: {
  results: ContinuationResult[];
  suppressTokens: string[];
  getSlotLabel: (panel: "A" | "B") => string;
}) {
  const clicheSet = new Set(suppressTokens.map(t => t.toLowerCase().trim()));

  const rows = results.map(r => {
    const dist = r.distribution ?? [];
    const probs = dist.map(d => Math.exp(d.logprob));
    const probSum = probs.reduce((s, p) => s + p, 0) || 1;
    const normed = probs.map(p => p / probSum);
    const top1 = normed.length > 0 ? Math.max(...normed) : 0;
    const entropy = normed.reduce((h, p) => h + (p > 0 ? -p * Math.log2(p) : 0), 0);
    const clicheShare = dist.reduce((s, d, i) => {
      return clicheSet.has(d.token.toLowerCase().trim()) ? s + normed[i] : s;
    }, 0);
    return {
      key: `${r.scaffoldId}-${r.panel}`,
      scaffold: r.scaffold,
      panel: r.panel,
      panelLabel: getSlotLabel(r.panel),
      chosen: r.chosen?.token ?? "—",
      top1,
      entropy,
      clicheShare,
      error: r.error,
    };
  });

  if (rows.length === 0) {
    return (
      <div className="text-caption text-muted-foreground italic border-l-2 border-parchment/60 pl-2">
        Run continuation on at least one scaffold to populate the concentration table.
      </div>
    );
  }

  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtH = (v: number) => v.toFixed(2);

  // Colour scale for top-1 / cliché share (cream → burgundy).
  const heatTop1 = (v: number) =>
    v > 0.6 ? "bg-burgundy/30 text-burgundy dark:text-amber-100"
    : v > 0.35 ? "bg-amber-200 dark:bg-amber-800/50 text-amber-900 dark:text-amber-100"
    : v > 0.15 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200"
    : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300";

  return (
    <div className="overflow-x-auto border border-parchment/60 rounded-sm bg-card">
      <table className="w-full text-caption border-collapse">
        <thead className="bg-cream/40 dark:bg-burgundy/10">
          <tr className="text-left">
            <th className="px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground/70">Scaffold</th>
            <th className="px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground/70">Panel</th>
            <th className="px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground/70">Top-1 token</th>
            <th className="px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Top-1 p</th>
            <th className="px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">H (bits)</th>
            <th className="px-2 py-1.5 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Cliché share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const isCliche = clicheSet.has(row.chosen.toLowerCase().trim());
            return (
              <tr key={row.key} className="border-t border-parchment/40">
                <td className="px-2 py-1.5 font-mono text-[11px] text-foreground truncate max-w-[420px]" title={row.scaffold}>
                  {row.scaffold}<span className="text-muted-foreground/50">▋</span>
                </td>
                <td className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                  {row.panel} · {row.panelLabel}
                </td>
                <td className={`px-2 py-1.5 font-mono text-[11px] ${isCliche ? "text-burgundy font-semibold" : "text-foreground"}`}>
                  {row.error ? <span className="text-red-700 dark:text-red-300">err</span> : `"${row.chosen}"`}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono text-[11px] ${heatTop1(row.top1)}`}>
                  {row.error ? "—" : fmtPct(row.top1)}
                </td>
                <td className="px-2 py-1.5 text-right font-mono text-[11px] text-foreground">
                  {row.error ? "—" : fmtH(row.entropy)}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono text-[11px] ${heatTop1(row.clicheShare)}`}>
                  {row.error ? "—" : fmtPct(row.clicheShare)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---- TemperatureSweepPanel (Phase E) ---------------------------------------
// Prevalence (hit rate) as a function of decoding temperature. The headline is
// the "greediness index": hitRate(T=0) − mean hitRate(T>0). Positive → the
// construction lives at the argmax (reflex). Near-zero → register-driven.
// Negative → the pattern emerges out of the sampler (rarer, more interesting).
import type { ProviderSlots } from "@/types/ai-settings";
import type { GrammarPattern } from "@/lib/grammar/patterns";

// ---- ForcedContinuationPanel (Phase C) ------------------------------------
// UI around /api/investigate/grammar-expand. Depends on Phase B having run.
// For each scaffold, pulls the top-N distribution entries as candidate Y
// tokens and asks the model to expand each into a short continuation
// phrase. Renders a scaffold × Y-token × Y-phrase table. The harvested
// Ys travel to Manifold Atlas via the full Grammar data bundle export,
// which Atlas imports directly — no per-scaffold deep link is needed.
function ForcedContinuationPanel({
  pattern,
  continuationResults,
  forcedExpansions,
  isForcedLoading,
  forcedProgress,
  forcedError,
  forcedTopN,
  setForcedTopN,
  handleRunForced,
  getSlotLabel,
  panelSelection,
}: {
  pattern: GrammarPattern;
  continuationResults: ContinuationResult[];
  forcedExpansions: {
    scaffoldId: string; scaffold: string; panel: "A" | "B";
    rank: number; token: string; tokenLogprob: number;
    phrase: string | null; error?: string;
  }[];
  isForcedLoading: boolean;
  forcedProgress: { done: number; total: number } | null;
  forcedError: string | null;
  forcedTopN: number;
  setForcedTopN: (n: number) => void;
  handleRunForced: () => void;
  getSlotLabel: (panel: "A" | "B") => string;
  panelSelection: PanelSelection;
}) {
  const activePanel: "A" | "B" = panelSelection === "B" ? "B" : "A";

  // Group expansions by scaffold for the table and the per-scaffold Atlas
  // deep link.
  const byScaffold = new Map<string, typeof forcedExpansions>();
  for (const e of forcedExpansions) {
    const bucket = byScaffold.get(e.scaffoldId) ?? [];
    bucket.push(e);
    byScaffold.set(e.scaffoldId, bucket);
  }

  // Extract the X term from a scaffold using pattern.xExtractor, if defined.
  const extractX = (scaffold: string): string | null => {
    if (!pattern.xExtractor) return null;
    try {
      const re = new RegExp(pattern.xExtractor);
      const m = scaffold.match(re);
      return m?.[1]?.trim() ?? null;
    } catch {
      return null;
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-caption">
        <button
          type="button"
          onClick={handleRunForced}
          disabled={isForcedLoading || continuationResults.length === 0}
          className="btn-editorial flex items-center gap-1 text-caption disabled:opacity-50"
          title={continuationResults.length === 0 ? "Run Phase B first to populate candidate Y tokens" : "Expand top-N Y tokens per scaffold into phrases"}
        >
          <Play className="w-3 h-3" /> Run Phase C
        </button>
        <button
          type="button"
          onClick={() => { /* reset */ void setForcedTopN(forcedTopN); }}
          className="hidden"
        />
        <label className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          top-N
          <input
            type="range" min={3} max={15} step={1} value={forcedTopN}
            onChange={e => setForcedTopN(Number(e.target.value))}
            className="w-20 accent-burgundy"
          />
          <span className="text-foreground w-6 text-right">{forcedTopN}</span>
        </label>
        <span className="text-muted-foreground">
          Expands the top-N tokens per scaffold on <strong className="text-foreground">Panel {activePanel}</strong> ({getSlotLabel(activePanel)}).
        </span>
      </div>

      {/* Pre-flight guard */}
      {continuationResults.length === 0 && (
        <div className="border border-parchment/60 rounded-sm p-3 bg-cream/30 dark:bg-burgundy/10 text-caption text-muted-foreground">
          Phase C expands Phase B&apos;s candidate Y tokens into short phrases. Switch to <strong className="text-foreground">Phase B. Continuation logprobs</strong>, run the probe on your primary pattern&apos;s scaffolds, then return here.
        </div>
      )}

      {/* Progress / error */}
      {isForcedLoading && forcedProgress && (
        <div className="text-caption text-muted-foreground mb-2">
          <div className="flex justify-between items-baseline mb-1">
            <span>Expanding… {forcedProgress.done} / {forcedProgress.total}</span>
            <span>{forcedProgress.total > 0 ? Math.round(100 * forcedProgress.done / forcedProgress.total) : 0}%</span>
          </div>
          <div className="w-full h-1 bg-parchment/30 rounded-sm overflow-hidden">
            <div className="h-full bg-burgundy/70" style={{ width: `${forcedProgress.total > 0 ? Math.round(100 * forcedProgress.done / forcedProgress.total) : 0}%` }} />
          </div>
        </div>
      )}
      {forcedError && (
        <div className="border border-burgundy/40 bg-burgundy/5 rounded-sm p-2 text-caption text-foreground flex items-start gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-burgundy mt-0.5 shrink-0" /><span>{forcedError}</span>
        </div>
      )}

      {/* Results */}
      {forcedExpansions.length > 0 && (
        <div className="space-y-3">
          {Array.from(byScaffold.entries()).map(([scaffoldId, group]) => {
            const scaffold = group[0].scaffold;
            const x = extractX(scaffold);
            return (
              <div key={scaffoldId} className="border border-parchment/60 rounded-sm bg-card/40">
                <div className="flex items-baseline justify-between gap-2 px-2 py-1.5 border-b border-parchment/40 bg-cream/30 dark:bg-burgundy/10">
                  <div className="text-caption font-mono text-foreground truncate" title={scaffold}>
                    {scaffold}<span className="text-muted-foreground/50">▋</span>
                  </div>
                  {x && <span className="text-[10px] font-mono text-muted-foreground shrink-0">X: <span className="text-foreground">{x}</span></span>}
                </div>
                <table className="w-full text-caption border-collapse">
                  <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b border-parchment/40">
                    <tr>
                      <th className="px-2 py-1 text-left">#</th>
                      <th className="px-2 py-1 text-left">Y-token</th>
                      <th className="px-2 py-1 text-left">Y-phrase</th>
                      <th className="px-2 py-1 text-right">logprob</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.map((e, i) => (
                      <tr key={i} className="border-t border-parchment/40">
                        <td className="px-2 py-1 font-mono text-[10px] text-muted-foreground">{e.rank}</td>
                        <td className="px-2 py-1 font-mono text-[11px] text-foreground">{JSON.stringify(e.token)}</td>
                        <td className="px-2 py-1 text-[11px] text-foreground">
                          {e.error ? <span className="text-red-700 dark:text-red-300">err: {e.error}</span> : (e.phrase ?? <span className="text-muted-foreground italic">empty</span>)}
                        </td>
                        <td className="px-2 py-1 text-right font-mono text-[10px] text-muted-foreground">{e.tokenLogprob.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* Idle helper */}
      {forcedExpansions.length === 0 && !isForcedLoading && continuationResults.length > 0 && (
        <div className="text-caption text-muted-foreground border border-dashed border-parchment/60 rounded-sm p-4 text-center">
          Ready to expand <strong>{continuationResults.filter(r => !r.error).length}</strong> Phase B scaffold results. Press <strong>Run Phase C</strong>.
        </div>
      )}
    </div>
  );
}

// ---- PerturbationPanel (Phase D) -----------------------------------------
// Renders the three-framing comparison. Each selected pattern appears as a
// row; columns are Neutral / Anti / Pro hit rate, plus the delta anti −
// neutral (negative = the instruction suppressed the construction) and the
// delta pro − neutral (positive = the construction inflates under explicit
// invitation). The verdict column summarises the reading:
//   |Δanti| < 0.1 → "structural" (persists under suppression)
//   Δanti < −0.3 → "stylistic" (collapses under suppression)
//   Δpro > 0.3   → "invitable" (the model reaches for it when permitted)
function PerturbationPanel({
  pattern, selectedPatterns, selectedPrompts,
  perturbationRuns, isLoading, progress, error, onRun,
  patternId, selectedPatternIds, togglePatternSelected, promotePatternToPrimary,
  panelSelection, getSlotLabel,
}: {
  pattern: GrammarPattern;
  selectedPatterns: GrammarPattern[];
  selectedPrompts: GrammarSuitePrompt[];
  perturbationRuns: (RunRecord & { framing: "neutral" | "anti" | "pro" })[];
  isLoading: boolean;
  progress: { done: number; total: number } | null;
  error: string | null;
  onRun: () => void;
  patternId: string;
  selectedPatternIds: Set<string>;
  togglePatternSelected: (id: string) => void;
  promotePatternToPrimary: (id: string) => void;
  panelSelection: PanelSelection;
  getSlotLabel: (panel: "A" | "B") => string;
}) {
  // Aggregate: per (pattern × framing), hit rate = runs_with_hit / runs_with_text.
  const rowsByPattern = selectedPatterns.map(p => {
    const framings = (["neutral", "anti", "pro"] as const).map(f => {
      const textedRuns = perturbationRuns.filter(r => r.framing === f && r.text);
      const runsWithHit = textedRuns.filter(r => countMatches(r.text!, p) > 0).length;
      const rate = textedRuns.length > 0 ? runsWithHit / textedRuns.length : NaN;
      return { framing: f, rate, runs: textedRuns.length, runsWithHit };
    });
    const neutral = framings[0].rate, anti = framings[1].rate, pro = framings[2].rate;
    const dAnti = Number.isFinite(neutral) && Number.isFinite(anti) ? anti - neutral : NaN;
    const dPro = Number.isFinite(neutral) && Number.isFinite(pro) ? pro - neutral : NaN;
    let verdict = "insufficient";
    if (Number.isFinite(dAnti)) {
      if (Math.abs(dAnti) < 0.1 && neutral > 0.2) verdict = "structural";
      else if (dAnti < -0.3) verdict = "stylistic";
      else if (Number.isFinite(dPro) && dPro > 0.3) verdict = "invitable";
      else verdict = "mixed";
    }
    return { pattern: p, neutral, anti, pro, dAnti, dPro, framings, verdict };
  });

  const fmtPct = (v: number) => Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "—";
  const fmtDelta = (v: number) => {
    if (!Number.isFinite(v)) return "—";
    const pct = (v * 100).toFixed(1);
    const sign = v > 0 ? "+" : "";
    return `${sign}${pct}pp`;
  };
  const deltaColour = (v: number, sense: "anti" | "pro"): string => {
    if (!Number.isFinite(v)) return "text-muted-foreground/50";
    if (sense === "anti") {
      // Large negative delta = pattern was suppressed (good compliance = stylistic)
      if (v < -0.3) return "text-emerald-700 dark:text-emerald-400";
      if (v > -0.1) return "text-burgundy font-semibold"; // persists → structural
      return "text-amber-700 dark:text-amber-400";
    }
    if (v > 0.3) return "text-burgundy font-semibold"; // rises on invite → invitable
    if (v < -0.1) return "text-emerald-700 dark:text-emerald-400";
    return "text-foreground";
  };
  const verdictBadge = (v: string) => {
    switch (v) {
      case "structural": return "bg-burgundy/20 text-burgundy";
      case "stylistic": return "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300";
      case "invitable": return "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200";
      case "mixed": return "bg-parchment/60 text-foreground";
      default: return "bg-muted/30 text-muted-foreground";
    }
  };

  const activePanel: "A" | "B" = panelSelection === "B" ? "B" : "A";

  return (
    <div>
      <PatternPicker
        selectedIds={selectedPatternIds}
        primaryId={patternId}
        onToggle={togglePatternSelected}
        onPromote={promotePatternToPrimary}
      />

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-caption">
        <button
          type="button"
          onClick={onRun}
          disabled={isLoading || selectedPrompts.length === 0}
          className="btn-editorial flex items-center gap-1 text-caption disabled:opacity-50"
        >
          <Play className="w-3 h-3" /> Run Phase D
        </button>
        <span className="text-muted-foreground">
          Runs <strong className="text-foreground">{selectedPrompts.length}</strong> prompts × 3 framings × {panelSelection === "both" ? "2 panels" : `1 panel (${getSlotLabel(activePanel)})`} @ T=0.7. Anti/pro directives are keyed to the primary pattern &ldquo;<strong className="text-foreground">{pattern.shortLabel}</strong>&rdquo;.
        </span>
      </div>

      {/* Progress / error */}
      {isLoading && progress && (
        <div className="text-caption text-muted-foreground mb-2">
          <div className="flex justify-between items-baseline mb-1">
            <span>Generating under three framings… {progress.done} / {progress.total}</span>
            <span>{progress.total > 0 ? Math.round(100 * progress.done / progress.total) : 0}%</span>
          </div>
          <div className="w-full h-1 bg-parchment/30 rounded-sm overflow-hidden">
            <div className="h-full bg-burgundy/70" style={{ width: `${progress.total > 0 ? Math.round(100 * progress.done / progress.total) : 0}%` }} />
          </div>
        </div>
      )}
      {error && (
        <div className="border border-burgundy/40 bg-burgundy/5 rounded-sm p-2 text-caption text-foreground flex items-start gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-burgundy mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Results table */}
      {perturbationRuns.length > 0 && (
        <div className="overflow-x-auto border border-parchment/60 rounded-sm bg-card">
          <table className="w-full text-caption border-collapse">
            <thead className="bg-cream/40 dark:bg-burgundy/10">
              <tr className="text-left">
                <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">Construction</th>
                <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Neutral</th>
                <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Anti</th>
                <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Δanti</th>
                <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Pro</th>
                <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 text-right">Δpro</th>
                <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {rowsByPattern.map(r => (
                <tr key={r.pattern.id} className="border-t border-parchment/40">
                  <td className="px-2 py-1.5 text-foreground text-[11px]">{r.pattern.shortLabel}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-right text-foreground">{fmtPct(r.neutral)}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-right text-foreground">{fmtPct(r.anti)}</td>
                  <td className={`px-2 py-1.5 font-mono text-[11px] text-right ${deltaColour(r.dAnti, "anti")}`}>{fmtDelta(r.dAnti)}</td>
                  <td className="px-2 py-1.5 font-mono text-[11px] text-right text-foreground">{fmtPct(r.pro)}</td>
                  <td className={`px-2 py-1.5 font-mono text-[11px] text-right ${deltaColour(r.dPro, "pro")}`}>{fmtDelta(r.dPro)}</td>
                  <td className="px-2 py-1.5">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded-sm ${verdictBadge(r.verdict)}`}>{r.verdict}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reading guide */}
      {perturbationRuns.length > 0 && (
        <div className="text-caption text-muted-foreground mt-2 leading-relaxed">
          <strong className="text-foreground">Reading the verdict.</strong>{" "}
          <span className="text-burgundy font-semibold">Structural</span> = the construction persists under explicit instruction not to use it (|Δanti| &lt; 10pp at non-trivial baseline).{" "}
          <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Stylistic</span> = the construction collapses under suppression (Δanti &lt; &minus;30pp) — the model is willing to drop it, so its Phase A prevalence is a matter of style, not grammar.{" "}
          <span className="text-amber-700 dark:text-amber-300 font-semibold">Invitable</span> = Δpro &gt; 30pp; the construction is on the shelf and the model reaches for it when permitted. <em>Mixed</em> = partial suppression, neither clean structural nor clean stylistic.
        </div>
      )}

      {/* Idle helper */}
      {perturbationRuns.length === 0 && !isLoading && (
        <div className="text-caption text-muted-foreground border border-dashed border-parchment/60 rounded-sm p-4 text-center">
          Press <strong>Run Phase D</strong> to generate under three framings and score each against every selected construction. Best used on the baseline or invitation suites with 6-12 prompts.
        </div>
      )}
    </div>
  );
}

function TemperatureSweepPanel(props: {
  pattern: GrammarPattern;
  patternId: string;
  setPatternId: (id: string) => void;
  selectedPatternIds: Set<string>;
  selectedPatterns: GrammarPattern[];
  togglePatternSelected: (id: string) => void;
  promotePatternToPrimary: (id: string) => void;
  suitePrompts: GrammarSuitePrompt[];
  selectedPrompts: GrammarSuitePrompt[];
  selectedPromptIds: Set<string>;
  setSelectedPromptIds: (s: Set<string>) => void;
  panelSelection: PanelSelection;
  slots: ProviderSlots;
  getSlotLabel: (panel: "A" | "B") => string;
  slotAConfigured: boolean;
  slotBConfigured: boolean;
  sweepRuns: RunRecord[];
  isSweepLoading: boolean;
  sweepProgress: { done: number; total: number } | null;
  sweepError: string | null;
  isSweepDone: boolean;
  onRun: () => void;
  onReset: () => void;
}) {
  const {
    pattern, patternId,
    selectedPatternIds, selectedPatterns, togglePatternSelected, promotePatternToPrimary,
    suitePrompts, selectedPrompts, selectedPromptIds, setSelectedPromptIds,
    panelSelection, slots, getSlotLabel,
    slotAConfigured, slotBConfigured,
    sweepRuns, isSweepLoading, sweepProgress, sweepError, isSweepDone,
    onRun, onReset,
  } = props;

  const usingBoth = panelSelection === "both" && slotBConfigured;
  const effectivePanels: ("A" | "B")[] = (
    usingBoth ? ["A", "B"] :
    panelSelection === "B" ? ["B"] :
    ["A"]
  );

  const togglePrompt = (id: string) => {
    const next = new Set(selectedPromptIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size > 0) setSelectedPromptIds(next);
  };

  // ---- aggregate: per-panel, per-T hit rate -------------------------------
  interface Point { temperature: number; runs: number; runsWithHit: number; hitRate: number; hits: number }
  const perPanelSeries: { panel: "A" | "B"; label: string; points: Point[]; greediness: number | null }[] =
    effectivePanels.map(panel => {
      const points: Point[] = SWEEP_TEMPS.map(t => {
        const rs = sweepRuns.filter(r => r.panel === panel && r.temperature === t && r.text);
        const runs = rs.length;
        const withText = rs.filter(r => r.text);
        const runsWithHit = withText.filter(r => countMatches(r.text!, pattern) > 0).length;
        const hits = withText.reduce((s, r) => s + countMatches(r.text!, pattern), 0);
        return { temperature: t, runs, runsWithHit, hits, hitRate: runs > 0 ? runsWithHit / runs : 0 };
      });
      const base = points.find(p => p.temperature === 0);
      const warm = points.filter(p => p.temperature > 0 && p.runs > 0);
      const meanWarm = warm.length > 0 ? warm.reduce((s, p) => s + p.hitRate, 0) / warm.length : null;
      const greediness = base && base.runs > 0 && meanWarm !== null ? base.hitRate - meanWarm : null;
      return { panel, label: getSlotLabel(panel), points, greediness };
    });

  const anyData = sweepRuns.length > 0;

  return (
    <>
      <PatternPicker
        selectedIds={selectedPatternIds}
        primaryId={patternId}
        onToggle={togglePatternSelected}
        onPromote={promotePatternToPrimary}
      />
      <div className="mb-3 text-caption text-muted-foreground">
        Counting <strong className="text-foreground">{selectedPatterns.length}</strong> construction{selectedPatterns.length !== 1 ? "s" : ""} per run: {selectedPatterns.map(p => p.shortLabel).join(", ")}.
      </div>

      {/* Capability note */}
      <div className="mb-3 text-caption text-muted-foreground border-l-2 border-parchment/60 pl-2">
        Runs the same prompt suite across <span className="font-mono">T ∈ {`{${SWEEP_TEMPS.join(", ")}}`}</span>.
        The headline is the <em>greediness index</em>: <span className="font-mono">hitRate(T=0) − mean hitRate(T&gt;0)</span>.
        Positive → the construction is a reflex of the argmax; near-zero → register-driven; negative → the pattern emerges out of the sampler.
      </div>

      {/* Prompt picker — compact list from the already-selected suite */}
      <div className="mb-3 border border-parchment/60 rounded-sm bg-card">
        <div className="px-3 py-2 border-b border-parchment/60 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold flex items-center justify-between">
          <span>Prompts (from the currently active suite)</span>
          <span className="text-muted-foreground/60 normal-case tracking-normal">
            {selectedPromptIds.size} / {suitePrompts.length} selected
          </span>
        </div>
        <div className="divide-y divide-parchment/30 max-h-48 overflow-y-auto">
          {suitePrompts.map(p => (
            <label key={p.id} className="flex items-start gap-2 px-3 py-1.5 text-caption hover:bg-cream/30 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedPromptIds.has(p.id)}
                onChange={() => togglePrompt(p.id)}
                className="mt-0.5 accent-burgundy"
              />
              <span className="font-mono text-[11px] text-foreground truncate flex-1">{p.prompt}</span>
              <span className="text-[10px] text-muted-foreground/70 uppercase tracking-wider shrink-0">{p.register}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <div className="text-caption text-muted-foreground">
          {selectedPrompts.length} prompts × {SWEEP_TEMPS.length} temperatures × {effectivePanels.length} model{effectivePanels.length > 1 ? "s" : ""}
          {" = "}
          <span className="font-mono">{selectedPrompts.length * SWEEP_TEMPS.length * effectivePanels.length}</span> runs expected
        </div>
        <div className="flex-1" />
        <button
          onClick={onReset}
          disabled={isSweepLoading || sweepRuns.length === 0}
          className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5 disabled:opacity-30"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
        <button
          onClick={onRun}
          disabled={isSweepLoading || selectedPrompts.length === 0 || (!slotAConfigured && !usingBoth)}
          className="px-3 py-1 text-caption font-medium rounded-sm bg-burgundy text-white hover:bg-burgundy/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          {isSweepLoading ? "Sweeping…" : "Run sweep"}
        </button>
      </div>

      {/* Progress */}
      {isSweepLoading && sweepProgress && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-caption text-muted-foreground mb-1">
            <span>Sweeping… {sweepProgress.done} / {sweepProgress.total}</span>
            <span>{sweepProgress.total > 0 ? Math.round(100 * sweepProgress.done / sweepProgress.total) : 0}%</span>
          </div>
          <div className="h-1.5 bg-parchment/40 rounded-full overflow-hidden">
            <div
              className="h-full bg-burgundy transition-all"
              style={{ width: `${sweepProgress.total > 0 ? Math.round(100 * sweepProgress.done / sweepProgress.total) : 0}%` }}
            />
          </div>
        </div>
      )}

      {sweepError && (
        <div className="mb-3 border border-red-400 bg-red-50 dark:bg-red-900/30 rounded-sm p-2 text-caption flex items-start gap-2 text-red-800 dark:text-red-200">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{sweepError}</span>
        </div>
      )}

      {!anyData && !isSweepLoading && (
        <div className="text-caption text-muted-foreground border border-dashed border-parchment/60 rounded-sm p-4 text-center">
          Select prompts and press <strong>Run sweep</strong> to measure prevalence across the five temperatures.
          Each run counts regex hits for <strong>{pattern.shortLabel}</strong>; the chart plots hit rate against T
          with one line per model and a <em>greediness index</em> headline per model.
        </div>
      )}

      {anyData && (
        <SweepChart
          series={perPanelSeries}
          temps={SWEEP_TEMPS}
          patternLabel={pattern.label}
          isComplete={isSweepDone}
        />
      )}

      {anyData && (
        <DeepDive label={`Temperature × model hit table (${sweepRuns.length} runs)`}>
          <div className="text-[11px] space-y-2">
            {perPanelSeries.map(s => (
              <div key={s.panel} className="border border-parchment/40 rounded-sm">
                <div className="px-2 py-1 border-b border-parchment/40 font-semibold text-foreground flex items-center justify-between">
                  <span>Panel {s.panel} · {s.label}</span>
                  <span className="text-muted-foreground font-mono">
                    greediness = {s.greediness === null ? "n/a" : s.greediness.toFixed(3)}
                  </span>
                </div>
                <div className="grid grid-cols-[4rem_4rem_4rem_5rem_5rem] gap-2 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold border-b border-parchment/40">
                  <span>T</span>
                  <span className="text-right">runs</span>
                  <span className="text-right">hits</span>
                  <span className="text-right">with-hit</span>
                  <span className="text-right">hit rate</span>
                </div>
                {s.points.map(p => (
                  <div key={p.temperature} className="grid grid-cols-[4rem_4rem_4rem_5rem_5rem] gap-2 px-2 py-0.5 font-mono tabular-nums">
                    <span className="text-foreground">{p.temperature.toFixed(1)}</span>
                    <span className="text-right text-muted-foreground">{p.runs}</span>
                    <span className="text-right text-muted-foreground">{p.hits}</span>
                    <span className="text-right text-muted-foreground">{p.runsWithHit}</span>
                    <span className="text-right text-foreground">{(p.hitRate * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </DeepDive>
      )}

      {/* Keep-in-scope note */}
      <div className="mt-3 text-[10px] text-muted-foreground/70 italic">
        Uses slots from Settings. Temperature is overridden for the sweep regardless of per-slot value.
        Provider-level token caps still apply; if a provider silently clamps T&gt;1, that shows up as a flat tail on the right.
      </div>
      {/* mute unused-vars lint for slot params we may want later */}
      <span className="hidden">{slots.A.provider}{slots.B.provider}</span>
    </>
  );
}

// ---- SweepChart -----------------------------------------------------------
// One line per model, y = hit rate (0..1), x = temperature (linear from 0 to max).
function SweepChart({
  series,
  temps,
  patternLabel,
  isComplete,
}: {
  series: { panel: "A" | "B"; label: string; points: { temperature: number; hitRate: number; runs: number }[]; greediness: number | null }[];
  temps: number[];
  patternLabel: string;
  isComplete: boolean;
}) {
  const W = 640, H = 260;
  const PAD = { l: 56, r: 140, t: 14, b: 40 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const xMin = Math.min(...temps);
  const xMax = Math.max(...temps);
  const xScale = (t: number) => PAD.l + ((t - xMin) / (xMax - xMin || 1)) * plotW;
  const yScale = (v: number) => PAD.t + (1 - v) * plotH;

  // Model colours: A = burgundy, B = slate.
  const colourFor = (panel: "A" | "B") => panel === "A" ? "#800020" : "#334155";

  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="border border-parchment/60 rounded-sm bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-parchment/60 text-caption flex items-center gap-2 flex-wrap">
        <BarChart3 className="w-3.5 h-3.5 text-burgundy shrink-0" />
        <span className="font-semibold text-foreground truncate flex-1 min-w-[10rem]">
          Prevalence × Temperature — {patternLabel}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          {isComplete ? "complete" : "streaming"}
        </span>
      </div>
      <div className="px-3 pb-3 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-full" role="img" aria-label="Line chart of pattern hit rate against temperature">
          {/* plot frame */}
          <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill="none" stroke="currentColor" strokeOpacity={0.1} />
          {/* y gridlines + labels */}
          {yTicks.map(v => (
            <g key={`y${v}`}>
              <line x1={PAD.l} x2={PAD.l + plotW} y1={yScale(v)} y2={yScale(v)} stroke="currentColor" strokeOpacity={0.06} />
              <text x={PAD.l - 6} y={yScale(v) + 3} fontSize={9} textAnchor="end" fill="currentColor" fillOpacity={0.55}>
                {Math.round(v * 100)}%
              </text>
            </g>
          ))}
          {/* x ticks */}
          {temps.map(t => (
            <g key={`x${t}`}>
              <line x1={xScale(t)} x2={xScale(t)} y1={PAD.t + plotH} y2={PAD.t + plotH + 3} stroke="currentColor" strokeOpacity={0.3} />
              <text x={xScale(t)} y={PAD.t + plotH + 14} fontSize={9} textAnchor="middle" fill="currentColor" fillOpacity={0.65}>
                {t.toFixed(1)}
              </text>
            </g>
          ))}
          {/* axis titles */}
          <text x={PAD.l + plotW / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="currentColor" fillOpacity={0.7}>
            temperature
          </text>
          <text
            x={-PAD.t - plotH / 2}
            y={14}
            fontSize={10}
            textAnchor="middle"
            fill="currentColor"
            fillOpacity={0.7}
            transform="rotate(-90)"
          >
            hit rate (runs containing pattern)
          </text>

          {/* series */}
          {series.map(s => {
            const pts = s.points.filter(p => p.runs > 0);
            if (pts.length === 0) return null;
            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(p.temperature).toFixed(2)} ${yScale(p.hitRate).toFixed(2)}`).join(" ");
            const col = colourFor(s.panel);
            return (
              <g key={s.panel}>
                <path d={d} fill="none" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {pts.map(p => (
                  <circle
                    key={p.temperature}
                    cx={xScale(p.temperature)}
                    cy={yScale(p.hitRate)}
                    r={p.temperature === 0 ? 5 : 3.5}
                    fill={col}
                    stroke="#fff"
                    strokeWidth={1}
                  >
                    <title>{`Panel ${s.panel}  T=${p.temperature}  hit rate=${(p.hitRate * 100).toFixed(1)}%  (n=${p.runs})`}</title>
                  </circle>
                ))}
              </g>
            );
          })}

          {/* legend + greediness readout */}
          <g>
            {series.map((s, i) => {
              const y = PAD.t + 8 + i * 36;
              const col = colourFor(s.panel);
              return (
                <g key={s.panel}>
                  <circle cx={PAD.l + plotW + 14} cy={y} r={4} fill={col} />
                  <text x={PAD.l + plotW + 22} y={y + 3} fontSize={10} fill="currentColor" fillOpacity={0.85}>
                    {s.panel} · {s.label.length > 14 ? s.label.slice(0, 13) + "…" : s.label}
                  </text>
                  <text x={PAD.l + plotW + 22} y={y + 16} fontSize={9} fill="currentColor" fillOpacity={0.65}>
                    greediness: {s.greediness === null ? "n/a" : s.greediness.toFixed(3)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
