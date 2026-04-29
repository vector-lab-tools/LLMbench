// NDJSON streaming utilities for progressive result display

/**
 * Parse a streaming NDJSON response, calling onEvent for each parsed line.
 * Returns when the stream closes.
 */
export async function fetchStreaming<T>(
  url: string,
  body: object,
  onEvent: (event: T) => void,
  /**
   * Optional AbortSignal for user-initiated cancellation. When the signal
   * fires we stop reading the server stream and propagate the abort to
   * `fetch()` so the connection itself is torn down — important for
   * long-running NDJSON probes (Grammar Probe Phase A/E, Sampling Probe)
   * where the user wants Stop to be immediate.
   */
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Server error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  // Wire abort → reader cancel so the in-flight read() resolves and we
  // exit the loop promptly. Without this, the loop would block on
  // reader.read() until the next chunk arrives.
  const onAbort = () => { reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", onAbort);

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!; // keep incomplete last line in buffer
      for (const line of lines) {
        if (line.trim()) {
          try {
            onEvent(JSON.parse(line) as T);
          } catch {
            // skip malformed lines
          }
        }
      }
    }

    // flush remaining buffer
    if (buffer.trim() && !signal?.aborted) {
      try {
        onEvent(JSON.parse(buffer) as T);
      } catch {
        // skip
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Server-side helper: create an NDJSON streaming response.
 * Returns { stream, send, close } where send() writes a JSON line
 * and close() ends the stream.
 */
export function createStreamResponse() {
  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController | null = null;

  const stream = new ReadableStream({
    start(controller) {
      controllerRef = controller;
    },
  });

  const send = (data: object) => {
    controllerRef?.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
  };

  const close = () => {
    controllerRef?.close();
  };

  const response = new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

  return { response, send, close };
}
