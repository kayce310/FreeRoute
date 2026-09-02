import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
import type { FreeTierClass } from '../contracts.js';
import { ProviderInvocationError, type ChatProviderAdapter, type NormalizedChatRequest } from '../inference.js';

interface OpenAIModel {
  id: string;
  pricing?: { prompt?: string; completion?: string };
}

interface OpenAIModelList {
  data?: OpenAIModel[];
}

type OpenAIMessageContent = string | Array<{ text?: string }> | undefined;

interface OpenAIChatCompletion {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: OpenAIMessageContent } }>;
}

interface OpenAIChatChunk {
  id?: string;
  model?: string;
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
}

export interface OpenAICompatibleAdapterOptions {
  providerId: string;
  baseUrl: string;
  getCredential: (credentialId: string) => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
  /** Use when an official catalog has no price metadata but the tier is known separately. */
  classifyModel?: (model: OpenAIModel) => FreeTierClass;
}

/**
 * Generic adapter for official OpenAI-compatible APIs. For OpenRouter, pricing
 * metadata is used to classify zero-cost models as verified free candidates.
 */
export class OpenAICompatibleAdapter implements ProviderDiscoveryAdapter, ChatProviderAdapter {
  readonly providerId: string;
  private readonly baseUrl: string;
  private readonly getCredential: OpenAICompatibleAdapterOptions['getCredential'];
  private readonly fetcher: typeof globalThis.fetch;
  private readonly classifyModel: (model: OpenAIModel) => FreeTierClass;

  constructor(options: OpenAICompatibleAdapterOptions) {
    this.providerId = options.providerId;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getCredential = options.getCredential;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.classifyModel = options.classifyModel ?? ((model) => isZeroPrice(model.pricing) ? 'free_verified' : 'paid');
  }

  async discoverModels(credentialId: string): Promise<DiscoveredModel[]> {
    const response = await this.fetcher(`${this.baseUrl}/models`, { headers: await this.headers(credentialId) });
    if (!response.ok) throw await providerError(response);
    const body = await response.json() as OpenAIModelList;
    return (body.data ?? []).map((model) => ({
      modelId: model.id,
      capabilities: ['chat', 'streaming'],
      freeTier: this.classifyModel(model),
    }));
  }

  async chat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { ...(await this.headers(input.credentialId)), 'content-type': 'application/json' },
      body: JSON.stringify({
        model: input.modelId,
        messages: input.request.messages,
        temperature: input.request.temperature,
        stream: false,
      }),
    });
    if (!response.ok) throw await providerError(response);
    const body = await response.json() as OpenAIChatCompletion;
    const content = contentToText(body.choices?.[0]?.message?.content);
    if (!content) throw new ProviderInvocationError('upstream returned no assistant content', { kind: 'temporary' });
    return { id: body.id ?? crypto.randomUUID(), model: body.model ?? input.modelId, content, quota: quotaFromHeaders(response.headers) };
  }

  async *streamChat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
    const response = await this.fetcher(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { ...(await this.headers(input.credentialId)), 'content-type': 'application/json' },
      body: JSON.stringify({ model: input.modelId, messages: input.request.messages, temperature: input.request.temperature, stream: true }),
    });
    if (!response.ok) throw await providerError(response);
    if (!response.body) throw new ProviderInvocationError('upstream returned no streaming response body', { kind: 'temporary' });
    const decoder = new TextDecoder();
    let pending = '';
    for await (const bytes of response.body) {
      pending += decoder.decode(bytes, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const data = line.startsWith('data:') ? line.slice(5).trim() : undefined;
        if (!data || data === '[DONE]') continue;
        let chunk: OpenAIChatChunk;
        try { chunk = JSON.parse(data) as OpenAIChatChunk; } catch { continue; }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        yield {
          id: chunk.id ?? crypto.randomUUID(),
          model: chunk.model ?? input.modelId,
          delta: choice.delta?.content,
          finishReason: choice.finish_reason,
        };
      }
    }
  }

  private async headers(credentialId: string): Promise<Record<string, string>> {
    const secret = await this.getCredential(credentialId);
    if (!secret) throw new ProviderInvocationError('credential not found', { kind: 'authentication' });
    return { authorization: `Bearer ${secret}` };
  }
}

function quotaFromHeaders(headers: Headers): import('../inference.js').QuotaObservation | undefined {
  const remainingRequests = positiveNumber(headers.get('x-ratelimit-remaining-requests'));
  const remainingTokens = positiveNumber(headers.get('x-ratelimit-remaining-tokens'));
  const resetAt = resetTime(headers.get('x-ratelimit-reset-requests') ?? headers.get('retry-after'));
  return remainingRequests === undefined && remainingTokens === undefined && !resetAt ? undefined : { remainingRequests, remainingTokens, resetAt };
}

function positiveNumber(value: string | null): number | undefined {
  if (!value || !/^\d+(?:\.\d+)?$/.test(value)) return undefined;
  return Number(value);
}

function resetTime(value: string | null): Date | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return new Date(Date.now() + Number(value) * 1_000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function isZeroPrice(pricing: OpenAIModel['pricing']): boolean {
  return pricing?.prompt === '0' && pricing?.completion === '0';
}

function contentToText(content: OpenAIMessageContent): string | undefined {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => part.text ?? '').join('') || undefined;
  return undefined;
}

async function providerError(response: Response): Promise<ProviderInvocationError> {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1_000 : undefined;
  const kind = response.status === 401 || response.status === 403
    ? 'authentication'
    : response.status === 402
      ? 'quota_exhausted'
    : response.status === 429
      ? 'rate_limit'
      : response.status === 408 || response.status >= 500
        ? 'temporary'
        : response.status === 404 || response.status === 400
          ? 'unsupported'
          : 'permanent';
  return new ProviderInvocationError(`upstream request failed with HTTP ${response.status}`, { kind, retryAfterMs });
}
