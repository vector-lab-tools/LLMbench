/**
 * Export utilities for LLMbench comparisons
 * Supports JSON, Markdown, plain text, and PDF export formats
 */

import type { SavedComparison } from "@/types";
import type { LineAnnotation } from "@/types";
import type { DiffSegment } from "@/lib/diff/word-diff";
import type { TokenLogprob } from "@/types/analysis";

/** Count words in a string */
function wordCount(text: string | undefined): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Export comparison as structured JSON
 */
export function exportAsJSON(comparison: SavedComparison): string {
  // Augment with computed word counts
  const augmented = {
    ...comparison,
    outputA: comparison.outputA
      ? { ...comparison.outputA, wordCount: wordCount(comparison.outputA.text) }
      : comparison.outputA,
    outputB: comparison.outputB
      ? { ...comparison.outputB, wordCount: wordCount(comparison.outputB.text) }
      : comparison.outputB,
  };
  return JSON.stringify(augmented, null, 2);
}

/**
 * Export comparison as Markdown document with inline annotations as footnotes
 */
export function exportAsMarkdown(comparison: SavedComparison): string {
  const lines: string[] = [];

  lines.push(`# ${comparison.name || "Untitled Comparison"}`);
  lines.push("");
  lines.push(`**Created:** ${new Date(comparison.createdAt).toLocaleDateString()}`);
  lines.push(`**Updated:** ${new Date(comparison.updatedAt).toLocaleDateString()}`);
  lines.push("");

  // Prompt
  lines.push("## Prompt");
  lines.push("");
  lines.push(comparison.prompt);
  lines.push("");

  // Model 1 (the PDF/Markdown is a publishable artefact, so we use
  // "Model 1/Model 2" in headers rather than the in-app "Panel A/Panel B"
  // affordance terminology).
  lines.push("---");
  lines.push("");
  lines.push("## Model 1");
  if (comparison.outputA?.provenance) {
    const p = comparison.outputA.provenance;
    lines.push("");
    const wc = wordCount(comparison.outputA?.text);
    lines.push(
      `**Model:** ${p.modelDisplayName} (${p.provider}) | **Temperature:** ${p.temperature} | **Response time:** ${(p.responseTimeMs / 1000).toFixed(1)}s | **Words:** ${wc.toLocaleString()}`
    );
  }
  lines.push("");
  if (comparison.outputA?.text) {
    lines.push(comparison.outputA.text);
  } else if (comparison.outputA?.error) {
    lines.push(`*Error: ${comparison.outputA.error}*`);
  }
  lines.push("");

  // Panel A annotations
  if (comparison.annotationsA.length > 0) {
    lines.push("### Annotations (Model 1)");
    lines.push("");
    for (const ann of comparison.annotationsA) {
      const lineRef = ann.endLineNumber
        ? `L${ann.lineNumber}-${ann.endLineNumber}`
        : `L${ann.lineNumber}`;
      lines.push(
        `- **[${ann.type.toUpperCase()}]** (${lineRef}): ${ann.content}`
      );
    }
    lines.push("");
  }

  // Model 2
  lines.push("---");
  lines.push("");
  lines.push("## Model 2");
  if (comparison.outputB?.provenance) {
    const p = comparison.outputB.provenance;
    lines.push("");
    const wc = wordCount(comparison.outputB?.text);
    lines.push(
      `**Model:** ${p.modelDisplayName} (${p.provider}) | **Temperature:** ${p.temperature} | **Response time:** ${(p.responseTimeMs / 1000).toFixed(1)}s | **Words:** ${wc.toLocaleString()}`
    );
  }
  lines.push("");
  if (comparison.outputB?.text) {
    lines.push(comparison.outputB.text);
  } else if (comparison.outputB?.error) {
    lines.push(`*Error: ${comparison.outputB.error}*`);
  }
  lines.push("");

  // Panel B annotations
  if (comparison.annotationsB.length > 0) {
    lines.push("### Annotations (Model 2)");
    lines.push("");
    for (const ann of comparison.annotationsB) {
      const lineRef = ann.endLineNumber
        ? `L${ann.lineNumber}-${ann.endLineNumber}`
        : `L${ann.lineNumber}`;
      lines.push(
        `- **[${ann.type.toUpperCase()}]** (${lineRef}): ${ann.content}`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("*Exported from LLMbench*");

  return lines.join("\n");
}

// ---------- annotation type prefix mapping ----------

const ANNOTATION_PREFIXES: Record<string, string> = {
  observation: "OBS",
  question: "Q",
  metaphor: "MET",
  pattern: "PAT",
  context: "CTX",
  critique: "CRT",
};

// ---------- plain text export ----------

function formatAnnotationsText(annotations: LineAnnotation[]): string {
  if (annotations.length === 0) return "";
  const lines: string[] = ["", "  Annotations:"];
  for (const ann of annotations) {
    const prefix = ANNOTATION_PREFIXES[ann.type] ?? ann.type.toUpperCase();
    const lineRef = ann.endLineNumber
      ? `L${ann.lineNumber}-${ann.endLineNumber}`
      : `L${ann.lineNumber}`;
    lines.push(`    [${prefix}] ${lineRef}: ${ann.content}`);
  }
  return lines.join("\n");
}

/**
 * Export comparison as formatted plain text
 */
export function exportAsText(comparison: SavedComparison): string {
  const bar = "\u2550".repeat(55);
  const dash = "\u2500".repeat(40);
  const lines: string[] = [];

  lines.push(bar);
  lines.push("LLMBENCH COMPARISON LOG");
  lines.push(bar);
  lines.push(`Comparison: ${comparison.name || "Untitled"}`);
  lines.push(`Created: ${new Date(comparison.createdAt).toLocaleString()}`);
  lines.push(`Prompt: ${comparison.prompt}`);
  lines.push("");

  // Model 1 (publication terminology \u2014 see Markdown export above)
  if (comparison.outputA?.provenance) {
    const p = comparison.outputA.provenance;
    const wc = wordCount(comparison.outputA?.text);
    lines.push(
      `MODEL 1 \u2014 ${p.modelDisplayName} (t=${p.temperature}, ${(p.responseTimeMs / 1000).toFixed(1)}s, ${wc.toLocaleString()} words)`
    );
  } else {
    lines.push("MODEL 1");
  }
  lines.push(dash);
  if (comparison.outputA?.text) {
    lines.push(comparison.outputA.text);
  } else if (comparison.outputA?.error) {
    lines.push(`[Error: ${comparison.outputA.error}]`);
  }
  lines.push(formatAnnotationsText(comparison.annotationsA));
  lines.push("");

  // Model 2
  if (comparison.outputB?.provenance) {
    const p = comparison.outputB.provenance;
    const wc = wordCount(comparison.outputB?.text);
    lines.push(
      `MODEL 2 \u2014 ${p.modelDisplayName} (t=${p.temperature}, ${(p.responseTimeMs / 1000).toFixed(1)}s, ${wc.toLocaleString()} words)`
    );
  } else {
    lines.push("MODEL 2");
  }
  lines.push(dash);
  if (comparison.outputB?.text) {
    lines.push(comparison.outputB.text);
  } else if (comparison.outputB?.error) {
    lines.push(`[Error: ${comparison.outputB.error}]`);
  }
  lines.push(formatAnnotationsText(comparison.annotationsB));
  lines.push("");

  lines.push(bar);
  lines.push("Exported from LLMbench");

  return lines.join("\n");
}

// ---------- PDF export ----------

// Annotation badge colours matching CCS-WB (RGB values)
const ANNOTATION_PDF_COLORS: Record<string, [number, number, number]> = {
  observation: [96, 165, 250],
  question: [251, 191, 36],
  metaphor: [192, 132, 252],
  pattern: [74, 222, 128],
  context: [148, 163, 184],
  critique: [157, 78, 89],
};

// Diff highlight colours for PDF (RGB)
const DIFF_REMOVED_COLOR: [number, number, number] = [180, 40, 40];
const DIFF_ADDED_COLOR: [number, number, number] = [30, 130, 50];
const DIFF_REMOVED_BG: [number, number, number] = [255, 230, 230];
const DIFF_ADDED_BG: [number, number, number] = [230, 255, 235];
const DIFF_COMMON_COLOR: [number, number, number] = [30, 30, 30];

export interface PdfDiffData {
  segmentsA: DiffSegment[];
  segmentsB: DiffSegment[];
}

export interface PdfLogprobsData {
  tokensA: TokenLogprob[] | null;
  tokensB: TokenLogprob[] | null;
}

/**
 * Convert a per-token logprob to a [bg, fg] RGB pair matching the in-app
 * Compare heatmap palette. The shape mirrors `probsColorLight` in
 * CompareMode: tokens above 70% probability get a near-white background,
 * uncertainty glides from pale yellow through orange to deep red as
 * probability drops. The palette is HSL in the UI; we convert to RGB
 * here because jsPDF's `setFillColor` only takes RGB.
 */
function probColorRgb(logprob: number): { bg: [number, number, number]; fg: [number, number, number] } {
  const prob = Math.exp(logprob);
  const THRESHOLD = 0.7;
  if (prob >= THRESHOLD) return { bg: [248, 250, 252], fg: [51, 65, 85] }; // near-white
  const t = Math.pow(1 - prob / THRESHOLD, 0.75);
  const hue = 52 - 47 * t;
  const sat = (88 + 7 * t) / 100;
  const lit = (92 - 50 * t) / 100;
  // HSL → RGB (per CSS Color Module 4). t=0 yields pale yellow, t=1 deep red.
  const a = sat * Math.min(lit, 1 - lit);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return lit - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  // Blend toward parchment by alpha so highlights aren't oversaturated;
  // alpha matches the in-app gradient of 0.18..1.0.
  const alpha = 0.18 + 0.82 * t;
  const PARCHMENT: [number, number, number] = [248, 245, 235];
  const r = Math.round((f(0) * 255) * alpha + PARCHMENT[0] * (1 - alpha));
  const g = Math.round((f(8) * 255) * alpha + PARCHMENT[1] * (1 - alpha));
  const b = Math.round((f(4) * 255) * alpha + PARCHMENT[2] * (1 - alpha));
  return { bg: [r, g, b], fg: t > 0.6 ? [26, 10, 10] : [51, 65, 85] };
}

/**
 * Export comparison as PDF document with side-by-side panels.
 * Uses landscape A4 for adequate column width.
 * Renders, in priority order: heatmap (when logprobs present) > diff
 * (when diff data present) > plain text. Heatmap and diff are
 * fundamentally different per-token colourings; rather than overlay them
 * (which compresses the signal of both), we pick the dominant view —
 * heatmap is the richer research artefact and takes priority. Annotations
 * always render below the columns regardless of view.
 */
export async function exportAsPDF(
  comparison: SavedComparison,
  diffData?: PdfDiffData,
  logprobsData?: PdfLogprobsData
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth(); // ~297
  const pageHeight = doc.internal.pageSize.getHeight(); // ~210
  const margin = 12;
  const gap = 6;
  const colWidth = (pageWidth - margin * 2 - gap) / 2;
  const colAx = margin;
  const colBx = margin + colWidth + gap;
  const textSize = 9;
  const lineH = 3.8;
  const bottomMargin = margin + 8;

  let y = margin;

  function newPage() {
    doc.addPage();
    y = margin;
  }

  function checkPage(needed: number) {
    if (y + needed > pageHeight - bottomMargin) {
      newPage();
    }
  }

  // ---- Title + metadata (full width) ----
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(comparison.name || "Untitled Comparison", margin, y);
  y += 7;

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  // View-mode tag: probs takes precedence over diff in the rendering
  // priority above, so it should also be the label here.
  const hasProbs = !!(logprobsData && (logprobsData.tokensA?.length || logprobsData.tokensB?.length));
  const viewLabel = hasProbs ? "  \u2022  Probs (token probability heatmap)"
    : diffData ? "  \u2022  Diff mode" : "";
  doc.text(
    `Created: ${new Date(comparison.createdAt).toLocaleString()}${viewLabel}`,
    margin,
    y
  );
  y += 5;

  // Prompt
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Prompt", margin, y);
  y += 5;
  doc.setFontSize(textSize);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  const fullWidth = pageWidth - margin * 2;
  const promptLines = doc.splitTextToSize(comparison.prompt, fullWidth);
  checkPage(promptLines.length * lineH + 4);
  doc.text(promptLines, margin, y);
  y += promptLines.length * lineH + 5;

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 3;

  // ---- Column headers ----
  function renderColumnHeader(
    x: number,
    label: string,
    output: SavedComparison["outputA"],
    tintColor: [number, number, number]
  ) {
    // Tinted background
    doc.setFillColor(tintColor[0], tintColor[1], tintColor[2]);
    doc.rect(x, y - 0.5, colWidth, 6, "F");

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    let header = label;
    if (output?.provenance) {
      const p = output.provenance;
      header += ` \u2014 ${p.modelDisplayName}`;
    }
    doc.text(header, x + 2, y + 3.5);

    if (output?.provenance) {
      const p = output.provenance;
      const wc = wordCount(output?.text);
      const meta = `${wc.toLocaleString()} words  t=${p.temperature}  ${(p.responseTimeMs / 1000).toFixed(1)}s`;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(meta, x + colWidth - 2, y + 3.5, { align: "right" });
    }
  }

  // The exported PDF is a publishable artefact, not an internal screen.
  // "Panel A / Panel B" are LLMbench-app affordances; in the PDF use
  // "Model 1 / Model 2" so a cold reader of the document — reviewer,
  // co-author, citation context — sees what each column is on its own
  // terms. The model display names follow on the same header line.
  const headerY = y;
  renderColumnHeader(colAx, "Model 1", comparison.outputA, [235, 240, 255]);
  y = headerY;
  renderColumnHeader(colBx, "Model 2", comparison.outputB, [255, 248, 235]);
  y += 8;

  // ---- Render text in columns ----

  // Pre-split both panels into wrapped lines (or diff-coloured word chunks)
  doc.setFontSize(textSize);
  doc.setFont("helvetica", "normal");

  /**
   * Render plain text in a column, returning final y position.
   */
  function renderPlainColumn(
    x: number,
    startY: number,
    text: string
  ): number {
    const lines = doc.splitTextToSize(text, colWidth - 4);
    let cy = startY;
    for (const line of lines) {
      if (cy + lineH > pageHeight - bottomMargin) {
        newPage();
        cy = y;
      }
      doc.setTextColor(30, 30, 30);
      doc.text(line, x + 2, cy);
      cy += lineH;
    }
    return cy;
  }

  /**
   * Render diff-highlighted text in a column using word-by-word
   * positioning with coloured backgrounds for unique segments.
   */
  function renderDiffColumn(
    x: number,
    startY: number,
    segments: DiffSegment[],
    uniqueType: "removed" | "added"
  ): number {
    const colLeft = x + 2;
    const colRight = x + colWidth - 2;
    let cx = colLeft;
    let cy = startY;

    const uniqueColor = uniqueType === "removed" ? DIFF_REMOVED_COLOR : DIFF_ADDED_COLOR;
    const uniqueBg = uniqueType === "removed" ? DIFF_REMOVED_BG : DIFF_ADDED_BG;

    for (const seg of segments) {
      // Split segment into words preserving whitespace
      const tokens = seg.text.split(/(\s+)/);
      for (const token of tokens) {
        if (token.length === 0) continue;

        // Handle newlines
        if (/\n/.test(token)) {
          const nlCount = (token.match(/\n/g) || []).length;
          for (let n = 0; n < nlCount; n++) {
            cy += lineH;
            cx = colLeft;
            if (cy > pageHeight - bottomMargin) {
              newPage();
              cy = y;
            }
          }
          continue;
        }

        const tw = doc.getTextWidth(token);

        // Wrap if needed (but not for pure whitespace)
        if (cx + tw > colRight && token.trim().length > 0) {
          cy += lineH;
          cx = colLeft;
          if (cy > pageHeight - bottomMargin) {
            newPage();
            cy = y;
          }
          // Skip leading whitespace on new line
          if (token.trim().length === 0) continue;
        }

        if (seg.type === uniqueType) {
          // Draw background highlight
          doc.setFillColor(uniqueBg[0], uniqueBg[1], uniqueBg[2]);
          doc.rect(cx - 0.2, cy - 3, tw + 0.4, lineH + 0.2, "F");
          doc.setTextColor(uniqueColor[0], uniqueColor[1], uniqueColor[2]);
        } else {
          doc.setTextColor(DIFF_COMMON_COLOR[0], DIFF_COMMON_COLOR[1], DIFF_COMMON_COLOR[2]);
        }

        doc.text(token, cx, cy);
        cx += tw;
      }
    }

    return cy + lineH;
  }

  /**
   * Render a token-probability heatmap in a column. Each token gets a
   * background fill matching its softmax probability (high-confidence
   * tokens parchment-pale, low-confidence tokens deep burgundy/red), so
   * the same heatmap that lives in the in-app Probs view appears in the
   * exported document. Wraps token-by-token, preserving whitespace; the
   * raw token strings are joined directly so the rendered text matches
   * the model's response verbatim (no synthetic spacing).
   */
  function renderHeatmapColumn(
    x: number,
    startY: number,
    tokens: TokenLogprob[]
  ): number {
    const colLeft = x + 2;
    const colRight = x + colWidth - 2;
    let cx = colLeft;
    let cy = startY;
    const cellPad = 0.3;

    for (const tok of tokens) {
      // Newlines: don't draw a fill for them, just advance the cursor.
      if (/\n/.test(tok.token)) {
        const nlCount = (tok.token.match(/\n/g) || []).length;
        for (let n = 0; n < nlCount; n++) {
          cy += lineH;
          cx = colLeft;
          if (cy > pageHeight - bottomMargin) { newPage(); cy = y; }
        }
        // Render any remainder after the trailing newline as text.
        const rest = tok.token.replace(/\n/g, "");
        if (rest.length === 0) continue;
        const tw = doc.getTextWidth(rest);
        const { bg, fg } = probColorRgb(tok.logprob);
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(cx - cellPad, cy - 3, tw + cellPad * 2, lineH + 0.2, "F");
        doc.setTextColor(fg[0], fg[1], fg[2]);
        doc.text(rest, cx, cy);
        cx += tw;
        continue;
      }

      const tw = doc.getTextWidth(tok.token);
      // Wrap if needed (skip pure-whitespace fills at the start of a new line).
      if (cx + tw > colRight && tok.token.trim().length > 0) {
        cy += lineH;
        cx = colLeft;
        if (cy > pageHeight - bottomMargin) { newPage(); cy = y; }
      }
      const { bg, fg } = probColorRgb(tok.logprob);
      // Only draw the fill for non-whitespace tokens — a coloured bar of
      // pure whitespace looks like a missing-image artefact rather than
      // a confidence cue.
      if (tok.token.trim().length > 0) {
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.rect(cx - cellPad, cy - 3, tw + cellPad * 2, lineH + 0.2, "F");
      }
      doc.setTextColor(fg[0], fg[1], fg[2]);
      doc.text(tok.token, cx, cy);
      cx += tw;
    }
    return cy + lineH;
  }

  // Render both columns in parallel, tracking y per column. Priority:
  // heatmap (when probs available for that side) → diff → plain text.
  const textStartY = y;
  let yA = textStartY;
  let yB = textStartY;

  if (comparison.outputA?.text) {
    if (logprobsData?.tokensA?.length) {
      yA = renderHeatmapColumn(colAx, textStartY, logprobsData.tokensA);
    } else if (diffData) {
      yA = renderDiffColumn(colAx, textStartY, diffData.segmentsA, "removed");
    } else {
      yA = renderPlainColumn(colAx, textStartY, comparison.outputA.text);
    }
  } else if (comparison.outputA?.error) {
    doc.setTextColor(200, 0, 0);
    doc.text(`Error: ${comparison.outputA.error}`, colAx + 2, textStartY);
    yA = textStartY + lineH;
  }

  if (comparison.outputB?.text) {
    if (logprobsData?.tokensB?.length) {
      yB = renderHeatmapColumn(colBx, textStartY, logprobsData.tokensB);
    } else if (diffData) {
      yB = renderDiffColumn(colBx, textStartY, diffData.segmentsB, "added");
    } else {
      yB = renderPlainColumn(colBx, textStartY, comparison.outputB.text);
    }
  } else if (comparison.outputB?.error) {
    doc.setTextColor(200, 0, 0);
    doc.text(`Error: ${comparison.outputB.error}`, colBx + 2, textStartY);
    yB = textStartY + lineH;
  }

  y = Math.max(yA, yB) + 5;

  // Heatmap legend — a small horizontal gradient so anyone reading the
  // PDF cold knows what the colours mean. Renders only when at least one
  // panel has probs data; takes one short row above the annotations.
  if (hasProbs) {
    checkPage(8);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("Heatmap: ", margin, y + 3);
    const labelW = doc.getTextWidth("Heatmap: ");
    const barX = margin + labelW + 1;
    const barW = 60;
    const barH = 3;
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      // Sample logprob across the THRESHOLD-based gradient so the legend
      // matches the in-app palette.
      const prob = 0.005 + ((1 - 0.005) * (steps - 1 - i)) / (steps - 1);
      const { bg } = probColorRgb(Math.log(prob));
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(barX + (i * barW) / steps, y, barW / steps + 0.05, barH, "F");
    }
    doc.setTextColor(120, 120, 120);
    doc.text("high confidence", barX + barW + 2, y + 3);
    const highW = doc.getTextWidth("high confidence");
    doc.text("→", barX + barW + 2 + highW + 1, y + 3);
    doc.text("low confidence", barX + barW + 2 + highW + 6, y + 3);
    y += 7;
  }

  // ---- Annotations (below both columns, full width per panel) ----
  function renderAnnotations(
    label: string,
    annotations: LineAnnotation[],
    x: number,
    width: number
  ) {
    if (annotations.length === 0) return;
    checkPage(10);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(`${label} Annotations`, x, y);
    y += 4;

    for (const ann of annotations) {
      checkPage(8);
      const prefix = ANNOTATION_PREFIXES[ann.type] ?? ann.type.toUpperCase();
      const lineRef = ann.endLineNumber
        ? `L${ann.lineNumber}-${ann.endLineNumber}`
        : `L${ann.lineNumber}`;
      const color = ANNOTATION_PDF_COLORS[ann.type] ?? [100, 100, 100];

      // Badge
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(x, y - 2.5, 9, 4, 1, 1, "F");
      doc.setFontSize(6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(255, 255, 255);
      doc.text(prefix, x + 0.8, y + 0.3);

      // Content
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80, 80, 80);
      const annText = `${lineRef}: ${ann.content}`;
      const annLines = doc.splitTextToSize(annText, width - 12);
      doc.text(annLines, x + 11, y + 0.3);
      y += annLines.length * 3.5 + 1.5;
    }
    y += 3;
  }

  renderAnnotations("Model 1", comparison.annotationsA, colAx, colWidth);
  renderAnnotations("Model 2", comparison.annotationsB, colBx, colWidth);

  // Footer
  checkPage(8);
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(150, 150, 150);
  doc.text("Exported from LLMbench", margin, pageHeight - margin);

  // Download
  const filename = `${(comparison.name || "comparison").replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf`;
  doc.save(filename);
}

/**
 * Trigger a file download in the browser
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
