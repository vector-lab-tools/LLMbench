/**
 * Grammar Probe — geometry helpers.
 *
 * Pure, dependency-free functions used by the Phase B "geometry" view:
 *
 *   - extractX(scaffold, pattern)  →  the pattern's X term if the pattern
 *                                     has an xExtractor regex and it matches
 *   - cosine(a, b)                  →  cosine similarity of two vectors
 *   - spearman(xs, ys)              →  Spearman rank correlation
 *   - ranks(values)                 →  average-rank vector (stable on ties)
 */

import type { GrammarPattern } from "./patterns";

/** Return the X span of a scaffold under a pattern, or null when not
 *  extractable. Case-insensitive. */
export function extractX(scaffold: string, pattern: GrammarPattern): string | null {
  if (!pattern.xExtractor) return null;
  try {
    const re = new RegExp(pattern.xExtractor, "i");
    const m = scaffold.match(re);
    if (!m || !m[1]) return null;
    const captured = m[1].trim();
    // Strip a leading article so "a system of government" and
    // "system of government" collapse to the same X. The article is
    // rhetorical filler, not semantic content — and keeping it asymmetrically
    // on X but not on Y-phrases would bias cosines.
    return captured.replace(/^(?:a|an|the)\s+/i, "").trim() || null;
  } catch {
    return null;
  }
}

/** Cosine similarity. Returns 0 for zero-magnitude vectors. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Average-rank vector. Handles ties by averaging their rank positions. */
export function ranks(values: number[]): number[] {
  const n = values.length;
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + j) / 2 + 1; // ranks 1-based
    for (let k = i; k <= j; k++) out[indexed[k].i] = avg;
    i = j + 1;
  }
  return out;
}

/**
 * Spearman rank correlation between two parallel numeric series.
 * Returns null when input is too short or has zero variance in either side.
 */
export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) return null;
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = rx.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx) * Math.sqrt(dy);
  if (denom === 0) return null;
  return num / denom;
}
