// AI Provider Types for LLMbench
// Adapted from CCS-WB with two-slot provider configuration

export type AIProvider =
  | "anthropic"
  | "openai"
  | "google"
  | "ollama"
  | "openai-compatible"
  | "openrouter"
  | "huggingface";

export interface ModelConfig {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
}

export interface ProviderConfig {
  id: AIProvider;
  name: string;
  description: string;
  models: ModelConfig[];
  requiresApiKey: boolean;
  baseUrlConfigurable: boolean;
  defaultBaseUrl?: string;
  supportsLogprobs?: boolean;
}

// A single provider slot (Panel A or Panel B)
export interface ProviderSlot {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  customModelId?: string;
  temperature: number;
  systemPrompt: string;
  enabled: boolean;
  /**
   * For "thinking"-capable models (Gemma 4, gpt-oss, qwen3 thinking
   * variants), bypass the reasoning channel and ask for a direct
   * answer. Sent to Ollama as `think: false` in the chat request body.
   * Drops latency dramatically — a Gemma 4 prompt that takes 30s+ with
   * thinking on returns in under a second with thinking off.
   *
   * Optional + defaults to falsy so existing localStorage slots stay
   * compatible. The toggle in Settings only surfaces when the slot's
   * provider supports the flag (currently: Ollama only).
   */
  disableThinking?: boolean;
}

// Both slots together
export interface ProviderSlots {
  A: ProviderSlot;
  B: ProviderSlot;
}

export interface AIRequestConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface AIValidationResult {
  valid: boolean;
  error?: string;
}

// Provenance metadata attached to each output
export interface OutputProvenance {
  provider: AIProvider;
  model: string;
  modelDisplayName: string;
  temperature: number;
  systemPrompt: string;
  responseTimeMs: number;
  generatedAt: string;
}

// Default slots
export const DEFAULT_SLOT_A: ProviderSlot = {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  apiKey: "",
  temperature: 1.0,
  systemPrompt: "",
  enabled: true,
};

export const DEFAULT_SLOT_B: ProviderSlot = {
  provider: "openai",
  model: "gpt-4o",
  apiKey: "",
  temperature: 1.0,
  systemPrompt: "",
  enabled: true,
};
