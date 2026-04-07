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

interface TemperatureRequest {
  prompt: string;
  temperatures: number[];
  slotA: SlotPayload;
  slotB?: SlotPayload | null;
}

function buildProvenance(slot: SlotPayload, temperature: number, responseTimeMs: number) {
  return {
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    modelDisplayName: getModelDisplayName(slot.provider, slot.customModelId || slot.model),
    temperature,
    systemPrompt: slot.systemPrompt,
    responseTimeMs,
    generatedAt: new Date().toISOString(),
  };
}

async function runSlotTemperatures(slot: SlotPayload, prompt: string, temperatures: number[]) {
  const config = {
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
  };

  const validation = validateAIConfig(config);
  if (!validation.valid) {
    return {
      runs: temperatures.map((t) => ({
        temperature: t,
        error: validation.error!,
        provenance: buildProvenance(slot, t, 0),
      })),
    };
  }

  const tasks = temperatures.map((temp) =>
    () => generateAIResponse(config, {
      prompt,
      systemPrompt: slot.systemPrompt || undefined,
      temperature: temp,
    }).then((r) => ({ ...r, temperature: temp }))
  );
  const results = await staggeredRun(tasks, 800);

  return {
    runs: results.map((r, i) => {
      const temp = temperatures[i];
      if (r.status === "fulfilled") {
        return {
          temperature: r.value.temperature,
          text: r.value.text,
          provenance: buildProvenance(slot, temp, r.value.responseTimeMs),
          metrics: computeTextMetrics(r.value.text),
        };
      }
      return {
        temperature: temp,
        error: r.reason?.message || "Generation failed",
        provenance: buildProvenance(slot, temp, 0),
      };
    }),
  };
}

export async function POST(request: NextRequest) {
  let body: TemperatureRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompt, temperatures, slotA, slotB } = body;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const temps = temperatures?.length ? temperatures : [0.0, 0.3, 0.7, 1.0, 1.5, 2.0];

  const promises = [runSlotTemperatures(slotA, prompt, temps)];
  if (slotB) {
    promises.push(runSlotTemperatures(slotB, prompt, temps));
  }

  const [resultA, resultB] = await Promise.all(promises);

  return NextResponse.json({
    prompt,
    temperatures: temps,
    A: resultA,
    B: resultB || null,
  });
}
