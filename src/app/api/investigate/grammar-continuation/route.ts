/**
 * Grammar Probe — Phase B (Continuation logprobs).
 *
 * For each supplied scaffold (e.g. "Democracy is not just a system of
 * government, but a "), fetch the model's top-K next-token distribution
 * at position 0 of the assistant's response. This exposes what the model
 * reaches for when primed with the opening of a rhetorical construction.
 *
 * Streams NDJSON events (one per scaffold × slot) so the UI can render
 * results progressively. Works with Gemini (2.0), OpenAI, OpenRouter, and
 * Hugging Face. Other providers return a typed error.
 *
 * The shape of each distribution event:
 *   {
 *     type: "scaffold",
 *     panel: "A" | "B",
 *     scaffoldId: string,
 *     scaffold: string,
 *     result: {
 *       chosen: { token, logprob },           // max-probability / sampled token
 *       distribution: [{ token, logprob }],   // top-K including chosen
 *       provenance: {...},
 *     } | { error, provenance }
 *   }
 */

import { NextRequest } from "next/server";
import { validateAIConfig } from "@/lib/ai/client";
import { getModelDisplayName } from "@/lib/ai/config";
import { createStreamResponse } from "@/lib/streaming";
import { buildSystemPrompt } from "@/lib/ai/system-prompts";
import type { AIProvider } from "@/types/ai-settings";

interface SlotPayload {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  customModelId?: string;
  temperature: number;
  systemPrompt: string;
}

interface ScaffoldSpec {
  id: string;
  text: string;
}

interface GrammarContinuationRequest {
  scaffolds: ScaffoldSpec[];
  topK?: number;
  slotA: SlotPayload;
  slotB?: SlotPayload | null;
  noMarkdown?: boolean;
}

interface TokenProb { token: string; logprob: number }

interface ContinuationResult {
  chosen: TokenProb | null;
  distribution: TokenProb[];
}

function provenance(slot: SlotPayload, responseTimeMs: number) {
  return {
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    modelDisplayName: getModelDisplayName(slot.provider, slot.customModelId || slot.model),
    temperature: slot.temperature,
    responseTimeMs,
  };
}

function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

// ---------- Google Gemini ----------
async function runGoogle(
  slot: SlotPayload, scaffold: string, topK: number, noMarkdown: boolean
): Promise<ContinuationResult> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const model = slot.customModelId || slot.model;
  const genAI = new GoogleGenerativeAI(slot.apiKey);
  const genModel = genAI.getGenerativeModel({
    model,
    generationConfig: {
      temperature: slot.temperature,
      responseLogprobs: true,
      logprobs: topK,
      maxOutputTokens: 1,
    } as Record<string, unknown>,
  });

  const contents = [];
  const sys = buildSystemPrompt(slot.systemPrompt || undefined, noMarkdown);
  if (sys) {
    contents.push({ role: "user" as const, parts: [{ text: sys }] });
    contents.push({ role: "model" as const, parts: [{ text: "Understood." }] });
  }
  contents.push({ role: "user" as const, parts: [{ text: scaffold }] });

  const result = await genModel.generateContent({ contents });
  const response = result.response;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidate = (response as any).candidates?.[0];
  const logprobsResult = candidate?.logprobsResult;
  const chosenArr = logprobsResult?.chosenCandidates || [];
  const topArr = logprobsResult?.topCandidates || [];
  const chosen = chosenArr[0]
    ? { token: chosenArr[0].token || "", logprob: chosenArr[0].logProbability ?? 0 }
    : null;
  const distribution: TokenProb[] = (topArr[0]?.candidates || []).map(
    (c: { token: string; logProbability?: number }) => ({ token: c.token, logprob: c.logProbability ?? 0 })
  );
  return { chosen, distribution };
}

