"use client";

import { useState, useCallback } from "react";
import { Send, Loader2, AlertCircle, Thermometer } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { ResultCard, MetricBox } from "@/components/shared/ResultCard";
import { DeepDive } from "@/components/shared/DeepDive";

const DEFAULT_TEMPS = [0.0, 0.3, 0.7, 1.0, 1.5, 2.0];

interface TempRun {
  temperature: number;
  text?: string;
  error?: string;
  metrics?: { wordCount: number; vocabularyDiversity: number; sentenceCount: number; avgSentenceLength: number; uniqueWordCount: number };
  provenance: { modelDisplayName: string; responseTimeMs: number };
}

interface TemperatureModeProps {
  isDark: boolean;
}

export default function TemperatureMode({ isDark }: TemperatureModeProps) {
  const { slots, getSlotLabel, isSlotConfigured } = useProviderSettings();
  const [prompt, setPrompt] = useState("");
  const [temperatures, setTemperatures] = useState(DEFAULT_TEMPS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultA, setResultA] = useState<{ runs: TempRun[] } | null>(null);
  const [resultB, setResultB] = useState<{ runs: TempRun[] } | null>(null);

  const slotAConfigured = isSlotConfigured("A");
  const slotBConfigured = isSlotConfigured("B");

  const handleRun = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setError(null);
    setResultA(null);
    setResultB(null);

    try {
      const response = await fetch("/api/analyse/temperature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          temperatures,
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
  }, [prompt, temperatures, slots, slotBConfigured, isLoading]);

  const renderPanel = (panel: "A" | "B", result: { runs: TempRun[] }, label: string) => {
    const outputs = result.runs.filter((r) => r.text);
    return (
      <div key={panel}>
        <h3 className="text-body-sm font-semibold text-foreground mb-3">
          Panel {panel}: {label}
        </h3>

        {/* Summary: metrics across temperatures */}
        {outputs.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
            <MetricBox
              label="Word Count Range"
              value={`${Math.min(...outputs.map((r) => r.metrics!.wordCount))} - ${Math.max(...outputs.map((r) => r.metrics!.wordCount))}`}
            />
            <MetricBox
              label="Diversity Range"
              value={`${(Math.min(...outputs.map((r) => r.metrics!.vocabularyDiversity)) * 100).toFixed(0)}% - ${(Math.max(...outputs.map((r) => r.metrics!.vocabularyDiversity)) * 100).toFixed(0)}%`}
            />
            <MetricBox
              label="Temperatures"
              value={result.runs.length}
            />
          </div>
        )}

        {/* Temperature cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {result.runs.map((run, i) => (
            <ResultCard
              key={i}
              title={`t = ${run.temperature.toFixed(1)}`}
              panel={panel}
              subtitle={run.text ? `${run.metrics!.wordCount} words` : undefined}
              badge={run.text ? `${(run.metrics!.vocabularyDiversity * 100).toFixed(0)}% diverse` : "Error"}
              badgeColor={run.text ? undefined : "bg-red-100 text-red-600"}
              footer={
                run.text ? (
                  <DeepDive label="Full Text" summary={`${run.text.length} chars`}>
                    <div className="text-body-sm text-foreground whitespace-pre-wrap font-serif leading-relaxed max-h-[400px] overflow-y-auto">
                      {run.text}
                    </div>
                  </DeepDive>
                ) : undefined
              }
            >
              {run.text ? (
                <p className="text-body-sm text-muted-foreground line-clamp-4 font-serif">
                  {run.text.slice(0, 300)}{run.text.length > 300 ? "..." : ""}
                </p>
              ) : (
                <div className="flex items-center gap-2 text-red-500">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-body-sm">{run.error}</span>
                </div>
              )}
            </ResultCard>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Mode description */}
      <div className="px-6 py-2 bg-cream/40 border-b border-parchment/30 text-caption text-muted-foreground">
        <strong className="text-foreground">Temperature Gradient:</strong> Runs the same prompt at different temperature settings (0.0 to 2.0) to visualise how the sampling parameter affects output determinism and creativity. Lower temperatures produce more predictable outputs; higher temperatures increase stochastic variation.
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
              <p className="text-body-sm">Running across {temperatures.length} temperature settings...</p>
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
              <Thermometer className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-body-sm">Run the same prompt across a temperature gradient.</p>
              <p className="text-caption mt-1">Shows how sampling temperature affects output determinism and creativity.</p>
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
            placeholder="Enter a prompt to test across temperatures..."
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
        <div className="mt-2 max-w-4xl mx-auto text-caption text-muted-foreground">
          Temperatures: {temperatures.map((t) => t.toFixed(1)).join(", ")}
        </div>
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
