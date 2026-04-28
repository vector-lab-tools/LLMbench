// Comparison types for local persistence
import type { LineAnnotation } from "./annotations";
import type { OutputProvenance, ProviderSlot } from "./ai-settings";
import type { CrossPanelLink } from "./links";
import type { TokenLogprob } from "./analysis";

export interface ComparisonOutput {
  text: string;
  provenance: OutputProvenance;
  error?: string;
}

/** Slim snapshot of a slot at execution time. Used to record provenance
 *  on a saved comparison without leaking the API key. */
export interface SavedSlotSnapshot {
  provider: ProviderSlot["provider"];
  model: string;
  customModelId?: string;
  temperature: number;
  systemPrompt?: string;
  baseUrl?: string;
}

export interface SavedComparison {
  id: string;
  name: string;
  prompt: string;
  outputA: ComparisonOutput | null;
  outputB: ComparisonOutput | null;
  annotationsA: LineAnnotation[];
  annotationsB: LineAnnotation[];
  crossPanelLinks?: CrossPanelLink[];
  /** When the saved record was first created (the canonical "saved at"). */
  createdAt: string;
  /** When the saved record was last edited (annotation edits, renames). */
  updatedAt: string;
  /** When the underlying generation actually ran. Distinct from createdAt
   *  because a user may save a long-running session hours after submit,
   *  and from updatedAt because annotations don't change the historical
   *  moment of the model output. Optional for backward compat — older
   *  saves don't carry it; the UI falls back to createdAt for display. */
  executedAt?: string;
  /** Slot configuration snapshot at the time the generation ran.
   *  Lets a saved comparison record exactly which model produced each
   *  output (provider, model, temperature, system prompt) so a reader
   *  can cite the historical conditions even after the user has
   *  changed slots in Settings. API keys are NEVER persisted. */
  executedSlots?: { A: SavedSlotSnapshot; B: SavedSlotSnapshot };
  /** Cached token-level logprobs for each panel, snapshotted at the
   *  moment the user saved. When a comparison is reloaded, the Probs
   *  view opens instantly without a fresh API call — the heatmap is
   *  the same one the user saw at save time. Optional; older saves and
   *  comparisons over non-logprob-capable models will not have it. */
  logprobsA?: TokenLogprob[];
  logprobsB?: TokenLogprob[];
}
