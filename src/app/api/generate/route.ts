/**
 * Fan-out API Route
 *
 * Receives a prompt + both provider configs, dispatches to two LLMs
 * in parallel via Promise.allSettled, returns both responses with
 * provenance metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateAIConfig, fanOutGenerate } from "@/lib/ai/client";
import { getModelDisplayName } from "@/lib/ai/config";
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

interface GenerateRequest {
  prompt: string;
  slotA: SlotPayload;
  slotB: SlotPayload;
  noMarkdown?: boolean;
}

export async function POST(request: NextRequest) {
  let body: GenerateRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { prompt, slotA, slotB, noMarkdown = false } = body;

  if (!prompt || !prompt.trim()) {
    return NextResponse.json(
      { error: "Prompt is required" },
      { status: 400 }
    );
  }

  // Build request configs
  const configA = {
    provider: slotA.provider,
    model: slotA.customModelId || slotA.model,
    apiKey: slotA.apiKey,
    baseUrl: slotA.baseUrl,
  };

  const configB = {
    provider: slotB.provider,
    model: slotB.customModelId || slotB.model,
    apiKey: slotB.apiKey,
    baseUrl: slotB.baseUrl,
  };

  // Validate both configs
  const validationA = validateAIConfig(configA);
  const validationB = validateAIConfig(configB);

  if (!validationA.valid && !validationB.valid) {
    return NextResponse.json(
      {
        error: "Both providers are misconfigured",
        details: { A: validationA.error, B: validationB.error },
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  // If only one is valid, still dispatch both (allSettled handles failures)
  const result = await fanOutGenerate(configA, configB, {
    prompt,
    systemPromptA: buildSystemPrompt(slotA.systemPrompt || undefined, noMarkdown),
    systemPromptB: buildSystemPrompt(slotB.systemPrompt || undefined, noMarkdown),
    temperatureA: slotA.temperature,
    temperatureB: slotB.temperature,
  });

  // Build response with provenance
  const response = {
    prompt,
    generatedAt: now,
    A: {
      ...("text" in result.A
        ? {
            text: result.A.text,
            responseTimeMs: result.A.responseTimeMs,
          }
        : { error: result.A.error }),
      provenance: {
        provider: slotA.provider,
        model: slotA.customModelId || slotA.model,
        modelDisplayName: getModelDisplayName(
          slotA.provider,
          slotA.customModelId || slotA.model
        ),
        temperature: slotA.temperature,
        systemPrompt: slotA.systemPrompt,
      },
    },
    B: {
      ...("text" in result.B
        ? {
            text: result.B.text,
            responseTimeMs: result.B.responseTimeMs,
          }
        : { error: result.B.error }),
      provenance: {
        provider: slotB.provider,
        model: slotB.customModelId || slotB.model,
        modelDisplayName: getModelDisplayName(
          slotB.provider,
          slotB.customModelId || slotB.model
        ),
        temperature: slotB.temperature,
        systemPrompt: slotB.systemPrompt,
      },
    },
  };

  return NextResponse.json(response);
}
