/**
 * Sampling Probe — shared types.
 *
 * A "step" is a single next-token decision with its full top-K distribution.
 * A "branch" is a linear sequence of steps that can fork from a parent at a
 * specific step index (by choosing a non-sampled top-K token). A "trace"
 * holds the whole tree for one prompt.
 */

export interface SamplingToken {
  /** Surface form of the token as returned by the provider. */
  token: string;
  /** Raw logprob (natural log, as returned by the provider). */
  logprob: number;
  /** Softmax-normalised probability under the user's current T / top-p. */
  softmaxP: number;
  /** Rank inside the returned top-K (0 = most likely). */
  rank: number;
}

export interface SamplingStep {
  /** Stable id so the UI can keep keys across re-softmax. */
  id: string;
  /** Text prefix fed to the model for this step (everything before). */
  prefix: string;
  /** Raw top-K distribution as returned by the provider (unadjusted logprobs). */
  rawDistribution: RawTokenProb[];
  /** The token chosen to extend the sequence. May be a fork choice, not the argmax. */
  chosenToken: string;
  /** Model/provider metadata for provenance. */
  provenance?: {
    provider: string;
    model: string;
    modelDisplayName?: string;
    responseTimeMs: number;
  };
}

export interface SamplingBranch {
  id: string;
  /** null for the root branch. */
  parentId: string | null;
  /** Index into parent's `steps` where this branch forks off. */
  forkStepIndex: number | null;
  /** The top-K token chosen at the fork point (differs from parent's chosen). */
  forkChoice: string | null;
  /** Panel this branch is assigned to (A or B). Used in dual-panel mode. */
  panel: "A" | "B";
  /** Steps in this branch, in sequence order. */
  steps: SamplingStep[];
  /** Display label for the branch (e.g. main / "but a …"). */
  label: string;
}

export interface SamplingTrace {
  prompt: string;
  branches: Record<string, SamplingBranch>;
  activeBranchId: string;
  params: {
    temperature: number;
    topP: number;
    topK: number;
    maxSteps: number;
  };
  /** Slot metadata at trace time — so exports carry provider/model. */
  slots: {
    A: { provider: string; model: string; modelDisplayName?: string } | null;
    B: { provider: string; model: string; modelDisplayName?: string } | null;
  };
}

/** Raw distribution entry from the API (logprob only; no softmax yet). */
export interface RawTokenProb {
  token: string;
  logprob: number;
}

/** The API response for a single sampling step. */
export interface SamplingStepResponse {
  /** Top-K next-token distribution, ordered by logprob (descending). */
  distribution: RawTokenProb[];
  /** The token the provider returned as max_tokens=1 output (argmax under T from provider). */
  chosen: RawTokenProb | null;
  provenance: {
    provider: string;
    model: string;
    modelDisplayName?: string;
    responseTimeMs: number;
  };
}
