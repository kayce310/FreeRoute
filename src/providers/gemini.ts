import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
import { ProviderInvocationError, type ChatProviderAdapter, type NormalizedChatRequest } from '../inference.js';

interface GeminiModel { name?: string; supportedGenerationMethods?: string[]; }
interface GeminiList { models?: GeminiModel[]; nextPageToken?: string; }
interface GeminiResponse { responseId?: string; modelVersion?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; }

export interface GeminiAdapterOptions {
  baseUrl?: string;
  getCredential: (credentialId: string) => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
}

/** Native Gemini REST adapter. It intentionally handles text-only chat first. */
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
      .map((model) => ({ modelId: model.name!.replace(/^models\//, ''), capabilities: ['chat', 'streaming'], freeTier: 'free_unverified' as const }));
  }

  async chat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
    const response = await this.fetcher(this.url(input.modelId, 'generateContent'), {
      method: 'POST', headers: { ...(await this.headers(input.credentialId)), 'content-type': 'application/json' },
      body: JSON.stringify(toGeminiRequest(input.request)),
    });
    if (!response.ok) throw await providerError(response);
    const body = await response.json() as GeminiResponse;
    const content = textFrom(body);
    if (!content) throw new ProviderInvocationError('Gemini returned no assistant content', { kind: 'temporary' });
    return { id: body.responseId ?? crypto.randomUUID(), model: body.modelVersion ?? input.modelId, content };
  }

  async *streamChat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
    const url = new URL(this.url(input.modelId, 'streamGenerateContent'));
    url.searchParams.set('alt', 'sse');
    const response = await this.fetcher(url, {
      method: 'POST', headers: { ...(await this.headers(input.credentialId)), 'content-type': 'application/json' },
      body: JSON.stringify(toGeminiRequest(input.request)),
    });
    if (!response.ok) throw await providerError(response);
    if (!response.body) throw new ProviderInvocationError('Gemini returned no streaming response body', { kind: 'temporary' });
    const decoder = new TextDecoder();
    let pending = '';
    for await (const bytes of response.body) {
      pending += decoder.decode(bytes, { stream: true });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) {
        const data = line.startsWith('data:') ? line.slice(5).trim() : '';
        if (!data) continue;
        try {
          const chunk = JSON.parse(data) as GeminiResponse;
          yield { id: chunk.responseId ?? crypto.randomUUID(), model: chunk.modelVersion ?? input.modelId, delta: textFrom(chunk) };
        } catch { /* Ignore non-data SSE lines. */ }
      }
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

function toGeminiRequest(request: NormalizedChatRequest): object {
  const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
  const contents = request.messages.filter((message) => message.role !== 'system').map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }],
  }));
  return { contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), ...(request.temperature === undefined ? {} : { generationConfig: { temperature: request.temperature } }) };
}

function textFrom(response: GeminiResponse): string | undefined {
  const text = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
  return text || undefined;
}

async function providerError(response: Response): Promise<ProviderInvocationError> {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1_000 : undefined;
  const kind = response.status === 401 || response.status === 403 ? 'authentication'
    : response.status === 429 ? 'rate_limit'
      : response.status === 408 || response.status >= 500 ? 'temporary'
        : response.status === 400 || response.status === 404 ? 'unsupported' : 'permanent';
  return new ProviderInvocationError(`Gemini request failed with HTTP ${response.status}`, { kind, retryAfterMs });
}
