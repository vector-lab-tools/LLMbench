"use client";

import { useState, useCallback } from "react";
import { Send, Loader2, AlertCircle, Dices } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
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
          slotA: slots.A,
          slotB: slotBConfigured ? slots.B : null,
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
  }, [prompt, runCount, slots, slotBConfigured, isLoading]);

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
              <p className="text-body-sm">Running {runCount} iterations on {slotBConfigured ? "both models" : "one model"}...</p>
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
      <div className="px-6 py-3 border-t border-border bg-card">
        <div className="flex gap-3 max-w-4xl mx-auto items-end">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a prompt to run multiple times..."
            className="input-editorial flex-1 resize-none min-h-[60px] max-h-[200px]"
            rows={2}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleRun();
              }
            }}
          />
          <div className="flex flex-col gap-1">
            <label className="text-caption text-muted-foreground">Runs</label>
            <select
              value={runCount}
              onChange={(e) => setRunCount(Number(e.target.value))}
              className="input-editorial text-body-sm px-2 py-1.5 w-16"
              disabled={isLoading}
            >
              {[3, 5, 7, 10, 15, 20].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleRun}
            disabled={!prompt.trim() || isLoading || !slotAConfigured}
            className="btn-editorial-primary px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {error && (
          <div className="mt-2 max-w-4xl mx-auto text-caption text-red-500 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
        {!slotAConfigured && (
          <div className="mt-2 max-w-4xl mx-auto text-caption text-muted-foreground">
            Configure at least one model in Settings to begin.
          </div>
        )}
      </div>
    </>
  );
}
