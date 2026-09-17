import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
import { ProviderInvocationError, type ChatProviderAdapter, type NormalizedChatRequest, type NormalizedChatStreamEvent } from '../inference.js';
import { translateRequest } from '../translators/index.js';
import { iterateStreamWithWatchdog } from '../utils/stream-watchdog.js';

interface AnthropicAdapterOptions {
  baseUrl?: string;
  getCredential: (credentialId: string) => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
}

export class AnthropicAdapter implements ProviderDiscoveryAdapter, ChatProviderAdapter {
  readonly providerId = 'anthropic';
  private readonly baseUrl: string;
  private readonly getCredential: AnthropicAdapterOptions['getCredential'];
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: AnthropicAdapterOptions) {
    this.baseUrl = (options.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
    this.getCredential = options.getCredential;
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async discoverModels(_credentialId: string): Promise<DiscoveredModel[]> {
    return [
      { modelId: 'claude-3-5-sonnet-latest', capabilities: ['chat', 'streaming', 'tools', 'vision'], freeTier: 'paid', priority: 0 },
      { modelId: 'claude-3-5-haiku-latest', capabilities: ['chat', 'streaming', 'tools', 'vision'], freeTier: 'paid', priority: 0 },
    ];
  }

  async chat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
    const response = await this.fetcher(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: await this.headers(input.credentialId, input.modelId),
      body: JSON.stringify({
        ...translateRequest('openai', 'anthropic', input.modelId, input.request),
        model: input.modelId,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) throw await providerError(response);
    const body = await response.json() as any;
    const content = body.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    const thought = body.content.find((b: any) => b.type === 'thinking')?.thinking;
    const toolCalls = body.content
      .filter((b: any) => b.type === 'tool_use')
      .map((b: any) => ({
        id: b.id,
        type: 'function' as const,
        function: { name: b.name, arguments: JSON.stringify(b.input) },
      }));

    return {
      id: body.id,
      model: body.model,
      content,
      thought,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage: {
        promptTokens: body.usage.input_tokens,
        completionTokens: body.usage.output_tokens,
        totalTokens: body.usage.input_tokens + body.usage.output_tokens,
      }
    };
  }

  async *streamChat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }): AsyncIterable<NormalizedChatStreamEvent> {
    const connectController = new AbortController();
    const connectTimer = setTimeout(() => connectController.abort(new Error('connect timeout')), 10000);
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: { ...(await this.headers(input.credentialId, input.modelId)), 'anthropic-version': '2023-06-01' },
        signal: connectController.signal,
        body: JSON.stringify({
          ...translateRequest('openai', 'anthropic', input.modelId, input.request),
          model: input.modelId,
          max_tokens: 4096,
          stream: true,
        }),
      });
      clearTimeout(connectTimer);
    } catch (err: unknown) {
      clearTimeout(connectTimer);
      const msg = err instanceof Error ? err.message : 'network fetch failed';
      throw new ProviderInvocationError(`upstream streaming connection error to anthropic: ${msg}`, {
        kind: 'temporary',
        scope: 'provider',
        retryable: true,
        fallbackAllowed: true,
      });
    }
    if (!response.ok) throw await providerError(response);
    if (!response.body) throw new ProviderInvocationError('no stream body', { kind: 'temporary' });

    const decoder = new TextDecoder();
    let pending = '';
    const toolCalls = new Map<number, { id: string; name: string; args: string; index: number }>();
    let toolCallSeq = 0;
    let finishReasonEmitted = false;
    let hadToolCalls = false;
    let lastUsage: import('../contracts.js').TokenUsage | undefined;

    for await (const value of iterateStreamWithWatchdog(response.body, {
      firstChunkTimeoutMs: 30_000,
      stallTimeoutMs: 30_000,
      parentSignal: input.request.signal,
      providerId: 'anthropic',
      onAbort: () => { try { connectController.abort(); } catch {} },
    })) {
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;
        let data: any;
        try { data = JSON.parse(raw); } catch { continue; }

        if (data.type === 'content_block_start') {
          if (data.content_block?.type === 'tool_use') {
            hadToolCalls = true;
            const tcIndex = toolCallSeq++;
            toolCalls.set(data.index, { id: data.content_block.id, name: data.content_block.name, args: '', index: tcIndex });
            yield {
              id: `tc-${data.index}`,
              model: input.modelId,
              toolCalls: [{
                index: tcIndex,
                id: data.content_block.id,
                type: 'function',
                function: { name: data.content_block.name, arguments: '' },
              } as any],
            };
          }
        } else if (data.type === 'content_block_delta') {
          if (data.delta?.type === 'text_delta' && data.delta.text) {
            yield { id: String(data.index), model: input.modelId, delta: data.delta.text };
          } else if (data.delta?.type === 'thinking_delta' && data.delta.thinking) {
            yield { id: String(data.index), model: input.modelId, thought: data.delta.thinking };
          } else if (data.delta?.type === 'input_json_delta' && data.delta.partial_json) {
            const tc = toolCalls.get(data.index);
            if (tc) {
              tc.args += data.delta.partial_json;
              yield {
                id: `tc-${data.index}`,
                model: input.modelId,
                toolCalls: [{
                  index: tc.index,
                  id: tc.id,
                  type: 'function',
                  function: { name: tc.name, arguments: data.delta.partial_json },
                } as any],
              };
            }
          }
        } else if (data.type === 'message_delta') {
          if (data.usage) {
            const promptTokens = (data.usage.input_tokens ?? 0) + (data.usage.cache_read_input_tokens ?? 0) + (data.usage.cache_creation_input_tokens ?? 0);
            const completionTokens = data.usage.output_tokens ?? 0;
            lastUsage = {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            };
          }
          if (data.delta?.stop_reason) {
            let finishReason = 'stop';
            if (data.delta.stop_reason === 'tool_use') finishReason = 'tool_calls';
            else if (data.delta.stop_reason === 'max_tokens') finishReason = 'length';
            else if (hadToolCalls) finishReason = 'tool_calls';

            finishReasonEmitted = true;
            yield {
              id: 'finish',
              model: input.modelId,
              finishReason,
              usage: lastUsage,
            };
          }
        } else if (data.type === 'message_stop') {
          if (!finishReasonEmitted) {
            finishReasonEmitted = true;
            yield {
              id: 'finish',
              model: input.modelId,
              finishReason: hadToolCalls ? 'tool_calls' : 'stop',
              usage: lastUsage,
            };
          }
        }
      }
    }

    if (!finishReasonEmitted) {
      yield {
        id: 'finish',
        model: input.modelId,
        finishReason: hadToolCalls ? 'tool_calls' : 'stop',
        usage: lastUsage,
      };
    }
  }

  private async headers(credentialId: string, _modelId: string): Promise<Record<string, string>> {
    const secret = await this.getCredential(credentialId);
    if (!secret) throw new ProviderInvocationError('credential not found', { kind: 'authentication' });
    return { 
      'x-api-key': secret,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
  }
}

async function providerError(response: Response): Promise<ProviderInvocationError> {
  const rawBody = await response.text().catch(() => '');
  let msg = rawBody;
  try { msg = JSON.parse(rawBody).error.message; } catch {}
  
  let kind: import('../contracts.js').RouteFailureKind = 'permanent';
  let scope: import('../contracts.js').RouteFailureScope = 'key';
  if (response.status === 401 || response.status === 403) {
    kind = 'authentication';
  } else if (response.status === 429) {
    kind = 'rate_limit';
  } else if (response.status >= 500) {
    kind = 'temporary';
    scope = 'provider';
  }
  
  return new ProviderInvocationError(`Anthropic error ${response.status}: ${msg}`, { kind, scope, fallbackAllowed: true });
}
