/**
 * Sampling Probe — single-step endpoint.
 *
 * POST /api/investigate/sampling-step
 *   body: { prefix: string, slot: SamplingSlotPayload, topK?: number }
 *   200:  { distribution: [{token, logprob}], chosen: {token, logprob} | null, provenance }
 *
 * One HTTP round trip per sampled token. The browser holds the sampling
 * state machine and re-softmaxes under the user's temperature and top-p
 * client-side so sliders are instant. We always ask the provider for
 * max_tokens=1 at temperature=0 so the returned distribution is unaltered
 * by provider-side sampling.
 */

import { NextRequest } from "next/server";
import { validateAIConfig } from "@/lib/ai/client";
import { runSamplingStep, type SamplingSlotPayload } from "@/lib/sampling/provider";

interface SamplingStepRequest {
  prefix: string;
  slot: SamplingSlotPayload;
  topK?: number;
}

export async function POST(request: NextRequest) {
  let body: SamplingStepRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { prefix, slot, topK } = body;
  if (typeof prefix !== "string" || prefix.length === 0) {
    return Response.json({ error: "prefix must be a non-empty string" }, { status: 400 });
  }
  if (!slot || !slot.provider) {
    return Response.json({ error: "slot with provider is required" }, { status: 400 });
  }

  const k = Math.min(Math.max(topK ?? 40, 5), 50);

  const validation = validateAIConfig({
    provider: slot.provider,
    model: slot.customModelId || slot.model,
    apiKey: slot.apiKey,
    baseUrl: slot.baseUrl,
  });
  if (!validation.valid) {
    return Response.json({ error: validation.error ?? "Invalid slot configuration" }, { status: 400 });
  }

  try {
    const result = await runSamplingStep(slot, prefix, k);
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sampling step failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
