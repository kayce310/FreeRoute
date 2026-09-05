import type { NormalizedChatStreamEvent } from '../inference.js';

export interface StreamEventResult {
  events: NormalizedChatStreamEvent[];
  error?: Error;
}

/**
 * Normalizes raw upstream stream chunks into CanonicalStreamEvent format.
 * Handles: SSE with trailing newline, SSE without trailing newline,
 * usage-only chunks, finish-only chunks, tool-call chunks, and error chunks.
 */
export function normalizeStreamEvents(
  chunks: Array<{ id?: string; model?: string; delta?: string; finishReason?: string | null; toolCalls?: unknown; usage?: unknown }>,
): StreamEventResult {
  const events: NormalizedChatStreamEvent[] = [];

  for (const chunk of chunks) {
    if (!chunk) continue;

    const event: NormalizedChatStreamEvent = {
      id: chunk.id ?? '',
      model: chunk.model ?? '',
      delta: chunk.delta,
      finishReason: chunk.finishReason,
      usage: chunk.usage as NormalizedChatStreamEvent['usage'],
    };

    if (chunk.toolCalls && Array.isArray(chunk.toolCalls) && chunk.toolCalls.length > 0) {
      event.toolCalls = chunk.toolCalls as NormalizedChatStreamEvent['toolCalls'];
    }

    events.push(event);
  }

  return { events };
}

/**
 * Merges usage across streaming chunks. Returns the latest usage if multiple present.
 */
export function mergeUsage(
  events: Array<{ usage?: NormalizedChatStreamEvent['usage'] }>,
): NormalizedChatStreamEvent['usage'] {
  let merged: NormalizedChatStreamEvent['usage'] | undefined;
  for (const event of events) {
    if (!event.usage) continue;
    merged = { ...event.usage };
  }
  return merged;
}

/**
 * Determines if a stream error occurred before any content was committed.
 * Returns true if error happened before the first non-empty delta.
 */
export function isErrorBeforeCommit(
  events: NormalizedChatStreamEvent[],
  errorEventIndex: number,
): boolean {
  const firstContentIndex = events.findIndex((event) => event.delta && event.delta.length > 0);
  if (firstContentIndex === -1) return true;
  return errorEventIndex < firstContentIndex;
}
