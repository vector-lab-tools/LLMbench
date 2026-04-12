// Provider configurations and model definitions for LLMbench
// Models loaded dynamically from /public/models.md at runtime;
// hardcoded defaults below are the fallback.

import type { AIProvider, ModelConfig, ProviderConfig } from "@/types/ai-settings";
import { loadModelsConfig, type LoadedModels } from "./load-models";

// ---- Custom Model sentinel (appended to every provider) ----

const CUSTOM_MODEL: ModelConfig = {
  id: "custom",
  name: "Custom Model",
  contextWindow: 200000,
  maxOutputTokens: 8192,
};

// ---- Hardcoded fallback model lists ----

const DEFAULT_MODELS: Record<AIProvider, ModelConfig[]> = {
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", contextWindow: 200000, maxOutputTokens: 8192 },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", contextWindow: 200000, maxOutputTokens: 8192 },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o", contextWindow: 128000, maxOutputTokens: 4096 },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", contextWindow: 128000, maxOutputTokens: 16384 },
    { id: "o1", name: "o1", contextWindow: 200000, maxOutputTokens: 100000 },
    { id: "o1-mini", name: "o1-mini", contextWindow: 128000, maxOutputTokens: 65536 },
  ],
  google: [
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", contextWindow: 1048576, maxOutputTokens: 65536 },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", contextWindow: 1048576, maxOutputTokens: 65536 },
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash (logprobs)", contextWindow: 1048576, maxOutputTokens: 8192 },
  ],
  ollama: [
    { id: "llama3.2", name: "Llama 3.2", contextWindow: 128000, maxOutputTokens: 4096 },
    { id: "llama3.1", name: "Llama 3.1", contextWindow: 128000, maxOutputTokens: 4096 },
    { id: "mistral", name: "Mistral", contextWindow: 32000, maxOutputTokens: 4096 },
  ],
  "openai-compatible": [
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B Instruct (logprobs)", contextWindow: 131072, maxOutputTokens: 8192 },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B Instruct (logprobs)", contextWindow: 131072, maxOutputTokens: 8192 },
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash (logprobs)", contextWindow: 1048576, maxOutputTokens: 8192 },
    { id: "mistralai/mistral-large", name: "Mistral Large (logprobs)", contextWindow: 128000, maxOutputTokens: 8192 },
  ],
  huggingface: [
    { id: "meta-llama/Llama-3.3-70B-Instruct", name: "Llama 3.3 70B Instruct", contextWindow: 131072, maxOutputTokens: 4096 },
    { id: "meta-llama/Llama-3.1-8B-Instruct", name: "Llama 3.1 8B Instruct (logprobs)", contextWindow: 131072, maxOutputTokens: 4096 },
    { id: "Qwen/Qwen3-32B", name: "Qwen3 32B", contextWindow: 40960, maxOutputTokens: 4096 },
    { id: "Qwen/Qwen3.5-27B", name: "Qwen3.5 27B", contextWindow: 262144, maxOutputTokens: 4096 },
    { id: "Qwen/Qwen2.5-7B-Instruct", name: "Qwen2.5 7B Instruct (logprobs)", contextWindow: 32768, maxOutputTokens: 4096 },
    { id: "Qwen/Qwen2.5-Coder-32B-Instruct", name: "Qwen2.5 Coder 32B (logprobs)", contextWindow: 131072, maxOutputTokens: 4096 },
    { id: "google/gemma-4-31B-it", name: "Gemma 4 31B", contextWindow: 262144, maxOutputTokens: 4096 },
    { id: "deepseek-ai/DeepSeek-R1", name: "DeepSeek R1", contextWindow: 163840, maxOutputTokens: 8192 },
    { id: "deepseek-ai/DeepSeek-V3", name: "DeepSeek V3", contextWindow: 131072, maxOutputTokens: 8192 },
  ],
};

// ---- Provider metadata (does not change at runtime) ----

