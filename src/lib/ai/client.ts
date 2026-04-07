// Unified AI Client for LLMbench
// Adapted from CCS-WB - abstracts multiple providers behind single interface

import { generateText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { AIProvider, AIRequestConfig, AIValidationResult } from "@/types/ai-settings";
import { PROVIDER_CONFIGS } from "./config";

// Validate AI configuration
export function validateAIConfig(config: AIRequestConfig): AIValidationResult {
  const { provider, apiKey, baseUrl } = config;

  if (!PROVIDER_CONFIGS[provider]) {
    return { valid: false, error: `Unknown provider: ${provider}` };
  }

  const providerConfig = PROVIDER_CONFIGS[provider];

  if (providerConfig.requiresApiKey && !apiKey) {
    return {
      valid: false,
      error: `${providerConfig.name} requires an API key.`,
    };
  }

  if (apiKey) {
    if (provider === "anthropic" && !apiKey.startsWith("sk-ant-")) {
      return {
        valid: false,
        error: "Invalid Anthropic API key format. Keys should start with 'sk-ant-'",
      };
    }
    if (
      provider === "openai" &&
      !apiKey.startsWith("sk-") &&
      !apiKey.startsWith("sess-")
    ) {
      return {
        valid: false,
        error: "Invalid OpenAI API key format. Keys should start with 'sk-'",
      };
    }
  }

  if (provider === "openai-compatible" && baseUrl) {
    try {
      new URL(baseUrl);
    } catch {
      return { valid: false, error: "Invalid base URL format" };
    }
  }

  return { valid: true };
}

// Create provider-specific client
function createAIClient(config: AIRequestConfig) {
  const { provider, apiKey, baseUrl } = config;

  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey });

    case "openai":
      return createOpenAI({ apiKey });

    case "google":
      return createGoogleGenerativeAI({ apiKey });

    case "ollama": {
      // Normalize localhost → 127.0.0.1 to avoid IPv6 resolution issues on macOS
      const ollamaUrl = (baseUrl || "http://127.0.0.1:11434").replace("://localhost", "://127.0.0.1");
      return createOpenAI({
        apiKey: "ollama",
        baseURL: ollamaUrl + (ollamaUrl.endsWith("/v1") ? "" : "/v1"),
      });
    }

    case "openai-compatible":
      return createOpenAI({
        apiKey,
        baseURL: baseUrl,
      });

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

// Delay helper
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Check if an error is retryable (rate limit or server overload)
function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return msg.includes("rate limit") || msg.includes("rate_limit")
      || msg.includes("429") || msg.includes("too many requests")
      || msg.includes("high demand") || msg.includes("overloaded")
      || msg.includes("503") || msg.includes("temporarily unavailable");
  }
  return false;
}

// Generate a response from a single provider (with one automatic retry on rate limit)
export async function generateAIResponse(
  config: AIRequestConfig,
  options: {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<{ text: string; responseTimeMs: number }> {
  async function attempt(): Promise<{ text: string; responseTimeMs: number }> {
    const client = createAIClient(config);
    const startTime = Date.now();

    // Timeout: 120s for most providers, 180s for Google (thinking models can be slow)
    const timeoutMs = config.provider === "google" ? 180000 : 120000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Build provider-specific options
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const providerOptions: Record<string, any> = {};

      // No special provider options needed - let models use their defaults

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await generateText({
        model: client(config.model) as any,
        system: options.systemPrompt || undefined,
        messages: [{ role: "user", content: options.prompt }],
        maxOutputTokens: options.maxTokens || 4096,
        temperature: options.temperature ?? 1.0,
        abortSignal: controller.signal,
        ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
      });

      const responseTimeMs = Date.now() - startTime;

      if (!result.text || result.text.trim() === "") {
        throw new Error(
          `${PROVIDER_CONFIGS[config.provider].name} returned an empty response.`
        );
      }

      return { text: result.text, responseTimeMs };
    } catch (error) {
      if (error instanceof Error) {
        const message = error.message.toLowerCase();

        // Abort / timeout
        if (message.includes("abort") || error.name === "AbortError") {
          throw new Error(
            `Request to ${PROVIDER_CONFIGS[config.provider].name} timed out after ${timeoutMs / 1000}s. The model may be overloaded or the response too long.`
          );
        }

        if (message.includes("rate limit") || message.includes("rate_limit") || message.includes("429") || message.includes("too many requests")) {
          throw new Error(
            `Rate limit exceeded for ${PROVIDER_CONFIGS[config.provider].name}. Please wait and try again.`
          );
        }

        if (
          message.includes("authentication") ||
          message.includes("api key") ||
          message.includes("unauthorized")
        ) {
          throw new Error(
            `Authentication failed for ${PROVIDER_CONFIGS[config.provider].name}. Check your API key.`
          );
        }

        if (message.includes("model") && message.includes("not found")) {
          throw new Error(
            `Model "${config.model}" not found for ${PROVIDER_CONFIGS[config.provider].name}.`
          );
        }

        if (
          message.includes("connection") ||
          message.includes("econnrefused")
        ) {
          if (config.provider === "ollama") {
            throw new Error(
              "Cannot connect to Ollama. Ensure Ollama is running with `ollama serve`."
            );
          }
          throw new Error(
            `Cannot connect to ${PROVIDER_CONFIGS[config.provider].name}.`
          );
        }
      }

      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    return await attempt();
  } catch (error) {
    if (isRetryableError(error)) {
      // Single automatic retry after a pause
      console.log(`[LLMbench] Rate limit hit for ${config.provider}, retrying in 3s...`);
      await delay(3000);
      return await attempt();
    }
    throw error;
  }
}

// Run an array of async tasks sequentially with a delay between each.
// Prevents rate limiting when sending many requests to the same provider.
export async function staggeredRun<T>(
  tasks: (() => Promise<T>)[],
  delayMs: number = 500
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < tasks.length; i++) {
    if (i > 0) await delay(delayMs);
    try {
      const value = await tasks[i]();
      results.push({ status: "fulfilled", value });
    } catch (reason) {
      results.push({ status: "rejected", reason });
    }
  }
  return results;
}

// Fan-out: dispatch same prompt to two providers in parallel
export async function fanOutGenerate(
  configA: AIRequestConfig,
  configB: AIRequestConfig,
  options: {
    prompt: string;
    systemPromptA?: string;
    systemPromptB?: string;
    temperatureA?: number;
    temperatureB?: number;
    maxTokensA?: number;
    maxTokensB?: number;
  }
): Promise<{
  A: { text: string; responseTimeMs: number } | { error: string };
  B: { text: string; responseTimeMs: number } | { error: string };
}> {
  const [resultA, resultB] = await Promise.allSettled([
    generateAIResponse(configA, {
      prompt: options.prompt,
      systemPrompt: options.systemPromptA,
      temperature: options.temperatureA,
      maxTokens: options.maxTokensA,
    }),
    generateAIResponse(configB, {
      prompt: options.prompt,
      systemPrompt: options.systemPromptB,
      temperature: options.temperatureB,
      maxTokens: options.maxTokensB,
    }),
  ]);

  return {
    A:
      resultA.status === "fulfilled"
        ? resultA.value
        : { error: resultA.reason?.message || "Panel A generation failed" },
    B:
      resultB.status === "fulfilled"
        ? resultB.value
        : { error: resultB.reason?.message || "Panel B generation failed" },
  };
}
