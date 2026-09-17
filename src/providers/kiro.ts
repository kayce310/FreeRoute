import { randomUUID } from 'node:crypto';
import {
  ProviderInvocationError,
  type ChatProviderAdapter,
  type NormalizedChatRequest,
  type NormalizedChatResponse,
  type NormalizedChatStreamEvent,
  type ToolCall,
} from '../inference.js';
import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
import { iterateStreamWithWatchdog } from '../utils/stream-watchdog.js';
import { parseStoredCredential } from '../storage/credential-types.js';

export const KIRO_MODELS: DiscoveredModel[] = [
  { modelId: 'claude-sonnet-4.5', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 95 },
  { modelId: 'claude-haiku-4.5', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 93 },
  { modelId: 'deepseek-3.2', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
  { modelId: 'qwen3-coder-next', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
  { modelId: 'glm-5', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 88 },
  { modelId: 'MiniMax-M2.5', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 88 },
  { modelId: 'claude-sonnet-4.5-thinking', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 94 },
  { modelId: 'claude-haiku-4.5-thinking', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 92 },
  { modelId: 'claude-sonnet-4.5-agentic', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 94 },
  { modelId: 'claude-haiku-4.5-agentic', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 92 },
];

export class KiroAdapter implements ChatProviderAdapter, ProviderDiscoveryAdapter {
  readonly providerId: string;
  private readonly baseUrl: string;
  private readonly getCredential: (id: string) => Promise<string | undefined> | string | undefined;
  private readonly fetch: typeof globalThis.fetch;

  constructor(options: {
    providerId: string;
    baseUrl?: string;
    getCredential: (id: string) => Promise<string | undefined> | string | undefined;
    fetch?: typeof globalThis.fetch;
  }) {
    this.providerId = options.providerId;
    this.baseUrl = (options.baseUrl || 'https://runtime.us-east-1.kiro.dev/generateAssistantResponse').replace(/\/$/, '');
    this.getCredential = options.getCredential;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async discoverModels(_credentialId: string): Promise<DiscoveredModel[]> {
    return KIRO_MODELS;
  }

  async chat(input: {
    credentialId: string;
    modelId: string;
    request: NormalizedChatRequest;
  }): Promise<Omit<NormalizedChatResponse, 'providerId' | 'modelId'>> {
    const chunks: NormalizedChatStreamEvent[] = [];
    for await (const chunk of this.streamChat(input)) chunks.push(chunk);

    let content = '';
    let thought = '';
    const toolCalls: ToolCall[] = [];
    let finishReason = 'stop';

    for (const chunk of chunks) {
      if (chunk.delta) content += chunk.delta;
      if (chunk.thought) thought += chunk.thought;
      if (chunk.toolCalls) toolCalls.push(...chunk.toolCalls);
      if (chunk.finishReason) finishReason = chunk.finishReason;
    }

    const lastWithUsage = [...chunks].reverse().find(c => c.usage);
    return {
      id: `kiro-${Date.now()}`,
      model: input.modelId,
      content,
      thought: thought || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage: lastWithUsage?.usage,
    };
  }

  async *streamChat(input: {
    credentialId: string;
    modelId: string;
    request: NormalizedChatRequest;
  }): AsyncIterable<NormalizedChatStreamEvent> {
    const rawSecret = await this.getCredential(input.credentialId);
    if (!rawSecret) {
      throw new ProviderInvocationError(`Kiro: no credentials configured for ${input.credentialId}`, {
        kind: 'authentication',
        scope: 'key',
        retryable: false,
        fallbackAllowed: true,
      });
    }

    const parsed = parseStoredCredential(rawSecret);
    const isApiKey = !parsed.isOAuth || parsed.authMethod === 'api_key' || Boolean(parsed.oauth?.apiKey);
    const token = isApiKey ? (parsed.oauth?.apiKey || parsed.apiKey || parsed.raw) : (parsed.accessToken || parsed.raw);

    // Build URL candidates based on auth type (mirroring 9router)
    const baseUrls = isApiKey
      ? [
          'https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse',
          'https://q.us-east-1.amazonaws.com/generateAssistantResponse',
          this.baseUrl.includes('generateAssistantResponse') ? this.baseUrl : `${this.baseUrl}/generateAssistantResponse`,
        ]
      : [
          this.baseUrl.includes('generateAssistantResponse') ? this.baseUrl : `${this.baseUrl}/generateAssistantResponse`,
          'https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse',
          'https://q.us-east-1.amazonaws.com/generateAssistantResponse',
        ];

    // Deduplicate URLs
    const targetUrls = [...new Set(baseUrls)];

    const id = `kiro-${Date.now()}`;
    const model = input.modelId.includes('/') ? input.modelId.split('/').pop()! : input.modelId;
    const profileArn = parsed.oauth?.providerSpecificData?.profileArn ||
      (parsed.authMethod === 'builder-id' ? 'arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX' : undefined);
    const payload = this.buildPayload(model, input.request, profileArn);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/vnd.amazon.eventstream, text/event-stream, application/json',
      'X-Amz-Target': 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
      'User-Agent': 'AWS-SDK-JS/3.0.0 kiro-ide/1.0.0',
      'X-Amz-User-Agent': 'aws-sdk-js/3.0.0 kiro-ide/1.0.0',
      'Amz-Sdk-Request': 'attempt=1; max=3',
      'Amz-Sdk-Invocation-Id': randomUUID(),
    };

    if (isApiKey) {
      headers.Authorization = `Bearer ${token}`;
      headers.tokentype = 'API_KEY';
    } else {
      headers.Authorization = `Bearer ${token}`;
    }

    let lastError: Error | undefined;
    let res: Response | undefined;

    for (const targetUrl of targetUrls) {
      const connectController = new AbortController();
      const connectTimer = setTimeout(() => connectController.abort(new Error('connect timeout')), 10000);

      try {
        const response = await this.fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: connectController.signal,
        });
        clearTimeout(connectTimer);

        if (response.ok) {
          res = response;
          break;
        }

        // On 401/403 or 429, don't silently loop all URLs if it's an auth or quota failure
        const errText = await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new ProviderInvocationError(`Kiro auth failed (${response.status}): ${errText}`, {
            kind: 'authentication',
            scope: 'key',
            retryable: false,
            fallbackAllowed: true,
          });
        }
        if (response.status === 402 || response.status === 429) {
          throw new ProviderInvocationError(`Kiro quota/rate limit (${response.status}): ${errText}`, {
            kind: response.status === 402 ? 'quota_exhausted' : 'rate_limit',
            scope: 'key',
            retryable: true,
            fallbackAllowed: true,
          });
        }

        lastError = new Error(`HTTP ${response.status}: ${errText}`);
      } catch (err: unknown) {
        clearTimeout(connectTimer);
        if (err instanceof ProviderInvocationError) throw err;
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    if (!res || !res.ok) {
      const msg = lastError?.message || 'all Kiro endpoints failed';
      throw new ProviderInvocationError(`Kiro upstream error: ${msg}`, {
        kind: 'temporary',
        scope: 'provider',
        retryable: true,
        fallbackAllowed: true,
      });
    }

    if (!res.body) {
      throw new ProviderInvocationError('Kiro returned empty streaming response', {
        kind: 'temporary',
        scope: 'provider',
        retryable: true,
        fallbackAllowed: true,
      });
    }

    // Stream decoding: supports both AWS EventStream binary and SSE text
    let buffer = new Uint8Array(0);
    let hadToolUse = false;
    const textDecoder = new TextDecoder();

    for await (const chunk of iterateStreamWithWatchdog(res.body, {
      firstChunkTimeoutMs: 30_000,
      stallTimeoutMs: 30_000,
      parentSignal: input.request.signal,
      providerId: this.providerId,
    })) {
      const uint8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      const newBuffer = new Uint8Array(buffer.length + uint8.length);
      newBuffer.set(buffer);
      newBuffer.set(uint8, buffer.length);
      buffer = newBuffer;

      // Attempt to decode AWS EventStream frames
      let isBinaryFrame = buffer.length >= 16;
      if (isBinaryFrame) {
        const view = new DataView(buffer.buffer, buffer.byteOffset);
        const totalLength = view.getUint32(0, false);
        // Valid EventStream total length check
        if (totalLength >= 16 && totalLength <= buffer.length) {
          while (buffer.length >= 16) {
            const currentView = new DataView(buffer.buffer, buffer.byteOffset);
            const frameLen = currentView.getUint32(0, false);
            if (frameLen < 16 || frameLen > buffer.length) break;

            const frameData = buffer.slice(0, frameLen);
            buffer = buffer.slice(frameLen);

            const frame = parseEventFrame(frameData);
            if (!frame) continue;

            const eventType = frame.headers[':event-type'] || '';
            const payload = frame.payload;

            if (eventType === 'assistantResponseEvent' || payload?.assistantResponseEvent) {
              const delta = payload?.assistantResponseEvent?.content ?? payload?.content ?? '';
              if (delta) yield { id, model: input.modelId, delta };
            } else if (eventType === 'reasoningContentEvent' || payload?.reasoningContentEvent) {
              const rc = payload?.reasoningContentEvent ?? payload;
              const thought = typeof rc === 'string' ? rc : (rc?.text ?? rc?.content ?? '');
              if (thought) yield { id, model: input.modelId, thought };
            } else if (eventType === 'toolUseEvent' || payload?.toolUseEvent) {
              hadToolUse = true;
              const tu = payload?.toolUseEvent ?? payload;
              const toolCall: ToolCall = {
                id: tu.toolUseId ?? `call_${Date.now()}`,
                type: 'function',
                function: { name: tu.name ?? '', arguments: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input ?? {}) },
              };
              yield { id, model: input.modelId, toolCalls: [toolCall] };
            } else if (eventType === 'usageEvent' || payload?.usageEvent) {
              const u = payload?.usageEvent ?? payload;
              yield {
                id,
                model: input.modelId,
                usage: {
                  promptTokens: u.inputTokens ?? 0,
                  completionTokens: u.outputTokens ?? 0,
                  totalTokens: (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
                },
              };
            } else if (eventType === 'messageStopEvent' || payload?.messageStopEvent) {
              yield { id, model: input.modelId, finishReason: hadToolUse ? 'tool_calls' : 'stop' };
              return;
            }
          }
          continue;
        }
      }

      // Fallback: Text / SSE line parser
      const text = textDecoder.decode(buffer, { stream: true });
      if (text.includes('\n\n')) {
        const blocks = text.split('\n\n');
        // Keep remainder in buffer
        const remainder = blocks.pop() ?? '';
        buffer = new TextEncoder().encode(remainder);

        for (const block of blocks) {
          if (!block.trim()) continue;
          let eventType = '';
          let eventData = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith(':event-type:')) eventType = line.slice(12).trim();
            else if (line.startsWith('data:')) eventData = line.slice(5).trim();
          }
          if (!eventData) continue;
          let data: any;
          try { data = JSON.parse(eventData); } catch { continue; }

          if (eventType === 'assistantResponseEvent' || data.assistantResponseEvent) {
            const delta = data.assistantResponseEvent?.content ?? data.content ?? '';
            if (delta) yield { id, model: input.modelId, delta };
          } else if (eventType === 'reasoningContentEvent' || data.reasoningContentEvent) {
            const rc = data.reasoningContentEvent ?? data;
            const thought = typeof rc === 'string' ? rc : (rc.text ?? rc.content ?? '');
            if (thought) yield { id, model: input.modelId, thought };
          } else if (eventType === 'toolUseEvent' || data.toolUseEvent) {
            hadToolUse = true;
            const tu = data.toolUseEvent ?? data;
            const toolCall: ToolCall = {
              id: tu.toolUseId ?? `call_${Date.now()}`,
              type: 'function',
              function: { name: tu.name ?? '', arguments: JSON.stringify(tu.input ?? {}) },
            };
            yield { id, model: input.modelId, toolCalls: [toolCall] };
          } else if (eventType === 'usageEvent' || data.usageEvent) {
            const u = data.usageEvent ?? data;
            yield {
              id,
              model: input.modelId,
              usage: {
                promptTokens: u.inputTokens ?? 0,
                completionTokens: u.outputTokens ?? 0,
                totalTokens: (u.inputTokens ?? 0) + (u.outputTokens ?? 0),
              },
            };
          } else if (eventType === 'messageStopEvent' || data.messageStopEvent) {
            yield { id, model: input.modelId, finishReason: hadToolUse ? 'tool_calls' : 'stop' };
            return;
          }
        }
      }
    }
  }

  private buildPayload(model: string, request: NormalizedChatRequest, profileArn?: string): Record<string, unknown> {
    const history: unknown[] = [];
    let currentMessage: any = null;

    for (const msg of request.messages) {
      if (msg.role === 'user' || msg.role === 'system') {
        const content = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') : '');
        currentMessage = { userInputMessage: { content, modelId: model, origin: 'AI_EDITOR' } };
        history.push(currentMessage);
      } else if (msg.role === 'assistant') {
        const content = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') : '');
        history.push({ assistantResponseMessage: { content } });
      }
    }

    for (let i = history.length - 1; i >= 0; i--) {
      const item = history[i] as any;
      if (item.userInputMessage) {
        currentMessage = history.splice(i, 1)[0];
        break;
      }
    }

    if (!currentMessage) {
      currentMessage = { userInputMessage: { content: '', modelId: model, origin: 'AI_EDITOR' } };
    }

    if (request.tools?.length) {
      currentMessage.userInputMessage.userInputMessageContext = {
        tools: request.tools.map((t: any) => ({
          toolSpecification: {
            name: t.function?.name ?? t.name,
            description: t.function?.description ?? t.description ?? '',
            inputSchema: { json: t.function?.parameters ?? t.parameters ?? {} },
          },
        })),
      };
    }

    return {
      ...(profileArn ? { profileArn } : {}),
      conversationState: {
        chatTriggerType: 'MANUAL',
        conversationId: `kiro-${Date.now()}`,
        currentMessage,
        history,
      },
    };
  }
}

