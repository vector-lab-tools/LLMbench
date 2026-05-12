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
    // The thrown message uses a structured prefix that the panel-error
    // renderer (CompareMode and friends) can detect to lay the failure
    // out with a copy-to-clipboard command block, rather than dumping a
    // long single-line string at the user. Format:
    //
    //   OLLAMA_UNREACHABLE::<baseUrl>
    //
    // Anything after the marker is the base URL Ollama was called at.
    // If the renderer doesn't recognise the prefix, fall back to a
    // human-readable sentence — old call sites and non-Compare modes
    // (Sampling, Sensitivity, etc.) still get a useful message.
    throw new Error(`OLLAMA_UNREACHABLE::${base}`);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `Ollama returned ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`
    );
  }
  const data = await res.json();
  const rawText: string = data?.choices?.[0]?.message?.content ?? "";
  return { text: stripHarmonyChannels(rawText), responseTimeMs: Date.now() - startedAt };
}

// ---------------------------------------------------------------------------
// Harmony-format channel stripping
//
// A growing number of open-weight reasoning models (OpenAI's gpt-oss family,
// some Gemma-derived community tags, certain Qwen "thinking" variants) emit
// their output structured as harmony channels:
//
//   <|channel|>thought<|message|>...hidden reasoning...<|end|>
//   <|channel|>commentary<|message|>...meta notes...<|end|>
//   <|channel|>final<|message|>...the actual answer...<|return|>
//
// The OpenAI Chat Completions API normally hides everything but the `final`
// channel content. Ollama's `/v1/chat/completions` compat layer currently
// passes the raw token stream through, which leaves users staring at the
// model's internal planning + a constraint-checklist self-audit instead of
// the answer. We strip these client-side so close-reading isn't polluted
// by structural tokens — but we strip in `ollama-browser.ts` rather than in
// the renderer because the same cleaned string is what gets saved to a
// comparison, exported as a bundle, and indexed by annotations.
//
// Strategy:
//   1. If a `<|channel|>final` segment is present, keep only its content.
//   2. Otherwise, strip all `<|...|>` special-token markers in place. This
//      leaves the planning prose intact (better than dropping the response
//      entirely) but removes the bracket-pipe noise.
//
// Tokens (the logprobs path) are stripped in parallel using the same logic
// so the Probs heatmap stays aligned with the visible prose. See
// `stripHarmonyChannelsFromTokens` below.
// ---------------------------------------------------------------------------

const HARMONY_FINAL_RE =
  /<\|channel\|>\s*final\s*(?:<\|message\|>)?([\s\S]*?)(?:<\|end\|>|<\|return\|>|<\|channel\|>|$)/;

const HARMONY_MARKER_RE = /<\|[^|>]*\|>/g;

function stripHarmonyChannels(text: string): string {
  if (!text || !text.includes("<|")) return text;
  const finalMatch = text.match(HARMONY_FINAL_RE);
  if (finalMatch && finalMatch[1].trim().length > 0) {
    return finalMatch[1].trim();
  }
  // No `final` channel found — fall back to stripping markers in place.
  // Also collapse the "<|channel|>name" pattern (no closing marker yet)
  // that appears when a model opens a channel without ending the previous
  // one, e.g. "<|channel|>thought" at the start of an unfenced output.
  return text
    .replace(/<\|channel\|>\s*\w+\s*(?:<\|message\|>)?/g, "")
    .replace(HARMONY_MARKER_RE, "")
    .trim();
}

/**
 * Token-level companion to `stripHarmonyChannels`. Slices the OllamaToken
 * array so its concatenated text matches the cleaned prose: drops every
 * token whose decoded form is a harmony special-token (`<|...|>`), and if
 * a `<|channel|>final` boundary exists, slices from there. Keeps the
 * Probs heatmap aligned with the visible text — without this, position 1
 * in the heatmap would still be `<|channel|>` even though the user can
 * no longer see it.
 */
function stripHarmonyChannelsFromTokens(
  tokens: OllamaTokenLogprob[]
): OllamaTokenLogprob[] {
  if (tokens.length === 0) return tokens;
  const isMarker = (t: string) => /^<\|[^|>]*\|>$/.test(t.trim());

  // Look for a `<|channel|>` followed by a `final`-bearing token. If we
  // find one, slice from just after it (skipping any trailing marker
  // tokens like <|message|>).
  for (let i = 0; i < tokens.length - 1; i++) {
    const tok = tokens[i].token.trim();
    if (tok === "<|channel|>" || tok.endsWith("channel|>")) {
      const next = tokens[i + 1].token.trim().toLowerCase();
      if (next === "final" || next.startsWith("final")) {
        let j = i + 2;
        while (j < tokens.length && isMarker(tokens[j].token)) j++;
        return tokens.slice(j).filter(t => !isMarker(t.token));
      }
    }
  }
  // No final-channel boundary — just filter out the marker tokens.
  return tokens.filter(t => !isMarker(t.token));
}

