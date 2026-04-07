import { NextRequest, NextResponse } from "next/server";
import { validateAIConfig, generateAIResponse } from "@/lib/ai/client";
import { getModelDisplayName } from "@/lib/ai/config";
import { computeTextMetrics, computeWordOverlap } from "@/lib/metrics/text-metrics";
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

interface DivergenceRequest {
  prompt: string;
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

async function runSlot(slot: SlotPayload, prompt: string) {
  const config = {
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
  };

  const validation = validateAIConfig(config);
  if (!validation.valid) {
    return { error: validation.error!, provenance: buildProvenance(slot, 0) };
  }

  try {
    const result = await generateAIResponse(config, {
      prompt,
      systemPrompt: slot.systemPrompt || undefined,
      temperature: slot.temperature,
    });
    return {
      text: result.text,
      provenance: buildProvenance(slot, result.responseTimeMs),
      metrics: computeTextMetrics(result.text),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Generation failed",
      provenance: buildProvenance(slot, 0),
    };
  }
}

export async function POST(request: NextRequest) {
  let body: DivergenceRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompt, slotA, slotB } = body;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const promises = [runSlot(slotA, prompt)];
  if (slotB) {
    promises.push(runSlot(slotB, prompt));
  }

  const [resultA, resultB] = await Promise.all(promises);

  // Compute metrics if both succeeded
  let metrics = null;
  const textA = "text" in resultA ? (resultA as { text: string; metrics: ReturnType<typeof computeTextMetrics>; provenance: { responseTimeMs: number } }) : null;
  const textB = resultB && "text" in resultB ? (resultB as { text: string; metrics: ReturnType<typeof computeTextMetrics>; provenance: { responseTimeMs: number } }) : null;
  if (textA && textB) {
    const wordOverlap = computeWordOverlap(textA.text, textB.text);
    metrics = {
      wordOverlap,
      metricsA: textA.metrics,
      metricsB: textB.metrics,
      responseTimeDiffMs: Math.abs(textA.provenance.responseTimeMs - textB.provenance.responseTimeMs),
    };
  }

  return NextResponse.json({
    prompt,
    A: resultA,
    B: resultB || null,
    metrics,
  });
}
