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