/**
 * Parses a single AWS EventStream binary frame.
 */
export function parseEventFrame(data: Uint8Array): { headers: Record<string, string>; payload: any } | null {
  try {
    if (data.length < 16) return null;
    const view = new DataView(data.buffer, data.byteOffset);
    const headersLength = view.getUint32(4, false);

    const headers: Record<string, string> = {};
    let offset = 12; // After 12-byte prelude
    const headerEnd = 12 + headersLength;

    while (offset < headerEnd && offset < data.length) {
      const nameLen = data[offset];
      offset++;
      if (offset + nameLen > data.length) break;

      const name = new TextDecoder().decode(data.slice(offset, offset + nameLen));
      offset += nameLen;

      const headerType = data[offset];
      offset++;

      if (headerType === 7) { // String type
        const valueLen = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        if (offset + valueLen > data.length) break;

        const value = new TextDecoder().decode(data.slice(offset, offset + valueLen));
        offset += valueLen;
        headers[name] = value;
      } else {
        break;
      }
    }

    // Payload slice (excluding 4-byte trailing message CRC)
    const payloadStart = 12 + headersLength;
    const payloadEnd = data.length - 4;

    let payload: any = null;
    if (payloadEnd > payloadStart) {
      const payloadStr = new TextDecoder().decode(data.slice(payloadStart, payloadEnd));
      if (payloadStr && payloadStr.trim()) {
        try {
          payload = JSON.parse(payloadStr);
        } catch {
          payload = { raw: payloadStr };
        }
      }
    }

    return { headers, payload };
  } catch {
    return null;
  }
}
