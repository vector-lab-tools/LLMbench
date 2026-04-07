import { NextRequest } from "next/server";
import { validateAIConfig, generateAIResponse } from "@/lib/ai/client";
import { getModelDisplayName } from "@/lib/ai/config";
import { computeTextMetrics } from "@/lib/metrics/text-metrics";
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

interface StochasticRequest {
  prompt: string;
  runCount: number;
  slotA: SlotPayload;
  slotB?: SlotPayload | null;
  noMarkdown?: boolean;
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

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  let body: StochasticRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompt, runCount, slotA, slotB, noMarkdown = false } = body;
  if (!prompt?.trim()) {
    return Response.json({ error: "Prompt is required" }, { status: 400 });
  }

  const count = Math.min(Math.max(runCount || 5, 1), 20);
  const { response, send, close } = createStreamResponse();

  // Run in background, streaming results as they arrive
  (async () => {
    // Send metadata first
    send({ type: "meta", runCount: count, hasB: !!slotB });

    // Process panels
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
          result: { error: validation.error!, provenance: buildProvenance(slot, 0) },
        });
        continue;
      }

      for (let i = 0; i < count; i++) {
        if (i > 0) await delay(800);

        try {
          const result = await generateAIResponse(config, {
            prompt,
            systemPrompt: buildSystemPrompt(slot.systemPrompt || undefined, noMarkdown),
            temperature: slot.temperature,
          });
          send({
            type: "run",
            panel,
            index: i,
            result: {
              text: result.text,
              provenance: buildProvenance(slot, result.responseTimeMs),
              metrics: computeTextMetrics(result.text),
            },
          });
        } catch (err) {
          send({
            type: "run",
            panel,
            index: i,
            result: {
              error: err instanceof Error ? err.message : "Generation failed",
              provenance: buildProvenance(slot, 0),
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
