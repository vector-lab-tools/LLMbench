import { NextRequest, NextResponse } from "next/server";
import { validateAIConfig } from "@/lib/ai/client";
import { getModelDisplayName } from "@/lib/ai/config";
import { computeMeanEntropy, computeMaxEntropyToken, computeTokenEntropy } from "@/lib/metrics/text-metrics";
import type { AIProvider } from "@/types/ai-settings";
import type { TokenLogprob } from "@/types/analysis";

interface SlotPayload {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  customModelId?: string;
  temperature: number;
  systemPrompt: string;
}

interface LogprobsRequest {
  prompt: string;
  topK?: number;
  slotA: SlotPayload;
  slotB?: SlotPayload | null;
}

function buildProvenance(slot: SlotPayload, responseTimeMs: number) {
  return {
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    modelDisplayName: getModelDisplayName(slot.provider, slot.customModelId || slot.model),
    temperature: slot.temperature,
    systemPrompt: slot.systemPrompt,
    responseTimeMs,
    generatedAt: new Date().toISOString(),
  };
}

// ---------- Google Gemini (direct SDK) ----------

async function runGoogleLogprobs(slot: SlotPayload, prompt: string, topK: number) {
  const model = slot.customModelId || slot.model;
  const startTime = Date.now();

  try {
    // Dynamic import to avoid bundling if not used
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(slot.apiKey);
    const genModel = genAI.getGenerativeModel({
      model,
      generationConfig: {
        temperature: slot.temperature,
        responseLogprobs: true,
        logprobs: topK,
      } as Record<string, unknown>,
    });

    const contents = [];
    if (slot.systemPrompt) {
      contents.push({ role: "user" as const, parts: [{ text: slot.systemPrompt }] });
      contents.push({ role: "model" as const, parts: [{ text: "Understood." }] });
    }
    contents.push({ role: "user" as const, parts: [{ text: prompt }] });

    const result = await genModel.generateContent({ contents });
    const responseTimeMs = Date.now() - startTime;
    const response = result.response;
    const text = response.text();

    // Extract logprobs from response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidate = (response as any).candidates?.[0];
    const logprobsResult = candidate?.logprobsResult;

    const tokens: TokenLogprob[] = [];
    if (logprobsResult?.chosenCandidates) {
      for (let i = 0; i < logprobsResult.chosenCandidates.length; i++) {
        const chosen = logprobsResult.chosenCandidates[i];
        const topCandidates = logprobsResult.topCandidates?.[i]?.candidates || [];

        tokens.push({
          token: chosen.token || "",
          logprob: chosen.logProbability ?? 0,
          topAlternatives: topCandidates
            .filter((c: { token: string }) => c.token !== chosen.token)
            .slice(0, topK)
            .map((c: { token: string; logProbability?: number }) => ({
              token: c.token,
              logprob: c.logProbability ?? 0,
            })),
        });
      }
    }

    return {
      text,
      provenance: buildProvenance(slot, responseTimeMs),
      tokens,
      meanEntropy: computeMeanEntropy(tokens),
      maxEntropyToken: computeMaxEntropyToken(tokens),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Logprobs generation failed",
      provenance: buildProvenance(slot, Date.now() - startTime),
    };
  }
}

// ---------- OpenAI (via Vercel AI SDK) ----------

async function runOpenAILogprobs(slot: SlotPayload, prompt: string, topK: number) {
  const startTime = Date.now();

  try {
    const { generateText } = await import("ai");
    const { createOpenAI } = await import("@ai-sdk/openai");

    const model = slot.customModelId || slot.model;
    const client = createOpenAI({ apiKey: slot.apiKey, baseURL: slot.baseUrl });

    const result = await generateText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: client(model) as any,
      system: slot.systemPrompt || undefined,
      messages: [{ role: "user", content: prompt }],
      temperature: slot.temperature,
      providerOptions: {
        openai: { logprobs: true, topLogprobs: topK },
      },
    });

    const responseTimeMs = Date.now() - startTime;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawLogprobs = (result as any).providerMetadata?.openai?.logprobs;

    const tokens: TokenLogprob[] = [];
    if (Array.isArray(rawLogprobs)) {
      for (const entry of rawLogprobs) {
        if (!entry) continue;
        const items = Array.isArray(entry) ? entry : [entry];
        for (const item of items) {
          tokens.push({
            token: item.token || "",
            logprob: item.logprob ?? 0,
            topAlternatives: (item.top_logprobs || [])
              .filter((t: { token: string }) => t.token !== item.token)
              .slice(0, topK)
              .map((t: { token: string; logprob: number }) => ({
                token: t.token,
                logprob: t.logprob,
              })),
          });
        }
      }
    }

    return {
      text: result.text,
      provenance: buildProvenance(slot, responseTimeMs),
      tokens,
      meanEntropy: computeMeanEntropy(tokens),
      maxEntropyToken: computeMaxEntropyToken(tokens),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Logprobs generation failed",
      provenance: buildProvenance(slot, Date.now() - startTime),
    };
  }
}

// ---------- Dispatch ----------

async function runSlotLogprobs(slot: SlotPayload, prompt: string, topK: number) {
  const validation = validateAIConfig({
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
  });

  if (!validation.valid) {
    return { error: validation.error!, provenance: buildProvenance(slot, 0) };
  }

  switch (slot.provider) {
    case "google":
      return runGoogleLogprobs(slot, prompt, topK);
    case "openai":
    case "openai-compatible":
      return runOpenAILogprobs(slot, prompt, topK);
    default:
      return {
        error: `Token probabilities are not supported for ${slot.provider}. Use Google Gemini or OpenAI.`,
        provenance: buildProvenance(slot, 0),
      };
  }
}

export async function POST(request: NextRequest) {
  let body: LogprobsRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompt, topK, slotA, slotB } = body;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const k = Math.min(Math.max(topK || 5, 1), 20);

  const promises = [runSlotLogprobs(slotA, prompt, k)];
  if (slotB) {
    promises.push(runSlotLogprobs(slotB, prompt, k));
  }

  const [resultA, resultB] = await Promise.all(promises);

  return NextResponse.json({
    prompt,
    topK: k,
    A: resultA,
    B: resultB || null,
  });
}
