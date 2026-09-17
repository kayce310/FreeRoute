import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
import { ProviderInvocationError, type ChatProviderAdapter, type NormalizedChatRequest, type NormalizedChatStreamEvent, type ToolCall } from '../inference.js';
import type { TokenUsage } from '../contracts.js';
import { translateRequest } from '../translators/index.js';
import { iterateStreamWithWatchdog } from '../utils/stream-watchdog.js';

interface GeminiModel { name?: string; supportedGenerationMethods?: string[]; }
interface GeminiList { models?: GeminiModel[]; nextPageToken?: string; }
interface GeminiResponse {
  responseId?: string;
  modelVersion?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: string; functionCall?: { name: string; args?: Record<string, unknown> } }>; };
    finishReason?: string;
    finishMessage?: string;
    index?: number;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

export interface GeminiAdapterOptions {
  baseUrl?: string;
  getCredential: (credentialId: string) => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
}

/** Native Gemini REST adapter. Handles text and tool-capable chat. */
export class GeminiAdapter implements ProviderDiscoveryAdapter, ChatProviderAdapter {
  readonly providerId = 'gemini';
  private readonly baseUrl: string;
  private readonly getCredential: GeminiAdapterOptions['getCredential'];
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: GeminiAdapterOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    this.getCredential = options.getCredential;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async discoverModels(credentialId: string): Promise<DiscoveredModel[]> {
    const models: GeminiModel[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${this.baseUrl}/models`);
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await this.fetcher(url, { headers: await this.headers(credentialId) });
      if (!response.ok) throw await providerError(response);
      const body = await response.json() as GeminiList;
      models.push(...(body.models ?? []));
      pageToken = body.nextPageToken;
    } while (pageToken);
    return models
      .filter((model) => model.name && model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => {
        const id = model.name!.replace(/^models\//, '');
        const isTtsOrAudio = id.includes('tts') || id.includes('audio');
        const caps: import('../contracts.js').Capability[] = ['chat', 'streaming'];
        if (!isTtsOrAudio) {
          caps.push('tools', 'vision');
        }
        return {
          modelId: id,
          capabilities: caps,
          freeTier: 'free_unverified' as const,
        };
      });
  }

  async chat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }): Promise<{ id: string; model: string; content: string; thought?: string; toolCalls?: ToolCall[]; usage?: TokenUsage }> {
    let response: Response;
    try {
      const headers = await this.headers(input.credentialId);
      response = await this.fetcher(this.url(input.modelId, 'generateContent'), {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify(translateRequest('openai', 'gemini', input.modelId, input.request)),
      });
    } catch (err: unknown) {
      if (err instanceof ProviderInvocationError) throw err;
      const msg = err instanceof Error ? err.message : 'network fetch failed';
      throw new ProviderInvocationError(`Gemini connection error: ${msg}`, { kind: 'temporary', scope: 'provider', retryable: true, fallbackAllowed: true });
    }

    if (!response.ok) {
      if (response.status === 404 && (input.modelId === 'gemini-2.5-flash' || input.modelId === 'gemini-2.0-flash')) {
        const errorText = await response.clone().text().catch(() => '');
        if (errorText.includes('gemini-3.6-flash') || errorText.includes('no longer available to new users')) {
          return this.chat({ ...input, modelId: 'gemini-3.6-flash' });
        }
      }
      throw await providerError(response);
    }
    const body = await response.json() as GeminiResponse;
    const content = textFrom(body);
    const thought = body.candidates?.[0]?.content?.parts?.find(p => 'thought' in p)?.thought;
    const toolCalls = toolCallsFrom(body);
    if (!content && !toolCalls.length && !thought) throw new ProviderInvocationError('Gemini returned no assistant content', { kind: 'temporary' });
    return { id: body.responseId ?? crypto.randomUUID(), model: body.modelVersion ?? input.modelId, content: content ?? '', thought, toolCalls: toolCalls.length ? toolCalls : undefined, usage: usageFrom(body.usageMetadata) };
  }

  async *streamChat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }): AsyncGenerator<NormalizedChatStreamEvent, void, unknown> {
    const url = new URL(this.url(input.modelId, 'streamGenerateContent'));
    url.searchParams.set('alt', 'sse');
    let response: Response;
    const connectController = new AbortController();
    const connectTimer = setTimeout(() => connectController.abort(new Error('connect timeout')), 10000);
    try {
      const headers = await this.headers(input.credentialId);
      response = await this.fetcher(url, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        signal: connectController.signal,
        body: JSON.stringify(translateRequest('openai', 'gemini', input.modelId, input.request)),
      });
      clearTimeout(connectTimer);
    } catch (err: unknown) {
      clearTimeout(connectTimer);
      if (err instanceof ProviderInvocationError) throw err;
      const msg = err instanceof Error ? err.message : 'network fetch failed';
      throw new ProviderInvocationError(`Gemini streaming connection error: ${msg}`, { kind: 'temporary', scope: 'provider', retryable: true, fallbackAllowed: true });
    }

    if (!response.ok) {
      if (response.status === 404 && (input.modelId === 'gemini-2.5-flash' || input.modelId === 'gemini-2.0-flash')) {
        const errorText = await response.clone().text().catch(() => '');
        if (errorText.includes('gemini-3.6-flash') || errorText.includes('no longer available to new users')) {
          yield* this.streamChat({ ...input, modelId: 'gemini-3.6-flash' });
          return;
        }
      }
      throw await providerError(response);
    }
    if (!response.body) throw new ProviderInvocationError('Gemini returned no streaming response body', { kind: 'temporary' });

    // --- 9router pattern (gemini-to-openai.js) ---
    // Each content/tool part emits its own chunk with finishReason=undefined (null on wire).
    // finishReason is emitted ONCE on a dedicated finish chunk when upstream signals it.
    // If upstream says STOP but we already saw tool calls → override to 'tool_calls'.
    let streamId: string | undefined;
    let streamModel: string | undefined;
    let seenToolCallCount = 0;
    let lastUsage: TokenUsage | undefined;

    const processChunk = (chunk: GeminiResponse): NormalizedChatStreamEvent[] => {
      const id = chunk.responseId ?? streamId ?? crypto.randomUUID();
      const model = chunk.modelVersion ?? streamModel ?? input.modelId;
      streamId = id;
      streamModel = model;

      const usage = usageFrom(chunk.usageMetadata);
      if (usage) lastUsage = usage;

      const results: NormalizedChatStreamEvent[] = [];
      const candidate = chunk.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      for (const part of parts) {
        if ('thought' in part && typeof part.thought === 'string') {
          results.push({ id, model, thought: part.thought });
          continue;
        }
        if (part.text) {
          results.push({ id, model, delta: part.text });
          continue;
        }
        if (part.functionCall) {
          const tc = {
            index: seenToolCallCount,
            id: crypto.randomUUID(),
            type: 'function' as const,
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args ?? {}),
            },
          };
          seenToolCallCount++;
          results.push({ id, model, toolCalls: [tc] });
        }
      }

      // Emit ONE finish chunk when upstream signals finishReason
      if (candidate?.finishReason) {
        let finishReason = mapGeminiFinish(candidate.finishReason);
        // Mirror 9router: STOP + had tool calls → tool_calls
        if (finishReason === 'stop' && seenToolCallCount > 0) finishReason = 'tool_calls';
        results.push({ id, model, finishReason, usage: lastUsage });
      }

      return results;
    };

    const decoder = new TextDecoder();
    let pending = '';
    for await (const bytes of iterateStreamWithWatchdog(response.body, {
      firstChunkTimeoutMs: 30_000,
      stallTimeoutMs: 30_000,
      parentSignal: input.request.signal,
      providerId: this.providerId,
      onAbort: () => { try { connectController.abort(); } catch {} },
    })) {
      pending += decoder.decode(bytes, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const data = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (!data) continue;
        try { for (const ev of processChunk(JSON.parse(data) as GeminiResponse)) yield ev; }
        catch { /* ignore non-JSON SSE lines */ }
      }
    }
    // Flush any buffered tail
    if (pending.trim().startsWith('data:')) {
      try { for (const ev of processChunk(JSON.parse(pending.trim().slice(5).trim()) as GeminiResponse)) yield ev; }
      catch { /* ignore malformed final chunk */ }
    }
  }

  private url(modelId: string, method: string): string {
    return `${this.baseUrl}/models/${encodeURIComponent(modelId.replace(/^models\//, ''))}:${method}`;
  }

  private async headers(credentialId: string): Promise<Record<string, string>> {
    const secret = await this.getCredential(credentialId);
    if (!secret) throw new ProviderInvocationError('credential not found', { kind: 'authentication' });
    return { 'x-goog-api-key': secret };
  }
}

// Removed old toGeminiRequest and helper functions since they are now in translators/gemini-translator.ts

function textFrom(response: GeminiResponse): string | undefined {
  return response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') || undefined;
}

function toolCallsFrom(response: GeminiResponse): ToolCall[] {
  return (response.candidates?.[0]?.content?.parts ?? [])
    .filter((part): part is { functionCall: { name: string; args?: Record<string, unknown> } } => !!part.functionCall)
    .map((part, idx) => ({
      index: idx,
      id: crypto.randomUUID(),
      type: 'function',
      function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) },
    }));
}

function usageFrom(metadata: GeminiResponse['usageMetadata']): TokenUsage | undefined {
  if (!metadata) return undefined;
  const promptTokens = metadata.promptTokenCount ?? 0;
  const completionTokens = metadata.candidatesTokenCount ?? 0;
  return { promptTokens, completionTokens, totalTokens: metadata.totalTokenCount ?? (promptTokens + completionTokens) };
}

/** Map Gemini finishReason → OpenAI finish_reason (mirrors 9router toOpenAIFinish for gemini). */
function mapGeminiFinish(reason: string | undefined): string {
  switch (String(reason ?? '').toUpperCase()) {
    case 'MAX_TOKENS': return 'length';
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT': return 'content_filter';
    default: return 'stop';
  }
}

function isContextOverflowError(status: number, text: string): boolean {
  if (status !== 400 && status !== 413) return false;
  const lower = text.toLowerCase();
  return lower.includes('context length') || lower.includes('token limit') || lower.includes('too many tokens') || lower.includes('prompt is too long');
}

async function providerError(response: Response): Promise<ProviderInvocationError> {
  const rawBody = await response.text().catch(() => '');
  let extractedMessage = '';
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string } | string; message?: string };
    extractedMessage = (typeof parsed.error === 'object' ? parsed.error?.message : parsed.error) || parsed.message || '';
  } catch { extractedMessage = rawBody.slice(0, 300); }

  const isOverflow = isContextOverflowError(response.status, rawBody);
  let kind: import('../contracts.js').RouteFailureKind = 'permanent';
  let scope: import('../contracts.js').RouteFailureScope = 'key';
  if (isOverflow) { kind = 'context_overflow'; scope = 'model'; }
  else if (response.status === 401 || response.status === 403) kind = 'authentication';
  else if (response.status === 429) kind = 'rate_limit';
  else if (response.status === 408 || response.status >= 500) { kind = 'temporary'; scope = 'provider'; }
  else if (response.status === 404) { kind = 'unsupported'; scope = 'model'; }
  else if (response.status === 400) { kind = 'unsupported'; scope = 'request'; }
  
  return new ProviderInvocationError(`Gemini request failed: ${extractedMessage}`, {
    kind,
    scope,
    fallbackAllowed: scope !== 'request',
    retryable: kind === 'temporary' || kind === 'rate_limit',
  });
}