// ---------- OpenAI / compatible ----------
async function runOpenAI(
  slot: SlotPayload, scaffold: string, topK: number, noMarkdown: boolean
): Promise<ContinuationResult> {
  const { generateText } = await import("ai");
  const { createOpenAI } = await import("@ai-sdk/openai");
  const model = slot.customModelId || slot.model;
  const client = createOpenAI({ apiKey: slot.apiKey, baseURL: slot.baseUrl });
  const result = await generateText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: client.chat(model) as any,
    system: buildSystemPrompt(slot.systemPrompt || undefined, noMarkdown),
    messages: [{ role: "user", content: scaffold }],
    temperature: slot.temperature,
    maxOutputTokens: 1,
    providerOptions: { openai: { logprobs: true, topLogprobs: topK } },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (result as any).providerMetadata?.openai?.logprobs;
  let chosen: TokenProb | null = null;
  let distribution: TokenProb[] = [];
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

// ---------- Direct fetch (OpenRouter, HuggingFace) ----------
async function runDirect(
  slot: SlotPayload, baseUrl: string, scaffold: string, topK: number, noMarkdown: boolean,
  extraHeaders: Record<string, string> = {}
): Promise<ContinuationResult> {
  const model = slot.customModelId || slot.model;
  const messages: { role: string; content: string }[] = [];
  const sys = buildSystemPrompt(slot.systemPrompt || undefined, noMarkdown);
  if (sys) messages.push({ role: "system", content: sys });
  messages.push({ role: "user", content: scaffold });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${slot.apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: slot.temperature,
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
  let chosen: TokenProb | null = null;
  let distribution: TokenProb[] = [];
  const decode = (e: { token?: string; bytes?: number[] | null }): string => {
    if (e.bytes && Array.isArray(e.bytes) && e.bytes.length > 0) {
      try { return new TextDecoder("utf-8").decode(new Uint8Array(e.bytes)); }
      catch { /* fall through */ }
    }
    return e.token ?? "";
  };
  if (content.length > 0) {
    const entry = content[0];
    chosen = { token: decode(entry), logprob: entry.logprob ?? 0 };
    distribution = (entry.top_logprobs || []).map(
      (t: { token?: string; bytes?: number[] | null; logprob: number }) =>
        ({ token: decode(t), logprob: t.logprob })
    );
  }
  return { chosen, distribution };
}

async function runOne(
  slot: SlotPayload, scaffold: string, topK: number, noMarkdown: boolean
): Promise<ContinuationResult> {
  const model = slot.customModelId || slot.model;
  let result: ContinuationResult;
  switch (slot.provider) {
    case "google": {
      if (model.includes("2.5")) throw new Error(`${model} does not provide logprobs. Use gemini-2.0-flash.`);
      result = await runGoogle(slot, scaffold, topK, noMarkdown);
      break;
    }
    case "openai":
    case "openai-compatible":
      result = await runOpenAI(slot, scaffold, topK, noMarkdown);
      break;
    case "openrouter":
      result = await runDirect(slot, "https://openrouter.ai/api/v1", scaffold, topK, noMarkdown, {
        "HTTP-Referer": "https://llm-bench.vercel.app",
        "X-Title": "LLMbench",
      });
      break;
    case "huggingface":
      result = await runDirect(slot, "https://router.huggingface.co/v1", scaffold, topK, noMarkdown);
      break;
    default:
      throw new Error(
        `Continuation logprobs require Gemini (2.0), OpenAI, OpenRouter, or Hugging Face. ${slot.provider} is not supported.`
      );
  }
  // Fail loudly if the provider responded 200 but returned no logprobs. This
  // happens on OpenRouter for non-OpenAI chat models (Qwen, Llama, Mistral,
  // Gemini-via-OR, etc.) and on some HF router models — they accept the
  // `logprobs` flag but their chat completions response never populates
  // `choice.logprobs.content`. Without this check the bundle exports with
  // empty distributions and the downstream tool cannot tell generation
  // failed from a legitimately flat distribution.
  if (!result.distribution || result.distribution.length === 0) {
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
  return result;
}

export async function POST(request: NextRequest) {
  let body: GrammarContinuationRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { scaffolds, topK, slotA, slotB, noMarkdown = false } = body;
  if (!Array.isArray(scaffolds) || scaffolds.length === 0) {
    return Response.json({ error: "scaffolds must be a non-empty array" }, { status: 400 });
  }
  const k = Math.min(Math.max(topK || 10, 1), 20);

  const { response, send, close } = createStreamResponse();

  (async () => {
    const panels: { panel: "A" | "B"; slot: SlotPayload }[] = [{ panel: "A", slot: slotA }];
    if (slotB) panels.push({ panel: "B", slot: slotB });

    const total = panels.length * scaffolds.length;
    send({ type: "meta", total, topK: k, scaffoldCount: scaffolds.length, hasB: !!slotB });

    let sent = 0;
    for (const { panel, slot } of panels) {
      const validation = validateAIConfig({
        provider: slot.provider,
        model: slot.customModelId || slot.model,
        apiKey: slot.apiKey,
        baseUrl: slot.baseUrl,
      });
      if (!validation.valid) {
        for (const sc of scaffolds) {
          send({
            type: "scaffold",
            panel,
            scaffoldId: sc.id,
            scaffold: sc.text,
            result: { error: validation.error!, provenance: provenance(slot, 0) },
          });
          sent++;
        }
        continue;
      }

      for (const sc of scaffolds) {
        if (sent > 0) await delay(350);
        const startedAt = Date.now();
        try {
          const r = await runOne(slot, sc.text, k, noMarkdown);
          send({
            type: "scaffold",
            panel,
            scaffoldId: sc.id,
            scaffold: sc.text,
            result: {
              chosen: r.chosen,
              distribution: r.distribution,
              provenance: provenance(slot, Date.now() - startedAt),
            },
          });
        } catch (err) {
          send({
            type: "scaffold",
            panel,
            scaffoldId: sc.id,
            scaffold: sc.text,
            result: {
              error: err instanceof Error ? err.message : "Continuation failed",
              provenance: provenance(slot, Date.now() - startedAt),
            },
          });
        }
        sent++;
      }
    }

    send({ type: "done" });
    close();
  })();

  return response;
}
