"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Loader2, AlertCircle, GitFork, RotateCcw } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { AnalysisPromptArea } from "@/components/shared/AnalysisPromptArea";
import { DefaultPromptChips } from "@/components/shared/DefaultPromptChips";
import { MODE_DEFAULTS, getRandomDefault } from "@/lib/prompts/defaults";
import type { PanelSelection } from "@/components/shared/ModelSelector";
import { MetricBox } from "@/components/shared/ResultCard";
import { DeepDive } from "@/components/shared/DeepDive";
import { computeTextMetrics } from "@/lib/metrics/text-metrics";

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
  cosineSimilarity?: number;
  metricsA: RunOutput["metrics"];
  metricsB: RunOutput["metrics"];
  responseTimeDiffMs: number;
}

function isOutput(r: RunResult): r is RunOutput {
  return "text" in r;
}

// Simple stopword list for vocabulary frequency
const STOPWORDS = new Set([
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by","from",
  "is","are","was","were","be","been","being","have","has","had","do","does","did",
  "will","would","could","should","may","might","shall","can","this","that","these",
  "those","it","its","we","our","they","their","you","your","he","his","she","her",
  "i","my","me","us","them","as","if","so","not","no","up","out","about","into",
  "than","then","when","where","which","who","what","how","all","each","more","also",
]);

function topWords(text: string, n = 10): Array<{ word: string; count: number }> {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
  const freq = new Map<string, number>();
  words.forEach(w => freq.set(w, (freq.get(w) ?? 0) + 1));
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }));
}

