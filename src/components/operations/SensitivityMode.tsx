"use client";

import { useState, useCallback, useMemo } from "react";
import { AlertCircle, Fingerprint, Plus, X } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { AnalysisPromptArea } from "@/components/shared/AnalysisPromptArea";
import type { PanelSelection } from "@/components/shared/ModelSelector";
import { ResultCard, MetricBox } from "@/components/shared/ResultCard";
import { DeepDive } from "@/components/shared/DeepDive";
import { GhostCard } from "@/components/shared/GhostCard";
import { fetchStreaming } from "@/lib/streaming";
import { generateVariations, type PromptVariation } from "@/lib/prompts/variations";
import { computeWordOverlap } from "@/lib/metrics/text-metrics";

interface RunResult {
  text?: string;
  error?: string;
  metrics?: { wordCount: number; vocabularyDiversity: number };
  provenance: { modelDisplayName: string; responseTimeMs: number };
}

interface VariationResult {
  variationLabel: string;
  variationPrompt: string;
  result: RunResult;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StreamEvent = { type: string; panel?: string; index?: number; isBase?: boolean; variationLabel?: string; variationPrompt?: string; result?: any; hasB?: boolean; count?: number };

interface SensitivityModeProps {
  isDark: boolean;
}

export default function SensitivityMode({ isDark }: SensitivityModeProps) {
  const { slots, getSlotLabel, isSlotConfigured } = useProviderSettings();
  const [panelSelection, setPanelSelection] = useState<PanelSelection>("A");
  const [prompt, setPrompt] = useState("");
  const [customVariations, setCustomVariations] = useState<string[]>([]);
  const [newVariation, setNewVariation] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Progressive results
  const [baseA, setBaseA] = useState<RunResult | null>(null);
  const [baseB, setBaseB] = useState<RunResult | null>(null);
  const [variationsA, setVariationsA] = useState<(VariationResult | null)[]>([]);
  const [variationsB, setVariationsB] = useState<(VariationResult | null)[]>([]);
  const [expectedCount, setExpectedCount] = useState(0); // total runs including base
  const [hasB, setHasB] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const slotAConfigured = isSlotConfigured("A");

  // Auto-generate variations from prompt
  const autoVariations = useMemo(() => {
    if (!prompt.trim()) return [];
    return generateVariations(prompt);
  }, [prompt]);

  const allVariations: PromptVariation[] = useMemo(() => [
    ...autoVariations,
    ...customVariations.map((p, i) => ({ label: `Custom ${i + 1}`, prompt: p })),
  ], [autoVariations, customVariations]);

  const handleRun = useCallback(async () => {
    if (!prompt.trim() || isLoading || allVariations.length === 0) return;
    setIsLoading(true);
    setError(null);
    setBaseA(null);
    setBaseB(null);
    setVariationsA([]);
    setVariationsB([]);
    // expected = 1 base + N variations
    setExpectedCount(1 + allVariations.length);
    setHasB(panelSelection === "both" && isSlotConfigured("B"));
    setIsDone(false);

    try {
      await fetchStreaming<StreamEvent>(
        "/api/analyse/sensitivity",
        {
          prompt,
          variations: allVariations,
          slotA: panelSelection === "B" ? slots.B : slots.A,
          slotB: panelSelection === "both" && isSlotConfigured("B") ? slots.B : null,
        },
        (event) => {
          if (event.type === "meta") {
            setExpectedCount(event.count || (1 + allVariations.length));
            setHasB(!!event.hasB);
          } else if (event.type === "run" && event.result) {
            if (event.isBase) {
              const setter = event.panel === "B" ? setBaseB : setBaseA;
              setter(event.result as RunResult);
            } else {
              const varResult: VariationResult = {
                variationLabel: event.variationLabel || `Variation ${event.index}`,
                variationPrompt: event.variationPrompt || "",
                result: event.result as RunResult,
              };
              // variations are indexed from 1 (base is 0), so slot = index - 1
              const varIndex = (event.index ?? 1) - 1;
              const setter = event.panel === "B" ? setVariationsB : setVariationsA;
              setter(prev => {
                const next = [...prev];
                next[varIndex] = varResult;
                return next;
              });
            }
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
  }, [prompt, allVariations, slots, panelSelection, isSlotConfigured, isLoading]);

  const hasResults = baseA !== null || baseB !== null || variationsA.some(v => v !== null) || variationsB.some(v => v !== null);
  const showResults = hasResults || isLoading;

  const renderPanel = (panel: "A" | "B", base: RunResult | null, variations: (VariationResult | null)[], label: string) => {
    const filledVariations = variations.filter((v): v is VariationResult => v !== null);
    const successfulVariations = filledVariations.filter((v) => v.result.text);
    const baseText = base?.text;
    const completedCount = (base ? 1 : 0) + filledVariations.length;
    const variationCount = allVariations.length;

    // Compute overlap between base and each variation
    const overlaps = baseText
      ? successfulVariations.map((v) => {
          const overlap = computeWordOverlap(baseText, v.result.text!);
          return { label: v.variationLabel, overlap: overlap.overlapPercentage };
        })
      : [];

    const avgOverlap = overlaps.length > 0
      ? overlaps.reduce((s, o) => s + o.overlap, 0) / overlaps.length
      : 0;

    return (
      <div key={panel}>
        <h3 className="text-body-sm font-semibold text-foreground mb-3">
          Panel {panel}: {label}
          {!isDone && <span className="text-caption text-muted-foreground font-normal ml-2">({completedCount}/{expectedCount} complete)</span>}
        </h3>

        {/* Summary */}
        {(base || filledVariations.length > 0) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricBox label="Base Words" value={base?.metrics?.wordCount || 0} />
            <MetricBox label="Variations" value={`${filledVariations.length}/${variationCount}`} />
            <MetricBox label="Avg Overlap with Base" value={overlaps.length > 0 ? `${avgOverlap.toFixed(1)}%` : "-"} />
            <MetricBox label="Successful" value={successfulVariations.length} />
          </div>
        )}

        {/* Base output */}
        {base ? (
          <ResultCard
            title="Base Prompt"
            panel={panel}
            subtitle={baseText ? `${base.metrics!.wordCount} words` : undefined}
            badge="Base"
            badgeColor="bg-burgundy/10 text-burgundy"
            footer={
              baseText ? (
                <DeepDive label="Full Text">
                  <div className="text-body-sm text-foreground whitespace-pre-wrap font-serif leading-relaxed max-h-[400px] overflow-y-auto">
                    {baseText}
                  </div>
                </DeepDive>
              ) : undefined
            }
          >
            {baseText ? (
              <p className="text-body-sm text-muted-foreground line-clamp-3 font-serif">
                {baseText.slice(0, 200)}{baseText.length > 200 ? "..." : ""}
              </p>
            ) : (
              <div className="flex items-center gap-2 text-red-500">
                <AlertCircle className="w-4 h-4" />
                <span className="text-body-sm">{base.error}</span>
              </div>
            )}
          </ResultCard>
        ) : (
          isLoading && <GhostCard title="Base Prompt" panel={panel} />
        )}

        {/* Variation cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {Array.from({ length: variationCount }, (_, i) => {
            const v = variations[i];
            if (!v) {
              return <GhostCard key={i} title={allVariations[i]?.label ?? `Variation ${i + 1}`} panel={panel} />;
            }
            const overlapInfo = overlaps.find((o) => o.label === v.variationLabel);
            return (
              <ResultCard
                key={i}
                title={v.variationLabel}
                panel={panel}
                subtitle={v.result.text ? `${v.result.metrics!.wordCount} words` : undefined}
                badge={overlapInfo ? `${overlapInfo.overlap.toFixed(0)}% overlap` : v.result.error ? "Error" : undefined}
                badgeColor={v.result.error ? "bg-red-100 text-red-600" : undefined}
                footer={
                  v.result.text ? (
                    <DeepDive label="Details">
                      <div className="space-y-3">
                        <div>
                          <div className="text-caption font-medium text-muted-foreground mb-1">Variation Prompt</div>
                          <div className="text-body-sm text-foreground bg-muted/50 rounded px-3 py-2 font-mono">
                            {v.variationPrompt}
                          </div>
                        </div>
                        <div>
                          <div className="text-caption font-medium text-muted-foreground mb-1">Full Output</div>
                          <div className="text-body-sm text-foreground whitespace-pre-wrap font-serif leading-relaxed max-h-[400px] overflow-y-auto">
                            {v.result.text}
                          </div>
                        </div>
                      </div>
                    </DeepDive>
                  ) : undefined
                }
              >
                {v.result.text ? (
                  <p className="text-body-sm text-muted-foreground line-clamp-3 font-serif">
                    {v.result.text.slice(0, 200)}{v.result.text.length > 200 ? "..." : ""}
                  </p>
                ) : (
                  <div className="flex items-center gap-2 text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-body-sm">{v.result.error}</span>
                  </div>
                )}
              </ResultCard>
            );
          })}
        </div>

        {/* Panel-level Deep Dive */}
        {isDone && successfulVariations.length > 0 && baseText && (
          <div className="mt-4 bg-card border border-parchment/50 rounded-sm overflow-hidden">
            <DeepDive
              label="Deep Dive"
              summary={`${successfulVariations.length} variations analysed`}
            >
              <div>
                <div className="text-caption font-medium text-muted-foreground mb-2">Variation Overlap Ranking</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-caption">
                    <thead>
                      <tr className="border-b border-parchment">
                        <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Variation</th>
                        <th className="text-left py-1.5 px-2 font-medium text-muted-foreground">Prompt Change</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Words</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Overlap with Base</th>
                        <th className="text-right py-1.5 px-2 font-medium text-muted-foreground">Word Diff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...successfulVariations]
                        .map((v) => {
                          const o = overlaps.find((x) => x.label === v.variationLabel);
                          return { ...v, overlap: o?.overlap ?? 0 };
                        })
                        .sort((a, b) => a.overlap - b.overlap)
                        .map((v, i) => {
                          const wordDiff = Math.abs(v.result.metrics!.wordCount - (base?.metrics?.wordCount || 0));
                          const bg = v.overlap > 70 ? "text-green-600 dark:text-green-400" : v.overlap > 40 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
                          return (
                            <tr key={i} className="border-b border-parchment/30 hover:bg-cream/30">
                              <td className="py-1 px-2 font-medium">{v.variationLabel}</td>
                              <td className="py-1 px-2 text-muted-foreground font-mono text-[11px] max-w-[200px] truncate">{v.variationPrompt}</td>
                              <td className="py-1 px-2 text-right tabular-nums">{v.result.metrics!.wordCount}</td>
                              <td className={`py-1 px-2 text-right tabular-nums font-medium ${bg}`}>{v.overlap.toFixed(1)}%</td>
                              <td className="py-1 px-2 text-right tabular-nums text-muted-foreground">{wordDiff > 0 ? `+${wordDiff}` : wordDiff}</td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
                <p className="text-caption text-muted-foreground mt-2">
                  Sorted by overlap with base (lowest first). Variations with lower overlap produced the most divergent outputs from the same model, indicating higher prompt sensitivity.
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
        <strong className="text-foreground">Prompt Sensitivity:</strong> Tests how minor changes to a prompt (adding politeness markers, changing punctuation, rephrasing) affect model outputs. Variations are auto-generated from the base prompt. You can also add custom variations to test specific hypotheses about prompt sensitivity.
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {showResults ? (
          <div className="p-6 space-y-6">
            {renderPanel(
              panelSelection === "B" ? "B" : "A",
              panelSelection === "B" ? baseB : baseA,
              panelSelection === "B" ? variationsB : variationsA,
              getSlotLabel(panelSelection === "B" ? "B" : "A")
            )}
            {hasB && renderPanel("B", baseB, variationsB, getSlotLabel("B"))}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Fingerprint className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-body-sm">Test how minor prompt changes affect model outputs.</p>
              <p className="text-caption mt-1">Variations are auto-generated. Add custom ones below.</p>
            </div>
          </div>
        )}
      </div>

      {/* Variations preview */}
      {prompt.trim() && allVariations.length > 0 && !isLoading && (
        <div className="px-6 py-2 border-t border-border bg-muted/20 max-h-[120px] overflow-y-auto">
          <div className="text-caption font-medium text-muted-foreground mb-1">
            {allVariations.length} variations will be tested:
          </div>
          <div className="flex flex-wrap gap-1.5">
            {allVariations.map((v, i) => (
              <span key={i} className="text-caption bg-cream px-2 py-0.5 rounded-sm text-muted-foreground" title={v.prompt}>
                {v.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Prompt area */}
      <AnalysisPromptArea
        prompt={prompt}
        onPromptChange={setPrompt}
        onSubmit={handleRun}
        isLoading={isLoading}
        disabled={!slotAConfigured || allVariations.length === 0}
        error={error}
        placeholder="Enter a prompt to test sensitivity..."
        panelSelection={panelSelection}
        onPanelSelectionChange={setPanelSelection}
        footer={
          <>
            {/* Custom variation input */}
            <div className="flex gap-2">
              <input
                value={newVariation}
                onChange={(e) => setNewVariation(e.target.value)}
                placeholder="Add a custom prompt variation..."
                className="input-editorial flex-1 text-body-sm px-2 py-1"
                disabled={isLoading}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newVariation.trim()) {
                    setCustomVariations((prev) => [...prev, newVariation.trim()]);
                    setNewVariation("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (newVariation.trim()) {
                    setCustomVariations((prev) => [...prev, newVariation.trim()]);
                    setNewVariation("");
                  }
                }}
                disabled={!newVariation.trim()}
                className="btn-editorial-ghost px-2 py-1 text-caption disabled:opacity-30"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Custom variations list */}
            {customVariations.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {customVariations.map((v, i) => (
                  <span key={i} className="text-caption bg-cream px-2 py-0.5 rounded-sm flex items-center gap-1">
                    Custom {i + 1}
                    <button onClick={() => setCustomVariations((prev) => prev.filter((_, j) => j !== i))}>
                      <X className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </>
        }
      />
    </>
  );
}
