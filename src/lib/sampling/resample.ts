/**
 * Sampling Probe — client-side re-softmax.
 *
 * The API returns raw logprobs (natural log, unadjusted). The browser
 * re-computes softmax under the user's chosen temperature and top-p so
 * the top-K bar chart updates instantly as sliders move, without any
 * extra API calls.
 *
 *   p_i = exp(logprob_i / T) / Σ exp(logprob_j / T)
 *
 * Top-p (nucleus) truncation zeroes out the smallest-probability tail
 * whose cumulative mass exceeds the threshold, then re-normalises. A
 * top-p of 1.0 is a no-op (keep all).
 */

import type { RawTokenProb, SamplingToken } from "./types";

export function resample(
  raw: RawTokenProb[],
  temperature: number,
  topP: number
): SamplingToken[] {
  if (raw.length === 0) return [];

  // Clamp T to avoid div-by-zero. T→0 collapses to one-hot on argmax.
  const t = Math.max(0.01, temperature);

  // Log-softmax under T: subtract max for numerical stability.
  const scaled = raw.map(r => r.logprob / t);
  const maxLogit = Math.max(...scaled);
  const exps = scaled.map(l => Math.exp(l - maxLogit));
  const sum = exps.reduce((s, x) => s + x, 0) || 1;
  const probs = exps.map(x => x / sum);

  // Sort by probability, descending.
  const indexed = raw.map((r, i) => ({ ...r, softmaxP: probs[i] }));
  indexed.sort((a, b) => b.softmaxP - a.softmaxP);

  // Top-p nucleus truncation.
  let cutoff = indexed.length;
  if (topP < 1) {
    let cum = 0;
    for (let i = 0; i < indexed.length; i++) {
      cum += indexed[i].softmaxP;
      if (cum >= topP) { cutoff = i + 1; break; }
    }
    // Re-normalise the nucleus.
    const nucleusSum = indexed.slice(0, cutoff).reduce((s, t) => s + t.softmaxP, 0) || 1;
    for (let i = 0; i < cutoff; i++) indexed[i].softmaxP = indexed[i].softmaxP / nucleusSum;
    for (let i = cutoff; i < indexed.length; i++) indexed[i].softmaxP = 0;
  }

  return indexed.map((r, rank) => ({
    token: r.token,
    logprob: r.logprob,
    softmaxP: r.softmaxP,
    rank,
  }));
}
