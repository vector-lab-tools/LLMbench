"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, AlertCircle, BarChart3, Download, RotateCcw } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { AnalysisPromptArea } from "@/components/shared/AnalysisPromptArea";
import { DefaultPromptChips } from "@/components/shared/DefaultPromptChips";
import { MODE_DEFAULTS, getRandomDefault } from "@/lib/prompts/defaults";
import type { PanelSelection } from "@/components/shared/ModelSelector";
import { MetricBox } from "@/components/shared/ResultCard";
import { DeepDive } from "@/components/shared/DeepDive";
import { TokenHeatmap } from "@/components/viz/TokenHeatmap";
import { EntropyHistogram } from "@/components/viz/EntropyHistogram";
import { SentenceEntropyView } from "@/components/viz/SentenceEntropyView";
import { computeTokenEntropy } from "@/lib/metrics/text-metrics";
import type { TokenLogprob } from "@/types/analysis";

interface LogprobsOutput {
  text: string;
  tokens: TokenLogprob[];
  meanEntropy: number;
  maxEntropyToken: { token: string; entropy: number; position: number };
  provenance: { modelDisplayName: string; responseTimeMs: number; provider: string };
}

interface LogprobsError {
  error: string;
  provenance: { modelDisplayName: string; provider: string };
}

type LogprobsResult = LogprobsOutput | LogprobsError;

function isOutput(r: LogprobsResult): r is LogprobsOutput {
  return "tokens" in r;
}

type ViewMode = "token" | "sentence";

interface LogprobsModeProps {
  isDark: boolean;
  pendingPrompt?: string;
}

