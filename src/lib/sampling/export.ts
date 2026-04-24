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
import { entropyBits, surprisalBits, rankOf, jaccard, klDivergenceBits } from "./metrics";

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
  trace: SamplingTrace,
  version: string,
  traceB?: SamplingTrace | null,
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
    `Panel B: ${traceB?.slots.B ? `${traceB.slots.B.provider} / ${traceB.slots.B.model}` : (trace.slots.B ? `${trace.slots.B.provider} / ${trace.slots.B.model}` : "(not configured)")}`,
    `Parameters: T=${trace.params.temperature}  top-p=${trace.params.topP}  top-K=${trace.params.topK}  maxSteps=${trace.params.maxSteps}`,
    traceB ? `Dual-panel run: Panel A + Panel B lockstep against shared prefix` : `Single-panel run: Panel A only`,
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

  // Iterate branches from both traces. Tag each branch with the panel it
  // belongs to so the per-branch header stays unambiguous in dual-panel
  // reports (otherwise "branch main" would appear twice, once per panel).
  const panelBranches: { panel: "A" | "B"; trace: SamplingTrace; branch: SamplingTrace["branches"][string] }[] = [];
  for (const b of Object.values(trace.branches)) panelBranches.push({ panel: "A", trace, branch: b });
  if (traceB) {
    for (const b of Object.values(traceB.branches)) panelBranches.push({ panel: "B", trace: traceB, branch: b });
  }

  for (const { panel, trace: ownerTrace, branch } of panelBranches) {
    const panelSlot = panel === "A" ? ownerTrace.slots.A : ownerTrace.slots.B;
    const panelLabel = panelSlot ? `${panelSlot.provider} / ${panelSlot.model}` : panel;

    // Section header
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    addPageIfNeeded(7);
    doc.text(`Panel ${panel} (${panelLabel}) — branch: ${branch.label}`, margin, y);
    y += 5;

    // Generated text
    const generated = ownerTrace.prompt + branch.steps.map(s => s.chosenToken).join("");
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

    const { temperature, topP } = ownerTrace.params;
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

    // Rank-of-chosen histogram for this branch — replicates the Deep Dive
    // view in the app. Bins: rank 0, ≤1, ≤2, ≤3, ≤4, ≤5, ≤10, ≤20, >20.
    const rankBins = [0, 1, 2, 3, 4, 5, 10, 20, 50];
    const binLabels = ["rank 0", "≤1", "≤2", "≤3", "≤4", "≤5", "≤10", "≤20", ">20"];
    const hist = new Array(rankBins.length).fill(0);
    for (const s of branch.steps) {
      const d = resample(s.rawDistribution, temperature, topP);
      const r = rankOf(s.chosenToken, d);
      if (r < 0) { hist[hist.length - 1]++; continue; }
      let placed = false;
      for (let i = 0; i < rankBins.length - 1; i++) {
        if (r <= rankBins[i]) { hist[i]++; placed = true; break; }
      }
      if (!placed) hist[hist.length - 1]++;
    }
    const maxBin = Math.max(1, ...hist);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    addPageIfNeeded(6);
    doc.text("Rank-of-chosen histogram", margin, y); y += 4;
    doc.setFont("courier", "normal"); doc.setFontSize(7.5);
    hist.forEach((n, i) => {
      addPageIfNeeded(3.6);
      const barWidth = (n / maxBin) * 90; // mm
      doc.text(binLabels[i].padEnd(8, " "), margin, y);
      doc.setFillColor(155, 43, 59); // burgundy
      if (barWidth > 0.01) doc.rect(margin + 22, y - 2.5, barWidth, 2.5, "F");
      doc.text(String(n), margin + 22 + 92, y);
      y += 3.5;
    });
    y += 3;

    y += 3;
  }

  // Dual-panel divergence: per-step Jaccard + KL(A‖B), marking the steps
  // where the two models chose different tokens. Mirrors the Deep Dive
  // divergence table in the app so the PDF carries the full comparative
  // record rather than just Panel A.
  if (traceB) {
    const branchA = Object.values(trace.branches)[0];
    const branchB = Object.values(traceB.branches)[0];
    if (branchA && branchB) {
      const n = Math.min(branchA.steps.length, branchB.steps.length);
      if (n > 0) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(11);
        addPageIfNeeded(7);
        doc.text("A/B divergence (per-step)", margin, y); y += 5;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        addPageIfNeeded(4);
        doc.text(
          "Jaccard = top-K token-set overlap. KL(A‖B) in bits, ε-smoothed on intersection. ● = A and B chose different tokens.",
          margin, y
        ); y += 5;
        const colX = [margin, margin + 16, margin + 46, margin + 76, margin + 106];
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
        ["step", "chosen A", "chosen B", "Jaccard", "KL (bits)"].forEach((h, i) => doc.text(h, colX[i], y));
        y += 3;
        doc.setFont("courier", "normal"); doc.setFontSize(7.5);
        const { temperature: tA, topP: pA } = trace.params;
        const { temperature: tB, topP: pB } = traceB.params;
        let disagreements = 0;
        for (let i = 0; i < n; i++) {
          const dA = resample(branchA.steps[i].rawDistribution, tA, pA);
          const dB = resample(branchB.steps[i].rawDistribution, tB, pB);
          const j = jaccard(dA, dB);
          const kl = klDivergenceBits(dA, dB);
          const aTok = branchA.steps[i].chosenToken;
          const bTok = branchB.steps[i].chosenToken;
          const disagree = aTok !== bTok;
          if (disagree) disagreements++;
          addPageIfNeeded(3.6);
          const trim = (s: string) => {
            const q = JSON.stringify(s);
            return q.length > 14 ? q.slice(0, 13) + "..." : q;
          };
          doc.text(`${i + 1}${disagree ? " ●" : ""}`, colX[0], y);
          doc.text(trim(aTok), colX[1], y);
          doc.text(trim(bTok), colX[2], y);
          doc.text(`${(j * 100).toFixed(1)}%`, colX[3], y);
          doc.text(Number.isFinite(kl) ? kl.toFixed(2) : "—", colX[4], y);
          y += 3.5;
        }
        y += 2;
        doc.setFont("helvetica", "italic"); doc.setFontSize(8);
        addPageIfNeeded(4);
        doc.text(`${disagreements} of ${n} steps showed token-level disagreement (${((disagreements / n) * 100).toFixed(1)}%).`, margin, y);
        y += 5;
      }
    }
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
