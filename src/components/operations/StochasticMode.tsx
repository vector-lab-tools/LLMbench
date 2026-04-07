"use client";

import { useState, useCallback } from "react";
import { Loader2, AlertCircle, Dices } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { AnalysisPromptArea } from "@/components/shared/AnalysisPromptArea";
import type { PanelSelection } from "@/components/shared/ModelSelector";
import { ResultCard, MetricBox } from "@/components/shared/ResultCard";
import { DeepDive } from "@/components/shared/DeepDive";
import { computeWordOverlap } from "@/lib/metrics/text-metrics";
import type { RunResult } from "@/types/analysis";

function isOutput(r: RunResult): r is RunResult & { text: string } {
  return "text" in r;
}

interface StochasticModeProps {
  isDark: boolean;
}

export default function StochasticMode({ isDark }: StochasticModeProps) {
  const { slots, getSlotLabel, isSlotConfigured } = useProviderSettings();
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("A");
  const [prompt, setPrompt] = useState("");
  const [runCount, setRunCount] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultA, setResultA] = useState<{ runs: RunResult[] } | null>(null);
  const [resultB, setResultB] = useState<{ runs: RunResult[] } | null>(null);

  const slotAConfigured = isSlotConfigured("A");
  const slotBConfigured = isSlotConfigured("B");

  const handleRun = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    setResultA(null);
    setResultB(null);

    try {
      const response = await fetch("/api/analyse/stochastic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          runCount,
          slotA: panelSelection === "B" ? slots.B : slots.A,
          slotB: panelSelection === "both" && isSlotConfigured("B") ? slots.B : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      setResultA(data.A);
      setResultB(data.B);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  }, [prompt, runCount, slots, panelSelection, isSlotConfigured, isLoading]);

  return (
    <>
      {/* Mode description */}
      <div className="px-6 py-2 bg-cream/40 border-b border-parchment/30 text-caption text-muted-foreground">
        <strong className="text-foreground">Stochastic Variation:</strong> Sends the same prompt to the same model(s) multiple times to empirically demonstrate how identical inputs produce different outputs through probabilistic sampling (&lsquo;prompt salting&rsquo;). Configure the number of runs and compare variation within and between models.
      </div>
      {/* Results area */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
              <p className="text-body-sm">Running {runCount} iterations on {panelSelection === "both" ? "both models" : "one model"}...</p>
            </div>
          </div>
        ) : resultA ? (
          <div className="p-6 space-y-6">
            {[
              { panel: "A" as const, result: resultA, label: getSlotLabel("A") },
              ...(resultB ? [{ panel: "B" as const, result: resultB, label: getSlotLabel("B") }] : []),
            ].map(({ panel, result, label }) => {
              const outputs = result.runs.filter(isOutput);
              const avgWords = outputs.length > 0
                ? Math.round(outputs.reduce((s, r) => s + (r as { metrics: { wordCount: number } }).metrics.wordCount, 0) / outputs.length)
                : 0;
              const avgDiversity = outputs.length > 0
                ? outputs.reduce((s, r) => s + (r as { metrics: { vocabularyDiversity: number } }).metrics.vocabularyDiversity, 0) / outputs.length
                : 0;

              // Pairwise overlap
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
                  </h3>

                  {/* Summary metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <MetricBox label="Runs" value={result.runs.length} />
                    <MetricBox label="Avg Words" value={avgWords} />
                    <MetricBox label="Avg Vocabulary Diversity" value={`${(avgDiversity * 100).toFixed(1)}%`} />
                    <MetricBox label="Avg Pairwise Overlap" value={`${avgOverlap.toFixed(1)}%`} />
                  </div>

                  {/* Run cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {result.runs.map((run: RunResult, i: number) => (
                      <ResultCard
                        key={i}
                        title={`Run ${i + 1}`}
                        panel={panel}
                        subtitle={isOutput(run) ? `${(run as { metrics: { wordCount: number } }).metrics.wordCount} words` : undefined}
                        badge={isOutput(run) ? `${((run as { metrics: { vocabularyDiversity: number } }).metrics.vocabularyDiversity * 100).toFixed(0)}% diverse` : "Error"}
                        badgeColor={isOutput(run) ? undefined : "bg-red-100 text-red-600"}
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
                          <div className="flex items-center gap-2 text-red-500">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-body-sm">{(run as { error: string }).error}</span>
                          </div>
                        )}
                      </ResultCard>
                    ))}
                  </div>

                  {/* Panel-level Deep Dive: pairwise overlap matrix and per-run metrics */}
                  {outputs.length >= 2 && (
                    <div className="mt-4 bg-card border border-parchment/50 rounded-sm overflow-hidden">
                      <DeepDive
                        label="Deep Dive"
                        summary={`${outputs.length} runs, ${(outputs.length * (outputs.length - 1)) / 2} pairwise comparisons`}
                      >
                        {/* Per-run metrics table */}
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

                        {/* Pairwise overlap matrix */}
                        <div>
                          <div className="text-caption font-medium text-muted-foreground mb-2">Pairwise Word Overlap (%)</div>
                          <div className="overflow-x-auto">
                            <table className="text-caption">
                              <thead>
                                <tr>
                                  <th className="py-1 px-2 font-medium text-muted-foreground"></th>
                                  {outputs.map((_, j) => (
                                    <th key={j} className="py-1 px-2 font-medium text-muted-foreground text-center min-w-[50px]">
                                      R{j + 1}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {outputs.map((runI, i) => (
                                  <tr key={i}>
                                    <td className="py-1 px-2 font-medium text-muted-foreground">R{i + 1}</td>
                                    {outputs.map((runJ, j) => {
                                      if (i === j) {
                                        return <td key={j} className="py-1 px-2 text-center text-muted-foreground/40 tabular-nums">-</td>;
                                      }
                                      const overlap = computeWordOverlap(
                                        (runI as { text: string }).text,
                                        (runJ as { text: string }).text
                                      );
                                      const pct = overlap.overlapPercentage;
                                      const bg = pct > 70 ? "bg-green-100 dark:bg-green-900/30" : pct > 40 ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-red-100 dark:bg-red-900/30";
                                      return (
                                        <td key={j} className={`py-1 px-2 text-center tabular-nums ${bg}`}>
                                          {pct.toFixed(0)}%
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <p className="text-caption text-muted-foreground mt-2">
                            Colour key: green (&gt;70%) = high overlap, yellow (40-70%) = moderate, red (&lt;40%) = low overlap. Lower overlap indicates greater stochastic variation between runs.
                          </p>
                        </div>
                      </DeepDive>
                    </div>
                  )}
                </div>
              );
            })}
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
          ) : undefined
        }
      />
    </>
  );
}