export default function LogprobsMode({ isDark, pendingPrompt }: LogprobsModeProps) {
  const { slots, getSlotLabel, isSlotConfigured, noMarkdown } = useProviderSettings();
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("A");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (pendingPrompt) setPrompt(pendingPrompt);
  }, [pendingPrompt]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultA, setResultA] = useState<LogprobsResult | null>(null);
  const [resultB, setResultB] = useState<LogprobsResult | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("token");

  const slotAConfigured = isSlotConfigured("A");

  // Check if providers support logprobs
  const aSupported = ["google", "openai", "openai-compatible"].includes(slots.A.provider);

  const handleRun = useCallback(async (overridePrompt?: string) => {
    const effectivePrompt = overridePrompt ?? (prompt.trim() || (() => {
      const d = getRandomDefault("logprobs"); setPrompt(d); return d;
    })());
    if (!effectivePrompt || isLoading) return;
    setIsLoading(true);
    setError(null);
    setResultA(null);
    setResultB(null);

    try {
      const response = await fetch("/api/analyse/logprobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: effectivePrompt,
          topK: 5,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setIsLoading(false);
    }
  }, [prompt, slots, panelSelection, isSlotConfigured, isLoading]);

  const exportTokenCSV = (tokens: TokenLogprob[], modelName: string) => {
    const header = "position,token,logprob,probability,alternatives";
    const rows = tokens.map((t, i) =>
      `${i + 1},"${t.token.replace(/"/g, '""')}",${t.logprob.toFixed(6)},${Math.exp(t.logprob).toFixed(6)},"${t.topAlternatives.map((a) => `${a.token}:${Math.exp(a.logprob).toFixed(4)}`).join("; ")}"`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logprobs-${modelName.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderPanel = (panel: "A" | "B", result: LogprobsResult, label: string) => {
    if (!isOutput(result)) {
      return (
        <div key={panel} className="bg-card border border-parchment/50 rounded-sm p-5">
          <h3 className="text-body-sm font-semibold text-foreground mb-2">
            Panel {panel}: {label}
          </h3>
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="w-4 h-4" />
            <span className="text-body-sm">{result.error}</span>
          </div>
          <button
            onClick={() => handleRun()}
            disabled={isLoading}
            className="mt-2 flex items-center gap-1.5 text-caption text-burgundy hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RotateCcw className="w-3 h-3" />
            Retry
          </button>
        </div>
      );
    }

    const avgProb = result.tokens.length > 0
      ? result.tokens.reduce((s, t) => s + Math.exp(t.logprob), 0) / result.tokens.length
      : 0;

    // Panel-level Deep Dive data
    const tokenEntropies = result.tokens.map(t => ({ token: t, entropy: computeTokenEntropy(t) }));
    const sortedByEntropy = [...tokenEntropies].sort((a, b) => b.entropy - a.entropy);
    const top10 = sortedByEntropy.slice(0, 10);

    const highConfCount = result.tokens.filter(t => Math.exp(t.logprob) > 0.9).length;
    const lowConfCount = result.tokens.filter(t => Math.exp(t.logprob) < 0.5).length;
    const midConfCount = result.tokens.length - highConfCount - lowConfCount;
    const total = result.tokens.length;

    // Top-5 most-considered alternatives across all positions
    const altFreq = new Map<string, number>();
    result.tokens.forEach(t => {
      t.topAlternatives.forEach(a => {
        const key = a.token.trim() || "\\n";
        altFreq.set(key, (altFreq.get(key) ?? 0) + 1);
      });
    });
    const topAlts = [...altFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    return (
      <div key={panel} className="bg-card border border-parchment/50 rounded-sm overflow-hidden">
        {/* Panel header */}
        <div className="px-5 py-3 border-b border-parchment/30 flex items-center gap-3">
          <span className="text-body-sm font-semibold text-foreground">
            Panel {panel}: {label}
          </span>
          <span className="text-caption text-burgundy font-medium">
            {result.provenance.modelDisplayName}
          </span>
          <span className="text-caption text-muted-foreground">
            {result.tokens.length} tokens
          </span>
          <button
            onClick={() => exportTokenCSV(result.tokens, result.provenance.modelDisplayName)}
            className="ml-auto btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1"
            title="Export token data as CSV"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>

        <div className="px-5 py-3 space-y-4">
          {/* Summary metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricBox label="Mean Entropy" value={result.meanEntropy.toFixed(3)} />
            <MetricBox label="Avg Probability" value={`${(avgProb * 100).toFixed(1)}%`} />
            <MetricBox
              label="Max Entropy Token"
              value={`"${result.maxEntropyToken.token.trim() || "\\n"}"`}
            />
            <MetricBox label="Total Tokens" value={result.tokens.length} />
          </div>

          {/* Entropy histogram */}
          <div className="border border-parchment/30 rounded-sm px-4 py-3 bg-cream/20">
            <EntropyHistogram tokens={result.tokens} isDark={isDark} />
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted-foreground">View:</span>
            <div className="flex border border-parchment rounded-sm overflow-hidden">
              {(["token", "sentence"] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-caption capitalize transition-colors ${
                    viewMode === mode
                      ? "bg-burgundy text-white"
                      : "bg-card text-muted-foreground hover:bg-cream/50 hover:text-foreground"
                  }`}
                >
                  {mode === "token" ? "Token Heatmap" : "Sentence Entropy"}
                </button>
              ))}
            </div>
          </div>

          {/* Main visualisation */}
          {viewMode === "token" ? (
            <TokenHeatmap tokens={result.tokens} isDark={isDark} />
          ) : (
            <SentenceEntropyView tokens={result.tokens} isDark={isDark} />
          )}
        </div>

        {/* Deep dive: full token table */}
        <DeepDive label="Token Table" summary={`${result.tokens.length} tokens`}>
          <div className="max-h-[500px] overflow-y-auto">
            <table className="w-full text-caption">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-parchment">
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">#</th>
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Token</th>
                  <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Prob</th>
                  <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">LogProb</th>
                  <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Top Alternatives</th>
                </tr>
              </thead>
              <tbody>
                {result.tokens.map((t, i) => (
                  <tr key={i} className="border-b border-parchment/30 hover:bg-cream/30">
                    <td className="py-1 px-2 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="py-1 px-2 font-mono text-foreground">{t.token || "\\n"}</td>
                    <td className="py-1 px-2 text-right tabular-nums">{(Math.exp(t.logprob) * 100).toFixed(2)}%</td>
                    <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{t.logprob.toFixed(4)}</td>
                    <td className="py-1 px-2 text-muted-foreground">
                      {t.topAlternatives.slice(0, 3).map((a, j) => (
                        <span key={j} className="mr-2">
                          <span className="font-mono">{a.token || "\\n"}</span>
                          <span className="text-muted-foreground/70 ml-0.5">
                            {(Math.exp(a.logprob) * 100).toFixed(1)}%
                          </span>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DeepDive>

        {/* Panel-level Deep Dive: analytical summary */}
        <div className="border-t border-parchment/30">
          <DeepDive label="Uncertainty Analysis" summary={`${highConfCount} certain, ${lowConfCount} uncertain tokens`}>
            {/* Certainty/uncertainty split */}
            <div>
              <div className="text-caption font-medium text-muted-foreground mb-2">Confidence Distribution</div>
              <div className="space-y-1.5">
                {[
                  { label: "Very certain (>90%)", count: highConfCount, color: "bg-green-400/70" },
                  { label: "Moderate (50–90%)", count: midConfCount, color: "bg-yellow-400/70" },
                  { label: "Uncertain (<50%)", count: lowConfCount, color: "bg-red-400/70" },
                ].map(({ label, count, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-caption text-muted-foreground w-36 shrink-0">{label}</span>
                    <div className="flex-1 h-3 bg-muted/30 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${color}`}
                        style={{ width: total > 0 ? `${(count / total) * 100}%` : "0%" }}
                      />
                    </div>
                    <span className="text-caption tabular-nums text-foreground w-8 text-right shrink-0">{count}</span>
                    <span className="text-caption tabular-nums text-muted-foreground w-10 shrink-0">
                      {total > 0 ? `${((count / total) * 100).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Entropy hotspot list */}
            <div>
              <div className="text-caption font-medium text-muted-foreground mb-2">
                Top 10 Uncertainty Hotspots — moments of highest decision entropy
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-caption">
                  <thead>
                    <tr className="border-b border-parchment">
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Rank</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Token</th>
                      <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Entropy</th>
                      <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Chosen Prob</th>
                      <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Context</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top10.map(({ token, entropy }, rank) => {
                      const pos = result.tokens.indexOf(token);
                      const pre = result.tokens.slice(Math.max(0, pos - 3), pos).map(t => t.token).join("").slice(-30);
                      const post = result.tokens.slice(pos + 1, pos + 4).map(t => t.token).join("").slice(0, 30);
                      return (
                        <tr key={rank} className="border-b border-parchment/30 hover:bg-cream/30">
                          <td className="py-1 px-2 tabular-nums text-muted-foreground">{rank + 1}</td>
                          <td className="py-1 px-2 font-mono text-foreground font-medium">
                            &ldquo;{token.token.trim() || "\\n"}&rdquo;
                          </td>
                          <td className="py-1 px-2 text-right tabular-nums font-mono text-orange-600 dark:text-orange-400">
                            {entropy.toFixed(3)}
                          </td>
                          <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">
                            {(Math.exp(token.logprob) * 100).toFixed(1)}%
                          </td>
                          <td className="py-1 px-2 font-mono text-muted-foreground text-[11px] max-w-[240px] truncate">
                            …{pre}<span className="text-foreground font-semibold">[{token.token.trim() || "↵"}]</span>{post}…
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-caption text-muted-foreground mt-2">
                These are the positions where the model was most uncertain. High entropy means the probability mass was spread across many alternatives rather than concentrated on one token.
              </p>
            </div>

            {/* Most-considered alternatives */}
            {topAlts.length > 0 && (
              <div>
                <div className="text-caption font-medium text-muted-foreground mb-2">
                  Most-Considered Alternatives — tokens the model almost chose
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {topAlts.map(([token, count]) => (
                    <span
                      key={token}
                      className="inline-flex items-center gap-1 bg-cream px-2 py-0.5 rounded-sm text-caption"
                      title={`Appeared as an alternative ${count} time${count !== 1 ? "s" : ""}`}
                    >
                      <span className="font-mono text-foreground">&ldquo;{token}&rdquo;</span>
                      <span className="text-muted-foreground/70">×{count}</span>
                    </span>
                  ))}
                </div>
                <p className="text-caption text-muted-foreground mt-1.5">
                  Tokens that appeared most frequently in the model&apos;s top-5 alternative lists. These are the words the model was repeatedly &ldquo;almost&rdquo; saying throughout the response.
                </p>
              </div>
            )}
          </DeepDive>
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mode description */}
      <div className="px-6 py-2 bg-cream/40 border-b border-parchment/30 text-caption text-muted-foreground">
        <strong className="text-foreground">Token Probabilities:</strong> Visualises the per-token probability distributions that underlie LLM text generation. Each token is colour-coded by model confidence (grey = certain, red = uncertain). Click a token to see the full probability distribution for that position. Switch to Sentence view to see which sentences were generated with most uncertainty. Supported by Google Gemini and OpenAI.
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
              <p className="text-body-sm">Generating with token probabilities...</p>
            </div>
          </div>
        ) : resultA ? (
          <div className="p-6 space-y-6">
            {renderPanel("A", resultA, getSlotLabel("A"))}
            {resultB && renderPanel("B", resultB, getSlotLabel("B"))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-body-sm">Visualise per-token probability distributions.</p>
              <p className="text-caption mt-1">Each token is colour-coded by model confidence. Click to see alternative choices.</p>
              <p className="text-caption mt-1">Supported providers: Google Gemini, OpenAI.</p>
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
        placeholder="Enter a prompt to analyse token probabilities..."
        panelSelection={panelSelection}
        onPanelSelectionChange={setPanelSelection}
        hasResults={resultA !== null || resultB !== null}
        onReset={() => { setResultA(null); setResultB(null); setError(null); }}
        footer={
          !aSupported && slotAConfigured ? (
            <span className="text-caption text-amber-600">
              Panel A ({slots.A.provider}) does not support logprobs. Use Google Gemini or OpenAI.
            </span>
          ) : !prompt.trim() && !isLoading ? (
            <DefaultPromptChips
              prompts={MODE_DEFAULTS.logprobs}
              onSelect={(p) => { setPrompt(p); handleRun(p); }}
              isLoading={isLoading}
            />
          ) : undefined
        }
      />
    </>
  );
}
