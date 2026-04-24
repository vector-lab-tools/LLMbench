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
  AlertCircle, Microscope, Play, RotateCcw, Settings2, FileText, BarChart3, Download, ScatterChart,
} from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { ModelSelector, type PanelSelection } from "@/components/shared/ModelSelector";
import { DeepDive } from "@/components/shared/DeepDive";
import { fetchStreaming } from "@/lib/streaming";
import {
  DEFAULT_PATTERNS,
  countMatches,
  findMatchSpans,
} from "@/lib/grammar/patterns";
import { extractX, cosine, spearman } from "@/lib/grammar/geometry";
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
  { id: "forced",       label: "C. Forced continuation",  short: "C",    available: false, description: "Cap scaffolds at 'but a ' and harvest top-20 Ys. Cross-link to Manifold Atlas." },
  { id: "perturbation", label: "D. Perturbation",         short: "D",    available: false, description: "Neutral vs anti-pattern vs pro-pattern framings. Measure compliance." },
  { id: "temperature",  label: "E. Temperature sweep",    short: "E",    available: true,  description: "Prevalence vs T ∈ {0, 0.3, 0.7, 1.0, 1.5}. Is the pattern at the greedy centre?" },
];

const PREVALENCE_TEMPS = [0, 0.7];
const SWEEP_TEMPS = [0, 0.3, 0.7, 1.0, 1.5];
const CONTINUATION_TOP_K = 15;
const CONTINUATION_PROVIDERS = new Set(["google", "openai", "openai-compatible", "openrouter", "huggingface"]);
const EMBEDDING_PROVIDERS = new Set(["openai", "openai-compatible", "google"]);
const EXPANSION_MAX_TOKENS = 6;
const GEOMETRY_CANDIDATES_PER_SCAFFOLD = 8; // embed top-8 to keep the scatter readable and the embedding bill small

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

interface GeometryYPoint {
  token: string;
  phrase: string;
  logprob: number;
  probability: number;
  cosineToX: number;
  rank: number;       // 1 = top-probability
}
interface GeometryScaffoldResult {
  panel: "A" | "B";
  scaffoldId: string;
  scaffold: string;
  x: string;
  ys: GeometryYPoint[];
  spearman: number | null;
  embeddingModel: string;
  embeddingProvider: string;
  error?: string;
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

  // ---- Phase B geometry state ----
  const [geometryResults, setGeometryResults] = useState<GeometryScaffoldResult[]>([]);
  const [isGeometryLoading, setIsGeometryLoading] = useState(false);
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [geometryProgress, setGeometryProgress] = useState<{ stage: string; done: number; total: number } | null>(null);

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

  // When the pattern changes, default to selecting all scaffolds and clear stale results.
  useEffect(() => {
    setSelectedScaffoldIdx(new Set(pattern.scaffolds.map((_, i) => i)));
    setContinuationResults([]);
    setContinuationProgress(null);
    setContinuationError(null);
    setGeometryResults([]);
    setGeometryProgress(null);
    setGeometryError(null);
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
    setGeometryResults([]);
    setGeometryProgress(null);
    setGeometryError(null);
  }, []);

  // ---- Phase B: geometry (expand → embed → cosine → Spearman) -------------
  const canDoGeometry = !!pattern.xExtractor;