// ---------------------------------------------------------------------------
// Logprob-capable browser-direct calls
//
// Ollama's `/v1/chat/completions` returns OpenAI-shaped logprobs when asked
// (`logprobs: true`, optional `top_logprobs: N`); confirmed upstream by an
// Ollama maintainer on `ollama/ollama#16117` for `gemma4` at top_logprobs=5.
// The four logprob endpoints in `/api/...` cannot reach a user's local
// Ollama when LLMbench is deployed (server-side runs in Vercel's cloud),
// so we replicate them browser-direct here. Each call site forks: Ollama
// slot → these functions, anything else → existing server route.
// ---------------------------------------------------------------------------

/** OpenAI-shaped logprob entry as returned by Ollama's /v1/chat/completions. */
interface OllamaLogprobEntry {
  token?: string;
  bytes?: number[] | null;
  logprob: number;
  top_logprobs?: Array<{ token?: string; bytes?: number[] | null; logprob: number }>;
}

/**
 * Some OpenAI-compatible servers strip leading BPE whitespace from the
 * `token` string while leaving `bytes` faithful. Decode bytes when present
 * so " system" doesn't collapse to "system" in the transcript. Same logic
 * as `decodeTokenField` in `lib/sampling/provider.ts`.
 */
function decodeTokenBytes(entry: { token?: string; bytes?: number[] | null }): string {
  if (entry.bytes && Array.isArray(entry.bytes) && entry.bytes.length > 0) {
    try {
      return new TextDecoder("utf-8").decode(new Uint8Array(entry.bytes));
    } catch {
      /* fall through to token */
    }
  }
  return entry.token ?? "";
}

/** Resolve the base URL into a fully-qualified /v1/chat/completions URL. */
function resolveOllamaUrl(baseUrl?: string): string {
  const base = (baseUrl || "http://127.0.0.1:11434")
    .replace("://localhost", "://127.0.0.1")
    .replace(/\/+$/, "");
  return base.endsWith("/v1")
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
}

/**
 * Low-level Ollama chat-completions call with logprobs. Throws on network
 * failure (OLLAMA_UNREACHABLE marker, matching `generateOllamaFromBrowser`)
 * or non-2xx response. Used by the three higher-level wrappers below.
 */
async function ollamaChatLogprobs(args: {
  baseUrl?: string;
  model: string;
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  maxTokens?: number;
  topLogprobs: number;
  signal?: AbortSignal;
}): Promise<{ data: {
    choices?: Array<{
      message?: { content?: string };
      logprobs?: { content?: OllamaLogprobEntry[] };
    }>;
  }; baseForError: string }> {
  const url = resolveOllamaUrl(args.baseUrl);
  const baseForError = url.replace(/\/v1\/chat\/completions$/, "");
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: args.model,
        messages: args.messages,
        temperature: args.temperature,
        ...(args.maxTokens ? { max_tokens: args.maxTokens } : {}),
        logprobs: true,
        top_logprobs: args.topLogprobs,
      }),
      signal: args.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new Error(`OLLAMA_UNREACHABLE::${baseForError}`);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `Ollama returned ${res.status}${txt ? `: ${txt.slice(0, 200)}` : ""}`
    );
  }
  const data = await res.json();
  return { data, baseForError };
}

// ---------- 1. Full-text logprobs (analyse/logprobs) ----------

export interface OllamaTokenLogprob {
  token: string;
  logprob: number;
  topAlternatives: Array<{ token: string; logprob: number }>;
}

export interface OllamaLogprobsResult {
  text: string;
  tokens: OllamaTokenLogprob[];
  responseTimeMs: number;
}

/**
 * Generate a full response from Ollama with per-token logprobs.
 * Used by Compare's Probs view via the `/api/analyse/logprobs` fork.
 * Mirrors the shape of `runDirectFetchLogprobs` in the server route.
 */
