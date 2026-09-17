import { ProviderInvocationError } from '../inference.js';

export interface StreamWatchdogOptions {
  /** Maximum time to wait for the very first chunk of data (default: 30,000ms) */
  firstChunkTimeoutMs?: number;
  /** Maximum idle time between chunks before considering stream stalled (default: 30,000ms) */
  stallTimeoutMs?: number;
  /** Signal from client (e.g. HTTP request close) to abort immediately */
  parentSignal?: AbortSignal;
  /** Provider ID for clearer error logging */
  providerId?: string;
  /** Callback to abort the underlying fetch/socket */
  onAbort?: () => void;
}

/**
 * Wraps a ReadableStream<Uint8Array> with a watchdog timer.
 * Follows 9router's pipeWithDisconnect pattern:
 * - Arms timer before first chunk arrives
 * - Resets timer on every raw byte chunk received from upstream
 * - Cancels reader and aborts fetch if timer fires (stream stall)
 * - Listens to parentSignal (client disconnect) to cancel early
 */
export async function* iterateStreamWithWatchdog(
  body: ReadableStream<Uint8Array>,
  options: StreamWatchdogOptions = {},
): AsyncGenerator<Uint8Array, void, unknown> {
  const firstTimeoutMs = options.firstChunkTimeoutMs ?? 30_000;
  const stallTimeoutMs = options.stallTimeoutMs ?? 30_000;
  const reader = body.getReader();
  let timer: NodeJS.Timeout | null = null;
  let isFirst = true;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const armTimer = (ms: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = null;
      options.onAbort?.();
      try {
        reader.cancel(new Error(`Stream stalled: no data received for ${ms / 1000}s`));
      } catch {}
    }, ms);
  };

  const abortListener = () => {
    clearTimer();
    options.onAbort?.();
    try {
      reader.cancel(new Error('Client disconnected'));
    } catch {}
  };

  if (options.parentSignal) {
    if (options.parentSignal.aborted) {
      options.onAbort?.();
      try { reader.cancel(new Error('Client already disconnected')); } catch {}
      return;
    }
    options.parentSignal.addEventListener('abort', abortListener, { once: true });
  }

  armTimer(firstTimeoutMs);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (isFirst) {
        isFirst = false;
      }
      armTimer(stallTimeoutMs);
      if (value && value.length > 0) {
        yield value;
      }
    }
  } catch (err: unknown) {
    clearTimer();
    if (options.parentSignal?.aborted) {
      throw new ProviderInvocationError('Client cancelled request', {
        kind: 'client_cancelled',
        scope: 'request',
        retryable: false,
        fallbackAllowed: false,
      });
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('stalled') || msg.includes('stall')) {
      throw new ProviderInvocationError(
        `Upstream stream stalled from ${options.providerId ?? 'provider'} (idle timeout)`,
        {
          kind: 'temporary',
          scope: 'model',
          retryable: true,
          fallbackAllowed: true,
        },
      );
    }
    throw err;
  } finally {
    clearTimer();
    if (options.parentSignal) {
      options.parentSignal.removeEventListener('abort', abortListener);
    }
    try {
      reader.releaseLock();
    } catch {}
  }
}
