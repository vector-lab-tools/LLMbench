/**
 * Sampling Probe — trace bundle + CSV export.
 *
 * The bundle format `vector-lab.sampling-trace.v1` packages the full trace
 * (prompt, params, all branches with every step's raw top-K distribution,
 * slot metadata) as a single JSON blob that downstream tools can re-play
 * without re-calling the provider.
 */

import type { SamplingTrace } from "./types";
import { resample } from "./resample";
import { entropyBits, surprisalBits, rankOf } from "./metrics";

export const TRACE_FORMAT = "vector-lab.sampling-trace.v1";

export function buildBundle(trace: SamplingTrace, version: string) {
  return {
    format: TRACE_FORMAT,
    generatedAt: new Date().toISOString(),
    source: { name: "llmbench", version, tool: "sampling-probe" },
    prompt: trace.prompt,
    params: trace.params,
    slots: trace.slots,
    branches: Object.values(trace.branches).map(b => ({
      id: b.id,
      parentId: b.parentId,
      forkStepIndex: b.forkStepIndex,
      forkChoice: b.forkChoice,
      panel: b.panel,
      label: b.label,
      steps: b.steps.map((s, i) => ({
        index: i,
        prefix: s.prefix,
        rawDistribution: s.rawDistribution,
        chosenToken: s.chosenToken,
        provenance: s.provenance,
      })),
    })),
  };
}

