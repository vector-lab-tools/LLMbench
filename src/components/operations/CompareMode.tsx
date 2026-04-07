"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Send,
  SplitSquareHorizontal,
  Loader2,
  AlertCircle,
  Clock,
  Cpu,
  MessageSquarePlus,
  Save,
  Download,
  FolderOpen,
  FilePlus,
  Check,
  Trash2,
  ChevronDown,
  SlidersHorizontal,
  Minus,
  Plus,
  FileJson,
  FileText,
  FileType,
  X,
  Moon,
  Sun,
  GitCompareArrows,
} from "lucide-react";
import { useProviderSettings } from "@/context/ProviderSettingsContext";
import {
  usePromptDispatch,
  isPanelOutput,
  type PanelResult,
} from "@/hooks/usePromptDispatch";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { ProsePanel } from "@/components/workspace/ProsePanel";
import {
  FONT_OPTIONS,
  type FontOptionId,
  getFontCss,
} from "@/components/workspace/cm-theme";
import {
  exportAsJSON,
  exportAsText,
  exportAsPDF,
  downloadFile,
  type PdfDiffData,
} from "@/lib/export/comparison-export";
import { DeepDive } from "@/components/shared/DeepDive";
import { MetricBox } from "@/components/shared/ResultCard";
import { computeTextMetrics, computeWordOverlap } from "@/lib/metrics/text-metrics";
import { DiffRenderedText } from "@/components/workspace/DiffPanel";
import { computeWordDiff, type DiffSegment } from "@/lib/diff/word-diff";
import {
  DEFAULT_ANNOTATION_DISPLAY_SETTINGS,
  type AnnotationDisplaySettings,
  type AnnotationBrightness,
  type LineHighlightIntensity,
} from "@/components/annotations/cm-annotations";
import type {
  LineAnnotationType,
  SavedComparison,
  ComparisonOutput,
} from "@/types";

// ---------- helpers ----------

function panelResultToOutput(
  result: PanelResult | null
): ComparisonOutput | null {
  if (!result) return null;
  if (isPanelOutput(result)) {
    return { text: result.text, provenance: result.provenance };
  }
  return { text: "", provenance: result.provenance, error: result.error };
}

function outputToPanelResult(
  output: ComparisonOutput | null
): PanelResult | null {
  if (!output) return null;
  if (output.error) {
    return { error: output.error, provenance: output.provenance };
  }
  return { text: output.text, provenance: output.provenance };
}

// ---------- panel display ----------

type AnnotationState = ReturnType<typeof useAnnotations>;

const PANEL_TINT = {
  A: "bg-blue-50/30 dark:bg-blue-950/10",
  B: "bg-amber-50/30 dark:bg-amber-950/10",
} as const;

