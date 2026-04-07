"use client";

import { useState, useCallback } from "react";
import { Send, Loader2, AlertCircle, GitFork } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { ModelSelector, type PanelSelection } from "@/components/shared/ModelSelector";
import { MetricBox } from "@/components/shared/ResultCard";
import { DeepDive } from "@/components/shared/DeepDive";

interface RunOutput {
  text: string;
  metrics: {
    wordCount: number;
    sentenceCount: number;
    avgSentenceLength: number;
    vocabularyDiversity: number;
    uniqueWordCount: number;
  };
  provenance: { modelDisplayName: string; responseTimeMs: number; temperature: number };
}

interface RunError {
  error: string;
  provenance: { modelDisplayName: string };
}

type RunResult = RunOutput | RunError;

interface DivergenceMetrics {
  wordOverlap: {
    shared: string[];
    uniqueA: string[];
    uniqueB: string[];
    jaccardSimilarity: number;
    overlapPercentage: number;
  };
  metricsA: RunOutput["metrics"];
  metricsB: RunOutput["metrics"];
  responseTimeDiffMs: number;
}

function isOutput(r: RunResult): r is RunOutput {
  return "text" in r;
}

interface DivergenceModeProps {
  isDark: boolean;
}

export default function DivergenceMode({ isDark }: DivergenceModeProps) {
  const { slots, getSlotLabel, isSlotConfigured } = useProviderSettings();
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("both");
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultA, setResultA] = useState<RunResult | null>(null);
  const [resultB, setResultB] = useState<RunResult | null>(null);
  const [metrics, setMetrics] = useState<DivergenceMetrics | null>(null);

  const slotAConfigured = isSlotConfigured("A");
  const slotBConfigured = isSlotConfigured("B");

  const handleRun = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    setResultA(null);
    setResultB(null);
    setMetrics(null);

    try {
      const response = await fetch("/api/analyse/divergence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
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
      setMetrics(data.metrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  }, [prompt, slots, panelSelection, isSlotConfigured, isLoading]);

  return (
    <>
      {/* Mode description */}
      <div className="px-6 py-2 bg-cream/40 border-b border-parchment/30 text-caption text-muted-foreground">
        <strong className="text-foreground">Cross-Model Divergence:</strong> Sends the same prompt to two models and computes quantitative divergence metrics including Jaccard similarity, vocabulary overlap, structural comparison (sentence count, average sentence length), and response time differences.
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
              <p className="text-body-sm">Generating and comparing outputs...</p>
            </div>
          </div>
        ) : resultA ? (
          <div className="p-6 space-y-6">
            {/* Divergence metrics dashboard */}
            {metrics && (
              <div className="bg-card border border-parchment/50 rounded-sm p-5">
                <h3 className="text-body-sm font-semibold text-foreground mb-3">Divergence Metrics</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <MetricBox label="Jaccard Similarity" value={`${(metrics.wordOverlap.jaccardSimilarity * 100).toFixed(1)}%`} />
                  <MetricBox label="Word Overlap" value={`${metrics.wordOverlap.overlapPercentage.toFixed(1)}%`} />
                  <MetricBox label="Shared Words" value={metrics.wordOverlap.shared.length} />
                  <MetricBox label="Unique to A" value={metrics.wordOverlap.uniqueA.length} />
                  <MetricBox label="Unique to B" value={metrics.wordOverlap.uniqueB.length} />
                </div>

                {/* Structural comparison */}
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-caption font-medium text-muted-foreground mb-2">Panel A: {getSlotLabel("A")}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <MetricBox label="Words" value={metrics.metricsA.wordCount} />
                      <MetricBox label="Sentences" value={metrics.metricsA.sentenceCount} />
                      <MetricBox label="Avg Sent. Length" value={metrics.metricsA.avgSentenceLength.toFixed(1)} />
                      <MetricBox label="Vocab Diversity" value={`${(metrics.metricsA.vocabularyDiversity * 100).toFixed(0)}%`} />
                    </div>
                  </div>
                  <div>
                    <div className="text-caption font-medium text-muted-foreground mb-2">Panel B: {getSlotLabel("B")}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <MetricBox label="Words" value={metrics.metricsB.wordCount} />
                      <MetricBox label="Sentences" value={metrics.metricsB.sentenceCount} />
                      <MetricBox label="Avg Sent. Length" value={metrics.metricsB.avgSentenceLength.toFixed(1)} />
                      <MetricBox label="Vocab Diversity" value={`${(metrics.metricsB.vocabularyDiversity * 100).toFixed(0)}%`} />
                    </div>
                  </div>
                </div>

                {/* Deep dive: vocabulary lists */}
                <DeepDive label="Vocabulary Analysis" summary={`${metrics.wordOverlap.shared.length} shared, ${metrics.wordOverlap.uniqueA.length + metrics.wordOverlap.uniqueB.length} unique`}>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-caption font-medium text-muted-foreground mb-1">Unique to A ({metrics.wordOverlap.uniqueA.length})</div>
                      <div className="max-h-[300px] overflow-y-auto text-caption font-mono text-red-600 dark:text-red-400 space-y-0.5">
                        {metrics.wordOverlap.uniqueA.slice(0, 100).map((w, i) => (
                          <div key={i}>{w}</div>
                        ))}
                        {metrics.wordOverlap.uniqueA.length > 100 && (
                          <div className="text-muted-foreground">...and {metrics.wordOverlap.uniqueA.length - 100} more</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-caption font-medium text-muted-foreground mb-1">Shared ({metrics.wordOverlap.shared.length})</div>
                      <div className="max-h-[300px] overflow-y-auto text-caption font-mono text-foreground space-y-0.5">
                        {metrics.wordOverlap.shared.slice(0, 100).map((w, i) => (
                          <div key={i}>{w}</div>
                        ))}
                        {metrics.wordOverlap.shared.length > 100 && (
                          <div className="text-muted-foreground">...and {metrics.wordOverlap.shared.length - 100} more</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-caption font-medium text-muted-foreground mb-1">Unique to B ({metrics.wordOverlap.uniqueB.length})</div>
                      <div className="max-h-[300px] overflow-y-auto text-caption font-mono text-green-600 dark:text-green-400 space-y-0.5">
                        {metrics.wordOverlap.uniqueB.slice(0, 100).map((w, i) => (
                          <div key={i}>{w}</div>
                        ))}
                        {metrics.wordOverlap.uniqueB.length > 100 && (
                          <div className="text-muted-foreground">...and {metrics.wordOverlap.uniqueB.length - 100} more</div>
                        )}
                      </div>
                    </div>
                  </div>
                </DeepDive>
              </div>
            )}

            {/* Side-by-side outputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { panel: "A" as const, result: resultA!, label: getSlotLabel("A") },
                ...(resultB ? [{ panel: "B" as const, result: resultB, label: getSlotLabel("B") }] : []),
              ].map(({ panel, result, label }) => (
                <div key={panel} className={`bg-card border border-parchment/50 rounded-sm overflow-hidden ${
                  panel === "A" ? "border-l-2 border-l-blue-400/50" : "border-l-2 border-l-amber-400/50"
                }`}>
                  <div className="px-5 py-3 border-b border-parchment/30">
                    <span className="text-body-sm font-semibold text-foreground">Panel {panel}: {label}</span>
                    {isOutput(result) && (
                      <span className="text-caption text-muted-foreground ml-2">
                        {result.metrics.wordCount} words, {(result.provenance.responseTimeMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>
                  <div className="px-5 py-4">
                    {isOutput(result) ? (
                      <div className="text-body-sm text-foreground whitespace-pre-wrap font-serif leading-relaxed max-h-[500px] overflow-y-auto">
                        {result.text}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-500">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-body-sm">{result.error}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <GitFork className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-body-sm">Compare model outputs with quantitative divergence metrics.</p>
              <p className="text-caption mt-1">Measures vocabulary overlap, structural similarity, and response characteristics.</p>
            </div>
          </div>
        )}
      </div>

      {/* Prompt area */}
      <div className="px-6 py-3 border-t border-border bg-card">
        <div className="mb-2 max-w-4xl mx-auto">
          <ModelSelector value={panelSelection} onChange={setPanelSelection} disabled={isLoading} />
        </div>
        <div className="flex gap-3 max-w-4xl mx-auto items-end">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a prompt to compare models..."
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
          <button
            onClick={handleRun}
            disabled={!prompt.trim() || isLoading || !slotAConfigured}
            className="btn-editorial-primary px-4 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {!slotBConfigured && slotAConfigured && (
          <div className="mt-2 max-w-4xl mx-auto text-caption text-muted-foreground">
            Only Panel A is configured. Add a second model in Settings for cross-model comparison.
          </div>
        )}
        {error && (
          <div className="mt-2 max-w-4xl mx-auto text-caption text-red-500 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>
    </>
  );
}
