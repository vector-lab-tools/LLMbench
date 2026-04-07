"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
import { BridgeKeeper, isBridgeKeeperPrompt } from "@/components/viz/BridgeKeeper";
import { KillerRabbit, isKillerRabbitPrompt } from "@/components/viz/KillerRabbit";
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
      ) : viewMode === "probs" && logprobTokens && logprobTokens.length > 0 ? (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <TokenHeatmap tokens={logprobTokens} isDark={isDark} />
        </div>
      ) : viewMode === "probs" && outputText !== null ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <p className="text-caption text-muted-foreground text-center">
            No token probability data for Panel {panel}.<br />
            Logprobs require Gemini or OpenAI models.
          </p>
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
  const [logprobsLoading, setLogprobsLoading] = useState(false);
  const [showLogprobsInfo, setShowLogprobsInfo] = useState(false);
  const [showBridgeKeeper, setShowBridgeKeeper] = useState(false);
  const [showKillerRabbit, setShowKillerRabbit] = useState(false);
  const [lastSentPrompt, setLastSentPrompt] = useState("");
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showProbsExport, setShowProbsExport] = useState(false);
  const [probsNavIndex, setProbsNavIndex] = useState<number | null>(null);
  const [probsSecondIndex, setProbsSecondIndex] = useState<number | null>(null);
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
    setProbsNavIndex(null);
    setProbsSecondIndex(null);
    setLastSentPrompt(effectivePrompt);
    if (isBridgeKeeperPrompt(effectivePrompt)) setShowBridgeKeeper(true);
    if (isKillerRabbitPrompt(effectivePrompt)) setShowKillerRabbit(true);
    dispatch(effectivePrompt, temperatureOverride !== null ? temperatureOverride : undefined);
    setPromptCollapsed(true);
    setPromptBouncing(true);
  };

  const fetchLogprobs = async () => {
    const effectivePrompt = prompt.trim();
    if (!effectivePrompt || logprobsLoading) return;
    setLogprobsLoading(true);
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
      if (data.A?.tokens?.length) setLogprobTokensA(data.A.tokens);
      if (data.B?.tokens?.length) setLogprobTokensB(data.B.tokens);
    } catch {
      // silently fail — panel will show "no data" message
    } finally {
      setLogprobsLoading(false);
    }
  };

  // ---- probs export helpers ----

  function probsColorLight(logprob: number): [string, string] {
    const u = Math.min(1, Math.abs(logprob) / 5);
    if (u < 0.1) return ["#f1f5f9", "#334155"];
    if (u < 0.3) return ["#dbeafe", "#334155"];
    if (u < 0.5) return ["#fef9c3", "#92400e"];
    if (u < 0.7) return ["#fed7aa", "#9a3412"];
    return ["#fecaca", "#991b1b"];
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
    const name = comparisonName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    downloadFile(JSON.stringify(payload, null, 2), `${name}-probs.json`, "application/json");
  }, [logprobTokensA, logprobTokensB, lastSentPrompt, getSlotLabel, comparisonName]);

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
    const totalH = PAD + HEADER_H + Math.max(linesA.length, linesB.length) * LINE_H + PAD + 32;
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

    // Legend
    const ly = canvas.height - PAD + 6;
    ctx.font = META_FONT;
    ctx.fillStyle = "#64748b";
    ctx.fillText("Confidence:", PAD, ly);
    const legendItems: [string, string][] = [["#f1f5f9", "High"], ["#fef9c3", "Medium"], ["#fecaca", "Low"]];
    let lx = PAD + 90;
    for (const [color, lbl] of legendItems) {
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - 7, 14, 14);
      ctx.fillStyle = "#64748b";
      ctx.fillText(lbl, lx + 18, ly);
      lx += 64;
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

    // Legend
    const ly = canvas.height - PAD + 4;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "#64748b";
    ctx.textBaseline = "middle";
    ctx.fillText("Confidence:", PAD, ly);
    const legendItems: [string, string][] = [["#f1f5f9", "High"], ["#fef9c3", "Medium"], ["#fecaca", "Low"]];
    let lx = PAD + 80;
    for (const [color, label] of legendItems) {
      ctx.fillStyle = color;
      ctx.fillRect(lx, ly - 6, 14, 12);
      ctx.fillStyle = "#64748b";
      ctx.fillText(label, lx + 18, ly);
      lx += 60;
    }

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

        {/* Probs export dropdown — only when probs data exists */}
        {(logprobTokensA || logprobTokensB) && viewMode === "probs" && (
          <div className="relative">
            <button
              onClick={() => setShowProbsExport(p => !p)}
              className="btn-editorial-ghost px-2 py-1 text-caption flex items-center gap-1.5"
              title="Export token probability data"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3" />
            </button>
            {showProbsExport && (
              <div className="absolute left-0 top-full mt-1 z-30 bg-popover border border-parchment rounded-sm shadow-lg min-w-[160px]"
                onMouseLeave={() => setShowProbsExport(false)}>
                <button onClick={() => { exportProbsPDF(); setShowProbsExport(false); }}
                  className="w-full text-left px-3 py-2 text-caption hover:bg-cream flex items-center gap-2">
                  <FileType className="w-3.5 h-3.5 text-burgundy" /> PDF snapshot
                </button>
                <button onClick={() => { exportProbsImage(); setShowProbsExport(false); }}
                  className="w-full text-left px-3 py-2 text-caption hover:bg-cream flex items-center gap-2">
                  <FileCode className="w-3.5 h-3.5 text-burgundy" /> PNG image
                </button>
                <button onClick={() => { exportProbsJSON(); setShowProbsExport(false); }}
                  className="w-full text-left px-3 py-2 text-caption hover:bg-cream flex items-center gap-2">
                  <FileJson className="w-3.5 h-3.5 text-burgundy" /> JSON data
                </button>
              </div>
            )}
          </div>
        )}

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

      {/* Scrollable body: panels + deep dive extend downward */}
      <div className="flex-1 overflow-y-auto min-h-0">
      <div className="flex flex-col min-h-full">

      {/* Dual panels */}
      <div className="flex flex-col md:flex-row flex-1">
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

      {/* Killer Rabbit Easter egg */}
      {showKillerRabbit && (
        <KillerRabbit onDismiss={() => setShowKillerRabbit(false)} />
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
