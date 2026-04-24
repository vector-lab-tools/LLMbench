/**
 * Sampling Probe — information-theoretic metrics.
 *
 * All operate on softmax-normalised probability distributions. Entropy and
 * surprisal are in bits (log base 2). Jaccard is on token sets. KL uses
 * natural log + ε smoothing on the intersection so a missing token doesn't
 * blow up to infinity.
 */

import type { SamplingToken } from "./types";

/** Shannon entropy over a distribution, in bits. */
export function entropyBits(dist: { softmaxP: number }[]): number {
  let h = 0;
  for (const d of dist) {
    if (d.softmaxP > 0) h += -d.softmaxP * Math.log2(d.softmaxP);
  }
  return h;
}

/** Surprisal of a chosen token, in bits. Returns NaN for p=0. */
export function surprisalBits(p: number): number {
  if (!(p > 0)) return NaN;
  return -Math.log2(p);
}

/** Mean surprisal across a list of steps, treating NaN as skipped. */
export function meanSurprisal(surprisals: number[]): number {
  const valid = surprisals.filter(x => Number.isFinite(x));
  if (valid.length === 0) return NaN;
  return valid.reduce((s, v) => s + v, 0) / valid.length;
}

/** Perplexity = 2^(mean surprisal). */
export function perplexity(surprisals: number[]): number {
  const m = meanSurprisal(surprisals);
  return Number.isFinite(m) ? Math.pow(2, m) : NaN;
}

/** Jaccard similarity over token sets from two distributions. */
export function jaccard(a: SamplingToken[], b: SamplingToken[]): number {
  const sa = new Set(a.map(t => t.token));
  const sb = new Set(b.map(t => t.token));
  if (sa.size === 0 && sb.size === 0) return 1;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/**
 * KL(a‖b) in bits on the token intersection. Tokens present in a but not b
 * (or vice versa) are zero-padded with ε. Returns NaN if intersection is
 * empty.
 */
export function klDivergenceBits(
  a: SamplingToken[], b: SamplingToken[], eps = 1e-6
): number {
  const bMap = new Map(b.map(t => [t.token, t.softmaxP]));
  let kl = 0;
  let used = 0;
  for (const ta of a) {
    const pb = bMap.get(ta.token) ?? eps;
    if (ta.softmaxP > 0) {
      kl += ta.softmaxP * (Math.log(ta.softmaxP / pb) / Math.LN2);
      used++;
    }
  }
  return used === 0 ? NaN : kl;
}

/**
 * Rank of a chosen token inside a sorted distribution. Returns -1 if not
 * present (can happen if the provider's "chosen" is outside the top-K we
 * requested).
 */
export function rankOf(token: string, dist: SamplingToken[]): number {
  for (let i = 0; i < dist.length; i++) if (dist[i].token === token) return i;
  return -1;
}

/** Simple Levenshtein distance on token arrays (for branch distance). */
export function tokenEditDistance(a: string[], b: string[]): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    const curr = new Array(n + 1).fill(0);
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,       // deletion
        curr[j - 1] + 1,   // insertion
        prev[j - 1] + cost // substitution
      );
    }
    prev = curr;
  }
  return prev[n];
}
