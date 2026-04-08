"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { DefaultPromptChips } from "@/components/shared/DefaultPromptChips";
import { MODE_DEFAULTS, getRandomDefault } from "@/lib/prompts/defaults";
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
  ChevronUp,
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
  ListOrdered,
  Activity,
  BarChart2,
  Eye,
  FileCode,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { StructView } from "@/components/viz/StructView";
import { ToneView } from "@/components/viz/ToneView";
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
import { computeTextMetrics, computeWordOverlap, computeTokenEntropy } from "@/lib/metrics/text-metrics";
import { DiffRenderedText } from "@/components/workspace/DiffPanel";
import { computeWordDiff, type DiffSegment } from "@/lib/diff/word-diff";
import { TokenHeatmap } from "@/components/viz/TokenHeatmap";
import { EntropyCurve } from "@/components/viz/EntropyCurve";
import { TokenPixelMap } from "@/components/viz/TokenPixelMap";
import { BridgeKeeper, isBridgeKeeperPrompt } from "@/components/viz/BridgeKeeper";

// Lazy-load the 3D skyline so Three.js only enters the bundle when the user
// actually toggles the view — keeps the initial page load lean.
const ProbabilitySkyline = dynamic(
  () =>
    import("@/components/viz/ProbabilitySkyline").then(
      (m) => m.ProbabilitySkyline
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-full px-3 py-8 text-center text-[10px] text-muted-foreground italic border-y border-parchment/40 bg-card/40">
        Loading 3D skyline…
      </div>
    ),
  }
);
import type { TokenLogprob } from "@/types/analysis";
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
  viewMode,
  diffSegments,
  diffUniqueCount,
  bodyScrollRef,
  logprobTokens,
  siblingTokens,
  controlledIndex,
  onControlledIndexChange,
  secondControlledIndex,
  onSecondControlledIndexChange,
  logprobsLoading,
  logprobCapable,
  logprobError,
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
  viewMode?: "diff" | "struct" | "tone" | "probs" | null;
  diffSegments?: DiffSegment[];
  diffUniqueCount?: number;
  bodyScrollRef?: React.RefObject<HTMLDivElement | null>;
  logprobTokens?: TokenLogprob[];
  siblingTokens?: TokenLogprob[] | null;
  controlledIndex?: number | null;
  onControlledIndexChange?: (i: number) => void;
  secondControlledIndex?: number | null;
  onSecondControlledIndexChange?: (i: number | null) => void;
  logprobsLoading?: boolean;
  logprobCapable?: boolean;
  logprobError?: string | null;
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
        {/* Confidence legend — shown in header when probs view is active */}
        {viewMode === "probs" && logprobTokens && logprobTokens.length > 0 && (
          <div className="flex items-center gap-1.5 ml-auto text-[10px] text-muted-foreground">
            <span>high</span>
            <div
              className="w-20 h-2.5 rounded-sm border border-parchment/20"
              style={{
                background: isDark
                  ? "linear-gradient(to right, hsla(52,95%,20%,0.2), hsla(30,95%,22%,0.55), hsla(5,95%,20%,0.8))"
                  : "linear-gradient(to right, hsla(52,90%,88%,0.3), hsla(30,92%,65%,0.75), hsla(5,95%,42%,1))",
              }}
            />
            <span>low</span>
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
      ) : viewMode === "probs" && logprobTokens && logprobTokens.length > 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <TokenHeatmap
            tokens={logprobTokens}
            isDark={isDark}
            siblingTokens={siblingTokens}
            controlledIndex={controlledIndex}
            onControlledIndexChange={onControlledIndexChange}
            secondControlledIndex={secondControlledIndex}
            onSecondControlledIndexChange={onSecondControlledIndexChange}
          />
        </div>
      ) : viewMode === "probs" && outputText !== null ? (
        <div className="flex-1 flex items-center justify-center p-6">
          {logprobsLoading ? (
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin opacity-60" />
              <p className="text-caption">Working&hellip;</p>
              <p className="text-[10px] opacity-70 mt-1">Fetching token probabilities</p>
            </div>
          ) : logprobError ? (
            <div className="text-center text-red-500/80 max-w-sm">
              <AlertCircle className="w-5 h-5 mx-auto mb-2 opacity-60" />
              <p className="text-caption font-medium">
                Logprobs request failed for Panel {panel}
              </p>
              <p className="text-[10px] opacity-80 mt-1 break-words whitespace-pre-wrap">
                {logprobError}
              </p>
            </div>
          ) : logprobCapable ? (
            <div className="text-center text-muted-foreground max-w-xs">
              <AlertCircle className="w-5 h-5 mx-auto mb-2 opacity-50" />
              <p className="text-caption">
                No token probabilities returned for Panel {panel}.
              </p>
              <p className="text-[10px] opacity-70 mt-1">
                The model is logprob-capable, but this response came back without
                token-level probability data. Try re-sending the prompt, or check
                that the API key has logprobs enabled.
              </p>
            </div>
          ) : (
            <p className="text-caption text-muted-foreground text-center">
              No token probability data for Panel {panel}.<br />
              Logprobs require Gemini or OpenAI models.
            </p>
          )}
        </div>
      ) : viewMode === "struct" && outputText !== null ? (
        <div className="flex-1 min-h-0">
          <StructView text={outputText} fontSize={fontSize} fontFamily={proseFontFamily} isDark={isDark} />
        </div>
      ) : viewMode === "tone" && outputText !== null ? (
        <div className="flex-1 min-h-0">
          <ToneView text={outputText} fontSize={fontSize} fontFamily={proseFontFamily} isDark={isDark} />
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
  const { getSlotLabel, setShowSettings, slots, noMarkdown, isSlotConfigured } = useProviderSettings();
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
  const [viewMode, setViewMode] = useState<"diff" | "struct" | "tone" | "probs" | null>(null);
  const [promptCollapsed, setPromptCollapsed] = useState(false);
  const [promptBouncing, setPromptBouncing] = useState(false);
  const [logprobTokensA, setLogprobTokensA] = useState<TokenLogprob[] | null>(null);
  const [logprobTokensB, setLogprobTokensB] = useState<TokenLogprob[] | null>(null);
  const [logprobErrorA, setLogprobErrorA] = useState<string | null>(null);
  const [logprobErrorB, setLogprobErrorB] = useState<string | null>(null);
  const [logprobsLoading, setLogprobsLoading] = useState(false);
  const [showLogprobsInfo, setShowLogprobsInfo] = useState(false);
  const [showBridgeKeeper, setShowBridgeKeeper] = useState(false);
  const [lastSentPrompt, setLastSentPrompt] = useState("");
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showProbsExport, setShowProbsExport] = useState(false);
  const [probsNavIndex, setProbsNavIndex] = useState<number | null>(null);
  const [probsSecondIndex, setProbsSecondIndex] = useState<number | null>(null);
  const [showEntropyCurve, setShowEntropyCurve] = useState(false);
  const [showPixelMap, setShowPixelMap] = useState(false);
  const [showSkyline, setShowSkyline] = useState(false);
  // Temperature override: null = use slot default
  const [temperatureOverride, setTemperatureOverride] = useState<number | null>(null);
  const showDiff = viewMode === "diff";

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

  // ---- Probs navigation chip targets ----
  // "Uncertain" — positions sorted by highest entropy
  const probsUncertainPositions = useMemo(() => {
    const tokens = logprobTokensA ?? logprobTokensB;
    if (!tokens) return [];
    return tokens
      .map((t, i) => ({ i, entropy: computeTokenEntropy(t) }))
      .sort((a, b) => b.entropy - a.entropy)
      .map(e => e.i);
  }, [logprobTokensA, logprobTokensB]);

  // "Forks" — positions where chosen token prob < 70%
  const probsForkPositions = useMemo(() => {
    const tokens = logprobTokensA ?? logprobTokensB;
    if (!tokens) return [];
    return tokens
      .map((t, i) => ({ i, prob: Math.exp(t.logprob) }))
      .filter(e => e.prob < 0.70)
      .sort((a, b) => a.prob - b.prob)
      .map(e => e.i);
  }, [logprobTokensA, logprobTokensB]);

  // "≠ Diverge" — positions where A and B chose different tokens
  const probsDivergePositions = useMemo(() => {
    if (!logprobTokensA || !logprobTokensB) return [];
    const minLen = Math.min(logprobTokensA.length, logprobTokensB.length);
    const result: number[] = [];
    for (let i = 0; i < minLen; i++) {
      if (logprobTokensA[i].token !== logprobTokensB[i].token) result.push(i);
    }
    return result;
  }, [logprobTokensA, logprobTokensB]);

  // Track which chip is active + index within that chip's list
  const [probsChipMode, setProbsChipMode] = useState<"uncertain" | "forks" | "diverge" | null>(null);
  const [probsChipCursor, setProbsChipCursor] = useState(0);

  const probsMaxIndex = useMemo(() => {
    const tokens = logprobTokensA ?? logprobTokensB;
    return tokens ? tokens.length - 1 : 0;
  }, [logprobTokensA, logprobTokensB]);

  const handleProbsChip = useCallback((mode: "uncertain" | "forks" | "diverge") => {
    const positions = mode === "uncertain" ? probsUncertainPositions
      : mode === "forks" ? probsForkPositions
      : probsDivergePositions;
    if (positions.length === 0) return;
    if (probsChipMode === mode) {
      // Cycle to next
      const next = (probsChipCursor + 1) % positions.length;
      setProbsChipCursor(next);
      setProbsNavIndex(positions[next]);
    } else {
      setProbsChipMode(mode);
      setProbsChipCursor(0);
      setProbsNavIndex(positions[0]);
    }
  }, [probsChipMode, probsChipCursor, probsUncertainPositions, probsForkPositions, probsDivergePositions]);

  const handleProbsStep = useCallback((delta: number) => {
    const current = probsNavIndex ?? 0;
    const next = Math.max(0, Math.min(probsMaxIndex, current + delta));
    setProbsNavIndex(next);
    setProbsChipMode(null);
  }, [probsNavIndex, probsMaxIndex]);

  // Move probs cursor vertically by one visual row in the DOM heatmap.
  // Reads bounding rects of the rendered token spans so wrapping behaviour
  // is respected even though the heatmap uses inline flow with flex-wrap.
  const handleProbsVertical = useCallback((direction: -1 | 1) => {
    if (typeof document === "undefined") return;
    const container = document.querySelector<HTMLElement>("[data-token-heatmap]");
    if (!container) return;
    const spans = Array.from(
      container.querySelectorAll<HTMLElement>("[data-token-index]")
    );
    if (spans.length === 0) return;

    const currentIdx = probsNavIndex ?? 0;
    const currentEl = spans[currentIdx];
    if (!currentEl) return;
    const currentRect = currentEl.getBoundingClientRect();
    const currentMidY = currentRect.top + currentRect.height / 2;
    const currentMidX = currentRect.left + currentRect.width / 2;

    // Find the next/previous row by Y position. A row is any span whose
    // vertical midpoint sits clearly above/below the current span's midpoint.
    const ROW_EPS = Math.max(4, currentRect.height * 0.4);
    let targetRowY: number | null = null;
    for (const el of spans) {
      const r = el.getBoundingClientRect();
      const midY = r.top + r.height / 2;
      if (direction === -1 && midY < currentMidY - ROW_EPS) {
        if (targetRowY === null || midY > targetRowY) targetRowY = midY;
      } else if (direction === 1 && midY > currentMidY + ROW_EPS) {
        if (targetRowY === null || midY < targetRowY) targetRowY = midY;
      }
    }
    if (targetRowY === null) return; // no row above/below

    // Within the target row, pick the span whose X-midpoint is closest.
    let bestIdx = -1;
    let bestDx = Infinity;
    for (let i = 0; i < spans.length; i++) {
      const r = spans[i].getBoundingClientRect();
      const midY = r.top + r.height / 2;
      if (Math.abs(midY - targetRowY) > ROW_EPS) continue;
      const midX = r.left + r.width / 2;
      const dx = Math.abs(midX - currentMidX);
      if (dx < bestDx) {
        bestDx = dx;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      setProbsNavIndex(bestIdx);
      setProbsChipMode(null);
      spans[bestIdx]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [probsNavIndex]);

  // Arrow-key navigation across the probs heatmap. Active only in probs view
  // and skipped when the user is typing into an editable field.
  useEffect(() => {
    if (viewMode !== "probs") return;
    if (logprobTokensA === null && logprobTokensB === null) return;

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      switch (e.key) {
        case "ArrowLeft":
          e.preventDefault();
          handleProbsStep(-1);
          break;
        case "ArrowRight":
          e.preventDefault();
          handleProbsStep(1);
          break;
        case "ArrowUp":
          e.preventDefault();
          handleProbsVertical(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          handleProbsVertical(1);
          break;
        case "Home":
          e.preventDefault();
          setProbsNavIndex(0);
          setProbsChipMode(null);
          break;
        case "End":
          e.preventDefault();
          setProbsNavIndex(probsMaxIndex);
          setProbsChipMode(null);
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    viewMode,
    logprobTokensA,
    logprobTokensB,
    handleProbsStep,
    handleProbsVertical,
    probsMaxIndex,
  ]);

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

  const handleSend = (overridePrompt?: string) => {
    const effectivePrompt = overridePrompt ?? (prompt.trim() || (() => {
      const d = getRandomDefault("compare"); setPrompt(d); return d;
    })());
    if (!effectivePrompt || isLoading) return;
    setComparisonId(null);
    setComparisonCreatedAt(null);
    annA.setAllAnnotations([]);
    annB.setAllAnnotations([]);
    setLogprobTokensA(null);
    setLogprobTokensB(null);
    setLogprobErrorA(null);
    setLogprobErrorB(null);
    setProbsNavIndex(null);
    setProbsSecondIndex(null);
    setLastSentPrompt(effectivePrompt);
    if (isBridgeKeeperPrompt(effectivePrompt)) setShowBridgeKeeper(true);
    dispatch(effectivePrompt, temperatureOverride !== null ? temperatureOverride : undefined);
    setPromptCollapsed(true);
    setPromptBouncing(true);
  };

  const fetchLogprobs = async () => {
    const effectivePrompt = prompt.trim();
    if (!effectivePrompt || logprobsLoading) return;
    setLogprobsLoading(true);
    setLogprobErrorA(null);
    setLogprobErrorB(null);
    try {
      const res = await fetch("/api/analyse/logprobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: effectivePrompt,
          topK: 5,
          slotA: slots.A,
          slotB: isSlotConfigured("B") ? slots.B : null,
          noMarkdown,
        }),
      });
      const data = await res.json();
      if (data.A?.tokens?.length) {
        setLogprobTokensA(data.A.tokens);
      } else if (data.A?.error) {
        setLogprobTokensA(null);
        setLogprobErrorA(data.A.error);
      }
      if (data.B?.tokens?.length) {
        setLogprobTokensB(data.B.tokens);
      } else if (data.B?.error) {
        setLogprobTokensB(null);
        setLogprobErrorB(data.B.error);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Request failed";
      setLogprobErrorA(msg);
      setLogprobErrorB(msg);
    } finally {
      setLogprobsLoading(false);
    }
  };

  // ---- probs export helpers ----

  // Continuous probability → canvas colour, matching the heatmap HSL gradient.
  // Returns [backgroundColor, foregroundColor].
  function probsColorLight(logprob: number): [string, string] {
    const prob = Math.exp(logprob);
    const THRESHOLD = 0.70;
    if (prob >= THRESHOLD) return ["#f8fafc", "#334155"]; // near-white, slate text
    const t = Math.pow(1 - prob / THRESHOLD, 0.75);
    const hue = Math.round(52 - 47 * t);
    const sat = Math.round(88 + 7 * t);
    const lit = Math.round(92 - 50 * t);
    const alpha = (0.18 + 0.82 * t).toFixed(2);
    const bg = `hsla(${hue},${sat}%,${lit}%,${alpha})`;
    // Text: dark slate for pale backgrounds, near-black for saturated ones
    const fg = t > 0.6 ? "#1a0a0a" : "#334155";
    return [bg, fg];
  }

  const exportProbsJSON = useCallback(() => {
    const makePanel = (tokens: TokenLogprob[], label: string) => ({
      model: label,
      tokenCount: tokens.length,
      tokens: tokens.map((t, i) => ({
        position: i + 1,
        token: t.token,
        logprob: t.logprob,
        probability: parseFloat(Math.exp(t.logprob).toFixed(6)),
        entropy: parseFloat(computeTokenEntropy(t).toFixed(6)),
        topAlternatives: t.topAlternatives.map(a => ({
          token: a.token,
          logprob: a.logprob,
          probability: parseFloat(Math.exp(a.logprob).toFixed(6)),
        })),
      })),
    });
    const payload: Record<string, unknown> = {
      export: "token-probabilities",
      tool: "LLMbench",
      timestamp: new Date().toISOString(),
      prompt: lastSentPrompt,
    };
    if (logprobTokensA) payload.panelA = makePanel(logprobTokensA, getSlotLabel("A"));
    if (logprobTokensB) payload.panelB = makePanel(logprobTokensB, getSlotLabel("B"));

    // Deep dive metrics
    const textA = resultA && isPanelOutput(resultA) ? resultA.text : null;
    const textB = resultB && isPanelOutput(resultB) ? resultB.text : null;
    if (textA && textB) {
      const metricsA = computeTextMetrics(textA);
      const metricsB = computeTextMetrics(textB);
      const overlap = computeWordOverlap(textA, textB);
      payload.deepDive = {
        panelA: { words: metricsA.wordCount, sentences: metricsA.sentenceCount, avgSentenceLength: metricsA.avgSentenceLength, vocabularyDiversity: metricsA.vocabularyDiversity },
        panelB: { words: metricsB.wordCount, sentences: metricsB.sentenceCount, avgSentenceLength: metricsB.avgSentenceLength, vocabularyDiversity: metricsB.vocabularyDiversity },
        jaccardSimilarity: overlap.jaccardSimilarity,
        wordOverlap: overlap.overlapPercentage,
        sharedWords: overlap.shared,
        uniqueToA: overlap.uniqueA,
        uniqueToB: overlap.uniqueB,
      };
    } else if (textA) {
      payload.deepDive = { panelA: computeTextMetrics(textA) };
    } else if (textB) {
      payload.deepDive = { panelB: computeTextMetrics(textB) };
    }

    // Per-panel entropy summary
    const entropyStats = (tokens: TokenLogprob[]) => {
      const entropies = tokens.map(t => computeTokenEntropy(t));
      const mean = entropies.reduce((a, b) => a + b, 0) / entropies.length;
      const forks = tokens.filter(t => Math.exp(t.logprob) < 0.70).length;
      const sorted = [...entropies].sort((a, b) => b - a);
      return {
        meanEntropy: parseFloat(mean.toFixed(4)),
        maxEntropy: parseFloat(sorted[0]?.toFixed(4) ?? "0"),
        forkCount: forks,
        totalTokens: tokens.length,
        top5UncertainPositions: sorted.slice(0, 5).map((e, i) => {
          const idx = entropies.indexOf(e);
          return { position: idx + 1, token: tokens[idx].token, entropy: parseFloat(e.toFixed(4)) };
        }),
      };
    };
    if (logprobTokensA) (payload.panelA as Record<string, unknown>).entropyStats = entropyStats(logprobTokensA);
    if (logprobTokensB) (payload.panelB as Record<string, unknown>).entropyStats = entropyStats(logprobTokensB);

    // Divergence positions (when both panels)
    if (logprobTokensA && logprobTokensB) {
      const minLen = Math.min(logprobTokensA.length, logprobTokensB.length);
      const divergePositions: { position: number; tokenA: string; tokenB: string }[] = [];
      for (let i = 0; i < minLen; i++) {
        if (logprobTokensA[i].token !== logprobTokensB[i].token) {
          divergePositions.push({ position: i + 1, tokenA: logprobTokensA[i].token, tokenB: logprobTokensB[i].token });
        }
      }
      payload.divergePositions = divergePositions;
    }

    const name = comparisonName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    downloadFile(JSON.stringify(payload, null, 2), `${name}-probs.json`, "application/json");
  }, [logprobTokensA, logprobTokensB, lastSentPrompt, getSlotLabel, comparisonName, resultA, resultB]);

  const exportProbsPDF = useCallback(async () => {
    // Build canvas (shared logic with image export)
    const canvas = document.createElement("canvas");
    const W = 2400;
    canvas.width = W;
    const ctx = canvas.getContext("2d")!;
    const PAD = 32;
    const LINE_H = 34;
    const TOKEN_H = 26;
    const FONT = "18px Georgia, serif";
    const HEADER_FONT = "bold 14px system-ui, sans-serif";
    const META_FONT = "12px system-ui, sans-serif";

    ctx.font = FONT;
    const layoutPanel = (tokens: TokenLogprob[], panelW: number) => {
      const lines: { token: TokenLogprob; w: number; x: number }[][] = [[]];
      let cx = 0;
      for (const tok of tokens) {
        const w = ctx.measureText(tok.token).width + 6;
        if (cx + w > panelW && cx > 0) { lines.push([]); cx = 0; }
        lines[lines.length - 1].push({ token: tok, w, x: cx });
        cx += w;
      }
      return lines;
    };
    const panelW = logprobTokensB ? (W - PAD * 3) / 2 : W - PAD * 2;
    const linesA = logprobTokensA ? layoutPanel(logprobTokensA, panelW) : [];
    const linesB = logprobTokensB ? layoutPanel(logprobTokensB, panelW) : [];
    const HEADER_H = 60;
    // Compute deep dive height: legend row + entropy stats + diverge positions
    const textA = resultA && isPanelOutput(resultA) ? resultA.text : null;
    const textB = resultB && isPanelOutput(resultB) ? resultB.text : null;
    const hasDive = !!(textA || textB);
    const DIVE_H = hasDive ? 220 : 0;
    const totalH = PAD + HEADER_H + Math.max(linesA.length, linesB.length) * LINE_H + PAD + 32 + DIVE_H;
    canvas.height = Math.max(totalH, 200);

    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, canvas.height);

    // Title + prompt
    ctx.font = HEADER_FONT;
    ctx.fillStyle = "#1e293b";
    ctx.textBaseline = "middle";
    ctx.fillText("Token Probability Heatmap — LLMbench", PAD, PAD + 8);
    ctx.font = META_FONT;
    ctx.fillStyle = "#64748b";
    const promptPreview = lastSentPrompt.length > 100 ? lastSentPrompt.slice(0, 100) + "…" : lastSentPrompt;
    ctx.fillText(`"${promptPreview}"  ·  ${new Date().toLocaleString()}`, PAD, PAD + 28);

    const drawPanel = (tokens: TokenLogprob[], lines: { token: TokenLogprob; w: number; x: number }[][], ox: number, label: string) => {
      ctx.font = HEADER_FONT;
      ctx.fillStyle = "#64748b";
      ctx.fillText(label, ox, PAD + HEADER_H - 14);
      ctx.font = FONT;
      ctx.textBaseline = "middle";
      const startY = PAD + HEADER_H;
      for (const [li, line] of lines.entries()) {
        const y = startY + li * LINE_H;
        for (const { token: tok, w, x } of line) {
          const [bg, fg] = probsColorLight(tok.logprob);
          ctx.fillStyle = bg;
          ctx.fillRect(ox + x, y, w, TOKEN_H);
          ctx.fillStyle = fg;
          ctx.fillText(tok.token, ox + x + 3, y + TOKEN_H / 2);
        }
      }
    };

    if (logprobTokensA) drawPanel(logprobTokensA, linesA, PAD, getSlotLabel("A"));
    if (logprobTokensB) drawPanel(logprobTokensB, linesB, PAD + panelW + PAD, getSlotLabel("B"));

    // Legend — gradient bar matching the heatmap
    const ly = canvas.height - PAD + 6;
    ctx.font = META_FONT;
    ctx.fillStyle = "#64748b";
    ctx.fillText("Confidence:", PAD, ly);
    const gradW = 200;
    const gradH = 14;
    const gx = PAD + 90;
    for (let px = 0; px < gradW; px++) {
      const t = px / gradW;
      const hue = Math.round(52 - 47 * t);
      const sat = Math.round(88 + 7 * t);
      const lit = Math.round(92 - 50 * t);
      const alpha = (0.18 + 0.82 * t).toFixed(2);
      ctx.fillStyle = `hsla(${hue},${sat}%,${lit}%,${alpha})`;
      ctx.fillRect(gx + px, ly - 7, 1, gradH);
    }
    ctx.fillStyle = "#64748b";
    ctx.fillText("high", gx - 30, ly);
    ctx.fillText("low", gx + gradW + 6, ly);
    ctx.fillText("no colour = ≥70%", gx + gradW + 40, ly);

    // Deep dive section
    if (hasDive) {
      let dy = ly + 28;
      ctx.font = HEADER_FONT;
      ctx.fillStyle = "#1e293b";
      ctx.fillText("Deep Dive", PAD, dy);
      dy += 22;
      ctx.font = META_FONT;
      ctx.fillStyle = "#334155";

      const renderStats = (tokens: TokenLogprob[], label: string, ox: number) => {
        const entropies = tokens.map(t => computeTokenEntropy(t));
        const mean = entropies.reduce((a, b) => a + b, 0) / entropies.length;
        const forks = tokens.filter(t => Math.exp(t.logprob) < 0.70).length;
        const maxE = Math.max(...entropies);
        const maxIdx = entropies.indexOf(maxE);
        ctx.fillStyle = "#64748b";
        ctx.fillText(`${label}:`, ox, dy);
        ctx.fillStyle = "#334155";
        ctx.fillText(`${tokens.length} tokens · Mean entropy: ${mean.toFixed(2)} bits · Forks (<70%): ${forks} · Max entropy: ${maxE.toFixed(2)} at "${tokens[maxIdx]?.token}"`, ox + 60, dy);
      };

      if (logprobTokensA) { renderStats(logprobTokensA, getSlotLabel("A"), PAD); dy += 20; }
      if (logprobTokensB) { renderStats(logprobTokensB, getSlotLabel("B"), PAD); dy += 20; }

      if (textA && textB) {
        const overlap = computeWordOverlap(textA, textB);
        const mA = computeTextMetrics(textA);
        const mB = computeTextMetrics(textB);
        dy += 6;
        ctx.fillStyle = "#64748b";
        ctx.fillText(`Jaccard: ${(overlap.jaccardSimilarity * 100).toFixed(1)}% · Word overlap: ${overlap.overlapPercentage.toFixed(1)}% · Shared: ${overlap.shared.length} · Unique A: ${overlap.uniqueA.length} · Unique B: ${overlap.uniqueB.length}`, PAD, dy);
        dy += 18;
        ctx.fillText(`Panel A: ${mA.wordCount} words, ${mA.sentenceCount} sentences, ${mA.avgSentenceLength.toFixed(0)} avg/sent, ${(mA.vocabularyDiversity * 100).toFixed(0)}% vocab diversity`, PAD, dy);
        dy += 18;
        ctx.fillText(`Panel B: ${mB.wordCount} words, ${mB.sentenceCount} sentences, ${mB.avgSentenceLength.toFixed(0)} avg/sent, ${(mB.vocabularyDiversity * 100).toFixed(0)}% vocab diversity`, PAD, dy);
      }

      // Divergence positions (top 10)
      if (logprobTokensA && logprobTokensB) {
        dy += 24;
        const minLen = Math.min(logprobTokensA.length, logprobTokensB.length);
        const diverge: string[] = [];
        for (let i = 0; i < minLen && diverge.length < 10; i++) {
          if (logprobTokensA[i].token !== logprobTokensB[i].token) {
            diverge.push(`${i + 1}: "${logprobTokensA[i].token}" vs "${logprobTokensB[i].token}"`);
          }
        }
        if (diverge.length > 0) {
          ctx.fillStyle = "#64748b";
          ctx.fillText(`Token divergences (first ${diverge.length}): ${diverge.join("  ·  ")}`, PAD, dy);
        }
      }
    }

    // Embed canvas into PDF via jsPDF
    const imgData = canvas.toDataURL("image/png");
    const { default: jsPDF } = await import("jspdf");
    // A4 landscape or auto-size to fit
    const aspect = canvas.height / canvas.width;
    const pdfW = 297; // mm A4 landscape width
    const pdfH = Math.max(210, pdfW * aspect);
    const doc = new jsPDF({ orientation: pdfW > pdfH ? "landscape" : "portrait", unit: "mm", format: [pdfW, pdfH] });
    doc.addImage(imgData, "PNG", 0, 0, pdfW, pdfW * aspect);
    doc.save(`${comparisonName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-probs.pdf`);
  }, [logprobTokensA, logprobTokensB, lastSentPrompt, getSlotLabel, comparisonName]);

  const exportProbsImage = useCallback(() => {
    const canvas = document.createElement("canvas");
    const W = 1600;
    canvas.width = W;
    const ctx = canvas.getContext("2d")!;
    const PAD = 28;
    const LINE_H = 30;
    const TOKEN_H = 22;
    const FONT = "15px Georgia, serif";
    const HEADER_FONT = "bold 12px system-ui, sans-serif";

    ctx.font = FONT;

    // Layout tokens into wrapped lines for a given panel width
    const layoutPanel = (tokens: TokenLogprob[], panelW: number) => {
      const lines: { token: TokenLogprob; w: number; x: number }[][] = [[]];
      let cx = 0;
      for (const tok of tokens) {
        const w = ctx.measureText(tok.token).width + 6;
        if (cx + w > panelW && cx > 0) { lines.push([]); cx = 0; }
        lines[lines.length - 1].push({ token: tok, w, x: cx });
        cx += w;
      }
      return lines;
    };

    const panelW = logprobTokensB ? (W - PAD * 3) / 2 : W - PAD * 2;
    const linesA = logprobTokensA ? layoutPanel(logprobTokensA, panelW) : [];
    const linesB = logprobTokensB ? layoutPanel(logprobTokensB, panelW) : [];
    const HEADER_H = 36;
    const totalH = PAD + HEADER_H + Math.max(linesA.length, linesB.length) * LINE_H + PAD + 28;
    canvas.height = Math.max(totalH, 200);

    // Background
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, canvas.height);

    const drawPanel = (tokens: TokenLogprob[], lines: { token: TokenLogprob; w: number; x: number }[][], ox: number, label: string) => {
      // Header
      ctx.font = HEADER_FONT;
      ctx.fillStyle = "#64748b";
      ctx.fillText(label, ox, PAD + 14);

      ctx.font = FONT;
      ctx.textBaseline = "middle";
      const startY = PAD + HEADER_H;
      for (const [li, line] of lines.entries()) {
        const y = startY + li * LINE_H;
        for (const { token: tok, w, x } of line) {
          const [bg, fg] = probsColorLight(tok.logprob);
          ctx.fillStyle = bg;
          ctx.fillRect(ox + x, y, w, TOKEN_H);
          ctx.fillStyle = fg;
          ctx.fillText(tok.token, ox + x + 3, y + TOKEN_H / 2);
        }
      }
    };

    if (logprobTokensA) drawPanel(logprobTokensA, linesA, PAD, getSlotLabel("A"));
    if (logprobTokensB) drawPanel(logprobTokensB, linesB, PAD + panelW + PAD, getSlotLabel("B"));

    // Legend — gradient bar
    const ly = canvas.height - PAD + 4;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.textBaseline = "middle";
    const gradW = 160;
    const gradH = 12;
    const gx = PAD + 80;
    ctx.fillText("Confidence:", PAD, ly);
    for (let px = 0; px < gradW; px++) {
      const t = px / gradW;
      const hue = Math.round(52 - 47 * t);
      const sat = Math.round(88 + 7 * t);
      const lit = Math.round(92 - 50 * t);
      const alpha = (0.18 + 0.82 * t).toFixed(2);
      ctx.fillStyle = `hsla(${hue},${sat}%,${lit}%,${alpha})`;
      ctx.fillRect(gx + px, ly - 6, 1, gradH);
    }
    ctx.fillStyle = "#64748b";
    ctx.fillText("high", gx - 28, ly);
    ctx.fillText("low", gx + gradW + 4, ly);
    ctx.fillText("≥70% = no colour", gx + gradW + 32, ly);

    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.download = `${comparisonName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}-probs.png`;
    a.href = url;
    a.click();
  }, [logprobTokensA, logprobTokensB, getSlotLabel, comparisonName]);

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
    // Reset probs-mode state so New doesn't leave the UI stuck showing
    // stale token heatmaps, nav cursors, or overlays from the previous run.
    setViewMode(null);
    setLogprobTokensA(null);
    setLogprobTokensB(null);
    setLogprobErrorA(null);
    setLogprobErrorB(null);
    setLogprobsLoading(false);
    setProbsNavIndex(null);
    setProbsSecondIndex(null);
    setProbsChipMode(null);
    setProbsChipCursor(0);
    setShowEntropyCurve(false);
    setShowPixelMap(false);
    setShowSkyline(false);
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

        {/* Export button — context-aware: opens probs export in probs mode, comparison export otherwise */}
        {(() => {
          const inProbsMode = viewMode === "probs" && (logprobTokensA || logprobTokensB);
          return (
            <button
              onClick={() => {
                if (inProbsMode) setShowProbsExport(true);
                else setShowExportModal(true);
              }}
              disabled={!hasContent}
              className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              title={inProbsMode ? "Export token probability data" : "Export comparison"}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{inProbsMode ? "Export Probs" : "Export"}</span>
            </button>
          );
        })()}

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

        {/* View augmentation buttons */}
        {(["diff", "struct", "tone"] as const).map((mode) => {
          const active = viewMode === mode;
          const icons = { diff: GitCompareArrows, struct: ListOrdered, tone: Activity };
          const labels = { diff: "Diff", struct: "Struct", tone: "Tone" };
          const titles = {
            diff: "Word-level diff between panels",
            struct: "Sentence structure + discourse markers",
            tone: "Hedging / confidence / negation register",
          };
          const Icon = icons[mode];
          return (
            <button
              key={mode}
              onClick={() => setViewMode(active ? null : mode)}
              disabled={(mode === "diff" && !hasBothOutputs) || (mode !== "diff" && !hasContent)}
              className={`px-2 py-1 text-caption flex items-center gap-1.5 rounded-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                active
                  ? "bg-burgundy/90 text-white dark:bg-burgundy/80 border border-transparent"
                  : "btn-editorial-ghost"
              }`}
              title={titles[mode]}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{active ? `${labels[mode]} On` : labels[mode]}</span>
            </button>
          );
        })}
        {/* Probs view button */}
        {(() => {
          const probsActive = viewMode === "probs";
          const logprobCapable = (p: string) => p === "google" || p === "openai";
          const aCapable = isSlotConfigured("A") && logprobCapable(slots.A.provider);
          const bCapable = isSlotConfigured("B") && logprobCapable(slots.B.provider);
          const anyCapable = aCapable || bCapable;
          return (
            <button
              onClick={() => {
                if (!anyCapable) { setShowLogprobsInfo(true); return; }
                if (probsActive) { setViewMode(null); return; }
                setViewMode("probs");
                if (!logprobTokensA && !logprobTokensB) fetchLogprobs();
              }}
              disabled={!hasContent && anyCapable}
              className={`px-2 py-1 text-caption flex items-center gap-1.5 rounded-sm transition-colors ${
                !anyCapable
                  ? "btn-editorial-ghost opacity-40"
                  : probsActive
                  ? "bg-burgundy/90 text-white dark:bg-burgundy/80 border border-transparent"
                  : "btn-editorial-ghost"
              }`}
              title={anyCapable ? "Token probability heatmap (Gemini / OpenAI)" : "Token probabilities require Gemini or OpenAI — click for details"}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>{probsActive ? "Probs On" : "Probs"}{logprobsLoading ? "…" : ""}</span>
            </button>
          );
        })()}

        {/* History — inline in toolbar */}
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

        <div className="flex-1" />
      </div>

      {/* Scrollable body: panels + deep dive extend downward */}
      <div className="flex-1 overflow-y-auto min-h-0">
      <div className="flex flex-col min-h-full">

      {/* Probs navigation strip */}
      {viewMode === "probs" && (logprobTokensA || logprobTokensB) && (
        <div className="px-3 py-1.5 border-b border-border bg-cream/20 flex items-center gap-2 text-caption">
          {/* Step buttons */}
          <button
            onClick={() => handleProbsStep(-1)}
            disabled={probsNavIndex === null || probsNavIndex <= 0}
            className="btn-editorial-ghost px-1.5 py-0.5 disabled:opacity-30"
            title="Previous token (←)"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[10px] text-muted-foreground min-w-[60px] text-center">
            {probsNavIndex !== null ? `${probsNavIndex + 1} / ${probsMaxIndex + 1}` : "— / —"}
          </span>
          <button
            onClick={() => handleProbsStep(1)}
            disabled={probsNavIndex === null || probsNavIndex >= probsMaxIndex}
            className="btn-editorial-ghost px-1.5 py-0.5 disabled:opacity-30"
            title="Next token (→)"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-parchment/60" />

          {/* Chip: Uncertain */}
          <button
            onClick={() => handleProbsChip("uncertain")}
            disabled={probsUncertainPositions.length === 0}
            className={`px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors disabled:opacity-30 ${
              probsChipMode === "uncertain"
                ? "bg-burgundy/90 text-white"
                : "btn-editorial-ghost"
            }`}
            title={`${probsUncertainPositions.length} positions sorted by entropy — click to cycle`}
          >
            Uncertain {probsChipMode === "uncertain" ? `(${probsChipCursor + 1}/${probsUncertainPositions.length})` : ""}
          </button>

          {/* Chip: Forks */}
          <button
            onClick={() => handleProbsChip("forks")}
            disabled={probsForkPositions.length === 0}
            className={`px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors disabled:opacity-30 ${
              probsChipMode === "forks"
                ? "bg-burgundy/90 text-white"
                : "btn-editorial-ghost"
            }`}
            title={`${probsForkPositions.length} positions where chosen token < 70% probability — click to cycle`}
          >
            Forks {probsChipMode === "forks" ? `(${probsChipCursor + 1}/${probsForkPositions.length})` : `(${probsForkPositions.length})`}
          </button>

          {/* Chip: Diverge — only when both panels have tokens */}
          {logprobTokensA && logprobTokensB && (
            <button
              onClick={() => handleProbsChip("diverge")}
              disabled={probsDivergePositions.length === 0}
              className={`px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors disabled:opacity-30 ${
                probsChipMode === "diverge"
                  ? "bg-burgundy/90 text-white"
                  : "btn-editorial-ghost"
              }`}
              title={`${probsDivergePositions.length} positions where A and B chose different tokens — click to cycle`}
            >
              ≠ Diverge {probsChipMode === "diverge" ? `(${probsChipCursor + 1}/${probsDivergePositions.length})` : `(${probsDivergePositions.length})`}
            </button>
          )}

          <div className="flex-1" />

          {/* Keyboard hint */}
          <span
            className="hidden lg:inline text-[10px] text-muted-foreground/60 font-mono mr-1"
            title="Use arrow keys to move the cursor · Home/End to jump to start/end"
          >
            ← → ↑ ↓
          </span>

          {/* Toggle: Entropy curve */}
          <button
            onClick={() => setShowEntropyCurve((v) => !v)}
            className={`px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors ${
              showEntropyCurve ? "bg-burgundy/90 text-white" : "btn-editorial-ghost"
            }`}
            title="Toggle entropy curve — shows uncertainty landscape across token position"
          >
            📈 Graph
          </button>

          {/* Toggle: Pixel map */}
          <button
            onClick={() => setShowPixelMap((v) => !v)}
            className={`px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors ${
              showPixelMap ? "bg-burgundy/90 text-white" : "btn-editorial-ghost"
            }`}
            title="Toggle bird's-eye pixel map — each token as a coloured cell"
          >
            🟨 Pixels
          </button>

          {/* Toggle: 3D Uncertainty Net */}
          <button
            onClick={() => setShowSkyline((v) => !v)}
            className={`px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors ${
              showSkyline ? "bg-burgundy/90 text-white" : "btn-editorial-ghost"
            }`}
            title="Toggle 3D uncertainty net — rotatable mesh surface where peaks are uncertain words"
          >
            🕸️ Net
          </button>
        </div>
      )}

      {/* Entropy curve band */}
      {viewMode === "probs" && showEntropyCurve && (logprobTokensA || logprobTokensB) && (
        <EntropyCurve
          tokensA={logprobTokensA}
          tokensB={logprobTokensB}
          divergePositions={probsDivergePositions}
          cursorIndex={probsNavIndex}
          onCursorChange={setProbsNavIndex}
          isDark={isDark}
        />
      )}

      {/* Pixel map band */}
      {viewMode === "probs" && showPixelMap && (logprobTokensA || logprobTokensB) && (
        <TokenPixelMap
          tokensA={logprobTokensA}
          tokensB={logprobTokensB}
          cursorIndex={probsNavIndex}
          onCursorChange={setProbsNavIndex}
          isDark={isDark}
        />
      )}

      {/* 3D Skyline band (lazy-loaded) */}
      {viewMode === "probs" && showSkyline && (logprobTokensA || logprobTokensB) && (
        <ProbabilitySkyline
          tokensA={logprobTokensA}
          tokensB={logprobTokensB}
          cursorIndex={probsNavIndex}
          onCursorChange={setProbsNavIndex}
          isDark={isDark}
        />
      )}

      {/* Dual panels */}
      <div className="flex flex-col md:flex-row flex-1">
        {(() => {
          const isLogprobCapable = (p: string) => p === "google" || p === "openai";
          const aCapable = isSlotConfigured("A") && isLogprobCapable(slots.A.provider);
          const bCapable = isSlotConfigured("B") && isLogprobCapable(slots.B.provider);
          return (
            <>
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
                viewMode={viewMode}
                diffSegments={diffResult?.segmentsA}
                diffUniqueCount={diffResult ? diffUniqueA : undefined}
                bodyScrollRef={diffScrollARef}
                logprobTokens={logprobTokensA ?? undefined}
                siblingTokens={logprobTokensB}
                controlledIndex={probsNavIndex}
                onControlledIndexChange={setProbsNavIndex}
                secondControlledIndex={probsSecondIndex}
                onSecondControlledIndexChange={setProbsSecondIndex}
                logprobsLoading={logprobsLoading}
                logprobCapable={aCapable}
                logprobError={logprobErrorA}
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
                viewMode={viewMode}
                diffSegments={diffResult?.segmentsB}
                diffUniqueCount={diffResult ? diffUniqueB : undefined}
                bodyScrollRef={diffScrollBRef}
                logprobTokens={logprobTokensB ?? undefined}
                siblingTokens={logprobTokensA}
                controlledIndex={probsNavIndex}
                onControlledIndexChange={setProbsNavIndex}
                secondControlledIndex={probsSecondIndex}
                onSecondControlledIndexChange={setProbsSecondIndex}
                logprobsLoading={logprobsLoading}
                logprobCapable={bCapable}
                logprobError={logprobErrorB}
              />
            </>
          );
        })()}
      </div>

      {/* Deep Dive: comparison analysis */}
      {hasBothOutputs && (() => {
        const textA = (resultA as { text: string }).text;
        const textB = (resultB as { text: string }).text;
        const metricsA = computeTextMetrics(textA);
        const metricsB = computeTextMetrics(textB);
        const overlap = computeWordOverlap(textA, textB);
        return (
          <div className="border-t border-border">
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

      {/* End min-h-full wrapper */}
      </div>

      {/* End scrollable body */}
      </div>

      {/* Prompt area */}
      <div className="border-t border-border bg-card shrink-0">
        {/* Collapse toggle strip */}
        <div className={`flex items-center border-b border-border/30 ${promptBouncing ? "prompt-toggle-bounce" : ""}`} onAnimationEnd={() => setPromptBouncing(false)}>
          {lastSentPrompt && (
            <button
              onClick={() => setShowPromptModal(true)}
              className="pl-3 pr-2 py-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 min-w-0 flex-1"
              title="View the full prompt that was sent to the models"
            >
              <Eye className="w-3 h-3 shrink-0" />
              <span className="font-mono truncate">{lastSentPrompt.slice(0, 80)}{lastSentPrompt.length > 80 ? "…" : ""}</span>
            </button>
          )}
          {!lastSentPrompt && <div className="flex-1" />}
          <button
            onClick={() => {
              if (promptCollapsed) {
                setPromptCollapsed(false);
              } else {
                setPromptCollapsed(true);
                setPromptBouncing(true);
              }
            }}
            className={`px-3 py-1 flex items-center gap-1 text-[10px] transition-colors shrink-0 ${
              promptCollapsed
                ? "text-burgundy hover:bg-burgundy/10"
                : "text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/20"
            }`}
            title={promptCollapsed ? "Show prompt" : "Hide prompt"}
          >
            {promptCollapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            promptCollapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
          }`}
        >
        <div className="overflow-hidden">
        <div className="px-3 py-2">
        <div className="flex gap-2 items-end">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter a prompt to send to both models…"
            className="input-editorial flex-1 resize-none min-h-[40px] max-h-[160px]"
            rows={1}
            disabled={isLoading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {/* Temperature control */}
          <div className="flex items-center gap-1.5 shrink-0 self-center">
            <span className="text-[10px] text-muted-foreground">t=</span>
            <select
              value={temperatureOverride !== null ? String(temperatureOverride) : ""}
              onChange={(e) => setTemperatureOverride(e.target.value === "" ? null : parseFloat(e.target.value))}
              className="text-[10px] border border-border rounded-sm px-1 py-0.5 bg-background text-foreground"
              title="Temperature override for this prompt (overrides slot settings)"
            >
              <option value="">default</option>
              <option value="0">0.0</option>
              <option value="0.3">0.3</option>
              <option value="0.7">0.7</option>
              <option value="1.0">1.0</option>
              <option value="1.5">1.5</option>
              <option value="2.0">2.0</option>
            </select>
          </div>
          <button
            onClick={() => handleSend()}
            disabled={!prompt.trim() || isLoading}
            className="btn-editorial-primary px-3 py-2 self-end disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        {!prompt.trim() && !isLoading && (
          <div className="mt-1.5">
            <DefaultPromptChips
              prompts={MODE_DEFAULTS.compare}
              onSelect={(p) => { setPrompt(p); handleSend(p); }}
              isLoading={isLoading}
            />
          </div>
        )}
        {error && (
          <div className="mt-1.5 text-caption text-red-500 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
        )}
        </div>
        </div>
        </div>
      </div>


      {/* BridgeKeeper Easter egg */}
      {showBridgeKeeper && (
        <BridgeKeeper onDismiss={() => setShowBridgeKeeper(false)} />
      )}

      {/* View Prompt modal */}
      {showPromptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPromptModal(false)}>
          <div className="bg-popover rounded-sm shadow-lg p-5 w-full max-w-lg border border-parchment mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-display-md font-bold text-foreground flex items-center gap-2">
                <Eye className="w-4 h-4 text-burgundy" />
                Last Sent Prompt
              </h2>
              <button onClick={() => setShowPromptModal(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              {temperatureOverride !== null && (
                <div className="text-[10px] text-muted-foreground bg-muted/30 rounded-sm px-2 py-1">
                  Temperature override: <span className="font-mono font-semibold text-foreground">{temperatureOverride}</span>
                </div>
              )}
              {/* System instruction */}
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">System instruction</div>
                <pre className="text-caption font-mono bg-muted/30 rounded-sm p-2 whitespace-pre-wrap text-muted-foreground text-[10px]">
                  {lastSentPrompt && (noMarkdown
                    ? "Respond in plain text only. Do not use any markdown formatting — no bold, italics, headers, bullet points, or code blocks."
                    : "(none)")}
                </pre>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">User prompt</div>
                <pre className="text-caption font-mono bg-muted/30 rounded-sm p-2 whitespace-pre-wrap text-foreground text-[11px] max-h-[300px] overflow-y-auto">
                  {lastSentPrompt}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Logprobs info modal */}
      {showLogprobsInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowLogprobsInfo(false)}>
          <div className="bg-popover rounded-sm shadow-lg p-5 w-full max-w-md border border-parchment mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-display-md font-bold text-foreground flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-burgundy" />
                Token Probabilities
              </h2>
              <button onClick={() => setShowLogprobsInfo(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3 text-caption text-muted-foreground leading-relaxed">
              <p>
                The <strong className="text-foreground">Probs</strong> view overlays a token probability heatmap on each panel.
                It re-runs the current prompt and returns the log-probability distribution at each token position,
                revealing where the model was confident and where it was genuinely uncertain.
              </p>
              <p>
                Token probabilities are only available from providers that expose log-probability data via their API:
              </p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong className="text-foreground">Google Gemini</strong> — supported on Gemini 2.0 Flash and most 1.5 models. <em>Not</em> supported on Gemini 2.5 models.</li>
                <li><strong className="text-foreground">OpenAI</strong> — supported on GPT-4o, GPT-4 Turbo, and most chat models.</li>
              </ul>
              <p>
                Anthropic (Claude), Ollama, and OpenAI-compatible endpoints do <em>not</em> expose token probabilities.
              </p>
              <div className="pt-2 border-t border-parchment/40">
                <p className="mb-2">To enable Probs view, configure Panel A or B to use a Gemini or OpenAI model:</p>
                <button
                  onClick={() => { setShowLogprobsInfo(false); setShowSettings(true); }}
                  className="btn-editorial-primary px-3 py-1.5 text-caption"
                >
                  Open Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Probs export modal */}
      {showProbsExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowProbsExport(false)}>
          <div className="bg-popover rounded-sm shadow-lg p-5 w-full max-w-sm border border-parchment mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-display-md font-bold text-foreground flex items-center gap-2">
                <Download className="w-4 h-4 text-burgundy" />
                Export Probabilities
              </h2>
              <button onClick={() => setShowProbsExport(false)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => { exportProbsPDF(); setShowProbsExport(false); }}
                className="w-full text-left px-4 py-3 rounded-sm border border-parchment/60 hover:bg-cream/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileType className="w-5 h-5 text-burgundy shrink-0" />
                  <div>
                    <div className="text-body-sm font-medium text-foreground">PDF snapshot</div>
                    <div className="text-caption text-muted-foreground">Heatmap with confidence gradient, prompt, and panel labels</div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { exportProbsImage(); setShowProbsExport(false); }}
                className="w-full text-left px-4 py-3 rounded-sm border border-parchment/60 hover:bg-cream/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileCode className="w-5 h-5 text-burgundy shrink-0" />
                  <div>
                    <div className="text-body-sm font-medium text-foreground">PNG image</div>
                    <div className="text-caption text-muted-foreground">High-resolution heatmap image for papers and presentations</div>
                  </div>
                </div>
              </button>
              <button
                onClick={() => { exportProbsJSON(); setShowProbsExport(false); }}
                className="w-full text-left px-4 py-3 rounded-sm border border-parchment/60 hover:bg-cream/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <FileJson className="w-5 h-5 text-burgundy shrink-0" />
                  <div>
                    <div className="text-body-sm font-medium text-foreground">JSON data</div>
                    <div className="text-caption text-muted-foreground">Per-token probabilities, entropy stats, deep dive metrics, and divergence positions</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

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
