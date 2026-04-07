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

interface SensitivityRequest {
  prompt: string;
  variations: { label: string; prompt: string }[];
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

async function runSlotSensitivity(
  slot: SlotPayload,
  basePrompt: string,
  variations: { label: string; prompt: string }[]
) {
  const config = {
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
  };

  const validation = validateAIConfig(config);
  if (!validation.valid) {
    const errResult = {
      error: validation.error!,
      provenance: buildProvenance(slot, 0),
    };
    return {
      base: errResult,
      variations: variations.map((v) => ({
        variationLabel: v.label,
        variationPrompt: v.prompt,
        result: errResult,
      })),
    };
  }

  // Run base prompt
  const allPrompts = [
    { label: "__base__", prompt: basePrompt },
    ...variations,
  ];

  const tasks = allPrompts.map((v) =>
    () => generateAIResponse(config, {
      prompt: v.prompt,
      systemPrompt: slot.systemPrompt || undefined,
      temperature: slot.temperature,
    })
  );
  const results = await staggeredRun(tasks, 800);

  const mapped = results.map((r, i) => {
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
  });

  return {
    base: mapped[0],
    variations: variations.map((v, i) => ({
      variationLabel: v.label,
      variationPrompt: v.prompt,
      result: mapped[i + 1],
    })),
  };
}

export async function POST(request: NextRequest) {
  let body: SensitivityRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompt, variations, slotA, slotB } = body;
  if (!prompt?.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }
  if (!variations?.length) {
    return NextResponse.json({ error: "At least one variation is required" }, { status: 400 });
  }

  const promises = [runSlotSensitivity(slotA, prompt, variations)];
  if (slotB) {
    promises.push(runSlotSensitivity(slotB, prompt, variations));
  }

  const [resultA, resultB] = await Promise.all(promises);

  return NextResponse.json({
    prompt,
    variations,
    A: resultA,
    B: resultB || null,
  });
}
