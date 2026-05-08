"use client";

/**
 * Browser-direct Ollama client.
 *
 * For most providers LLMbench routes generation through its own
 * Next.js API route (`/api/generate`) so API keys never leave the
 * server. Ollama is the special case: it has no API key, runs on the
 * user's own machine, and the natural endpoint is
 * `http://localhost:11434`. When LLMbench is itself deployed (e.g. on
 * Vercel), routing Ollama through the API route fails because it's
 * Vercel's `localhost` that gets contacted, not the user's machine.
 *
 * The browser, however, can reach `http://localhost:11434` directly
 * from any HTTPS-deployed page:
 *
 *   - `localhost` is a "potentially trustworthy URL" per the W3C
 *     Secure Contexts spec, so HTTPS → http://localhost is NOT
 *     blocked as mixed content.
 *   - The only browser-level gate is CORS, which the user opens with
 *     `OLLAMA_ORIGINS="*"` (or a specific origin list).
 *   - Chrome's Private Network Access enforcement is not currently
 *     mandatory for fetch/XHR; if Chrome ever flips it on, Ollama
 *     would need to add `Access-Control-Allow-Private-Network: true`
 *     to its preflight response, which is upstream's call.
 *
 * So the right thing for Ollama is to skip the API route entirely and
 * fetch from the browser. This module is the single point of contact
 * for that path.
 */

export interface OllamaBrowserParams {
  baseUrl: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  signal?: AbortSignal;
}

export interface OllamaBrowserResult {
  text: string;
  responseTimeMs: number;
}

/** Fetch a chat completion from Ollama directly from the browser. */
export async function generateOllamaFromBrowser(
  params: OllamaBrowserParams
): Promise<OllamaBrowserResult> {
  const startedAt = Date.now();
  const messages: { role: string; content: string }[] = [];
  if (params.systemPrompt && params.systemPrompt.trim().length > 0) {
    messages.push({ role: "system", content: params.systemPrompt });
  }
  messages.push({ role: "user", content: params.prompt });

  // Normalise: strip trailing slashes, append /v1/chat/completions.
  // Tolerate both `http://localhost:11434` and `.../v1` forms.
  const base = (params.baseUrl || "http://127.0.0.1:11434")
    .replace("://localhost", "://127.0.0.1")
    .replace(/\/+$/, "");
  const url = base.endsWith("/v1")
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        messages,
        temperature: params.temperature ?? 0.7,
      }),
      signal: params.signal,
    });
  } catch (err) {
    // Network-level failure (Ollama not running, CORS rejection,
    // private-network-access block). The user-visible message names
    // the most likely cause and the most useful fix so the failure
    // doesn't read as a generic "fetch failed".
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new Error(
      `Cannot reach Ollama at ${base}. Confirm Ollama is running ` +
      `(\`ollama serve\` or the Ollama app), and if you're calling from a ` +
      `deployed LLMbench, restart Ollama with \`OLLAMA_ORIGINS="*" ollama serve\` ` +
      `so the browser is allowed to talk to it (CORS).`
    );
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `Ollama returned ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`
    );
  }
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content ?? "";
  return { text, responseTimeMs: Date.now() - startedAt };
}
