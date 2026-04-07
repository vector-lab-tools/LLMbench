"use client";

import { useState, useCallback, useMemo } from "react";
import { Loader2, AlertCircle, Fingerprint, Plus, X } from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import { AnalysisPromptArea } from "@/components/shared/AnalysisPromptArea";
import type { PanelSelection } from "@/components/shared/ModelSelector";
import { ResultCard, MetricBox } from "@/components/shared/ResultCard";
import { DeepDive } from "@/components/shared/DeepDive";
import { generateVariations, type PromptVariation } from "@/lib/prompts/variations";
import { computeWordOverlap } from "@/lib/metrics/text-metrics";

interface VariationResult {
  variationLabel: string;
  variationPrompt: string;
  result: {
    text?: string;
    error?: string;
    metrics?: { wordCount: number; vocabularyDiversity: number };
    provenance: { modelDisplayName: string; responseTimeMs: number };
  };
}

interface PanelResult {
  base: {
    text?: string;
    error?: string;
    metrics?: { wordCount: number; vocabularyDiversity: number };
    provenance: { modelDisplayName: string; responseTimeMs: number };
  };
  variations: VariationResult[];
}

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
  const [resultA, setResultA] = useState<PanelResult | null>(null);
  const [resultB, setResultB] = useState<PanelResult | null>(null);

  const slotAConfigured = isSlotConfigured("A");
  const slotBConfigured = isSlotConfigured("B");

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
    setResultA(null);
    setResultB(null);

    try {
      const response = await fetch("/api/analyse/sensitivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          variations: allVariations,
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
  }, [prompt, allVariations, slots, panelSelection, isSlotConfigured, isLoading]);

  const renderPanel = (panel: "A" | "B", result: PanelResult, label: string) => {
    const baseText = result.base.text;
    const successfulVariations = result.variations.filter((v) => v.result.text);

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
        </h3>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricBox label="Base Words" value={result.base.metrics?.wordCount || 0} />
          <MetricBox label="Variations" value={result.variations.length} />
          <MetricBox label="Avg Overlap with Base" value={`${avgOverlap.toFixed(1)}%`} />
          <MetricBox label="Successful" value={successfulVariations.length} />
        </div>

        {/* Base output */}
        <ResultCard
          title="Base Prompt"
          panel={panel}
          subtitle={baseText ? `${result.base.metrics!.wordCount} words` : undefined}
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
              <span className="text-body-sm">{result.base.error}</span>
            </div>
          )}
        </ResultCard>

        {/* Variation cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          {result.variations.map((v, i) => {
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
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
              <p className="text-body-sm">Testing {allVariations.length} prompt variations...</p>
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
