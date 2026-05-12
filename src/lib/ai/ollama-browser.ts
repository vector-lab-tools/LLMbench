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
  /** Disable thinking mode on "thinking"-capable models (Gemma 4,
   *  gpt-oss, qwen3 thinking). Sent as `think: false` in the request
   *  body. Confirmed working against `/v1/chat/completions` for Gemma 4:
   *  drops a 30s+ thinking response to ~0.6s, with no harmony channels
   *  emitted at all (a clean direct answer). */
  disableThinking?: boolean;
}

export interface OllamaBrowserResult {
  /** Visible prose (final channel content if harmony format, else raw). */
  text: string;
  /** Non-final harmony channels (thought, commentary, …) if any. */
  hiddenChannels?: HarmonyChannel[];
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
        ...(params.disableThinking ? { think: false } : {}),
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
  const parsed = parseHarmonyOutput(rawText);
  return {
    text: parsed.visible,
    hiddenChannels: parsed.hidden.length > 0 ? parsed.hidden : undefined,
    responseTimeMs: Date.now() - startedAt,
  };
}

// ---------------------------------------------------------------------------
// Harmony-format channel parsing
//
// Gemma 4 (Google) ships with a `thinking` capability — confirmed locally
// against `ollama show gemma4`: capabilities include `thinking`, and the
// model emits its output structured as harmony channels:
//
//   <|channel|>thought<|message|>...hidden reasoning...<|end|>
//   <|channel|>commentary<|message|>...meta notes...<|end|>
//   <|channel|>final<|message|>...the visible answer...<|return|>
//
// The same format is used by OpenAI's gpt-oss family and a handful of
// other "thinking" open-weight models. The OpenAI Chat Completions API
// normally returns only the `final` channel; Ollama's `/v1/chat/completions`
// compat layer passes the raw token stream through, which leaves users
// staring at the model's planning + constraint-checklist self-audit
// instead of the answer.
//
// We do NOT discard the hidden channels — David's point in v2.2.3 is
// that the model's chain-of-thought is itself analytical data ("close-
// reading the model's metacognition is a legitimate move"). Instead we
// partition the output into a `visible` portion (rendered in the prose
// panel and analysed in the Probs view) and a list of `hidden` channels
// (collapsed behind a chevron above the prose, expandable on demand,
// excluded from all analytical paths).
// ---------------------------------------------------------------------------

export interface HarmonyChannel {
  /** Canonical channel name as emitted by the model, lower-cased. */
  name: string;
  /** Channel content with any inner marker tokens stripped. */
  content: string;
}

export interface HarmonyParseResult {
  /** Final-channel content (or fallback prose if no proper channels). */
  visible: string;
  /** Non-final channels (thought, commentary, etc.), preserved verbatim. */
  hidden: HarmonyChannel[];
}

// Matches harmony markers in any of three shapes: `<|TAG|>` (OpenAI),
// `<|TAG>` (Gemma 4 open), `<TAG|>` (Gemma 4 close). Used to scrub any
// stray markers that survive segment-level parsing.
const HARMONY_MARKER_RE = /<\|?[A-Za-z_]+\|?>/g;

/**
 * Parse a raw harmony-formatted response into `{visible, hidden}`.
 *
 * Design (v2.2.5, after a wrong turn in v2.2.3/v2.2.4): the chevron-
 * collapse behaviour only fires when the model emitted a *proper*
 * harmony structure — i.e. a `final` channel alongside reasoning
 * channels. In that case `final` becomes visible and the other channels
 * (thought, commentary, …) get collapsed behind the chevron, as
 * originally requested.
 *
 * When the model emits ONLY reasoning channels (no `final`) — which
 * happens with Gemma 4 under Ollama because the chat template doesn't
 * cue the channel transition — we fall back to showing the content as
 * visible. Hiding it would silently throw the model's actual output
 * away, which is what v2.2.4 was doing wrong.
 *
 * In all cases the structural markers (`<|channel|>`, `<|message|>`,
 * `<|end|>`, …) are stripped from the visible text. They never appear in
 * the prose; they're excluded from analysis at the token level too.
 *
 * Algorithm:
 *   1. Split on `<|channel|>` boundaries. Each segment after the first
 *      starts with a channel name, optionally followed by `<|message|>`
 *      and then the channel content. End-of-channel markers (`<|end|>`,
 *      `<|return|>`, `<|start|>`) truncate a channel mid-segment.
 *   2. If `final` exists alongside other channels: visible = final
 *      content, hidden = the others (chevron renders them).
 *   3. If `final` exists alone: visible = final, hidden = [] (no chevron).
 *   4. If `final` does NOT exist: visible = all parsed channel content
 *      joined, hidden = [] (no chevron, no text lost).
 *   5. If no channel structure parsed: visible = original text minus
 *      markers, hidden = [].
 */