const PANEL_HEADER_TINT = {
  A: "bg-blue-50/50 dark:bg-blue-950/20",
  B: "bg-amber-50/50 dark:bg-amber-950/20",
} as const;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function AnnotatedPanelDisplay({
  panel,
  result,
  isLoading,
  slotLabel,
  ann,
  fontSize,
  displaySettings,
  proseFontFamily,
  annotationFontFamily,
  annotationFontSize,
  isDark,
  diffSegments,
  diffUniqueCount,
  bodyScrollRef,
}: {
  panel: "A" | "B";
  result: PanelResult | null;
  isLoading: boolean;
  slotLabel: string;
  ann: AnnotationState;
  fontSize: number;
  displaySettings: AnnotationDisplaySettings;
  proseFontFamily: string;
  annotationFontFamily: string;
  annotationFontSize: number;
  isDark: boolean;
  diffSegments?: DiffSegment[];
  diffUniqueCount?: number;
  bodyScrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const editCallbacks = useMemo(
    () => ({
      onSubmit: (type: LineAnnotationType, content: string) =>
        ann.submitAnnotation(type, content),
      onCancel: ann.cancelEdit,
    }),
    [ann.submitAnnotation, ann.cancelEdit]
  );

  const provenance = result?.provenance ?? null;
  let outputText: string | null = null;
  let errorText: string | null = null;
  if (result) {
    if (isPanelOutput(result)) {
      outputText = result.text;
    } else {
      errorText = result.error;
    }
  }
  const wc = outputText !== null ? wordCount(outputText) : null;

  return (
    <div className={`flex-1 flex flex-col border-border ${PANEL_TINT[panel]}`}>
      {/* Header - always visible */}
      <div className={`px-4 py-2 border-b border-border ${PANEL_HEADER_TINT[panel]} flex items-center gap-3`}>
        {errorText && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
        {isLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        <span className="text-caption font-medium text-foreground">
          Panel {panel}
        </span>
        {provenance ? (
          <>
            <span className="text-caption text-burgundy font-medium">
              {provenance.modelDisplayName}
            </span>
            {outputText !== null && (
              <>
                <div className="flex items-center gap-1 text-caption text-muted-foreground">
                  <Cpu className="w-3 h-3" />
                  <span>t={provenance.temperature.toFixed(1)}</span>
                </div>
                <div className="flex items-center gap-1 text-caption text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span>
                    {(provenance.responseTimeMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <span className="text-caption text-muted-foreground">
                  {wc!.toLocaleString()} words
                </span>
                {diffSegments && diffUniqueCount !== undefined && (
                  <div className="flex items-center gap-1 text-caption">
                    <span className={`inline-block w-2 h-2 rounded-sm ${
                      panel === "A"
                        ? "bg-red-300 dark:bg-red-700"
                        : "bg-green-300 dark:bg-green-700"
                    }`} />
                    <span className={
                      panel === "A"
                        ? "text-red-600 dark:text-red-400"
                        : "text-green-600 dark:text-green-400"
                    }>
                      {diffUniqueCount} unique
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <span className="text-caption text-muted-foreground italic">
            {slotLabel || "No LLM set"}
          </span>
        )}
        {ann.annotations.length > 0 && (
          <div className="flex items-center gap-1 text-caption text-muted-foreground ml-auto">
            <MessageSquarePlus className="w-3 h-3" />
            <span>{ann.annotations.length}</span>
          </div>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
            <p className="text-body-sm">Generating...</p>
          </div>
        </div>
      ) : errorText ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center text-red-500/80 max-w-md">
            <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-60" />
            <p className="text-body-sm">{errorText}</p>
          </div>
        </div>
      ) : diffSegments && outputText !== null ? (
        <div ref={bodyScrollRef} className="flex-1 min-h-0 overflow-y-auto">
          <DiffRenderedText
            segments={diffSegments}
            fontSize={fontSize}
            fontFamily={proseFontFamily}
          />
        </div>
      ) : outputText !== null ? (
        <div className="flex-1 min-h-0">
          <ProsePanel
            value={outputText}
            fontSize={fontSize}
            isDark={isDark}
            proseFontFamily={proseFontFamily}
            annotationFontFamily={annotationFontFamily}
            annotationFontSize={annotationFontSize}
            annotations={ann.annotations}
            onLineClick={ann.startAnnotation}
            onEditAnnotation={ann.startEditAnnotation}
            onDeleteAnnotation={ann.deleteAnnotation}
            inlineEditState={ann.editState}
            inlineEditCallbacks={editCallbacks}
            annotationDisplaySettings={displaySettings}
          />
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <SplitSquareHorizontal className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="text-body-sm">
              Send a prompt to generate output.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- main compare mode ----------

interface CompareModeProps {
  isDark: boolean;
  onToggleDark: () => void;
}

export default function CompareMode({ isDark, onToggleDark }: CompareModeProps) {
  const [prompt, setPrompt] = useState("");
  const { getSlotLabel, setShowSettings } = useProviderSettings();
  const {
    isLoading,
    loadingA,
    loadingB,
    resultA,
    resultB,
    error,
    dispatch,
    reset,
    loadState,
  } = usePromptDispatch();

  // Lifted annotation state (parent owns so we can save/load/export)
  const annA = useAnnotations("panel-A");
  const annB = useAnnotations("panel-B");

  // Persistence
  const { comparisons, saveComparison, deleteComparison } = useLocalStorage();

  // Comparison metadata
  const [comparisonId, setComparisonId] = useState<string | null>(null);
  const [comparisonName, setComparisonName] = useState("Untitled Comparison");
  const [comparisonCreatedAt, setComparisonCreatedAt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved">("idle");

  // Display settings
  const [proseFontSize, setProseFontSize] = useState(14);
  const [annDisplaySettings, setAnnDisplaySettings] =
    useState<AnnotationDisplaySettings>(DEFAULT_ANNOTATION_DISPLAY_SETTINGS);
  const [proseFontFamily, setProseFontFamily] = useState<FontOptionId>("source-serif");
  const [annotationFontFamily, setAnnotationFontFamily] = useState<FontOptionId>("system");
  const [annotationFontSize, setAnnotationFontSize] = useState(11);

  // Dropdown / modal visibility
  const [showExportModal, setShowExportModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const hasContent = resultA !== null || resultB !== null;
  const hasBothOutputs =
    resultA !== null &&
    isPanelOutput(resultA) &&
    resultB !== null &&
    isPanelOutput(resultB);

  // Word diff computation
  const diffResult = useMemo(() => {
    if (!showDiff || !hasBothOutputs) return null;
    return computeWordDiff(
      (resultA as { text: string }).text,
      (resultB as { text: string }).text
    );
  }, [showDiff, hasBothOutputs, resultA, resultB]);

  const diffUniqueA = diffResult
    ? diffResult.segmentsA.filter((s) => s.type === "removed").length
    : 0;
  const diffUniqueB = diffResult
    ? diffResult.segmentsB.filter((s) => s.type === "added").length
    : 0;

  // Synchronised scrolling for diff mode
  const diffScrollARef = useRef<HTMLDivElement>(null);
  const diffScrollBRef = useRef<HTMLDivElement>(null);
  const diffSyncing = useRef(false);

  useEffect(() => {
    if (!showDiff) return;
    const elA = diffScrollARef.current;
    const elB = diffScrollBRef.current;
    if (!elA || !elB) return;

    function handleScrollA() {
      if (diffSyncing.current) return;
      diffSyncing.current = true;
      const ratio = elA!.scrollTop / (elA!.scrollHeight - elA!.clientHeight || 1);
      elB!.scrollTop = ratio * (elB!.scrollHeight - elB!.clientHeight || 1);
      diffSyncing.current = false;
    }
    function handleScrollB() {
      if (diffSyncing.current) return;
      diffSyncing.current = true;
      const ratio = elB!.scrollTop / (elB!.scrollHeight - elB!.clientHeight || 1);
      elA!.scrollTop = ratio * (elA!.scrollHeight - elA!.clientHeight || 1);
      diffSyncing.current = false;
    }

    elA.addEventListener("scroll", handleScrollA);
    elB.addEventListener("scroll", handleScrollB);
    return () => {
      elA.removeEventListener("scroll", handleScrollA);
      elB.removeEventListener("scroll", handleScrollB);
    };
  }, [showDiff]);

  // Click-outside handling for dropdowns
  const historyRef = useRef<HTMLDivElement>(null);
  const displaySettingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
      if (displaySettingsRef.current && !displaySettingsRef.current.contains(e.target as Node)) {
        setShowDisplaySettings(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Build a SavedComparison from current state
  const buildComparison = useCallback((): SavedComparison => {
    const now = new Date().toISOString();
    const id = comparisonId ?? crypto.randomUUID();
    return {
      id,
      name: comparisonName,
      prompt: prompt || "",
      outputA: panelResultToOutput(resultA),
      outputB: panelResultToOutput(resultB),
      annotationsA: annA.annotations,
      annotationsB: annB.annotations,
      createdAt: comparisonCreatedAt ?? now,
      updatedAt: now,
    };
  }, [comparisonId, comparisonName, comparisonCreatedAt, prompt, resultA, resultB, annA.annotations, annB.annotations]);

  // ---- actions ----

  const handleSend = () => {
    if (!prompt.trim() || isLoading) return;
    setComparisonId(null);
    setComparisonCreatedAt(null);
    annA.setAllAnnotations([]);
    annB.setAllAnnotations([]);
    dispatch(prompt);
  };

  const handleSave = useCallback(() => {
    const comparison = buildComparison();
    if (!comparisonId) {
      setComparisonId(comparison.id);
      setComparisonCreatedAt(comparison.createdAt);
    }
    saveComparison(comparison);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 2000);
  }, [buildComparison, comparisonId, saveComparison]);

  const handleLoad = useCallback(
    (comparison: SavedComparison) => {
      setComparisonId(comparison.id);
      setComparisonName(comparison.name);
      setComparisonCreatedAt(comparison.createdAt);
      setPrompt(comparison.prompt);
      loadState(
        comparison.prompt,
        outputToPanelResult(comparison.outputA),
        outputToPanelResult(comparison.outputB)
      );
      annA.setAllAnnotations(comparison.annotationsA);
      annB.setAllAnnotations(comparison.annotationsB);
      setShowHistory(false);
      setSaveStatus("idle");
    },
    [loadState, annA, annB]
  );

  const handleNew = useCallback(() => {
    setComparisonId(null);
    setComparisonName("Untitled Comparison");
    setComparisonCreatedAt(null);
    setPrompt("");
    reset();
    annA.setAllAnnotations([]);
    annB.setAllAnnotations([]);
    setSaveStatus("idle");
  }, [reset, annA, annB]);

  const safeFilename = useCallback(
    (ext: string) =>
      `${comparisonName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.${ext}`,
    [comparisonName]
  );

  const handleExportJSON = useCallback(() => {
    const comparison = buildComparison();
    downloadFile(exportAsJSON(comparison), safeFilename("json"), "application/json");
    setShowExportModal(false);
  }, [buildComparison, safeFilename]);

  const handleExportText = useCallback(() => {
    const comparison = buildComparison();
    downloadFile(exportAsText(comparison), safeFilename("txt"), "text/plain");
    setShowExportModal(false);
  }, [buildComparison, safeFilename]);

  const handleExportPDF = useCallback(() => {
    const comparison = buildComparison();
    const pdfDiff: PdfDiffData | undefined = diffResult
      ? { segmentsA: diffResult.segmentsA, segmentsB: diffResult.segmentsB }
      : undefined;
    exportAsPDF(comparison, pdfDiff);
    setShowExportModal(false);
  }, [buildComparison, diffResult]);

  const handleDeleteSaved = useCallback(
    (id: string) => {
      deleteComparison(id);
      if (comparisonId === id) {
        setComparisonId(null);
      }
    },
    [deleteComparison, comparisonId]
  );

  return (
    <>
      {/* Compare toolbar */}
      <div className="px-4 py-1.5 border-b border-border bg-cream/20 flex flex-wrap items-center gap-2">
        {/* Comparison name */}
        <input
          type="text"
          value={comparisonName}
          onChange={(e) => {
            setComparisonName(e.target.value);
            setSaveStatus("idle");
          }}
          className="text-body-sm bg-transparent border-b border-transparent hover:border-border focus:border-burgundy focus:outline-none px-1 py-0.5 text-foreground min-w-[200px]"
          placeholder="Comparison name..."
        />

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={!hasContent}
          className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Save comparison"
        >
          {saveStatus === "saved" ? (
            <Check className="w-3.5 h-3.5 text-green-500" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>{saveStatus === "saved" ? "Saved" : "Save"}</span>
        </button>

        {/* New */}
        <button
          onClick={handleNew}
          className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
          title="New comparison"
        >
          <FilePlus className="w-3.5 h-3.5" />
          <span>New</span>
        </button>

        <div className="h-4 w-px bg-parchment mx-1" />

        {/* Export button */}
        <button
          onClick={() => setShowExportModal(true)}
          disabled={!hasContent}
          className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
          title="Export comparison"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>

        <div className="h-4 w-px bg-parchment mx-1" />

        {/* Display settings popover */}
        <div className="relative" ref={displaySettingsRef}>
          <button
            onClick={() => setShowDisplaySettings(!showDisplaySettings)}
            className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
            title="Display settings"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Display</span>
          </button>
          {showDisplaySettings && (
            <div className="absolute top-full left-0 mt-1 bg-popover w-64 rounded shadow-xl border border-parchment/50 p-3 z-50">
              <div className="text-caption font-medium text-foreground mb-2">Display Settings</div>

              {/* Dark mode toggle */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-caption text-muted-foreground">Dark mode</span>
                <button
                  onClick={onToggleDark}
                  className="p-0.5 rounded border border-parchment bg-card hover:bg-cream"
                >
                  {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="h-px bg-parchment/50 my-2" />

              {/* LLM Output section */}
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">LLM Output</div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-caption text-muted-foreground">Font</span>
                <select
                  value={proseFontFamily}
                  onChange={(e) => setProseFontFamily(e.target.value as FontOptionId)}
                  className="text-caption bg-card border border-parchment rounded px-1 py-0.5 max-w-[130px]"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-caption text-muted-foreground">Size</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setProseFontSize((s) => Math.max(10, s - 1))}
                    className="p-0.5 rounded border border-parchment bg-card hover:bg-cream"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-caption w-6 text-center">{proseFontSize}</span>
                  <button
                    onClick={() => setProseFontSize((s) => Math.min(24, s + 1))}
                    className="p-0.5 rounded border border-parchment bg-card hover:bg-cream"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="h-px bg-parchment/50 my-2" />

              {/* Annotations section */}
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Annotations</div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-caption text-muted-foreground">Font</span>
                <select
                  value={annotationFontFamily}
                  onChange={(e) => setAnnotationFontFamily(e.target.value as FontOptionId)}
                  className="text-caption bg-card border border-parchment rounded px-1 py-0.5 max-w-[130px]"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-caption text-muted-foreground">Size</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setAnnotationFontSize((s) => Math.max(8, s - 1))}
                    className="p-0.5 rounded border border-parchment bg-card hover:bg-cream"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-caption w-6 text-center">{annotationFontSize}</span>
                  <button
                    onClick={() => setAnnotationFontSize((s) => Math.min(16, s + 1))}
                    className="p-0.5 rounded border border-parchment bg-card hover:bg-cream"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-caption text-muted-foreground">Brightness</span>
                <select
                  value={annDisplaySettings.brightness}
                  onChange={(e) =>
                    setAnnDisplaySettings((s) => ({
                      ...s,
                      brightness: e.target.value as AnnotationBrightness,
                    }))
                  }
                  className="text-caption bg-card border border-parchment rounded px-1 py-0.5"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="full">Full</option>
                </select>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-caption text-muted-foreground">Type badge</span>
                <input
                  type="checkbox"
                  checked={annDisplaySettings.showBadge}
                  onChange={(e) =>
                    setAnnDisplaySettings((s) => ({
                      ...s,
                      showBadge: e.target.checked,
                    }))
                  }
                  className="accent-burgundy"
                />
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-caption text-muted-foreground">Line highlight</span>
                <select
                  value={annDisplaySettings.lineHighlightIntensity}
                  onChange={(e) =>
                    setAnnDisplaySettings((s) => ({
                      ...s,
                      lineHighlightIntensity: e.target.value as LineHighlightIntensity,
                    }))
                  }
                  className="text-caption bg-card border border-parchment rounded px-1 py-0.5"
                >
                  <option value="off">Off</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="full">Full</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-caption text-muted-foreground">Pill background</span>
                <input
                  type="checkbox"
                  checked={annDisplaySettings.showPillBackground}
                  onChange={(e) =>
                    setAnnDisplaySettings((s) => ({
                      ...s,
                      showPillBackground: e.target.checked,
                    }))
                  }
                  className="accent-burgundy"
                />
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-parchment mx-1" />

        {/* Diff toggle */}
        <button
          onClick={() => setShowDiff((d) => !d)}
          disabled={!hasBothOutputs}
          className={`px-2 py-1 text-caption flex items-center gap-1.5 rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
            showDiff
              ? "bg-burgundy/90 text-white dark:bg-burgundy/80"
              : "btn-editorial-ghost"
          }`}
          title="Toggle word diff view"
        >
          <GitCompareArrows className="w-3.5 h-3.5" />
          <span>{showDiff ? "Diff On" : "Diff"}</span>
        </button>

        <div className="flex-1" />

        {/* History dropdown */}
        <div className="relative" ref={historyRef}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
            title="Saved comparisons"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>History ({comparisons.length})</span>
            <ChevronDown className="w-3 h-3" />
          </button>
          {showHistory && (
            <div className="absolute top-full right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 min-w-[300px] max-h-[400px] overflow-y-auto">
              {comparisons.length === 0 ? (
                <div className="px-4 py-3 text-body-sm text-muted-foreground">
                  No saved comparisons yet.
                </div>
              ) : (
                comparisons.map((c) => (
                  <div
                    key={c.id}
                    className={`px-3 py-2 hover:bg-accent/50 flex items-center gap-2 border-b border-border last:border-b-0 ${
                      c.id === comparisonId ? "bg-accent/30" : ""
                    }`}
                  >
                    <button
                      onClick={() => handleLoad(c)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="text-body-sm font-medium text-foreground truncate">
                        {c.name}
                      </div>
                      <div className="text-caption text-muted-foreground truncate">
                        {new Date(c.updatedAt).toLocaleDateString()} &middot;{" "}
                        {c.prompt.slice(0, 50)}
                        {c.prompt.length > 50 ? "..." : ""}
                      </div>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSaved(c.id);
                      }}
                      className="p-1 text-muted-foreground hover:text-red-500 shrink-0"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dual panels */}
      <div className="flex-1 flex flex-col md:flex-row min-h-[180px]">
        <AnnotatedPanelDisplay
          panel="A"
          result={resultA}
          isLoading={loadingA}
          slotLabel={getSlotLabel("A")}
          ann={annA}
          fontSize={proseFontSize}
          displaySettings={annDisplaySettings}
          proseFontFamily={getFontCss(proseFontFamily)}
          annotationFontFamily={getFontCss(annotationFontFamily)}
          annotationFontSize={annotationFontSize}
          isDark={isDark}
          diffSegments={diffResult?.segmentsA}
          diffUniqueCount={diffResult ? diffUniqueA : undefined}
          bodyScrollRef={diffScrollARef}
        />
        <div className="hidden md:block w-px bg-border" />
        <div className="md:hidden h-px bg-border" />
        <AnnotatedPanelDisplay
          panel="B"
          result={resultB}
          isLoading={loadingB}
          slotLabel={getSlotLabel("B")}
          ann={annB}
          fontSize={proseFontSize}
          displaySettings={annDisplaySettings}
          proseFontFamily={getFontCss(proseFontFamily)}
          annotationFontFamily={getFontCss(annotationFontFamily)}
          annotationFontSize={annotationFontSize}
          isDark={isDark}
          diffSegments={diffResult?.segmentsB}
          diffUniqueCount={diffResult ? diffUniqueB : undefined}
          bodyScrollRef={diffScrollBRef}
        />
      </div>

      {/* Deep Dive: comparison analysis */}
      {hasBothOutputs && (() => {
        const textA = (resultA as { text: string }).text;
        const textB = (resultB as { text: string }).text;
        const metricsA = computeTextMetrics(textA);
        const metricsB = computeTextMetrics(textB);
        const overlap = computeWordOverlap(textA, textB);
        return (
          <div className="border-t border-border shrink-0 max-h-[45vh] overflow-y-auto">
            <DeepDive label="Deep Dive" summary={`${overlap.shared.length} shared words, ${(overlap.jaccardSimilarity * 100).toFixed(0)}% Jaccard`}>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <MetricBox label="Jaccard Similarity" value={`${(overlap.jaccardSimilarity * 100).toFixed(1)}%`} />
                <MetricBox label="Word Overlap" value={`${overlap.overlapPercentage.toFixed(1)}%`} />
                <MetricBox label="Shared Words" value={overlap.shared.length} />
                <MetricBox label="Unique to A" value={overlap.uniqueA.length} />
                <MetricBox label="Unique to B" value={overlap.uniqueB.length} />
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <div className="text-caption font-medium text-muted-foreground mb-2">Panel A</div>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricBox label="Words" value={metricsA.wordCount} />
                    <MetricBox label="Sentences" value={metricsA.sentenceCount} />
                    <MetricBox label="Avg Sent. Length" value={metricsA.avgSentenceLength.toFixed(1)} />
                    <MetricBox label="Vocab Diversity" value={`${(metricsA.vocabularyDiversity * 100).toFixed(0)}%`} />
                  </div>
                </div>
                <div>
                  <div className="text-caption font-medium text-muted-foreground mb-2">Panel B</div>
                  <div className="grid grid-cols-2 gap-2">
                    <MetricBox label="Words" value={metricsB.wordCount} />
                    <MetricBox label="Sentences" value={metricsB.sentenceCount} />
                    <MetricBox label="Avg Sent. Length" value={metricsB.avgSentenceLength.toFixed(1)} />
                    <MetricBox label="Vocab Diversity" value={`${(metricsB.vocabularyDiversity * 100).toFixed(0)}%`} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-caption font-medium text-red-600 dark:text-red-400 mb-1">Unique to A ({overlap.uniqueA.length})</div>
                  <div className="max-h-[200px] overflow-y-auto text-caption font-mono text-red-600 dark:text-red-400 space-y-0.5">
                    {overlap.uniqueA.slice(0, 80).map((w, i) => <div key={i}>{w}</div>)}
                    {overlap.uniqueA.length > 80 && <div className="text-muted-foreground">...and {overlap.uniqueA.length - 80} more</div>}
                  </div>
                </div>
                <div>
                  <div className="text-caption font-medium text-muted-foreground mb-1">Shared ({overlap.shared.length})</div>
                  <div className="max-h-[200px] overflow-y-auto text-caption font-mono text-foreground space-y-0.5">
                    {overlap.shared.slice(0, 80).map((w, i) => <div key={i}>{w}</div>)}
                    {overlap.shared.length > 80 && <div className="text-muted-foreground">...and {overlap.shared.length - 80} more</div>}
                  </div>
                </div>
                <div>
                  <div className="text-caption font-medium text-green-600 dark:text-green-400 mb-1">Unique to B ({overlap.uniqueB.length})</div>
                  <div className="max-h-[200px] overflow-y-auto text-caption font-mono text-green-600 dark:text-green-400 space-y-0.5">
                    {overlap.uniqueB.slice(0, 80).map((w, i) => <div key={i}>{w}</div>)}
                    {overlap.uniqueB.length > 80 && <div className="text-muted-foreground">...and {overlap.uniqueB.length - 80} more</div>}
                  </div>
                </div>
              </div>
            </DeepDive>
          </div>
        );
      })()}

      {/* Prompt area */}
      <div className="px-6 py-3 border-t border-border bg-card">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a prompt to send to both models..."
            className="input-editorial flex-1 resize-none min-h-[60px] max-h-[200px]"
            rows={2}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            onClick={handleSend}
            disabled={!prompt.trim() || isLoading}
            className="btn-editorial-primary px-4 py-2 self-end disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        {error && (
          <div className="mt-2 max-w-4xl mx-auto text-caption text-red-500 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
      </div>

      {/* Export modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowExportModal(false)}>
          <div className="bg-popover rounded-sm shadow-lg p-6 w-full max-w-md border border-parchment" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-display-md font-bold text-foreground">
                Export Comparison
              </h2>
              <button
                onClick={() => setShowExportModal(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <button
                onClick={handleExportJSON}
                className="w-full flex items-center gap-3 p-3 rounded border border-parchment/50 bg-card hover:bg-cream text-left"
              >
                <FileJson className="w-6 h-6 text-blue-500 shrink-0" />
                <div>
                  <div className="text-body-sm font-medium text-foreground">JSON</div>
                  <div className="text-caption text-muted-foreground">
                    Structured data with full metadata and annotations
                  </div>
                </div>
              </button>
              <button
                onClick={handleExportText}
                className="w-full flex items-center gap-3 p-3 rounded border border-parchment/50 bg-card hover:bg-cream text-left"
              >
                <FileText className="w-6 h-6 text-green-500 shrink-0" />
                <div>
                  <div className="text-body-sm font-medium text-foreground">Plain Text</div>
                  <div className="text-caption text-muted-foreground">
                    Formatted text log with annotations
                  </div>
                </div>
              </button>
              <button
                onClick={handleExportPDF}
                className="w-full flex items-center gap-3 p-3 rounded border border-parchment/50 bg-card hover:bg-cream text-left"
              >
                <FileType className="w-6 h-6 text-red-500 shrink-0" />
                <div>
                  <div className="text-body-sm font-medium text-foreground">PDF</div>
                  <div className="text-caption text-muted-foreground">
                    Printable document with coloured annotation badges
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
