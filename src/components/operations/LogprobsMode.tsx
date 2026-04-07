"use client";

import { useState, useCallback } from "react";
import { Send, Loader2, AlertCircle, BarChart3, Download } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { MetricBox } from "@/components/shared/ResultCard";
import { DeepDive } from "@/components/shared/DeepDive";
import { TokenHeatmap } from "@/components/viz/TokenHeatmap";
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

interface LogprobsModeProps {
  isDark: boolean;
}

export default function LogprobsMode({ isDark }: LogprobsModeProps) {
  const { slots, getSlotLabel, isSlotConfigured } = useProviderSettings();
  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultA, setResultA] = useState<LogprobsResult | null>(null);
  const [resultB, setResultB] = useState<LogprobsResult | null>(null);

  const slotAConfigured = isSlotConfigured("A");
  const slotBConfigured = isSlotConfigured("B");

  // Check if providers support logprobs
  const aSupported = ["google", "openai", "openai-compatible"].includes(slots.A.provider);
  const bSupported = ["google", "openai", "openai-compatible"].includes(slots.B.provider);

  const handleRun = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    setResultA(null);
    setResultB(null);

    try {
      const response = await fetch("/api/analyse/logprobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          topK: 5,
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
  }, [prompt, slots, slotBConfigured, isLoading]);

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
        </div>
      );
    }

    const avgProb = result.tokens.length > 0
      ? result.tokens.reduce((s, t) => s + Math.exp(t.logprob), 0) / result.tokens.length
      : 0;

    return (
      <div key={panel} className="bg-card border border-parchment/50 rounded-sm overflow-hidden">
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

        {/* Summary metrics */}
        <div className="px-5 py-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricBox label="Mean Entropy" value={result.meanEntropy.toFixed(3)} />
            <MetricBox label="Avg Probability" value={`${(avgProb * 100).toFixed(1)}%`} />
            <MetricBox
              label="Max Entropy Token"
              value={`"${result.maxEntropyToken.token.trim() || "\\n"}"`}
            />
            <MetricBox label="Total Tokens" value={result.tokens.length} />
          </div>

          {/* Token heatmap */}
          <TokenHeatmap tokens={result.tokens} isDark={isDark} />
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
      </div>
    );
  };

  return (
    <>
      {/* Mode description */}
      <div className="px-6 py-2 bg-cream/40 border-b border-parchment/30 text-caption text-muted-foreground">
        <strong className="text-foreground">Token Probabilities:</strong> Visualises the per-token probability distributions that underlie LLM text generation. Each token is colour-coded by model confidence (grey = certain, red = uncertain). Hover to see the alternative tokens the model considered at each position. Supported by Google Gemini and OpenAI.
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
              <p className="text-caption mt-1">Each token is colour-coded by model confidence. Hover to see alternative choices.</p>
              <p className="text-caption mt-1">Supported providers: Google Gemini, OpenAI.</p>
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
            placeholder="Enter a prompt to analyse token probabilities..."
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
        {!aSupported && slotAConfigured && (
          <div className="mt-2 max-w-4xl mx-auto text-caption text-amber-600">
            Panel A ({slots.A.provider}) does not support logprobs. Use Google Gemini or OpenAI.
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
