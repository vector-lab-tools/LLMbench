// NDJSON streaming utilities for progressive result display

/**
 * Parse a streaming NDJSON response, calling onEvent for each parsed line.
 * Returns when the stream closes.
 */
export async function fetchStreaming<T>(
  url: string,
  body: object,
  onEvent: (event: T) => void
): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.error || `Server error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
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
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer) as T);
    } catch {
      // skip
    }
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