export function downloadBundle(trace: SamplingTrace, version: string): void {
  const blob = new Blob(
    [JSON.stringify(buildBundle(trace, version), null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `llmbench-sampling-trace-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- CSV helpers ------------------------------------------------------------

function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(header: string[], rows: unknown[][]): string {
  return [header.map(csvField).join(","), ...rows.map(r => r.map(csvField).join(","))].join("\n") + "\n";
}
function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * PDF report: a formatted, human-readable record of one Sampling Probe run.
 * Laid out as:
 *   Title + metadata
 *   Prompt
 *   Generated text (per branch, per panel)
 *   Per-step table: step, chosen token, rank, p, surprisal (bits), entropy (bits)
 *   Override log (if any)
 * Designed to be cite-able / printable as the artefact of a research session.
 */
export async function downloadTracePdf(
  trace: SamplingTrace, version: string
): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210, H = 297;
  const margin = 14;
  const maxW = W - 2 * margin;
  let y = margin;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const addPageIfNeeded = (needed: number) => {
    if (y + needed > H - margin) { doc.addPage(); y = margin; }
  };

  // Title
  doc.setFont("helvetica", "bold"); doc.setFontSize(14);
  doc.text("LLMbench — Sampling Probe trace", margin, y); y += 6;

  // Metadata
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  const metaLines = [
    `Generated: ${new Date().toLocaleString()}`,
    `LLMbench version: ${version}`,
    `Panel A: ${trace.slots.A ? `${trace.slots.A.provider} / ${trace.slots.A.model}` : "(not configured)"}`,
    `Panel B: ${trace.slots.B ? `${trace.slots.B.provider} / ${trace.slots.B.model}` : "(not configured)"}`,
    `Parameters: T=${trace.params.temperature}  top-p=${trace.params.topP}  top-K=${trace.params.topK}  maxSteps=${trace.params.maxSteps}`,
  ];
  for (const line of metaLines) { addPageIfNeeded(5); doc.text(line, margin, y); y += 4; }
  y += 2;

  // Prompt
  doc.setFont("helvetica", "bold"); doc.setFontSize(10);
  addPageIfNeeded(6); doc.text("Prompt", margin, y); y += 5;
  doc.setFont("courier", "normal"); doc.setFontSize(9);
  const promptLines = doc.splitTextToSize(trace.prompt, maxW);
  for (const line of promptLines) { addPageIfNeeded(4.5); doc.text(line, margin, y); y += 4; }
  y += 3;

  // Per-branch sections
  const branches = Object.values(trace.branches);
  for (const branch of branches) {
    const panelSlot = branch.panel === "A" ? trace.slots.A : trace.slots.B;
    const panelLabel = panelSlot ? `${panelSlot.provider} / ${panelSlot.model}` : branch.panel;

    // Section header
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    addPageIfNeeded(7);
    doc.text(`Branch: ${branch.label}  —  Panel ${branch.panel}  (${panelLabel})`, margin, y);
    y += 5;

    // Generated text
    const generated = trace.prompt + branch.steps.map(s => s.chosenToken).join("");
    doc.setFont("helvetica", "italic"); doc.setFontSize(8);
    addPageIfNeeded(4); doc.text(`${branch.steps.length} tokens`, margin, y); y += 4;
    doc.setFont("courier", "normal"); doc.setFontSize(9);
    const genLines = doc.splitTextToSize(generated, maxW);
    for (const line of genLines) { addPageIfNeeded(4.5); doc.text(line, margin, y); y += 4; }
    y += 2;

    // Metrics table
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    addPageIfNeeded(6); doc.text("Per-step metrics", margin, y); y += 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);

    // Column layout (mm from left margin): step, token, rank, p%, surprisal, entropy
    const colX = [margin, margin + 14, margin + 70, margin + 90, margin + 110, margin + 140];
    const headers = ["#", "chosen", "rank", "p", "surprisal", "H (bits)"];
    addPageIfNeeded(4);
    doc.setFont("helvetica", "bold");
    headers.forEach((h, i) => doc.text(h, colX[i], y));
    y += 3;
    doc.setFont("courier", "normal"); doc.setFontSize(7.5);

    const { temperature, topP } = trace.params;
    branch.steps.forEach((s, i) => {
      const dist = resample(s.rawDistribution, temperature, topP);
      const entry = dist.find(d => d.token === s.chosenToken);
      const p = entry?.softmaxP ?? 0;
      const rank = rankOf(s.chosenToken, dist);
      const surp = surprisalBits(p);
      const ent = entropyBits(dist);
      addPageIfNeeded(3.6);
      const tokenDisplay = JSON.stringify(s.chosenToken);
      const tokenTrim = tokenDisplay.length > 26 ? tokenDisplay.slice(0, 23) + "..." : tokenDisplay;
      doc.text(String(i + 1), colX[0], y);
      doc.text(tokenTrim, colX[1], y);
      doc.text(String(rank), colX[2], y);
      doc.text(`${(p * 100).toFixed(1)}%`, colX[3], y);
      doc.text(Number.isFinite(surp) ? surp.toFixed(2) : "—", colX[4], y);
      doc.text(ent.toFixed(2), colX[5], y);
      y += 3.5;
    });
    y += 3;

    // Overrides
    if (branch.overrides && branch.overrides.length > 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      addPageIfNeeded(6);
      doc.text(`Counterfactual overrides (${branch.overrides.length})`, margin, y); y += 4;
      doc.setFont("helvetica", "normal"); doc.setFontSize(8);
      for (const o of branch.overrides) {
        addPageIfNeeded(4);
        doc.text(`Step ${o.stepIndex + 1}: model chose ${JSON.stringify(o.from)}, user picked ${JSON.stringify(o.to)}`, margin, y);
        y += 4;
      }
      y += 2;
    }

    y += 3;
  }

  doc.save(`llmbench-sampling-trace-${stamp}.pdf`);
}

/** CSV: per-step entropy + surprisal + rank-of-chosen for a given branch. */
export function downloadTrajectoryCsv(trace: SamplingTrace, branchId: string): void {
  const branch = trace.branches[branchId];
  if (!branch) return;
  const { temperature, topP } = trace.params;
  const rows: unknown[][] = branch.steps.map((s, i) => {
    const dist = resample(s.rawDistribution, temperature, topP);
    const entry = dist.find(d => d.token === s.chosenToken);
    const p = entry?.softmaxP ?? 0;
    return [
      i,
      s.chosenToken,
      entropyBits(dist).toFixed(4),
      Number.isFinite(surprisalBits(p)) ? surprisalBits(p).toFixed(4) : "",
      rankOf(s.chosenToken, dist),
      p.toFixed(4),
    ];
  });
  downloadCsv(
    `llmbench-sampling-trajectory-${branch.label}.csv`,
    toCsv(
      ["step", "chosen_token", "entropy_bits", "surprisal_bits", "rank", "softmax_p"],
      rows
    )
  );
}
