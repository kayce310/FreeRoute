import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
import { ProviderInvocationError, type ChatProviderAdapter, type NormalizedChatRequest, type NormalizedChatStreamEvent } from '../inference.js';
import type { TokenUsage } from '../contracts.js';
import { translateAnthropicRequest } from '../translators/anthropic-translator.js';

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
    // Anthropic doesn't have a model discovery API, using a static list for integration
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
        ...translateAnthropicRequest(input.request),
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
    const response = await this.fetcher(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { ...(await this.headers(input.credentialId, input.modelId)), 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        ...translateAnthropicRequest(input.request),
        model: input.modelId,
        max_tokens: 4096,
        stream: true,
      }),
    });

    if (!response.ok) throw await providerError(response);
    if (!response.body) throw new ProviderInvocationError('no stream body', { kind: 'temporary' });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = JSON.parse(line.slice(5));
        
        if (data.type === 'content_block_delta') {
          if (data.delta.type === 'text_delta') {
            yield { id: data.index, model: input.modelId, delta: data.delta.text };
          }
        } else if (data.type === 'message_delta') {
          if (data.usage) {
            yield { id: 'usage', model: input.modelId, usage: { promptTokens: data.usage.input_tokens, completionTokens: data.usage.output_tokens, totalTokens: data.usage.input_tokens + data.usage.output_tokens } };
          }
        }
      }
    }
  }

  private async headers(credentialId: string, modelId: string): Promise<Record<string, string>> {
    const secret = await this.getCredential(credentialId);
    if (!secret) throw new ProviderInvocationError('credential not found', { kind: 'authentication' });
    return { 
      'x-api-key': secret,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true' // For local dev
    };
  }
}

async function providerError(response: Response): Promise<ProviderInvocationError> {
  const rawBody = await response.text().catch(() => '');
  let msg = rawBody;
  try { msg = JSON.parse(rawBody).error.message; } catch {}
  
  let kind: import('../contracts.js').RouteFailureKind = 'permanent';
  if (response.status === 401 || response.status === 403) kind = 'authentication';
  else if (response.status === 429) kind = 'rate_limit';
  else if (response.status >= 500) kind = 'temporary';
  
  return new ProviderInvocationError(`Anthropic error ${response.status}: ${msg}`, { kind, scope: 'provider' });
}
