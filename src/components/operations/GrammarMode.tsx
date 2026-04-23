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

import { useState, useCallback, useMemo } from "react";
import {
  AlertCircle, Microscope, Play, RotateCcw, Settings2, FileText,
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
import {
  DEFAULT_GRAMMAR_SUITE,
  REGISTER_LABELS,
  type GrammarSuitePrompt,
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
  { id: "continuation", label: "B. Continuation logprobs", short: "B",   available: false, description: "For each pattern scaffold, inspect the top-20 next-token distribution." },
  { id: "forced",       label: "C. Forced continuation",  short: "C",    available: false, description: "Cap scaffolds at 'but a ' and harvest top-20 Ys. Cross-link to Manifold Atlas." },
  { id: "perturbation", label: "D. Perturbation",         short: "D",    available: false, description: "Neutral vs anti-pattern vs pro-pattern framings. Measure compliance." },
  { id: "temperature",  label: "E. Temperature sweep",    short: "E",    available: false, description: "Prevalence vs T ∈ {0, 0.3, 0.7, 1.0, 1.5}. Is the pattern at the greedy centre?" },
];

const PREVALENCE_TEMPS = [0, 0.7];

// `pendingPrompt` is accepted for nav compatibility with the rest of the app
// (tutorial cards can deep-link into any mode with a pre-filled prompt).
// Grammar mode does not yet consume it.
export default function GrammarMode({ pendingPrompt: _pendingPrompt }: GrammarModeProps) {
  void _pendingPrompt;

  const { slots, getSlotLabel, isSlotConfigured, noMarkdown } = useProviderSettings();
  const [activePhase, setActivePhase] = useState<Phase>("prevalence");
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("A");
  const [patternId, setPatternId] = useState(DEFAULT_PATTERNS[0].id);
  const [suite] = useState<GrammarSuitePrompt[]>(DEFAULT_GRAMMAR_SUITE);
  const [selectedPromptIds, setSelectedPromptIds] = useState<Set<string>>(
    () => new Set(DEFAULT_GRAMMAR_SUITE.map(p => p.id))
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [showSuiteEditor, setShowSuiteEditor] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const pattern = useMemo(
    () => DEFAULT_PATTERNS.find(p => p.id === patternId) || DEFAULT_PATTERNS[0],
    [patternId]
  );

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

          {activePhase !== "prevalence" && (
            <div className="border border-parchment/60 rounded-sm p-4 bg-cream/20 text-body-sm text-muted-foreground">
              <strong className="text-foreground">Coming soon.</strong> {PHASES.find(p => p.id === activePhase)?.description}
            </div>
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

              {/* Suite controls */}
              <div className="mb-3 flex items-center gap-3 flex-wrap">
                <button
                  onClick={() => setShowSuiteEditor(v => !v)}
                  className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  Suite ({selectedPrompts.length}/{suite.length})
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

              {/* Per-panel + per-temperature + per-register quick stats */}
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
                        {suite.filter(p => selectedPromptIds.has(p.id)).map(p => (
                          <tr key={p.id} className="border-b border-parchment/30 last:border-b-0">
                            <td className="px-2 py-1 sticky left-0 bg-card z-10">
                              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                                {REGISTER_LABELS[p.register]}
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
                        ))}
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