  const handleRunGeometry = useCallback(async () => {
    if (isGeometryLoading) return;
    if (!pattern.xExtractor) {
      setGeometryError("This pattern has no extractable X; the geometry view is only defined for antithesis patterns.");
      return;
    }
    if (continuationResults.length === 0) {
      setGeometryError("Run continuation first so we have top-K tokens to expand.");
      return;
    }

    // Build the set of scaffolds that (a) have results, (b) yield an X.
    const baseResults = continuationResults.filter(r => !r.error && r.distribution.length > 0);
    const usable = baseResults
      .map(r => ({ result: r, x: extractX(r.scaffold, pattern) }))
      .filter((x): x is { result: typeof baseResults[number]; x: string } => !!x.x);
    if (usable.length === 0) {
      setGeometryError("No scaffolds in the current results yielded an extractable X. Check that the scaffold contains both halves of the construction (e.g. '…not just X, but ').");
      return;
    }

    // Embedding slot: reuse whichever of slotA / slotB we can for this panel.
    const embeddingSlotFor = (panel: "A" | "B") => {
      const s = panel === "A" ? slots.A : slots.B;
      return EMBEDDING_PROVIDERS.has(s.provider) ? s : null;
    };

    setIsGeometryLoading(true);
    setGeometryError(null);
    setGeometryResults([]);

    // Cap K per scaffold for scatter readability and embedding cost.
    const capped = usable.map(u => ({
      ...u,
      top: u.result.distribution.slice(0, GEOMETRY_CANDIDATES_PER_SCAFFOLD),
    }));
    const totalExpansions = capped.reduce((s, u) => s + u.top.length, 0);

    // Per-scaffold processing so we can stream progress and intermediate
    // scaffold results into the scatter as they resolve.
    let expansionsDone = 0;
    setGeometryProgress({ stage: "Expanding Y tokens into phrases", done: 0, total: totalExpansions });

    for (const u of capped) {
      const panel = u.result.panel;
      const embedSlot = embeddingSlotFor(panel);
      if (!embedSlot) {
        setGeometryResults(prev => [...prev, {
          panel,
          scaffoldId: u.result.scaffoldId,
          scaffold: u.result.scaffold,
          x: u.x,
          ys: [],
          spearman: null,
          embeddingModel: "",
          embeddingProvider: "",
          error: `Panel ${panel}'s provider does not support embeddings. Use an OpenAI, OpenAI-compatible, or Google slot.`,
        }]);
        expansionsDone += u.top.length;
        setGeometryProgress(p => p ? { ...p, done: expansionsDone } : p);
        continue;
      }

      // The chat slot (for expansion) — same slot as produced the logprobs.
      const chatSlot = panel === "A" ? slots.A : slots.B;

      try {
        // 1. Expand tokens → phrases.
        const pairs = u.top.map(t => ({
          scaffoldId: u.result.scaffoldId,
          scaffold: u.result.scaffold,
          token: t.token,
        }));
        const phraseByToken = new Map<string, string>();
        await fetchStreaming<StreamEvent>(
          "/api/investigate/grammar-expand",
          { pairs, maxTokens: EXPANSION_MAX_TOKENS, slot: chatSlot },
          (ev) => {
            if (ev.type === "expansion" && ev.phrase) {
              phraseByToken.set(ev.token, ev.phrase);
              expansionsDone++;
              setGeometryProgress(p => p ? { ...p, done: expansionsDone } : p);
            } else if (ev.type === "expansion") {
              expansionsDone++;
              setGeometryProgress(p => p ? { ...p, done: expansionsDone } : p);
            }
          }
        );

        const phrasePoints = u.top
          .map(t => ({
            token: t.token,
            logprob: t.logprob,
            phrase: phraseByToken.get(t.token) || t.token.trim() || t.token,
          }))
          .filter(p => p.phrase && p.phrase.length > 0);

        if (phrasePoints.length < 2) {
          setGeometryResults(prev => [...prev, {
            panel,
            scaffoldId: u.result.scaffoldId,
            scaffold: u.result.scaffold,
            x: u.x,
            ys: [],
            spearman: null,
            embeddingModel: "",
            embeddingProvider: "",
            error: "Too few Y-phrases returned to compute geometry.",
          }]);
          continue;
        }

        // 2. Embed X and all Y-phrases in one call.
        const texts = [u.x, ...phrasePoints.map(p => p.phrase)];
        const res = await fetch("/api/embeddings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts, slot: embedSlot }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Embeddings failed" }));
          throw new Error(err.error || `Embeddings HTTP ${res.status}`);
        }
        const data = await res.json();
        const embeddings: number[][] = data.embeddings;
        const xVec = embeddings[0];
        const yVecs = embeddings.slice(1);

        // 3. Cosine per Y, then Spearman(logprob rank, cosine).
        const ys: GeometryYPoint[] = phrasePoints.map((p, i) => ({
          token: p.token,
          phrase: p.phrase,
          logprob: p.logprob,
          probability: Math.exp(p.logprob),
          cosineToX: cosine(xVec, yVecs[i]),
          rank: i + 1, // u.top is already sorted by probability descending
        }));
        const rho = spearman(ys.map(y => y.logprob), ys.map(y => y.cosineToX));

        setGeometryResults(prev => [...prev, {
          panel,
          scaffoldId: u.result.scaffoldId,
          scaffold: u.result.scaffold,
          x: u.x,
          ys,
          spearman: rho,
          embeddingModel: data.model || "unknown",
          embeddingProvider: data.provider || embedSlot.provider,
        }]);
      } catch (err) {
        setGeometryResults(prev => [...prev, {
          panel,
          scaffoldId: u.result.scaffoldId,
          scaffold: u.result.scaffold,
          x: u.x,
          ys: [],
          spearman: null,
          embeddingModel: "",
          embeddingProvider: "",
          error: err instanceof Error ? err.message : "Geometry run failed",
        }]);
      }
    }

    setIsGeometryLoading(false);
    setGeometryProgress(null);
  }, [isGeometryLoading, pattern, continuationResults, slots]);

  // ---- Bundle export ------------------------------------------------------
  const handleDownloadBundle = useCallback(() => {
    if (geometryResults.length === 0) return;
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;

    // Pick the chat slot (take the first represented panel).
    const firstPanel = geometryResults[0].panel;
    const chatSlot = firstPanel === "A" ? slots.A : slots.B;
    const modelName = chatSlot.customModelId || chatSlot.model;

    const bundle = {
      format: "vector-lab.grammar-probe.v1",
      createdAt: now.toISOString(),
      source: { tool: "LLMbench", version: "2.12.0", phase: "B" },
      pattern: {
        id: pattern.id,
        label: pattern.label,
        category: pattern.category,
        note: pattern.note,
      },
      model: {
        provider: chatSlot.provider,
        name: modelName,
        displayName: pattern.label, // consumer can relabel; name is the key
      },
      embeddingModel: {
        provider: geometryResults[0].embeddingProvider,
        name: geometryResults[0].embeddingModel,
      },
      parameters: {
        temperature: 0,
        topK: CONTINUATION_TOP_K,
        geometryK: GEOMETRY_CANDIDATES_PER_SCAFFOLD,
        expansionMaxTokens: EXPANSION_MAX_TOKENS,
      },
      probes: geometryResults.map(r => ({
        scaffoldId: r.scaffoldId,
        panel: r.panel,
        scaffold: r.scaffold,
        x: r.x,
        chosen: r.ys[0] ? { token: r.ys[0].token, logprob: r.ys[0].logprob } : null,
        ys: r.ys.map(y => ({
          token: y.token,
          yPhrase: y.phrase,
          logprob: y.logprob,
          rank: y.rank,
          cosineToX: y.cosineToX,
        })),
        spearman: r.spearman,
        error: r.error,
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
  }, [geometryResults, pattern, slots]);

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

          {activePhase !== "prevalence" && activePhase !== "continuation" && activePhase !== "temperature" && (
            <div className="border border-parchment/60 rounded-sm p-4 bg-cream/20 text-body-sm text-muted-foreground">
              <strong className="text-foreground">Coming soon.</strong> {PHASES.find(p => p.id === activePhase)?.description}
            </div>
          )}

          {activePhase === "continuation" && (
            <>
              {/* Pattern selector (shared) */}
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
                  Pattern
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {DEFAULT_PATTERNS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPatternId(p.id)}
                      className={`px-2.5 py-1 text-caption rounded-sm border transition-colors ${
                        patternId === p.id
                          ? "border-burgundy bg-burgundy/10 text-burgundy"
                          : "border-parchment bg-card text-muted-foreground hover:text-foreground hover:bg-cream/50"
                      }`}
                      title={p.description}
                    >
                      {p.shortLabel}
                    </button>
                  ))}
                </div>
                <div className="text-caption text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">{pattern.label}.</strong> {pattern.description}
                </div>
              </div>

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

              {/* ---- Phase B Geometry upgrade --------------------------- */}
              {continuationResults.length > 0 && (
                <div className="mt-5 pt-4 border-t border-parchment/60">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <ScatterChart className="w-3.5 h-3.5 text-burgundy" />
                      <span className="text-caption font-semibold text-foreground">Geometry view</span>
                      <span className="text-caption text-muted-foreground">— logprob × cosine(X, Y-phrase)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRunGeometry}
                        disabled={
                          !canDoGeometry ||
                          isGeometryLoading ||
                          continuationResults.length === 0
                        }
                        className="px-3 py-1 text-caption font-medium rounded-sm bg-burgundy text-white hover:bg-burgundy/90 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        <ScatterChart className="w-3.5 h-3.5" />
                        {isGeometryLoading ? "Computing…" : "Compute geometry"}
                      </button>
                      <button
                        onClick={handleDownloadBundle}
                        disabled={geometryResults.length === 0}
                        className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5 disabled:opacity-30"
                        title="Download grammar-probe bundle (.grammar.json) for import into Manifold Atlas"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download bundle
                      </button>
                    </div>
                  </div>

                  {!canDoGeometry && (
                    <div className="text-caption text-muted-foreground border-l-2 border-parchment/60 pl-2 mb-2">
                      This pattern has no extractable X — the geometry view is only defined
                      for antithesis patterns like <em>Not X but Y</em>.
                    </div>
                  )}

                  {canDoGeometry && geometryResults.length === 0 && !isGeometryLoading && (
                    <div className="text-caption text-muted-foreground border-l-2 border-parchment/60 pl-2 mb-2">
                      Expand each top-{GEOMETRY_CANDIDATES_PER_SCAFFOLD} token into a short Y-phrase,
                      embed it alongside X, and plot logprob against cosine(X, Y-phrase). A flat or
                      negative Spearman ρ means probability is <em>not</em> tracking semantic distance
                      from X — evidence the construction has collapsed toward a stable direction.
                      Requires an OpenAI, OpenAI-compatible, or Google slot for embeddings.
                    </div>
                  )}

                  {isGeometryLoading && geometryProgress && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-caption text-muted-foreground mb-1">
                        <span>{geometryProgress.stage}… {geometryProgress.done} / {geometryProgress.total}</span>
                        <span>{geometryProgress.total > 0 ? Math.round(100 * geometryProgress.done / geometryProgress.total) : 0}%</span>
                      </div>
                      <div className="h-1.5 bg-parchment/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-burgundy transition-all"
                          style={{ width: `${geometryProgress.total > 0 ? Math.round(100 * geometryProgress.done / geometryProgress.total) : 0}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {geometryError && (
                    <div className="mb-3 border border-red-400 bg-red-50 dark:bg-red-900/30 rounded-sm p-2 text-caption flex items-start gap-2 text-red-800 dark:text-red-200">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span>{geometryError}</span>
                    </div>
                  )}

                  {geometryResults.length > 0 && (
                    <div className="space-y-3">
                      {geometryResults.map((g, idx) => (
                        <GeometryScatterCard
                          key={`${g.scaffoldId}-${g.panel}-${idx}`}
                          result={g}
                          panelLabel={getSlotLabel(g.panel)}
                          suppressTokens={pattern.suppressTokens}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {activePhase === "temperature" && (
            <TemperatureSweepPanel
              pattern={pattern}
              patternId={patternId}
              setPatternId={setPatternId}
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
          )}

          {activePhase === "prevalence" && (
            <>
              {/* Pattern selector */}
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
                  Pattern
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {DEFAULT_PATTERNS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setPatternId(p.id)}
                      className={`px-2.5 py-1 text-caption rounded-sm border transition-colors ${
                        patternId === p.id
                          ? "border-burgundy bg-burgundy/10 text-burgundy"
                          : "border-parchment bg-card text-muted-foreground hover:text-foreground hover:bg-cream/50"
                      }`}
                      title={p.description}
                    >
                      {p.shortLabel}
                    </button>
                  ))}
                </div>
                <div className="text-caption text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">{pattern.label}.</strong> {pattern.description}
                </div>
              </div>

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

              {/* Deep dive */}
              {isDone && runs.length > 0 && (
                <DeepDive label="Deep Dive — run-by-run matches" defaultOpen={false}>
                  <div className="space-y-2 text-caption">
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
                      <div className="text-muted-foreground italic">No matches found in any run. Either the pattern is absent or the regex needs tightening.</div>
                    )}
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

// ---- GeometryScatterCard --------------------------------------------------
// One card per scaffold: the Y-phrases laid out as logprob × cosine(X, Y-phrase).
// The headline number is the Spearman rank correlation between the two series.
function GeometryScatterCard({
  result,
  panelLabel,
  suppressTokens,
}: {
  result: GeometryScaffoldResult;
  panelLabel: string;
  suppressTokens: string[];
}) {
  const suppressSet = new Set(suppressTokens.map(t => t.toLowerCase().trim()));
  const { ys } = result;

  if (result.error || ys.length === 0) {
    return (
      <div className="border border-parchment/60 rounded-sm bg-card overflow-hidden">
        <div className="px-3 py-2 border-b border-parchment/60 text-caption flex items-center gap-2">
          <ScatterChart className="w-3.5 h-3.5 text-burgundy shrink-0" />
          <span className="font-mono text-[11px] text-foreground truncate">{result.scaffold}<span className="text-muted-foreground/50">▋</span></span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
            {result.panel} · {panelLabel}
          </span>
        </div>
        <div className="p-3 text-caption text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{result.error || "No Y-phrases available."}</span>
        </div>
      </div>
    );
  }

  // Plot dimensions
  const W = 560, H = 220;
  const PAD = { l: 44, r: 16, t: 14, b: 34 };
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;

  const xs = ys.map(y => y.logprob);
  const cs = ys.map(y => y.cosineToX);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const cMin = Math.min(...cs);
  const cMax = Math.max(...cs);
  const xPad = (xMax - xMin) * 0.08 || 0.1;
  const cPad = (cMax - cMin) * 0.08 || 0.02;
  const xLo = xMin - xPad, xHi = xMax + xPad;
  const cLo = Math.max(-1, cMin - cPad), cHi = Math.min(1, cMax + cPad);

  const xScale = (v: number) => PAD.l + ((v - xLo) / (xHi - xLo)) * plotW;
  const yScale = (v: number) => PAD.t + (1 - (v - cLo) / (cHi - cLo)) * plotH;

  const rho = result.spearman;
  const rhoLabel = rho === null ? "n/a" : rho.toFixed(3);
  const rhoColour =
    rho === null ? "text-muted-foreground" :
    rho > 0.3 ? "text-emerald-700 dark:text-emerald-400" :
    rho < -0.3 ? "text-burgundy" :
    "text-amber-700 dark:text-amber-400";

  const xTicks = 4;
  const yTicks = 4;

  return (
    <div className="border border-parchment/60 rounded-sm bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-parchment/60 text-caption flex items-center gap-2 flex-wrap">
        <ScatterChart className="w-3.5 h-3.5 text-burgundy shrink-0" />
        <span className="font-mono text-[11px] text-foreground truncate flex-1 min-w-[12rem]">
          {result.scaffold}<span className="text-muted-foreground/50">▋</span>
        </span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
          {result.panel} · {panelLabel}
        </span>
      </div>
      <div className="px-3 py-2 flex items-center gap-3 flex-wrap text-caption">
        <span className="text-muted-foreground">X =</span>
        <span className="font-mono text-foreground">&ldquo;{result.x}&rdquo;</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-muted-foreground">Spearman ρ</span>
          <span className={`font-mono font-semibold ${rhoColour}`}>{rhoLabel}</span>
        </span>
      </div>
      <div className="px-3 pb-3 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-full" role="img" aria-label="Scatter plot of log-probability against cosine similarity of Y-phrase to X">
          {/* gridlines + axes */}
          <rect x={PAD.l} y={PAD.t} width={plotW} height={plotH} fill="none" stroke="currentColor" strokeOpacity={0.1} />
          {Array.from({ length: yTicks + 1 }).map((_, i) => {
            const v = cLo + (i / yTicks) * (cHi - cLo);
            const y = yScale(v);
            return (
              <g key={`y${i}`}>
                <line x1={PAD.l} x2={PAD.l + plotW} y1={y} y2={y} stroke="currentColor" strokeOpacity={0.06} />
                <text x={PAD.l - 6} y={y + 3} fontSize={9} textAnchor="end" fill="currentColor" fillOpacity={0.55}>
                  {v.toFixed(2)}
                </text>
              </g>
            );
          })}
          {Array.from({ length: xTicks + 1 }).map((_, i) => {
            const v = xLo + (i / xTicks) * (xHi - xLo);
            const x = xScale(v);
            return (
              <g key={`x${i}`}>
                <line x1={x} x2={x} y1={PAD.t} y2={PAD.t + plotH} stroke="currentColor" strokeOpacity={0.06} />
                <text x={x} y={PAD.t + plotH + 12} fontSize={9} textAnchor="middle" fill="currentColor" fillOpacity={0.55}>
                  {v.toFixed(2)}
                </text>
              </g>
            );
          })}
          {/* axis titles */}
          <text x={PAD.l + plotW / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="currentColor" fillOpacity={0.7}>
            log-probability
          </text>
          <text
            x={-PAD.t - plotH / 2}
            y={12}
            fontSize={10}
            textAnchor="middle"
            fill="currentColor"
            fillOpacity={0.7}
            transform="rotate(-90)"
          >
            cosine(X, Y-phrase)
          </text>

          {/* points */}
          {ys.map((y, i) => {
            const isSuppress = suppressSet.has(y.token.toLowerCase().trim());
            const cx = xScale(y.logprob);
            const cy = yScale(y.cosineToX);
            const r = 3 + Math.sqrt(y.probability) * 9;
            const fill = isSuppress ? "#800020" : "#800020";
            const opacity = 0.35 + 0.6 * y.probability;
            return (
              <g key={i}>
                <circle cx={cx} cy={cy} r={r} fill={fill} fillOpacity={opacity} stroke={isSuppress ? "#800020" : "#fff"} strokeOpacity={isSuppress ? 1 : 0.4} strokeWidth={isSuppress ? 1.5 : 0.75}>
                  <title>{`"${y.token}" → "${y.phrase}"  p=${(y.probability * 100).toFixed(1)}%  cos=${y.cosineToX.toFixed(3)}  rank=${y.rank}`}</title>
                </circle>
                <text
                  x={cx + r + 3}
                  y={cy + 3}
                  fontSize={9}
                  fill="currentColor"
                  fillOpacity={0.85}
                  style={{ pointerEvents: "none" }}
                >
                  {y.phrase.length > 26 ? y.phrase.slice(0, 25) + "…" : y.phrase}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <DeepDive label="Y-phrases (rank · logprob · cosine)">
        <div className="space-y-0.5 text-[11px]">
          <div className="grid grid-cols-[2rem_6rem_1fr_4rem_4rem] gap-2 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold pb-1 border-b border-parchment/40">
            <span>#</span>
            <span>token</span>
            <span>Y-phrase</span>
            <span className="text-right">p</span>
            <span className="text-right">cos(X,Y)</span>
          </div>
          {ys.map((y, i) => {
            const isSuppress = suppressSet.has(y.token.toLowerCase().trim());
            return (
              <div key={i} className="grid grid-cols-[2rem_6rem_1fr_4rem_4rem] gap-2 py-0.5">
                <span className="font-mono tabular-nums text-muted-foreground">{y.rank}</span>
                <span className={`font-mono truncate ${isSuppress ? "text-burgundy font-semibold" : "text-foreground"}`}>
                  &ldquo;{y.token.replace(/\n/g, "⏎")}&rdquo;
                </span>
                <span className="font-mono truncate text-foreground">{y.phrase}</span>
                <span className="font-mono tabular-nums text-right text-muted-foreground">{(y.probability * 100).toFixed(1)}%</span>
                <span className="font-mono tabular-nums text-right text-muted-foreground">{y.cosineToX.toFixed(3)}</span>
              </div>
            );
          })}
          <div className="pt-2 mt-2 border-t border-parchment/40 text-caption text-muted-foreground">
            Embedding model: <span className="font-mono text-foreground">{result.embeddingProvider} / {result.embeddingModel}</span>
          </div>
        </div>
      </DeepDive>
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

function TemperatureSweepPanel(props: {
  pattern: GrammarPattern;
  patternId: string;
  setPatternId: (id: string) => void;
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
    pattern, patternId, setPatternId,
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
      {/* Pattern selector */}
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1.5">
          Pattern
        </div>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DEFAULT_PATTERNS.map(p => (
            <button
              key={p.id}
              onClick={() => setPatternId(p.id)}
              className={`px-2.5 py-1 text-caption rounded-sm border transition-colors ${
                patternId === p.id
                  ? "border-burgundy bg-burgundy/10 text-burgundy"
                  : "border-parchment bg-card text-muted-foreground hover:text-foreground hover:bg-cream/50"
              }`}
              title={p.description}
            >
              {p.shortLabel}
            </button>
          ))}
        </div>
        <div className="text-caption text-muted-foreground leading-relaxed">
          <strong className="text-foreground">{pattern.label}.</strong> {pattern.description}
        </div>
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
