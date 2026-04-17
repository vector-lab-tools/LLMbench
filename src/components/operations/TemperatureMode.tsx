"use client";

import { useState, useCallback, useEffect } from "react";
import { AlertCircle, Thermometer, RotateCcw } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { AnalysisPromptArea } from "@/components/shared/AnalysisPromptArea";
import { DefaultPromptChips } from "@/components/shared/DefaultPromptChips";
import { MODE_DEFAULTS, getRandomDefault } from "@/lib/prompts/defaults";
import type { PanelSelection } from "@/components/shared/ModelSelector";
import { ResultCard, MetricBox } from "@/components/shared/ResultCard";
import { DeepDive } from "@/components/shared/DeepDive";
import { GhostCard } from "@/components/shared/GhostCard";
import { fetchStreaming } from "@/lib/streaming";

const DEFAULT_TEMPS = [0.0, 0.3, 0.7, 1.0, 1.5, 2.0];

interface TempRun {
  temperature: number;
  text?: string;
  error?: string;
  metrics?: { wordCount: number; vocabularyDiversity: number; sentenceCount: number; avgSentenceLength: number; uniqueWordCount: number };
  provenance: { modelDisplayName: string; responseTimeMs: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamEvent = { type: string; panel?: string; index?: number; temperature?: number; result?: any; hasB?: boolean; count?: number };

interface TemperatureModeProps {
  isDark: boolean;
  pendingPrompt?: string;
}

export default function TemperatureMode({ isDark, pendingPrompt }: TemperatureModeProps) {
  const { slots, getSlotLabel, isSlotConfigured, noMarkdown } = useProviderSettings();
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("A");
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (pendingPrompt) setPrompt(pendingPrompt);
  }, [pendingPrompt]);
  const [temperatures, setTemperatures] = useState(DEFAULT_TEMPS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Progressive results: sparse arrays that fill in as results stream back
  const [runsA, setRunsA] = useState<(TempRun | null)[]>([]);
  const [runsB, setRunsB] = useState<(TempRun | null)[]>([]);
  const [expectedCount, setExpectedCount] = useState(0);
  const [hasB, setHasB] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const slotAConfigured = isSlotConfigured("A");

  const handleRun = useCallback(async (overridePrompt?: string) => {
    const effectivePrompt = overridePrompt ?? (prompt.trim() || (() => {
      const d = getRandomDefault("temperature"); setPrompt(d); return d;
    })());
    if (!effectivePrompt || isLoading) return;
    setIsLoading(true);
    setError(null);
    setRunsA([]);
    setRunsB([]);
    setExpectedCount(temperatures.length);
    setHasB(panelSelection === "both" && isSlotConfigured("B"));
    setIsDone(false);

    try {
      await fetchStreaming<StreamEvent>(
        "/api/analyse/temperature",
        {
          prompt: effectivePrompt,
          temperatures,
          slotA: panelSelection === "B" ? slots.B : slots.A,
          slotB: panelSelection === "both" && isSlotConfigured("B") ? slots.B : null,
          noMarkdown,
        },
        (event) => {
          if (event.type === "meta") {
            setExpectedCount(event.count || temperatures.length);
            setHasB(!!event.hasB);
          } else if (event.type === "run" && event.index !== undefined && event.result) {
            const tempRun: TempRun = {
              temperature: event.temperature ?? 0,
              ...event.result,
            };
            const setter = event.panel === "B" ? setRunsB : setRunsA;
            setter(prev => {
              const next = [...prev];
              next[event.index!] = tempRun;
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
  }, [prompt, temperatures, slots, panelSelection, isSlotConfigured, isLoading]);

  const hasResults = runsA.some(r => r !== null) || runsB.some(r => r !== null);
  const showResults = hasResults || isLoading;

  const renderPanel = (panel: "A" | "B", runs: (TempRun | null)[], label: string) => {
    const filledRuns = runs.filter((r): r is TempRun => r !== null);
    const outputs = filledRuns.filter((r) => r.text);

    return (
      <div key={panel}>
        <h3 className="text-body-sm font-semibold text-foreground mb-3">
          Panel {panel}: {label}
          {!isDone && <span className="text-caption text-muted-foreground font-normal ml-2">({filledRuns.length}/{expectedCount} complete)</span>}
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
              value={`${filledRuns.length}/${expectedCount}`}
            />
          </div>
        )}

        {/* Temperature cards: filled results + ghost cards for pending */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: expectedCount }, (_, i) => {
            const run = runs[i];
            if (!run) {
              return <GhostCard key={i} title={`t = ${temperatures[i]?.toFixed(1) ?? "?"}`} panel={panel} />;
            }
            return (
              <ResultCard
                key={i}
                title={`t = ${run.temperature.toFixed(1)}`}
                panel={panel}
                subtitle={run.text ? `${run.metrics!.wordCount} words` : undefined}
                badge={run.text ? `${(run.metrics!.vocabularyDiversity * 100).toFixed(0)}% lexical diversity` : "Error"}
                badgeColor={run.text ? undefined : "bg-red-100 text-red-600"}
                badgeTooltip={run.text ? "Lexical diversity: the percentage of words in this response that are non-repeated. High values indicate varied vocabulary; lower values suggest repetition. This measures richness within a single run, not similarity between runs." : undefined}
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
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-red-500">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-body-sm">{run.error}</span>
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

        {/* Panel-level Deep Dive */}
        {isDone && outputs.length >= 2 && (
          <div className="mt-4 bg-card border border-parchment/50 rounded-sm overflow-hidden">
            <DeepDive
              label="Deep Dive"
              summary={`${outputs.length} temperatures compared`}
            >
              <div>
                <div className="text-caption font-medium text-muted-foreground mb-2">Per-Temperature Metrics</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="border-b border-parchment">
                        <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Temp</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Words</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Sentences</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Avg Sent. Length</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Vocab Diversity</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Unique Words</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Response Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outputs.map((run, i) => (
                        <tr key={i} className="border-b border-parchment/30 hover:bg-cream/30">
                          <td className="py-1 px-2 font-medium">t = {run.temperature.toFixed(1)}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{run.metrics!.wordCount}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{run.metrics!.sentenceCount}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{run.metrics!.avgSentenceLength.toFixed(1)}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{(run.metrics!.vocabularyDiversity * 100).toFixed(1)}%</td>
                          <td className="py-1 px-2 text-right tabular-nums">{run.metrics!.uniqueWordCount}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{(run.provenance.responseTimeMs / 1000).toFixed(1)}s</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-caption text-muted-foreground">
                Lower temperatures (0.0-0.3) produce more deterministic outputs with lower vocabulary diversity. Higher temperatures (1.5-2.0) increase randomness, often producing more creative but less predictable text.
              </p>
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
        <strong className="text-foreground">Temperature Gradient:</strong> Runs the same prompt at different temperature settings (0.0 to 2.0) to visualise how the sampling parameter affects output determinism and creativity. Lower temperatures produce more predictable outputs; higher temperatures increase stochastic variation.
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {showResults ? (
          <div className="p-6 space-y-6">
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
              <Thermometer className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-body-sm">Run the same prompt across a temperature gradient.</p>
              <p className="text-caption mt-1">Shows how sampling temperature affects output determinism and creativity.</p>
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
        placeholder="Enter a prompt to test across temperatures..."
        panelSelection={panelSelection}
        onPanelSelectionChange={setPanelSelection}
        hasResults={runsA.length > 0 || runsB.length > 0}
        onReset={() => { setRunsA([]); setRunsB([]); setIsDone(false); setError(null); }}
        footer={
          <div className="space-y-1.5">
            <span className="text-caption text-muted-foreground">
              Temperatures: {temperatures.map((t) => t.toFixed(1)).join(", ")}
            </span>
            {!prompt.trim() && !isLoading && (
              <DefaultPromptChips
                prompts={MODE_DEFAULTS.temperature}
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
