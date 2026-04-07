import { NextRequest } from "next/server";
import { validateAIConfig, generateAIResponse } from "@/lib/ai/client";
import { getModelDisplayName } from "@/lib/ai/config";
import { computeTextMetrics } from "@/lib/metrics/text-metrics";
import { createStreamResponse } from "@/lib/streaming";
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  let body: TemperatureRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompt, temperatures, slotA, slotB } = body;
  if (!prompt?.trim()) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  const temps = temperatures?.length ? temperatures : [0.0, 0.3, 0.7, 1.0, 1.5, 2.0];
  const { response, send, close } = createStreamResponse();

  (async () => {
    send({ type: "meta", temperatures: temps, hasB: !!slotB });

    const panels: { panel: "A" | "B"; slot: SlotPayload }[] = [{ panel: "A", slot: slotA }];
    if (slotB) panels.push({ panel: "B", slot: slotB });

    for (const { panel, slot } of panels) {
      const config = {
        provider: slot.provider,
        model: slot.customModelId || slot.model,
        apiKey: slot.apiKey,
        baseUrl: slot.baseUrl,
      };

      const validation = validateAIConfig(config);
      if (!validation.valid) {
        send({
          type: "run",
          panel,
          index: 0,
          temperature: temps[0],
          result: { error: validation.error!, provenance: buildProvenance(slot, temps[0], 0) },
        });
        continue;
      }

      for (let i = 0; i < temps.length; i++) {
        if (i > 0) await delay(800);
        const temp = temps[i];

        try {
          const result = await generateAIResponse(config, {
            prompt,
            systemPrompt: slot.systemPrompt || undefined,
            temperature: temp,
          });
          send({
            type: "run",
            panel,
            index: i,
            temperature: temp,
            result: {
              temperature: temp,
              text: result.text,
              provenance: buildProvenance(slot, temp, result.responseTimeMs),
              metrics: computeTextMetrics(result.text),
            },
          });
        } catch (err) {
          send({
            type: "run",
            panel,
            index: i,
            temperature: temp,
            result: {
              temperature: temp,
              error: err instanceof Error ? err.message : "Generation failed",
              provenance: buildProvenance(slot, temp, 0),
            },
          });
        }
      }
    }

    send({ type: "done" });
    close();
  })();

  return response;
}
