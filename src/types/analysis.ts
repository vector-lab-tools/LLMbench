import type { OutputProvenance } from "./ai-settings";

// ---------- shared ----------

export interface TextMetrics {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  vocabularyDiversity: number; // unique words / total words
  uniqueWordCount: number;
}

export interface RunOutput {
  text: string;
  provenance: OutputProvenance;
  metrics: TextMetrics;
}

export interface RunError {
  error: string;
  provenance: OutputProvenance;
}

export type RunResult = RunOutput | RunError;

export function isRunOutput(r: RunResult): r is RunOutput {
  return "text" in r;
}

// ---------- stochastic ----------

export interface StochasticRequest {
  prompt: string;
  runCount: number;
}

export interface StochasticPanelResult {
  runs: RunResult[];
}

export interface StochasticResponse {
  A: StochasticPanelResult;
  B: StochasticPanelResult;
}

// ---------- temperature ----------

export interface TemperatureRequest {
  prompt: string;
  temperatures: number[];
}

export interface TemperaturePanelResult {
  runs: (RunResult & { temperature: number })[];
}

export interface TemperatureResponse {
  A: TemperaturePanelResult;
  B: TemperaturePanelResult;
}

// ---------- sensitivity ----------

export interface SensitivityRequest {
  prompt: string;
  variations: string[];
}

export interface SensitivityVariationResult {
  variationLabel: string;
  variationPrompt: string;
  result: RunResult;
}

export interface SensitivityPanelResult {
  base: RunResult;
  variations: SensitivityVariationResult[];
}

export interface SensitivityResponse {
  A: SensitivityPanelResult;
  B: SensitivityPanelResult;
}

// ---------- logprobs ----------

export interface TokenLogprob {
  token: string;
  logprob: number;
  topAlternatives: { token: string; logprob: number }[];
}

export interface LogprobsRunOutput {
  text: string;
  provenance: OutputProvenance;
  tokens: TokenLogprob[];
  meanEntropy: number;
  maxEntropyToken: { token: string; entropy: number; position: number };
}

export interface LogprobsRunError {
  error: string;
  provenance: OutputProvenance;
}

export type LogprobsResult = LogprobsRunOutput | LogprobsRunError;

export function isLogprobsOutput(r: LogprobsResult): r is LogprobsRunOutput {
  return "tokens" in r;
}

export interface LogprobsResponse {
  A: LogprobsResult;
  B: LogprobsResult;
}

// ---------- divergence ----------

export interface WordOverlap {
  shared: string[];
  uniqueA: string[];
  uniqueB: string[];
  jaccardSimilarity: number;
  overlapPercentage: number;
}

export interface DivergenceMetrics {
  wordOverlap: WordOverlap;
  metricsA: TextMetrics;
  metricsB: TextMetrics;
  responseTimeDiffMs: number;
}

export interface DivergenceResponse {
  A: RunResult;
  B: RunResult;
  metrics: DivergenceMetrics | null;
}