const PROVIDER_META: Record<AIProvider, Omit<ProviderConfig, "models">> = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic (Claude)",
    description: "Claude models from Anthropic",
    requiresApiKey: true,
    baseUrlConfigurable: false,
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    description: "GPT models from OpenAI",
    requiresApiKey: true,
    baseUrlConfigurable: false,
    supportsLogprobs: true,
  },
  google: {
    id: "google",
    name: "Google (Gemini)",
    description: "Gemini models from Google",
    requiresApiKey: true,
    baseUrlConfigurable: false,
    supportsLogprobs: true,
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    description: "Run models locally with Ollama",
    requiresApiKey: false,
    baseUrlConfigurable: true,
    defaultBaseUrl: "http://localhost:11434",
    supportsLogprobs: false,
  },
  "openai-compatible": {
    id: "openai-compatible",
    name: "OpenAI-Compatible API",
    description: "Any API compatible with OpenAI format (Together, Groq, etc.)",
    requiresApiKey: true,
    baseUrlConfigurable: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsLogprobs: true,
  },
  huggingface: {
    id: "huggingface",
    name: "Hugging Face",
    description: "Open-weights models via Hugging Face Inference API",
    requiresApiKey: true,
    baseUrlConfigurable: false,
    defaultBaseUrl: "https://router.huggingface.co/v1",
    supportsLogprobs: true,
  },
};

// ---- Dynamic model state ----

let loadedModels: LoadedModels | null = null;

/**
 * Initialize models from /models.md.
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export async function initializeModels(): Promise<void> {
  if (loadedModels) return;
  loadedModels = await loadModelsConfig();
}

/**
 * Convert a LoadedModels definition to a ModelConfig (with generic defaults).
 */
function toModelConfig(def: { id: string; name: string }): ModelConfig {
  return {
    id: def.id,
    name: def.name,
    contextWindow: 200000,
    maxOutputTokens: 8192,
  };
}

/**
 * Get the full list of models for a provider.
 * Priority: loaded from models.md > hardcoded defaults.
 * Always appends the "Custom Model" sentinel at the end.
 */
export function getModelsForProvider(provider: AIProvider): ModelConfig[] {
  let models: ModelConfig[];

  if (loadedModels && loadedModels[provider].length > 0) {
    models = loadedModels[provider].map(toModelConfig);
  } else {
    models = [...DEFAULT_MODELS[provider]];
  }

  // Ensure Custom Model is always last
  if (!models.some((m) => m.id === "custom")) {
    models.push(CUSTOM_MODEL);
  }

  return models;
}

/**
 * Build a full ProviderConfig (metadata + models) for a provider.
 */
export function getProviderConfigWithModels(provider: AIProvider): ProviderConfig {
  return {
    ...PROVIDER_META[provider],
    models: getModelsForProvider(provider),
  };
}

// ---- Legacy PROVIDER_CONFIGS (static snapshot, used at import time) ----

export const PROVIDER_CONFIGS: Record<AIProvider, ProviderConfig> = Object.fromEntries(
  (Object.keys(PROVIDER_META) as AIProvider[]).map((p) => [
    p,
    { ...PROVIDER_META[p], models: [...DEFAULT_MODELS[p], CUSTOM_MODEL] },
  ])
) as Record<AIProvider, ProviderConfig>;

// ---- Helpers ----

export function getDefaultModel(provider: AIProvider): string {
  const models = getModelsForProvider(provider);
  return models[0]?.id || "custom";
}

export function getModelDisplayName(provider: AIProvider, modelId: string): string {
  // Check dynamic models first
  const models = getModelsForProvider(provider);
  const model = models.find((m) => m.id === modelId);
  if (model && model.id !== "custom") return model.name;

  // For custom or unknown IDs, return the raw ID (which is what the user typed)
  // But never display anything that looks like an API key or token
  if (modelId && modelId !== "custom") {
    const looksLikeKey = modelId.startsWith("sk-")
      || modelId.startsWith("AIza")
      || modelId.startsWith("key-")
      || modelId.startsWith("Bearer ")
      || modelId.length > 50
      || /^[a-zA-Z0-9+/=_-]{20,}$/.test(modelId); // long alphanumeric strings
    if (looksLikeKey) return "Custom Model";
    return modelId;
  }

  return "Custom Model";
}

export function getAllProviders(): ProviderConfig[] {
  return (Object.keys(PROVIDER_META) as AIProvider[]).map(getProviderConfigWithModels);
}