function extractBigrams(text: string): Set<string> {
  const words = text.toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
  const bigrams = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.add(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

interface DivergenceModeProps {
  isDark: boolean;
  pendingPrompt?: string;
}

export default function DivergenceMode({ isDark: _isDark, pendingPrompt }: DivergenceModeProps) {
  const { slots, getSlotLabel, isSlotConfigured, noMarkdown } = useProviderSettings();
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("both");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (pendingPrompt) setPrompt(pendingPrompt);
  }, [pendingPrompt]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultA, setResultA] = useState<RunResult | null>(null);
  const [resultB, setResultB] = useState<RunResult | null>(null);
  const [metrics, setMetrics] = useState<DivergenceMetrics | null>(null);

  const slotAConfigured = isSlotConfigured("A");
  const slotBConfigured = isSlotConfigured("B");

  const handleRun = useCallback(async (overridePrompt?: string) => {
    const effectivePrompt = overridePrompt ?? (prompt.trim() || (() => {
      const d = getRandomDefault("divergence"); setPrompt(d); return d;
    })());
    if (!effectivePrompt || isLoading) return;
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
          prompt: effectivePrompt,
          slotA: panelSelection === "B" ? slots.B : slots.A,
          slotB: panelSelection === "both" && isSlotConfigured("B") ? slots.B : null,
          noMarkdown,
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

  // Panel-level analysis for bigrams and top words
  const panelAnalysis = useMemo(() => {
    if (!resultA || !isOutput(resultA)) return null;
    const textA = resultA.text;
    const textB = resultB && isOutput(resultB) ? resultB.text : null;
    const wordsA = topWords(textA);
    const bigramsA = extractBigrams(textA);
    const wordsB = textB ? topWords(textB) : null;
    const bigramsB = textB ? extractBigrams(textB) : null;

    const uniqueBigramsA = textB ? [...bigramsA].filter(b => !bigramsB!.has(b)).slice(0, 8) : [];
    const uniqueBigramsB = textB ? [...bigramsB!].filter(b => !bigramsA.has(b)).slice(0, 8) : [];

    // Sentence breakdown for A
    const sentencesA = textA.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5).map(s => {
      const m = computeTextMetrics(s);
      return { text: s.slice(0, 70) + (s.length > 70 ? "…" : ""), wordCount: m.wordCount, pct: 0 };
    });
    const totalWordsA = sentencesA.reduce((s, x) => s + x.wordCount, 0);
    sentencesA.forEach(s => { s.pct = totalWordsA > 0 ? (s.wordCount / totalWordsA) * 100 : 0; });

    const sentencesB = textB
      ? textB.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5).map(s => {
          const m = computeTextMetrics(s);
          return { text: s.slice(0, 70) + (s.length > 70 ? "…" : ""), wordCount: m.wordCount, pct: 0 };
        })
      : [];
    const totalWordsB = sentencesB.reduce((s, x) => s + x.wordCount, 0);
    sentencesB.forEach(s => { s.pct = totalWordsB > 0 ? (s.wordCount / totalWordsB) * 100 : 0; });

    return { wordsA, wordsB, uniqueBigramsA, uniqueBigramsB, sentencesA, sentencesB };
  }, [resultA, resultB]);

  return (
    <>
      {/* Mode description */}
      <div className="px-6 py-2 bg-cream/40 border-b border-parchment/30 text-caption text-muted-foreground">
        <strong className="text-foreground">Cross-Model Divergence:</strong> Sends the same prompt to two models and computes quantitative divergence metrics including cosine similarity (frequency-weighted), Jaccard similarity (set-level), vocabulary overlap, structural comparison (sentence count, average sentence length), and response time differences.
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
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <MetricBox
                    label="Cosine Similarity"
                    value={metrics.cosineSimilarity !== undefined ? `${(metrics.cosineSimilarity * 100).toFixed(1)}%` : "—"}
                  />
                  <MetricBox
                    label="Jaccard Similarity"
                    value={`${(metrics.wordOverlap.jaccardSimilarity * 100).toFixed(1)}%`}
                  />
                  <MetricBox label="Word Overlap (Dice)" value={`${metrics.wordOverlap.overlapPercentage.toFixed(1)}%`} />
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
                      <>
                        <p className="text-body-sm text-muted-foreground font-serif line-clamp-4 mb-2">
                          {result.text.slice(0, 400)}{result.text.length > 400 ? "…" : ""}
                        </p>
                        <DeepDive label="Full Text">
                          <div className="space-y-4">
                            <div className="text-body-sm text-foreground whitespace-pre-wrap font-serif leading-relaxed max-h-[400px] overflow-y-auto">
                              {result.text}
                            </div>
                            {/* Sentence breakdown */}
                            {panelAnalysis && (panel === "A" ? panelAnalysis.sentencesA : panelAnalysis.sentencesB).length > 0 && (
                              <div>
                                <div className="text-caption font-medium text-muted-foreground mb-1.5">Sentence Breakdown</div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-caption">
                                    <thead>
                                      <tr className="border-b border-parchment">
                                        <th className="text-left py-1 px-2 font-medium text-muted-foreground">#</th>
                                        <th className="text-left py-1 px-2 font-medium text-muted-foreground">Sentence</th>
                                        <th className="text-right py-1 px-2 font-medium text-muted-foreground">Words</th>
                                        <th className="text-right py-1 px-2 font-medium text-muted-foreground">% of total</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(panel === "A" ? panelAnalysis.sentencesA : panelAnalysis.sentencesB).slice(0, 20).map((s, i) => (
                                        <tr key={i} className="border-b border-parchment/30 hover:bg-cream/30">
                                          <td className="py-1 px-2 tabular-nums text-muted-foreground">{i + 1}</td>
                                          <td className="py-1 px-2 text-foreground max-w-[260px] truncate">{s.text}</td>
                                          <td className="py-1 px-2 text-right tabular-nums">{s.wordCount}</td>
                                          <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{s.pct.toFixed(1)}%</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </div>
                        </DeepDive>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-red-500">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-body-sm">{result.error}</span>
                        </div>
                        <button
                          onClick={() => handleRun()}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 text-caption text-burgundy hover:text-foreground transition-colors disabled:opacity-40"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Panel-level Deep Dive: cross-output analysis */}
            {panelAnalysis && resultB && isOutput(resultA!) && isOutput(resultB) && (
              <div className="bg-card border border-parchment/50 rounded-sm overflow-hidden">
                <DeepDive label="Comparative Analysis" summary="vocabulary frequency · unique phrases · structural comparison">
                  {/* Vocabulary frequency side by side */}
                  <div>
                    <div className="text-caption font-medium text-muted-foreground mb-2">
                      Top Words — which concepts does each model foreground?
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: getSlotLabel("A"), words: panelAnalysis.wordsA, color: "text-blue-600 dark:text-blue-400" },
                        { label: getSlotLabel("B"), words: panelAnalysis.wordsB ?? [], color: "text-amber-600 dark:text-amber-400" },
                      ].map(({ label, words, color }) => (
                        <div key={label}>
                          <div className={`text-caption font-medium mb-1.5 ${color}`}>{label}</div>
                          <div className="space-y-1">
                            {words.slice(0, 10).map(({ word, count }) => {
                              const maxCount = words[0]?.count ?? 1;
                              return (
                                <div key={word} className="flex items-center gap-2">
                                  <span className="text-caption font-mono text-foreground w-24 truncate shrink-0">{word}</span>
                                  <div className="flex-1 h-2 bg-muted/30 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${color.replace("text-", "bg-").replace("/", "/40 ")}`}
                                      style={{ width: `${(count / maxCount) * 100}%` }}
                                    />
                                  </div>
                                  <span className="text-[10px] tabular-nums text-muted-foreground w-4 text-right shrink-0">
                                    {count}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Unique bigrams */}
                  {(panelAnalysis.uniqueBigramsA.length > 0 || panelAnalysis.uniqueBigramsB.length > 0) && (
                    <div>
                      <div className="text-caption font-medium text-muted-foreground mb-2">
                        Unique Phrase Candidates — bigrams present in one output but not the other
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-caption font-medium text-blue-600 dark:text-blue-400 mb-1">Only in A</div>
                          <div className="flex flex-wrap gap-1">
                            {panelAnalysis.uniqueBigramsA.map(b => (
                              <span key={b} className="text-caption font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-sm">{b}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-caption font-medium text-amber-600 dark:text-amber-400 mb-1">Only in B</div>
                          <div className="flex flex-wrap gap-1">
                            {panelAnalysis.uniqueBigramsB.map(b => (
                              <span key={b} className="text-caption font-mono bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-sm">{b}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </DeepDive>
              </div>
            )}
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
      <AnalysisPromptArea
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={handleRun}
        isLoading={isLoading}
        disabled={!slotAConfigured}
        error={error}
        placeholder="Enter a prompt to compare models..."
        panelSelection={panelSelection}
        onPanelSelectionChange={setPanelSelection}
        hasResults={resultA !== null || resultB !== null}
        onReset={() => { setResultA(null); setResultB(null); setMetrics(null); setError(null); }}
        footer={
          <div className="space-y-1.5">
            {!slotBConfigured && slotAConfigured && (
              <span className="text-caption text-muted-foreground">
                Only Panel A is configured. Add a second model in Settings for cross-model comparison.
              </span>
            )}
            {!prompt.trim() && !isLoading && (
              <DefaultPromptChips
                prompts={MODE_DEFAULTS.divergence}
                onSelect={(p) => { setPrompt(p); handleRun(p); }}
                isLoading={isLoading}
              />
            )}
          </div>
        }
      />
    </>
  );
}