export function parseHarmonyOutput(text: string): HarmonyParseResult {
  // Accept both OpenAI harmony (`<|channel|>`) and Gemma 4 (`<|channel>`)
  // shapes; see the doc block above isMarkerToken for the byte-level
  // evidence. In practice Ollama strips harmony markers from
  // `message.content` for thinking-capable models, so this branch is
  // mostly defensive — but if anyone ever pipes raw harmony text through
  // this function we want it to behave correctly for both variants.
  if (!text || !/<\|channel\|?>/.test(text)) {
    return { visible: text ?? "", hidden: [] };
  }

  // Split on the channel-open marker so we don't depend on a single regex
  // matching across the whole document. The first segment is whatever
  // preceded the first marker (typically empty, sometimes a
  // `<|start|>assistant` preamble we discard).
  const parts = text.split(/<\|channel\|?>/);
  const channels: HarmonyChannel[] = [];
  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i];
    // Channel-name token (\w+), optional <|message|>, then content.
    const head = segment.match(/^\s*(\w+)\s*(?:<\|message\|>)?\s*([\s\S]*)$/);
    if (!head) continue;
    const name = head[1].toLowerCase();
    let content = head[2];
    // Truncate at the first end-of-segment marker (the next channel-open
    // would have caused a fresh split, so we only need to worry about
    // <|end|>, <|return|>, <|start|>).
    const endMatch = content.match(/<\|(?:end|return|start)\|>/);
    if (endMatch && typeof endMatch.index === "number") {
      content = content.slice(0, endMatch.index);
    }
    content = content.replace(HARMONY_MARKER_RE, "").trim();
    if (content.length > 0) channels.push({ name, content });
  }

  if (channels.length === 0) {
    return {
      visible: text.replace(HARMONY_MARKER_RE, "").trim(),
      hidden: [],
    };
  }

  const finalIdx = channels.findIndex(c => c.name === "final");
  if (finalIdx >= 0) {
    return {
      visible: channels[finalIdx].content,
      hidden: channels.filter((_, i) => i !== finalIdx),
    };
  }

  // No `final` channel — typically Gemma 4 emitting only `thought`. Show
  // the content rather than hide it. Joining multiple channels with a
  // blank-line separator preserves the order the model emitted them in,
  // which can be analytically interesting in its own right. No chevron
  // here because there's nothing structurally separable to collapse.
  return {
    visible: channels.map(c => c.content).join("\n\n"),
    hidden: [],
  };
}

/**
 * Token-level companion to `parseHarmonyOutput`. Partitions the OllamaToken
 * array into `{visible, hiddenByChannel}` so the Probs heatmap operates
 * only on the tokens that correspond to the visible prose — and so the
 * hidden-channel UI can show per-channel token-level data if it ever
 * wants to (not used today, but the structure preserves it).
 */
export interface HarmonyTokenPartition {
  visible: OllamaTokenLogprob[];
  hiddenByChannel: Record<string, OllamaTokenLogprob[]>;
}

/**
 * Match any "harmony-style" structural token. Two real-world variants:
 *   - OpenAI harmony (gpt-oss): `<|channel|>`, `<|message|>`, `<|end|>` …
 *     — both opening and closing pipes.
 *   - Gemma 4 (Google): `<|channel>` to open (single trailing pipe) and
 *     `<channel|>` mid-stream to transition out of a reasoning channel
 *     (single leading pipe). Confirmed by inspecting Gemma 4's actual
 *     logprobs.content stream against a local Ollama instance — the
 *     token at position 0 is literally `<|channel>` (10 bytes:
 *     [60,124,99,104,97,110,110,101,108,62]), not `<|channel|>`.
 * The regex covers all three shapes: optional leading `|`, an alphabetic
 * tag, optional trailing `|`, closing `>`.
 */
function isMarkerToken(t: string): boolean {
  return /^<\|?[A-Za-z_]+\|?>$/.test(t.trim());
}

/**
 * Match the "open a new channel" marker. The next token is the channel
 * name. Recognises both OpenAI harmony (`<|channel|>`) and Gemma 4
 * (`<|channel>`) shapes.
 */
