/**
 * Grammar Probe — aggregation helpers for the research-grade Deep Dive.
 *
 * Pure functions that roll up a set of generated-prose runs against a set of
 * patterns into the structures the Deep Dive charts consume. Kept separate
 * from the React component so they can be unit-tested and reused by Phase E
 * and (later) the bundle export.
 */

import type { GrammarPattern } from "./patterns";
import { countMatches, findMatchSpans, type MatchSpan } from "./patterns";

export interface MultiCountedRun {
  runIndex: number;
  panel: "A" | "B";
  promptId: string;
  register?: string;
  prompt: string;
  temperature: number;
  text: string | null;
  error: string | null;
  /** patternId → hit count in this run's text. */
  perPatternHits: Record<string, number>;
  /** patternId → match spans (capped). */
  perPatternSpans: Record<string, MatchSpan[]>;
}

/** Apply every pattern in `patterns` to every run's text, returning a
 *  parallel structure with per-pattern counts and spans. Runs without text
 *  yield zero counts for every pattern. */
export function countMultiPattern<R extends {
  runIndex: number; panel: "A" | "B"; promptId: string; prompt: string;
  temperature: number; register?: string; text?: string; error?: string;
}>(runs: R[], patterns: GrammarPattern[]): MultiCountedRun[] {
  return runs.map(r => {
    const perPatternHits: Record<string, number> = {};
    const perPatternSpans: Record<string, MatchSpan[]> = {};
    for (const p of patterns) {
      perPatternHits[p.id] = r.text ? countMatches(r.text, p) : 0;
      perPatternSpans[p.id] = r.text ? findMatchSpans(r.text, p, 20) : [];
    }
    return {
      runIndex: r.runIndex,
      panel: r.panel,
      promptId: r.promptId,
      register: r.register,
      prompt: r.prompt,
      temperature: r.temperature,
      text: r.text ?? null,
      error: r.error ?? null,
      perPatternHits,
      perPatternSpans,
    };
  });
}

export interface RateCell {
  runs: number;
  runsWithHit: number;
  totalHits: number;
  hitRate: number;          // runsWithHit / runs
  avgHitsPerRun: number;    // totalHits / runs
}

export function emptyCell(): RateCell {
  return { runs: 0, runsWithHit: 0, totalHits: 0, hitRate: 0, avgHitsPerRun: 0 };
}

function accumulate(cell: RateCell, hits: number): RateCell {
  const runs = cell.runs + 1;
  const runsWithHit = cell.runsWithHit + (hits > 0 ? 1 : 0);
  const totalHits = cell.totalHits + hits;
  return {
    runs,
    runsWithHit,
    totalHits,
    hitRate: runsWithHit / runs,
    avgHitsPerRun: totalHits / runs,
  };
}

/** Aggregate per-(pattern × panel × temperature). Keyed by
 *  `${patternId}::${panel}::${temperature}`. Only runs with text are counted. */
export function aggregateByPatternPanelTemp(
  runs: MultiCountedRun[],
  patterns: GrammarPattern[]
): Map<string, RateCell> {
  const out = new Map<string, RateCell>();
  for (const r of runs) {
    if (!r.text) continue;
    for (const p of patterns) {
      const key = `${p.id}::${r.panel}::${r.temperature}`;
      out.set(key, accumulate(out.get(key) ?? emptyCell(), r.perPatternHits[p.id] || 0));
    }
  }
  return out;
}

/** Aggregate per-(pattern × register). Only runs with a register are counted. */
export function aggregateByPatternRegister(
  runs: MultiCountedRun[],
  patterns: GrammarPattern[]
): Map<string, RateCell> {
  const out = new Map<string, RateCell>();
  for (const r of runs) {
    if (!r.text || !r.register) continue;
    for (const p of patterns) {
      const key = `${p.id}::${r.register}`;
      out.set(key, accumulate(out.get(key) ?? emptyCell(), r.perPatternHits[p.id] || 0));
    }
  }
  return out;
}

/** Histogram of hits-per-run for each pattern. Returns counts for bins
 *  0, 1, 2, 3, 4, 5+. Runs with no text are excluded. */
export function hitsHistogram(
  runs: MultiCountedRun[],
  patterns: GrammarPattern[]
): Map<string, number[]> {
  const BINS = 6; // 0, 1, 2, 3, 4, 5+
  const out = new Map<string, number[]>();
  for (const p of patterns) out.set(p.id, new Array(BINS).fill(0));
  for (const r of runs) {
    if (!r.text) continue;
    for (const p of patterns) {
      const n = r.perPatternHits[p.id] || 0;
      const bin = Math.min(n, BINS - 1);
      const arr = out.get(p.id)!;
      arr[bin]++;
    }
  }
  return out;
}

/** Co-occurrence matrix: cell[i][j] = among runs where pattern i fires at
 *  least once, the fraction where pattern j also fires. Diagonal = 1 where
 *  defined; NaN where pattern i never fired. */
export function coOccurrenceMatrix(
  runs: MultiCountedRun[],
  patterns: GrammarPattern[]
): { matrix: number[][]; supportI: number[] } {
  const n = patterns.length;
  const matrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const counts: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const supportI: number[] = new Array(n).fill(0);

  for (const r of runs) {
    if (!r.text) continue;
    const firing = patterns.map(p => (r.perPatternHits[p.id] || 0) > 0);
    for (let i = 0; i < n; i++) {
      if (!firing[i]) continue;
      supportI[i]++;
      for (let j = 0; j < n; j++) {
        if (firing[j]) counts[i][j]++;
      }
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      matrix[i][j] = supportI[i] === 0 ? NaN : counts[i][j] / supportI[i];
    }
  }
  return { matrix, supportI };
}

/** Convert a numeric hit rate to a 3-decimal string or "n/a". */
export function formatRate(v: number): string {
  if (!Number.isFinite(v)) return "n/a";
  return (v * 100).toFixed(1) + "%";
}

/** CSV escape a single field. */
function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV string from a header row and a list of rows. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvField).join(",")];
  for (const row of rows) lines.push(row.map(csvField).join(","));
  return lines.join("\n") + "\n";
}

/** Trigger a browser download for a string of CSV. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
