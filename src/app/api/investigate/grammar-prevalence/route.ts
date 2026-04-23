/**
 * Grammar Probe — Phase A (Prevalence).
 *
 * For each prompt × temperature × slot, generate one response and stream it
 * back. Regex counting happens client-side so the same result can be recounted
 * against different patterns without re-running the model.
 */

import { NextRequest } from "next/server";
import { validateAIConfig, generateAIResponse } from "@/lib/ai/client";
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

interface PromptSpec {
  id: string;
  prompt: string;
  register?: string;
}

interface GrammarPrevalenceRequest {
  prompts: PromptSpec[];
  temperatures: number[];
  slotA: SlotPayload;
  slotB?: SlotPayload | null;
  noMarkdown?: boolean;
}

function provenance(slot: SlotPayload, responseTimeMs: number, temperature: number) {
  return {
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    modelDisplayName: getModelDisplayName(slot.provider, slot.customModelId || slot.model),
    temperature,
    responseTimeMs,
    generatedAt: new Date().toISOString(),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  let body: GrammarPrevalenceRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prompts, temperatures, slotA, slotB, noMarkdown = false } = body;
  if (!Array.isArray(prompts) || prompts.length === 0) {
    return Response.json({ error: "prompts must be a non-empty array" }, { status: 400 });
  }
  if (!Array.isArray(temperatures) || temperatures.length === 0) {
    return Response.json({ error: "temperatures must be a non-empty array" }, { status: 400 });
  }

  const { response, send, close } = createStreamResponse();

  (async () => {
    const panels: { panel: "A" | "B"; slot: SlotPayload }[] = [{ panel: "A", slot: slotA }];
    if (slotB) panels.push({ panel: "B", slot: slotB });

    const totalRuns = panels.length * prompts.length * temperatures.length;
    send({ type: "meta", totalRuns, hasB: !!slotB, promptCount: prompts.length, tempCount: temperatures.length });

    let runIndex = 0;

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
          runIndex: runIndex++,
          promptId: prompts[0].id,
          temperature: temperatures[0],
          result: { error: validation.error!, provenance: provenance(slot, 0, temperatures[0]) },
        });
        continue;
      }

      for (const spec of prompts) {
        for (const temperature of temperatures) {
          if (runIndex > 0) await delay(400);
          try {
            const result = await generateAIResponse(config, {
              prompt: spec.prompt,
              systemPrompt: buildSystemPrompt(slot.systemPrompt || undefined, noMarkdown),
              temperature,
            });
            send({
              type: "run",
              panel,
              runIndex: runIndex++,
              promptId: spec.id,
              register: spec.register,
              prompt: spec.prompt,
              temperature,
              result: {
                text: result.text,
                provenance: provenance(slot, result.responseTimeMs, temperature),
              },
            });
          } catch (err) {
            send({
              type: "run",
              panel,
              runIndex: runIndex++,
              promptId: spec.id,
              register: spec.register,
              prompt: spec.prompt,
              temperature,
              result: {
                error: err instanceof Error ? err.message : "Generation failed",
                provenance: provenance(slot, 0, temperature),
              },
            });
          }
        }
      }
    }

    send({ type: "done" });
    close();
  })();

  return response;
}
