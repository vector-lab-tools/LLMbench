/**
 * Sampling Probe — one-step provider adapter.
 *
 * A single step: given (slot, prefix, topK), returns the next-token top-K
 * distribution and the model's chosen token. Reuses the four logprob-capable
 * providers already wired for Grammar Probe Phase B (Google Gemini 2.0,
 * OpenAI / openai-compatible, OpenRouter, Hugging Face). Other providers
 * throw a typed error.
 *
 * Note: we request `max_tokens: 1` with `temperature: 0` from the provider
 * so the raw logprob distribution is unaltered by the provider's own
 * sampler. The browser re-softmaxes under the user's chosen T and top-p
 * client-side so sliders are instant.
 */

import type { AIProvider } from "@/types/ai-settings";
import { getModelDisplayName } from "@/lib/ai/config";
import type { RawTokenProb, SamplingStepResponse } from "./types";

export interface SamplingSlotPayload {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  customModelId?: string;
}

export const SAMPLING_PROVIDERS = new Set<AIProvider>([
  "google", "openai", "openai-compatible", "openrouter", "huggingface",
]);

function provenance(slot: SamplingSlotPayload, responseTimeMs: number) {
  const model = slot.customModelId || slot.model;
  return {
    provider: slot.provider,
    model,
    modelDisplayName: getModelDisplayName(slot.provider, model),
    responseTimeMs,
  };
}

// ---------- Google Gemini ----------
async function runGoogle(
  slot: SamplingSlotPayload, prefix: string, topK: number
): Promise<{ chosen: RawTokenProb | null; distribution: RawTokenProb[] }> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const model = slot.customModelId || slot.model;
  const genAI = new GoogleGenerativeAI(slot.apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    generationConfig: {
      temperature: 0,
      responseLogprobs: true,
      logprobs: topK,
      maxOutputTokens: 1,
    } as Record<string, unknown>,
  });
  const result = await genModel.generateContent({
    contents: [{ role: "user", parts: [{ text: prefix }] }],
  });
  const response = result.response;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = (response as any).candidates?.[0];
  const logprobsResult = candidate?.logprobsResult;
  const chosenArr = logprobsResult?.chosenCandidates || [];
  const topArr = logprobsResult?.topCandidates || [];
  const chosen = chosenArr[0]
    ? { token: chosenArr[0].token || "", logprob: chosenArr[0].logProbability ?? 0 }
    : null;
  const distribution: RawTokenProb[] = (topArr[0]?.candidates || []).map(
    (c: { token: string; logProbability?: number }) => ({ token: c.token, logprob: c.logProbability ?? 0 })
  );
  return { chosen, distribution };
}

// ---------- OpenAI / compatible ----------
async function runOpenAI(
  slot: SamplingSlotPayload, prefix: string, topK: number
): Promise<{ chosen: RawTokenProb | null; distribution: RawTokenProb[] }> {
  const { generateText } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const model = slot.customModelId || slot.model;
  const client = createOpenAI({ apiKey: slot.apiKey, baseURL: slot.baseUrl });
  const result = await generateText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: client.chat(model) as any,
    messages: [{ role: "user", content: prefix }],
    temperature: 0,
    maxOutputTokens: 1,
    providerOptions: { openai: { logprobs: true, topLogprobs: topK } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (result as any).providerMetadata?.openai?.logprobs;
  let chosen: RawTokenProb | null = null;
  let distribution: RawTokenProb[] = [];
  if (Array.isArray(raw) && raw.length > 0) {
    const first = Array.isArray(raw[0]) ? raw[0][0] : raw[0];
    if (first) {
      chosen = { token: first.token || "", logprob: first.logprob ?? 0 };
      distribution = (first.top_logprobs || []).map(
        (t: { token: string; logprob: number }) => ({ token: t.token, logprob: t.logprob })
      );
    }
  }
  return { chosen, distribution };
}

// ---------- Direct fetch (OpenRouter, Hugging Face) ----------
async function runDirect(
  slot: SamplingSlotPayload, baseUrl: string, prefix: string, topK: number,
  extraHeaders: Record<string, string> = {}
): Promise<{ chosen: RawTokenProb | null; distribution: RawTokenProb[] }> {
  const model = slot.customModelId || slot.model;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${slot.apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prefix }],
      temperature: 0,
      max_tokens: 1,
      logprobs: true,
      top_logprobs: topK,
    }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API error ${response.status}: ${errText}`);
  }
  const data = await response.json();
  const choice = data.choices?.[0];
  const content = choice?.logprobs?.content || [];
  let chosen: RawTokenProb | null = null;
  let distribution: RawTokenProb[] = [];
  if (content.length > 0) {
    const entry = content[0];
    chosen = { token: entry.token || "", logprob: entry.logprob ?? 0 };
    distribution = (entry.top_logprobs || []).map(
      (t: { token: string; logprob: number }) => ({ token: t.token, logprob: t.logprob })
    );
  }
  return { chosen, distribution };
}

/** Run a single sampling step against the slot's provider. */
export async function runSamplingStep(
  slot: SamplingSlotPayload, prefix: string, topK: number
): Promise<SamplingStepResponse> {
  const startedAt = Date.now();
  const model = slot.customModelId || slot.model;

  let raw: { chosen: RawTokenProb | null; distribution: RawTokenProb[] };
  switch (slot.provider) {
    case "google":
      if (model.includes("2.5")) {
        throw new Error(`${model} does not provide logprobs. Use gemini-2.0-flash.`);
      }
      raw = await runGoogle(slot, prefix, topK);
      break;
    case "openai":
    case "openai-compatible":
      raw = await runOpenAI(slot, prefix, topK);
      break;
    case "openrouter":
      raw = await runDirect(slot, "https://openrouter.ai/api/v1", prefix, topK, {
        "HTTP-Referer": "https://llm-bench.vercel.app",
        "X-Title": "LLMbench",
      });
      break;
    case "huggingface":
      raw = await runDirect(slot, "https://router.huggingface.co/v1", prefix, topK);
      break;
    default:
      throw new Error(
        `Sampling Probe requires Gemini (2.0), OpenAI, OpenRouter, or Hugging Face. ${slot.provider} is not supported.`
      );
  }

  // Fail loudly on silent empty logprobs — same class of bug that bit Atlas
  // when a pre-v2.14.0 Phase B bundle was generated on OpenRouter + a
  // non-OpenAI model. Better to surface a provider-specific hint per step
  // than to accumulate an empty trace.
  if (!raw.distribution || raw.distribution.length === 0) {
    const hint =
      slot.provider === "openrouter"
        ? `OpenRouter returned no logprobs for ${model}. On OpenRouter only OpenAI models (e.g. openai/gpt-4o, openai/gpt-4o-mini) expose logprobs; other routes silently drop the logprobs field. Switch to a direct OpenAI slot or Google Gemini 2.0.`
        : slot.provider === "huggingface"
        ? `Hugging Face returned no logprobs for ${model}. Not every HF-routed chat model exposes logprobs. Switch to OpenAI or Google Gemini 2.0.`
        : slot.provider === "openai-compatible"
        ? `The OpenAI-compatible endpoint for ${model} returned no logprobs. Verify the provider actually exposes top_logprobs.`
        : `${slot.provider} returned no logprobs for ${model}.`;
    throw new Error(hint);
  }

  return {
    distribution: raw.distribution,
    chosen: raw.chosen,
    provenance: provenance(slot, Date.now() - startedAt),
  };
}
