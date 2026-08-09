/**
 * Client-side chat transport.
 *
 * Consumes the Server-Sent Events stream from POST /api/chat and reports each
 * token as it arrives, so the UI can render progressively.
 */

export interface ChatMessagePayload {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamChatOptions {
  messages: ChatMessagePayload[];
  instrumentId?: string | null;
  timeframe?: string;
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}

export class ChatStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatStreamError';
  }
}

/**
 * Streams an assistant reply.
 *
 * Resolves once the stream completes; rejects with a user-readable message if
 * the server reports an error. Aborting via `signal` resolves quietly, because
 * a deliberate cancel is not a failure.
 */
export async function streamChat(options: StreamChatOptions): Promise<string> {
  let res: Response;

  try {
    res = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: options.messages,
        instrumentId: options.instrumentId ?? null,
        timeframe: options.timeframe,
      }),
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return '';
    throw new ChatStreamError('Could not reach the server. Check that it is running.');
  }

  // A non-streaming error response arrives as ordinary JSON.
  if (!res.ok) {
    let message = `Chat failed (HTTP ${res.status}).`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* keep the generic message */
    }
    throw new ChatStreamError(message);
  }

  if (!res.body) throw new ChatStreamError('The server returned an empty response.');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let streamError: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line; keep any trailing partial.
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        let event = 'message';
        let data = '';

        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;

        try {
          const parsed = JSON.parse(data);
          if (event === 'delta' && typeof parsed.text === 'string') {
            full += parsed.text;
            options.onDelta(parsed.text);
          } else if (event === 'error') {
            streamError = parsed.message || 'The assistant could not respond.';
          }
        } catch {
          // Ignore malformed frames rather than killing the stream.
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return full;
    throw new ChatStreamError('The connection was interrupted.');
  } finally {
    reader.releaseLock();
  }

  // A mid-stream error only counts as a failure if nothing useful arrived.
  if (streamError && !full) throw new ChatStreamError(streamError);
  if (streamError) throw new ChatStreamError(streamError);

  return full;
}
