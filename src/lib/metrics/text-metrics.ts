import type { TextMetrics, TokenLogprob } from "@/types/analysis";

export function computeTextMetrics(text: string): TextMetrics {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const uniqueWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z0-9'-]/g, "")));
  const uniqueWordCount = uniqueWords.size;
  const vocabularyDiversity = wordCount > 0 ? uniqueWordCount / wordCount : 0;

  return { wordCount, sentenceCount, avgSentenceLength, vocabularyDiversity, uniqueWordCount };
}

export function computeWordOverlap(textA: string, textB: string) {
  const wordsA = new Set(textA.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9'-]/g, "")).filter(Boolean));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9'-]/g, "")).filter(Boolean));

  const shared = [...wordsA].filter(w => wordsB.has(w));
  const uniqueA = [...wordsA].filter(w => !wordsB.has(w));
  const uniqueB = [...wordsB].filter(w => !wordsA.has(w));
  const union = new Set([...wordsA, ...wordsB]);

  // Jaccard: |A∩B| / |A∪B| — strict set similarity, penalises any vocabulary difference
  const jaccardSimilarity = union.size > 0 ? shared.length / union.size : 0;

  // Dice coefficient: 2|A∩B| / (|A| + |B|) — more generous when outputs differ in length;
  // equivalent to the harmonic mean of the two directional coverage scores (A→B and B→A)
  const diceCoefficient = (wordsA.size + wordsB.size) > 0
    ? (2 * shared.length) / (wordsA.size + wordsB.size)
    : 0;

  // Keep overlapPercentage as Dice for backward-compat display (replaces the old duplicate)
  const overlapPercentage = diceCoefficient * 100;

  return { shared, uniqueA, uniqueB, jaccardSimilarity, diceCoefficient, overlapPercentage };
}

/**
 * Compute cosine similarity between two texts using term-frequency vectors.
 * More sensitive than Jaccard: frequency-weighted, so a word used 10 times
 * pulls the vectors closer than a word used once. Returns 0–1.
 */
export function computeCosineSimilarity(textA: string, textB: string): number {
  const tokenise = (t: string) =>
    t.toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 1);

  const freq = (words: string[]): Map<string, number> => {
    const m = new Map<string, number>();
    words.forEach(w => m.set(w, (m.get(w) ?? 0) + 1));
    return m;
  };

  const tfA = freq(tokenise(textA));
  const tfB = freq(tokenise(textB));

  const vocab = new Set([...tfA.keys(), ...tfB.keys()]);
  if (vocab.size === 0) return 0;

  let dot = 0, magA = 0, magB = 0;
  vocab.forEach(term => {
    const a = tfA.get(term) ?? 0;
    const b = tfB.get(term) ?? 0;
    dot += a * b;
    magA += a * a;
    magB += b * b;
  });

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

export function computeTokenEntropy(logprob: TokenLogprob): number {
  // Shannon entropy over the visible top-K *plus* the unseen long tail
  // treated as a single residual bucket of probability (1 − Σ visible).
  //
  // Before v2.2.10 this function renormalised the visible top-K to sum
  // to 1 and computed entropy on that — which technically described the
  // *shape of the visible peak* rather than the model's full belief
  // state, since the long tail was simply excluded. The renormalise
  // version made perplexity look lower than the true distribution
  // warranted, especially for positions where the visible top-K summed
  // to only ~30–40% of the probability mass.
  //
  // The bucket-the-other approach gives a strict LOWER BOUND on the
  // true full-vocabulary entropy: collapsing the long tail's many
  // tokens into a single point of mass under-estimates the entropy
  // they would contribute if their actual per-token distribution were
  // visible. So the displayed perplexity now sits between "perplexity
  // of just the visible peak" (the old measure) and the true
  // full-distribution perplexity that the API doesn't expose. For
  // close reading the lower bound is the right default — honest about
  // the data we have, no smoothing assumptions about the tail.
  //
  // Trade-off: if the visible mass is very low (rare, but possible at
  // very flat distributions), the "other" bucket dominates and the
  // computed entropy approaches `−p_other · log₂(p_other)`, which
  // *under*-states uncertainty quite badly. In practice this only
  // bites at the extremes — the old high/moderate thresholds in
  // TokenHeatmap still flag the right tokens.
  const allProbs = [logprob, ...logprob.topAlternatives];
  const probs = allProbs.map(t => Math.exp(t.logprob));
  const sumVisible = probs.reduce((a, b) => a + b, 0);
  if (sumVisible === 0) return 0;

  // Floating-point noise occasionally pushes the visible sum a hair
  // past 1.0 (especially with renormalised provider responses).
  // Clamp so the residual is never negative.
  const clampedSum = Math.min(1, sumVisible);
  const other = Math.max(0, 1 - clampedSum);

  let h = 0;
  for (const p of probs) {
    if (p > 0) h -= p * Math.log2(p);
  }
  if (other > 0) h -= other * Math.log2(other);
  return h;
}

export function computeMeanEntropy(tokens: TokenLogprob[]): number {
  if (tokens.length === 0) return 0;
  const entropies = tokens.map(computeTokenEntropy);
  return entropies.reduce((a, b) => a + b, 0) / entropies.length;
}

export function computeMaxEntropyToken(tokens: TokenLogprob[]): { token: string; entropy: number; position: number } {
  let max = { token: "", entropy: 0, position: 0 };
  tokens.forEach((t, i) => {
    const e = computeTokenEntropy(t);
    if (e > max.entropy) max = { token: t.token, entropy: e, position: i };
  });
  return max;
}
