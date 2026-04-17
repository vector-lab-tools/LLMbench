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
  // Shannon entropy from top alternatives
  const allProbs = [logprob, ...logprob.topAlternatives];
  const probs = allProbs.map(t => Math.exp(t.logprob));
  const sum = probs.reduce((a, b) => a + b, 0);
  if (sum === 0) return 0;
  const normalised = probs.map(p => p / sum);
  return -normalised.reduce((h, p) => h + (p > 0 ? p * Math.log2(p) : 0), 0);
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
