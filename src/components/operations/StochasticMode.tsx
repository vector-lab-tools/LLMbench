"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { AlertCircle, Dices, RotateCcw } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { AnalysisPromptArea } from "@/components/shared/AnalysisPromptArea";
import { DefaultPromptChips } from "@/components/shared/DefaultPromptChips";
import { MODE_DEFAULTS, getRandomDefault } from "@/lib/prompts/defaults";
import type { PanelSelection } from "@/components/shared/ModelSelector";
import { ResultCard, MetricBox } from "@/components/shared/ResultCard";
import { AnalysisSummaryBanner } from "@/components/shared/AnalysisSummaryBanner";
import { DeepDive } from "@/components/shared/DeepDive";
import { GhostCard } from "@/components/shared/GhostCard";
import { computeWordOverlap } from "@/lib/metrics/text-metrics";
import { fetchStreaming } from "@/lib/streaming";
import type { RunResult, RunOutput } from "@/types/analysis";
import { isRunOutput } from "@/types/analysis";

function isOutput(r: RunResult): r is RunResult & { text: string } {
  return "text" in r;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamEvent = { type: string; panel?: string; index?: number; result?: any; runCount?: number; hasB?: boolean };

interface StochasticModeProps {
  isDark: boolean;
  pendingPrompt?: string;
}

export default function StochasticMode({ isDark, pendingPrompt }: StochasticModeProps) {
  const { slots, getSlotLabel, isSlotConfigured, noMarkdown } = useProviderSettings();
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("A");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (pendingPrompt) setPrompt(pendingPrompt);
  }, [pendingPrompt]);
  const [runCount, setRunCount] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Progressive results: sparse arrays that fill in as results stream back
  const [runsA, setRunsA] = useState<(RunResult | null)[]>([]);
  const [runsB, setRunsB] = useState<(RunResult | null)[]>([]);
  const [expectedCount, setExpectedCount] = useState(0);
  const [hasB, setHasB] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const slotAConfigured = isSlotConfigured("A");

  const handleRun = useCallback(async (overridePrompt?: string) => {
    const effectivePrompt = overridePrompt ?? (prompt.trim() || (() => {
      const d = getRandomDefault("stochastic"); setPrompt(d); return d;
    })());
    if (!effectivePrompt || isLoading) return;
    setIsLoading(true);
    setError(null);
    setRunsA([]);
    setRunsB([]);
    setExpectedCount(runCount);
    setHasB(panelSelection === "both" && isSlotConfigured("B"));
    setIsDone(false);

    try {
      await fetchStreaming<StreamEvent>(
        "/api/analyse/stochastic",
        {
          prompt: effectivePrompt,
          runCount,
          slotA: panelSelection === "B" ? slots.B : slots.A,
          slotB: panelSelection === "both" && isSlotConfigured("B") ? slots.B : null,
          noMarkdown,
        },
        (event) => {
          if (event.type === "meta") {
            setExpectedCount(event.runCount || runCount);
            setHasB(!!event.hasB);
          } else if (event.type === "run" && event.index !== undefined && event.result) {
            const setter = event.panel === "B" ? setRunsB : setRunsA;
            setter(prev => {
              const next = [...prev];
              next[event.index!] = event.result as RunResult;
              return next;
            });
          } else if (event.type === "done") {
            setIsDone(true);
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsLoading(false);
      setIsDone(true);
    }
  }, [prompt, runCount, slots, panelSelection, isSlotConfigured, isLoading]);

  const hasResults = runsA.some(r => r !== null) || runsB.some(r => r !== null);
  const showResults = hasResults || isLoading;

  const summaryStats = useMemo(() => {
    if (!isDone) return null;
    const outputs = runsA.filter((r): r is RunOutput => r !== null && isRunOutput(r));
    if (outputs.length < 2) return null;
    const avgDiversity =
      outputs.reduce((s, r) => s + r.metrics.vocabularyDiversity, 0) / outputs.length;
    let sum = 0, count = 0;
    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        sum += computeWordOverlap(outputs[i].text, outputs[j].text).overlapPercentage;
        count++;
      }
    }
    const avgOverlap = sum / count;
    const level = avgOverlap > 70 ? "low" : avgOverlap > 40 ? "moderate" : "high";
    const label =
      level === "low" ? "Low variation" : level === "moderate" ? "Moderate variation" : "High variation";
    const summary = `${label} across ${outputs.length} runs: outputs share ${avgOverlap.toFixed(0)}% of vocabulary on average (vocabulary diversity ${(avgDiversity * 100).toFixed(0)}%).`;
    return { level: level as "low" | "moderate" | "high", label, summary };
  }, [isDone, runsA]);

  const renderPanel = (panel: "A" | "B", runs: (RunResult | null)[], label: string) => {
    const filledRuns = runs.filter((r): r is RunResult => r !== null);
    const outputs = filledRuns.filter(isOutput);
    const avgWords = outputs.length > 0
      ? Math.round(outputs.reduce((s, r) => s + (r as { metrics: { wordCount: number } }).metrics.wordCount, 0) / outputs.length)
      : 0;
    const avgDiversity = outputs.length > 0
      ? outputs.reduce((s, r) => s + (r as { metrics: { vocabularyDiversity: number } }).metrics.vocabularyDiversity, 0) / outputs.length
      : 0;

    let avgOverlap = 0;
    if (outputs.length >= 2) {
      let count = 0;
      let sum = 0;
      for (let i = 0; i < outputs.length; i++) {
        for (let j = i + 1; j < outputs.length; j++) {
          const overlap = computeWordOverlap(
            (outputs[i] as { text: string }).text,
            (outputs[j] as { text: string }).text
          );
          sum += overlap.overlapPercentage;
          count++;
        }
      }
      avgOverlap = sum / count;
    }

    return (
      <div key={panel}>
        <h3 className="text-body-sm font-semibold text-foreground mb-3">
          Panel {panel}: {label}
          {!isDone && <span className="text-caption text-muted-foreground font-normal ml-2">({filledRuns.length}/{expectedCount} complete)</span>}
        </h3>

        {/* Summary metrics (update progressively) */}
        {filledRuns.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricBox label="Runs" value={`${filledRuns.length}/${expectedCount}`} />
            <MetricBox label="Avg Words" value={avgWords} />
            <MetricBox label="Avg Vocabulary Diversity" value={`${(avgDiversity * 100).toFixed(1)}%`} />
            <MetricBox label="Avg Pairwise Overlap" value={outputs.length >= 2 ? `${avgOverlap.toFixed(1)}%` : "-"} />
          </div>
        )}

        {/* Run cards: filled results + ghost cards for pending */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: expectedCount }, (_, i) => {
            const run = runs[i];
            if (!run) {
              return <GhostCard key={i} title={`Run ${i + 1}`} panel={panel} />;
            }
            return (
              <ResultCard
                key={i}
                title={`Run ${i + 1}`}
                panel={panel}
                subtitle={isOutput(run) ? `${(run as { metrics: { wordCount: number } }).metrics.wordCount} words` : undefined}
                badge={isOutput(run) ? `${((run as { metrics: { vocabularyDiversity: number } }).metrics.vocabularyDiversity * 100).toFixed(0)}% lexical diversity` : "Error"}
                badgeColor={isOutput(run) ? undefined : "bg-red-100 text-red-600"}
                badgeTooltip={isOutput(run) ? "Lexical diversity: the percentage of words in this response that are non-repeated. High values indicate varied vocabulary; lower values suggest repetition. This measures richness within a single run, not similarity between runs." : undefined}
                footer={
                  isOutput(run) ? (
                    <DeepDive label="Full Text" summary={`${(run as { text: string }).text.length} chars`}>
                      <div className="text-body-sm text-foreground whitespace-pre-wrap font-serif leading-relaxed max-h-[400px] overflow-y-auto">
                        {(run as { text: string }).text}
                      </div>
                    </DeepDive>
                  ) : undefined
                }
              >
                {isOutput(run) ? (
                  <p className="text-body-sm text-muted-foreground line-clamp-4 font-serif">
                    {(run as { text: string }).text.slice(0, 300)}
                    {(run as { text: string }).text.length > 300 ? "..." : ""}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-500">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-body-sm">{(run as { error: string }).error}</span>
                    </div>
                    <button
                      onClick={() => handleRun()}
                      disabled={isLoading}
                      className="flex items-center gap-1.5 text-caption text-burgundy hover:text-foreground transition-colors disabled:opacity-40"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Retry all
                    </button>
                  </div>
                )}
              </ResultCard>
            );
          })}
        </div>

        {/* Panel-level Deep Dive (only when done) */}
        {isDone && outputs.length >= 2 && (
          <div className="mt-4 bg-card border border-parchment/50 rounded-sm overflow-hidden">
            <DeepDive
              label="Deep Dive"
              summary={`${outputs.length} runs, ${(outputs.length * (outputs.length - 1)) / 2} pairwise comparisons`}
            >
              <div>
                <div className="text-caption font-medium text-muted-foreground mb-2">Per-Run Metrics</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="border-b border-parchment">
                        <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Run</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Words</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Sentences</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Avg Sent. Length</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Vocab Diversity</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Unique Words</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Response Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outputs.map((run, i) => {
                        const r = run as { metrics: { wordCount: number; sentenceCount: number; avgSentenceLength: number; vocabularyDiversity: number; uniqueWordCount: number }; provenance: { responseTimeMs: number } };
                        return (
                          <tr key={i} className="border-b border-parchment/30 hover:bg-cream/30">
                            <td className="py-1 px-2 font-medium">Run {i + 1}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{r.metrics.wordCount}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{r.metrics.sentenceCount}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{r.metrics.avgSentenceLength.toFixed(1)}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{(r.metrics.vocabularyDiversity * 100).toFixed(1)}%</td>
                            <td className="py-1 px-2 text-right tabular-nums">{r.metrics.uniqueWordCount}</td>
                            <td className="py-1 px-2 text-right tabular-nums">{(r.provenance.responseTimeMs / 1000).toFixed(1)}s</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <div className="text-caption font-medium text-muted-foreground mb-2">Pairwise Word Overlap (%)</div>
                <div className="overflow-x-auto">
                  <table className="text-caption">
                    <thead>
                      <tr>
                        <th className="py-1 px-2 font-medium text-muted-foreground"></th>
                        {outputs.map((_, j) => (
                          <th key={j} className="py-1 px-2 font-medium text-muted-foreground text-center min-w-[50px]">R{j + 1}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {outputs.map((runI, i) => (
                        <tr key={i}>
                          <td className="py-1 px-2 font-medium text-muted-foreground">R{i + 1}</td>
                          {outputs.map((runJ, j) => {
                            if (i === j) return <td key={j} className="py-1 px-2 text-center text-muted-foreground/40 tabular-nums">-</td>;
                            const overlap = computeWordOverlap((runI as { text: string }).text, (runJ as { text: string }).text);
                            const pct = overlap.overlapPercentage;
                            const bg = pct > 70 ? "bg-green-100 dark:bg-green-900/30" : pct > 40 ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-red-100 dark:bg-red-900/30";
                            return <td key={j} className={`py-1 px-2 text-center tabular-nums ${bg}`}>{pct.toFixed(0)}%</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-caption text-muted-foreground mt-2">
                  Colour key: green (&gt;70%) = high overlap, yellow (40-70%) = moderate, red (&lt;40%) = low overlap.
                </p>
              </div>
            </DeepDive>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mode description */}
      <div className="px-6 py-2 bg-cream/40 border-b border-parchment/30 text-caption text-muted-foreground">
        <strong className="text-foreground">Stochastic Variation:</strong> Sends the same prompt to the same model(s) multiple times to empirically demonstrate how identical inputs produce different outputs through probabilistic sampling (&lsquo;prompt salting&rsquo;). Configure the number of runs and compare variation within and between models.
      </div>

      {/* Results area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {showResults ? (
          <div className="p-6 space-y-6">
            {summaryStats && (
              <AnalysisSummaryBanner
                level={summaryStats.level}
                label={summaryStats.label}
                summary={summaryStats.summary}
              />
            )}
            {renderPanel(
              panelSelection === "B" ? "B" : "A",
              runsA,
              getSlotLabel(panelSelection === "B" ? "B" : "A")
            )}
            {hasB && renderPanel("B", runsB, getSlotLabel("B"))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Dices className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-body-sm">Run the same prompt multiple times to measure stochastic variation.</p>
              <p className="text-caption mt-1">Demonstrates how identical inputs produce different outputs.</p>
            </div>
          </div>
        )}
      </div>

      {/* Prompt area */}
      <AnalysisPromptArea
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={handleRun}
        isLoading={isLoading}
        disabled={!slotAConfigured}
        error={error}
        placeholder="Enter a prompt to run multiple times..."
        panelSelection={panelSelection}
        onPanelSelectionChange={setPanelSelection}
        hasResults={runsA.length > 0 || runsB.length > 0}
        onReset={() => { setRunsA([]); setRunsB([]); setIsDone(false); setError(null); }}
        controls={
          <div className="flex items-center gap-1.5">
            <label className="text-caption text-muted-foreground">Runs</label>
            <select
              value={runCount}
              onChange={(e) => setRunCount(Number(e.target.value))}
              className="input-editorial text-caption px-2 py-1 w-14"
              disabled={isLoading}
            >
              {[3, 5, 7, 10, 15, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        }
        footer={
          !slotAConfigured ? (
            <div className="text-caption text-muted-foreground">
              Configure at least one model in Settings to begin.
            </div>
          ) : !prompt.trim() && !isLoading ? (
            <DefaultPromptChips
              prompts={MODE_DEFAULTS.stochastic}
              onSelect={(p) => { setPrompt(p); handleRun(p); }}
              isLoading={isLoading}
            />
          ) : undefined
        }
      />
    </>
  );
}
