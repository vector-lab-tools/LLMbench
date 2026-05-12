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
  // Optional: when retrying a single panel after a transient error
  // (e.g. rate-limit on Panel B), the client passes the panel id so the
  // route only dispatches that slot's call. Default "both" preserves
  // existing behaviour for normal submissions.
  panel?: "A" | "B" | "both";
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

  const { prompt, slotA, slotB, noMarkdown = false, panel = "both" } = body;

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

  // When `panel` is "A" or "B", call only that slot's provider — used by
  // the per-panel retry button to retry a single failing slot without
  // re-running (and re-billing) the working one. "both" keeps the
  // original fan-out behaviour for normal submissions.
  const wantA = panel !== "B";
  const wantB = panel !== "A";

  // Ollama slots should never reach this route — the client routes
  // them through the browser-direct path (src/lib/ai/ollama-browser.ts)
  // because the Vercel server can't reach the user's local Ollama
  // (it'd try its own localhost). Surface a clear routing-bug error
  // instead of the generic "Cannot connect to Ollama" the AI client
  // would otherwise throw — the latter falsely suggests the user's
  // Ollama is down when the real fault is on our side.
  const isOllamaProvider = (p: string) =>
    typeof p === "string" && p.trim().toLowerCase() === "ollama";
  if (wantA && isOllamaProvider(slotA.provider as string)) {
    return NextResponse.json(
      {
        error:
          "Routing bug: Ollama slot reached the server route. Ollama runs " +
          "directly from the browser; the client should have bypassed " +
          "/api/generate for this panel. Please reload the page; if the " +
          "issue persists, this is a bug in LLMbench's routing layer.",
      },
      { status: 400 }
    );
  }
  if (wantB && isOllamaProvider(slotB.provider as string)) {
    return NextResponse.json(
      {
        error:
          "Routing bug: Ollama slot reached the server route. Ollama runs " +
          "directly from the browser; the client should have bypassed " +
          "/api/generate for this panel. Please reload the page; if the " +
          "issue persists, this is a bug in LLMbench's routing layer.",
      },
      { status: 400 }
    );
  }

  const result = await fanOutGenerate(configA, configB, {
    prompt,
    systemPromptA: buildSystemPrompt(slotA.systemPrompt || undefined, noMarkdown),
    systemPromptB: buildSystemPrompt(slotB.systemPrompt || undefined, noMarkdown),
    temperatureA: slotA.temperature,
    temperatureB: slotB.temperature,
    skipA: !wantA,
    skipB: !wantB,
  });

  // Build response with provenance. Panels excluded by `panel` are
  // omitted from the payload entirely so the client merges only the
  // retried side back into state.
  const response: {
    prompt: string;
    generatedAt: string;
    panel: "A" | "B" | "both";
    A?: unknown;
    B?: unknown;
  } = {
    prompt,
    generatedAt: now,
    panel,
  };
  if (wantA) {
    response.A = {
      ...("text" in result.A
        ? { text: result.A.text, responseTimeMs: result.A.responseTimeMs }
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
    };
  }
  if (wantB) {
    response.B = {
      ...("text" in result.B
        ? { text: result.B.text, responseTimeMs: result.B.responseTimeMs }
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
    };
  }

  return NextResponse.json(response);
}
