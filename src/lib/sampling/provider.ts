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

// Chat-tuned models treat a bare user message as a conversational turn and
// respond with something like "Democracy is a system of government…" — they
// echo and paraphrase rather than continue. For Sampling Probe we need the
// model to act as a text-completion engine, so the response's first token
// flows naturally from the end of the prefix. This system prompt disables
// acknowledgement, commentary, quoting, and echoing, leaving the model
// nothing to do *except* emit the next token of the user's fragment.
const SAMPLING_SYSTEM_PROMPT =
  "You are a text completion engine, not a chat assistant. The user's message is a text fragment. " +
  "Your response must be the immediate continuation of that fragment — one or more tokens of natural prose " +
  "that could be concatenated directly after the user's text with no gap, preamble, acknowledgement, " +
  "quotation marks, formatting, or commentary. Do not repeat the user's text. Do not address the user. " +
  "If the fragment ends mid-word, complete the word; if it ends mid-sentence, continue the sentence.";

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
    systemInstruction: SAMPLING_SYSTEM_PROMPT,
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

// ---------- OpenAI / compatible (direct fetch) ----------
// We bypass the AI SDK here because its `providerMetadata.openai.logprobs`
// normalisation strips the leading BPE whitespace from token strings — so a
// token the API actually returns as " system" arrives as "system". That
// destroys the ability to reconstruct the generated text by concatenation
// and makes the transcript read as "Democracy isasysteminwhich…". Calling
// /chat/completions directly gives us OpenAI's raw `token` field intact,
// including its leading space where applicable.
async function runOpenAI(
  slot: SamplingSlotPayload, prefix: string, topK: number
): Promise<{ chosen: RawTokenProb | null; distribution: RawTokenProb[] }> {
  const baseUrl = slot.baseUrl || "https://api.openai.com/v1";
  return runDirect(slot, baseUrl, prefix, topK);
}

// ---------- Direct fetch (OpenRouter, Hugging Face, OpenAI) ----------
// Some OpenAI-compatible proxies (notably OpenRouter for certain GPT-4o
// routes) return `token` stripped of its leading BPE whitespace — so
// " system" comes back as "system" and the concatenated transcript reads
// as "Democracy isasysteminwhich…". The underlying `bytes` field, however,
// is the true UTF-8 byte sequence (e.g. [32, 115, 121, 115, 116, 101, 109]
// for " system"). Prefer bytes when present so the reconstructed text is
// faithful to what the model actually emitted.
function decodeTokenField(entry: { token?: string; bytes?: number[] | null }): string {
  if (entry.bytes && Array.isArray(entry.bytes) && entry.bytes.length > 0) {
    try {
      return new TextDecoder("utf-8").decode(new Uint8Array(entry.bytes));
    } catch {
      // fall through to token
    }
  }
  return entry.token ?? "";
}

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
      messages: [
        { role: "system", content: SAMPLING_SYSTEM_PROMPT },
        { role: "user", content: prefix },
      ],
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
  // `choice.message.content` is the raw generated text as the model
  // emitted it. OpenRouter (and some other OpenAI-compatible proxies)
  // sometimes strip the leading BPE whitespace from
  // `logprobs.content[0].token` AND its `bytes`, while leaving the
  // top_logprobs[i] entries untouched. `message.content` is the
  // authoritative source for what was actually appended to the stream,
  // so prefer it for the chosen token's text.
  const messageContent: string = typeof choice?.message?.content === "string"
    ? choice.message.content
    : "";
  let chosen: RawTokenProb | null = null;
  let distribution: RawTokenProb[] = [];
  if (content.length > 0) {
    const entry = content[0];
    const decodedChosen = decodeTokenField(entry);
    const authoritativeChosen = messageContent.length > 0 ? messageContent : decodedChosen;
    chosen = { token: authoritativeChosen, logprob: entry.logprob ?? 0 };
    distribution = (entry.top_logprobs || []).map(
      (t: { token?: string; bytes?: number[] | null; logprob: number }) =>
        ({ token: decodeTokenField(t), logprob: t.logprob })
    );
    // Critical path: advanceOne's sampler picks from `distribution`, not from
    // `chosen`. Without this alignment the argmax pick at T≈0 still uses the
    // OpenRouter-stripped token string and the transcript comes out as
    // "Democracy isasysteminwhich…". Overwrite the rank-0 entry with
    // message.content (the raw emitted text) so sampleFromDistribution
    // returns the faithful token at the most-likely pick — which is where
    // almost every step lands with peaked distributions.
    if (distribution.length > 0 && distribution[0].token !== authoritativeChosen) {
      distribution = [
        { ...distribution[0], token: authoritativeChosen },
        ...distribution.slice(1),
      ];
    }
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
