/**
 * Grammar Probe — Phase B geometry upgrade: Y-phrase expansion.
 *
 * Given (scaffold, firstToken) pairs, ask the model to produce a short natural
 * completion starting from scaffold+firstToken. The result is a Y-*phrase*
 * ("way of life", "culture of participation") rather than just a Y-*token*
 * ("way"), which gives the embedding step a meaningful unit to compare
 * against X.
 *
 * Streams NDJSON events:
 *   { type: "meta", total }
 *   { type: "expansion", scaffoldId, token, phrase, provenance }  // or { error }
 *   { type: "done" }
 *
 * Providers: Gemini, OpenAI, OpenAI-compatible, OpenRouter, Hugging Face. We
 * use a plain user-message approach — no logprobs needed here — so the set of
 * providers is wider than the Phase B continuation route. Anthropic works too
 * but is excluded here for parity with the continuation route, which does
 * need logprobs; if users mix an Anthropic chat slot with an OpenAI/Google
 * embedding provider, the workflow still requires logprobs for step 1, so
 * the whole geometry pipeline gates on the continuation route's support set.
 */

import { NextRequest } from "next/server";
import { validateAIConfig } from "@/lib/ai/client";
import { getModelDisplayName } from "@/lib/ai/config";
import { createStreamResponse } from "@/lib/streaming";
import type { AIProvider } from "@/types/ai-settings";

interface SlotPayload {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  customModelId?: string;
}

interface ExpandPair {
  scaffoldId: string;
  scaffold: string;
  token: string;
}

interface ExpandRequest {
  pairs: ExpandPair[];
  maxTokens?: number;
  slot: SlotPayload;
}

const SYSTEM_PROMPT =
  "You complete sentences. The user will send a sentence fragment. Reply with one short natural continuation of at most 6 words. " +
  "Do not repeat any of the fragment. Do not add punctuation beyond what the continuation needs. " +
  "Do not add quotes or commentary. Return the continuation only.";

function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

function cleanPhrase(s: string): string {
  // Strip surrounding whitespace, trailing punctuation, leading connectives.
  let out = s.trim();
  // Drop a leading quote, space, or bullet.
  out = out.replace(/^["'`\-–—•*\s]+/, "");
  // Drop trailing punctuation or quotes.
  out = out.replace(/[\s.,;:!?"'`]+$/g, "");
  return out;
}

// --- provider-specific runners ---------------------------------------------

async function runOpenAI(slot: SlotPayload, fragment: string, maxTokens: number): Promise<string> {
  const baseUrl = slot.baseUrl || "https://api.openai.com/v1";
  const model = slot.customModelId || slot.model;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${slot.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: fragment },
      ],
      temperature: 0,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function runOpenRouter(slot: SlotPayload, fragment: string, maxTokens: number): Promise<string> {
  const model = slot.customModelId || slot.model;
  const res = await fetch(`https://openrouter.ai/api/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${slot.apiKey}`,
      "HTTP-Referer": "https://llm-bench.vercel.app",
      "X-Title": "LLMbench",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: fragment },
      ],
      temperature: 0,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function runHuggingFace(slot: SlotPayload, fragment: string, maxTokens: number): Promise<string> {
  const model = slot.customModelId || slot.model;
  const res = await fetch(`https://router.huggingface.co/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${slot.apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: fragment },
      ],
      temperature: 0,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`HF error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

async function runGoogle(slot: SlotPayload, fragment: string, maxTokens: number): Promise<string> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const model = slot.customModelId || slot.model;
  const genAI = new GoogleGenerativeAI(slot.apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    systemInstruction: SYSTEM_PROMPT,
    generationConfig: { temperature: 0, maxOutputTokens: maxTokens },
  });
  const result = await genModel.generateContent({
    contents: [{ role: "user", parts: [{ text: fragment }] }],
  });
  return result.response.text() || "";
}

async function runOne(slot: SlotPayload, fragment: string, maxTokens: number): Promise<string> {
  switch (slot.provider) {
    case "google":        return runGoogle(slot, fragment, maxTokens);
    case "openai":
    case "openai-compatible":
                           return runOpenAI(slot, fragment, maxTokens);
    case "openrouter":    return runOpenRouter(slot, fragment, maxTokens);
    case "huggingface":   return runHuggingFace(slot, fragment, maxTokens);
    default:
      throw new Error(
        `Y-phrase expansion requires Gemini, OpenAI, OpenRouter, or Hugging Face. '${slot.provider}' is not supported.`
      );
  }
}

// ----------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  let body: ExpandRequest;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid request body" }, { status: 400 }); }

  const { pairs, slot, maxTokens = 6 } = body;
  if (!Array.isArray(pairs) || pairs.length === 0) {
    return Response.json({ error: "pairs must be a non-empty array" }, { status: 400 });
  }

  const validation = validateAIConfig({
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
  });

  const { response, send, close } = createStreamResponse();
  (async () => {
    send({ type: "meta", total: pairs.length });
    if (!validation.valid) {
      for (const p of pairs) {
        send({
          type: "expansion",
          scaffoldId: p.scaffoldId,
          token: p.token,
          phrase: null,
          error: validation.error,
        });
      }
      send({ type: "done" });
      close();
      return;
    }

    const cap = Math.min(Math.max(maxTokens, 2), 12);
    const modelName = slot.customModelId || slot.model;

    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      const fragment = `${p.scaffold}${p.token}`;
      const startedAt = Date.now();
      if (i > 0) await delay(120);
      try {
        const raw = await runOne(slot, fragment, cap);
        const phrase = cleanPhrase(raw);
        send({
          type: "expansion",
          scaffoldId: p.scaffoldId,
          token: p.token,
          phrase,
          provenance: {
            provider: slot.provider,
            model: modelName,
            modelDisplayName: getModelDisplayName(slot.provider, modelName),
            responseTimeMs: Date.now() - startedAt,
          },
        });
      } catch (err) {
        send({
          type: "expansion",
          scaffoldId: p.scaffoldId,
          token: p.token,
          phrase: null,
          error: err instanceof Error ? err.message : "Expansion failed",
        });
      }
    }

    send({ type: "done" });
    close();
  })();

  return response;
}