export async function generateOllamaLogprobs(params: {
  baseUrl?: string;
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  signal?: AbortSignal;
}): Promise<OllamaLogprobsResult> {
  const startedAt = Date.now();
  const messages: Array<{ role: string; content: string }> = [];
  if (params.systemPrompt && params.systemPrompt.trim().length > 0) {
    messages.push({ role: "system", content: params.systemPrompt });
  }
  messages.push({ role: "user", content: params.prompt });

  const topK = Math.min(Math.max(params.topK ?? 5, 1), 20);
  const { data } = await ollamaChatLogprobs({
    baseUrl: params.baseUrl,
    model: params.model,
    messages,
    temperature: params.temperature ?? 0.7,
    topLogprobs: topK,
    signal: params.signal,
  });

  const choice = data.choices?.[0];
  const rawText = choice?.message?.content ?? "";
  const content: OllamaLogprobEntry[] = choice?.logprobs?.content ?? [];
  const rawTokens: OllamaTokenLogprob[] = content.map((entry) => ({
    token: decodeTokenBytes(entry),
    logprob: entry.logprob ?? 0,
    topAlternatives: (entry.top_logprobs ?? [])
      .filter((t) => t.token !== entry.token)
      .slice(0, topK)
      .map((t) => ({ token: decodeTokenBytes(t), logprob: t.logprob })),
  }));

  // Strip harmony channel markers from both views in parallel so the
  // visible prose and the per-token heatmap stay aligned. See the doc
  // block above `stripHarmonyChannels`.
  return {
    text: stripHarmonyChannels(rawText),
    tokens: stripHarmonyChannelsFromTokens(rawTokens),
    responseTimeMs: Date.now() - startedAt,
  };
}

// ---------- 2. Single-step distribution (sampling + grammar continuation) ----------

export interface OllamaStepResult {
  chosen: { token: string; logprob: number } | null;
  distribution: Array<{ token: string; logprob: number }>;
  responseTimeMs: number;
}

/**
 * Single-step top-K distribution: `max_tokens: 1` at `temperature: 0` so
 * the raw distribution is unaltered by provider-side sampling. The browser
 * re-softmaxes under the user's T and top-p client-side for the Sampling
 * Probe; Grammar Probe Phase B uses the distribution directly.
 *
 * Used by both the `/api/investigate/sampling-step` and
 * `/api/investigate/grammar-continuation` forks. The difference between
 * those two endpoints is only in the system prompt and temperature
 * convention: sampling uses a strict text-completion system prompt at T=0,
 * continuation uses the user's chosen system+temperature with `max_tokens=1`.
 * Both shapes flow through this one function.
 */
export async function ollamaStepLogprobs(params: {
  baseUrl?: string;
  model: string;
  /** Pre-built messages (system + user) the caller controls. */
  messages: Array<{ role: string; content: string }>;
  temperature: number;
  topK: number;
  signal?: AbortSignal;
}): Promise<OllamaStepResult> {
  const startedAt = Date.now();
  const topK = Math.min(Math.max(params.topK, 1), 20);
  const { data } = await ollamaChatLogprobs({
    baseUrl: params.baseUrl,
    model: params.model,
    messages: params.messages,
    temperature: params.temperature,
    maxTokens: 1,
    topLogprobs: topK,
    signal: params.signal,
  });

  const choice = data.choices?.[0];
  const content: OllamaLogprobEntry[] = choice?.logprobs?.content ?? [];
  const messageContent: string =
    typeof choice?.message?.content === "string" ? choice.message.content : "";

  let chosen: OllamaStepResult["chosen"] = null;
  let distribution: OllamaStepResult["distribution"] = [];

  if (content.length > 0) {
    const entry = content[0];
    const decodedChosen = decodeTokenBytes(entry);
    const authoritativeChosen =
      messageContent.length > 0 ? messageContent : decodedChosen;
    chosen = { token: authoritativeChosen, logprob: entry.logprob ?? 0 };
    distribution = (entry.top_logprobs ?? []).map((t) => ({
      token: decodeTokenBytes(t),
      logprob: t.logprob,
    }));
    // Same rank-0 alignment as the OpenRouter direct-fetch path: keep the
    // distribution's argmax entry visually equal to what was actually
    // emitted so the heatmap / sampler shows a faithful transcript.
    if (distribution.length > 0 && distribution[0].token !== authoritativeChosen) {
      distribution = [
        { ...distribution[0], token: authoritativeChosen },
        ...distribution.slice(1),
      ];
    }
  }

  return { chosen, distribution, responseTimeMs: Date.now() - startedAt };
}
