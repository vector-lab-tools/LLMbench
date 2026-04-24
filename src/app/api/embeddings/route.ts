/**
 * Embeddings endpoint — used by Grammar Probe's Phase B geometry view.
 *
 * Accepts a batch of texts and a slot payload, and returns one vector per
 * text. Providers supported in v1:
 *
 *   - openai, openai-compatible : `text-embedding-3-small` (1536-d) by default
 *   - google                    : `text-embedding-004` (768-d) by default
 *
 * The chat model and the embedding model are independent. The user's slot
 * carries the API key; this route picks a sensible embedding model for the
 * slot's provider. Other providers (anthropic, ollama, openrouter, huggingface)
 * return a typed capability error — the caller should gate the UI on
 * provider support.
 */

import { NextRequest } from "next/server";
import type { AIProvider } from "@/types/ai-settings";

interface EmbeddingSlot {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
  /** Optional override; otherwise we pick per provider. */
  embeddingModel?: string;
}

interface EmbeddingsRequest {
  texts: string[];
  slot: EmbeddingSlot;
}

const DEFAULT_MODEL: Partial<Record<AIProvider, string>> = {
  "openai": "text-embedding-3-small",
  "openai-compatible": "text-embedding-3-small",
  "google": "text-embedding-004",
};

async function embedOpenAI(texts: string[], slot: EmbeddingSlot): Promise<number[][]> {
  const baseUrl = slot.baseUrl || "https://api.openai.com/v1";
  const model = slot.embeddingModel || DEFAULT_MODEL[slot.provider] || "text-embedding-3-small";
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${slot.apiKey}` },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI embeddings error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return (data.data || []).map((d: { embedding: number[] }) => d.embedding);
}

async function embedGoogle(texts: string[], slot: EmbeddingSlot): Promise<number[][]> {
  const model = slot.embeddingModel || DEFAULT_MODEL.google || "text-embedding-004";
  // Google's REST batchEmbedContents groups requests in one call.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${encodeURIComponent(slot.apiKey)}`;
  const body = {
    requests: texts.map(t => ({
      model: `models/${model}`,
      content: { parts: [{ text: t }] },
    })),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Google embeddings error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  return (data.embeddings || []).map((e: { values: number[] }) => e.values);
}

export async function POST(request: NextRequest) {
  let body: EmbeddingsRequest;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { texts, slot } = body;
  if (!Array.isArray(texts) || texts.length === 0) {
    return Response.json({ error: "texts must be a non-empty array" }, { status: 400 });
  }
  if (!slot || !slot.provider || !slot.apiKey) {
    return Response.json({ error: "slot.provider and slot.apiKey are required" }, { status: 400 });
  }

  try {
    let embeddings: number[][];
    let modelUsed: string;
    switch (slot.provider) {
      case "openai":
      case "openai-compatible":
        embeddings = await embedOpenAI(texts, slot);
        modelUsed = slot.embeddingModel || DEFAULT_MODEL[slot.provider] || "text-embedding-3-small";
        break;
      case "google":
        embeddings = await embedGoogle(texts, slot);
        modelUsed = slot.embeddingModel || DEFAULT_MODEL.google!;
        break;
      default:
        return Response.json(
          {
            error:
              `Embeddings require an OpenAI, OpenAI-compatible, or Google slot. '${slot.provider}' is not supported.`,
          },
          { status: 400 }
        );
    }
    return Response.json({ embeddings, model: modelUsed, provider: slot.provider });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Embeddings failed" },
      { status: 500 }
    );
  }
}