function isChannelOpenToken(t: string): boolean {
  return /^<\|channel\|?>$/.test(t.trim());
}

/**
 * Match the "close current channel" marker. Gemma 4 emits `<channel|>`
 * mid-stream to leave the reasoning channel and (implicitly) transition
 * to the visible answer. OpenAI harmony uses `<|end|>` / `<|return|>`
 * for the same role — both handled here. After this marker fires we
 * snap `currentChannel` back to `"final"` so subsequent content tokens
 * land in the visible set.
 */
function isChannelCloseToken(t: string): boolean {
  const s = t.trim();
  return s === "<channel|>" || s === "<|end|>" || s === "<|return|>";
}

export function partitionHarmonyTokens(
  tokens: OllamaTokenLogprob[]
): HarmonyTokenPartition {
  if (tokens.length === 0) return { visible: [], hiddenByChannel: {} };

  // Walk the stream collecting non-marker tokens into the channel
  // they belong to (default `final` until a marker switches us). Marker
  // tokens (`<|channel|>`, `<|message|>`, `<|end|>`, …) and the
  // channel-name tokens that immediately follow `<|channel|>` are
  // dropped — they're structural noise, not content, and David's
  // spec is that they must not appear in any analytical view.
  let currentChannel: string = "final";
  let pendingChannelName = false;
  const tokensByChannel: Record<string, OllamaTokenLogprob[]> = {};

  for (const tok of tokens) {
    const raw = tok.token;
    if (isChannelOpenToken(raw)) {
      pendingChannelName = true;
      continue;
    }
    if (pendingChannelName) {
      currentChannel = raw.trim().toLowerCase().replace(/[^a-z]/g, "") || currentChannel;
      pendingChannelName = false;
      continue;
    }
    if (isChannelCloseToken(raw)) {
      // End-of-reasoning marker (Gemma 4: <channel|>; OpenAI: <|end|>,
      // <|return|>). Snap back to the visible channel — what follows is
      // the model's actual answer.
      currentChannel = "final";
      pendingChannelName = false;
      continue;
    }
    if (isMarkerToken(raw)) continue;

    if (!tokensByChannel[currentChannel]) tokensByChannel[currentChannel] = [];
    tokensByChannel[currentChannel].push(tok);
  }

  // Mirrors parseHarmonyOutput's rules so prose and heatmap stay in
  // lockstep. `final` present → it's the visible answer, everything else
  // goes to hiddenByChannel (the chevron). `final` absent → flatten all
  // collected channels into visible. Marker and channel-name tokens
  // were already excluded in the walk above, so visible is guaranteed
  // marker-free in either case.
  if ("final" in tokensByChannel) {
    const visible = tokensByChannel.final;
    delete tokensByChannel.final;
    return { visible, hiddenByChannel: tokensByChannel };
  }

  const visible: OllamaTokenLogprob[] = [];
  for (const channelTokens of Object.values(tokensByChannel)) {
    visible.push(...channelTokens);
  }
  return { visible, hiddenByChannel: {} };
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
  disableThinking?: boolean;
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
        ...(args.disableThinking ? { think: false } : {}),
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
  /** Visible prose — final-channel content for harmony models, raw otherwise. */
  text: string;
  /** Per-token logprobs corresponding to `text` only. Harmony-channel and
   *  marker tokens are excluded so every analytical view (heatmap, pixel
   *  map, 3D net, entropy curve) operates on the visible prose alone. */
  tokens: OllamaTokenLogprob[];
  /** Non-final harmony channels (thought, commentary, …) as plain text.
   *  Surfaced behind a chevron in the panel UI; never enters analysis. */
  hiddenChannels?: HarmonyChannel[];
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
  disableThinking?: boolean;
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
    disableThinking: params.disableThinking,
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

  // Partition both prose and tokens into visible + hidden channels so
  // the heatmap operates on the visible prose alone, while the hidden
  // channels remain accessible behind the chevron UI in CompareMode.
  // See the doc block above `parseHarmonyOutput`.
  const parsedText = parseHarmonyOutput(rawText);
  const partitioned = partitionHarmonyTokens(rawTokens);
  return {
    text: parsedText.visible,
    tokens: partitioned.visible,
    hiddenChannels: parsedText.hidden.length > 0 ? parsedText.hidden : undefined,
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
  disableThinking?: boolean;
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
    disableThinking: params.disableThinking,
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
