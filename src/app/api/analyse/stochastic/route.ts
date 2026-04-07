import { NextRequest, NextResponse } from "next/server";
import { validateAIConfig, generateAIResponse, staggeredRun } from "@/lib/ai/client";
import { getModelDisplayName } from "@/lib/ai/config";
import { computeTextMetrics } from "@/lib/metrics/text-metrics";
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

interface StochasticRequest {
  prompt: string;
  runCount: number;
  slotA: SlotPayload;
  slotB?: SlotPayload | null;
}

async function runSlot(slot: SlotPayload, prompt: string, runCount: number) {
  const config = {
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
  };

  const validation = validateAIConfig(config);
  if (!validation.valid) {
    return { runs: [{ error: validation.error!, provenance: buildProvenance(slot, 0) }] };
  }

  const tasks = Array.from({ length: runCount }, () =>
    () => generateAIResponse(config, {
      prompt,
      systemPrompt: slot.systemPrompt || undefined,
      temperature: slot.temperature,
    })
  );
  const runs = await staggeredRun(tasks, 800);

  return {
    runs: runs.map((r) => {
      if (r.status === "fulfilled") {
        return {
          text: r.value.text,
          provenance: buildProvenance(slot, r.value.responseTimeMs),
          metrics: computeTextMetrics(r.value.text),
        };
      }
      return {
        error: r.reason?.message || "Generation failed",
        provenance: buildProvenance(slot, 0),
      };
    }),
  };
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

export async function POST(request: NextRequest) {
  let body: StochasticRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompt, runCount, slotA, slotB } = body;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const count = Math.min(Math.max(runCount || 5, 1), 20);

  // Run both slots (or just A if B not configured)
  const promises: Promise<{ runs: unknown[] }>[] = [runSlot(slotA, prompt, count)];
  if (slotB) {
    promises.push(runSlot(slotB, prompt, count));
  }

  const [resultA, resultB] = await Promise.all(promises);

  return NextResponse.json({
    prompt,
    runCount: count,
    A: resultA,
    B: resultB || null,
  });
}
