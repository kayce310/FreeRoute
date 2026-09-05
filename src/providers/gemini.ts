import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
import { ProviderInvocationError, type ChatProviderAdapter, type NormalizedChatRequest, type ToolCall } from '../inference.js';
import type { TokenUsage } from '../contracts.js';

interface GeminiModel { name?: string; supportedGenerationMethods?: string[]; }
interface GeminiList { models?: GeminiModel[]; nextPageToken?: string; }
interface GeminiResponse {
  responseId?: string;
  modelVersion?: string;
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args?: Record<string, unknown> } }>; };
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
      .map((model) => ({ modelId: model.name!.replace(/^models\//, ''), capabilities: ['chat', 'streaming'], freeTier: 'free_unverified' as const }));
  }

  async chat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
    let response: Response;
    try {
      const headers = await this.headers(input.credentialId);
      response = await this.fetcher(this.url(input.modelId, 'generateContent'), {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(toGeminiRequest(input.request)),
      });
    } catch (err: unknown) {
      if (err instanceof ProviderInvocationError) throw err;
      const msg = err instanceof Error ? err.message : 'network fetch failed';
      throw new ProviderInvocationError(`Gemini connection error: ${msg}`, { kind: 'temporary' });
    }

    if (!response.ok) throw await providerError(response);
    const body = await response.json() as GeminiResponse;
    const content = textFrom(body);
    const toolCalls = toolCallsFrom(body);
    if (!content && !toolCalls.length) throw new ProviderInvocationError('Gemini returned no assistant content', { kind: 'temporary' });
    return { id: body.responseId ?? crypto.randomUUID(), model: body.modelVersion ?? input.modelId, content: content ?? '', toolCalls: toolCalls.length ? toolCalls : undefined, usage: usageFrom(body.usageMetadata) };
  }

  async *streamChat(input: { credentialId: string; modelId: string; request: NormalizedChatRequest }) {
    const url = new URL(this.url(input.modelId, 'streamGenerateContent'));
    url.searchParams.set('alt', 'sse');
    let response: Response;
    try {
      const headers = await this.headers(input.credentialId);
      response = await this.fetcher(url, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify(toGeminiRequest(input.request)),
      });
    } catch (err: unknown) {
      if (err instanceof ProviderInvocationError) throw err;
      const msg = err instanceof Error ? err.message : 'network fetch failed';
      throw new ProviderInvocationError(`Gemini streaming connection error: ${msg}`, { kind: 'temporary' });
    }

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
          const text = textFrom(chunk);
          const toolCalls = (chunk.candidates?.[0]?.content?.parts ?? [])
            .filter((part): part is { functionCall: { name: string; args?: Record<string, unknown> } } => !!part.functionCall)
            .map((part) => ({
            id: crypto.randomUUID(),
            type: 'function' as const,
            function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) },
          }));
          yield { id: chunk.responseId ?? crypto.randomUUID(), model: chunk.modelVersion ?? input.modelId, delta: text, toolCalls: toolCalls.length ? toolCalls : undefined, usage: usageFrom(chunk.usageMetadata) };
        } catch { /* Ignore non-data SSE lines. */ }
      }
    }
    pending += decoder.decode();
    const finalLine = pending.trim();
    if (finalLine.startsWith('data:')) {
      try {
        const chunk = JSON.parse(finalLine.slice(5).trim()) as GeminiResponse;
        const text = textFrom(chunk);
        const toolCalls = toolCallsFrom(chunk);
        yield { id: chunk.responseId ?? crypto.randomUUID(), model: chunk.modelVersion ?? input.modelId, delta: text, toolCalls: toolCalls.length ? toolCalls : undefined, usage: usageFrom(chunk.usageMetadata) };
      } catch { /* Ignore an incomplete final SSE line. */ }
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
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: convertContentToGeminiParts(message.content),
  }));
  const extra: Record<string, unknown> = {};
  if (request.tools?.length) {
    extra.tools = [{
      functionDeclarations: request.tools.map((tool) => ({
        name: tool.function.name,
        ...(tool.function.description ? { description: tool.function.description } : {}),
        ...(tool.function.parameters ? { parameters: tool.function.parameters } : {}),
      })),
    }];
  }
  if (request.temperature !== undefined) extra.generationConfig = { temperature: request.temperature };
  return { contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), ...extra };
}

function convertContentToGeminiParts(content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> | null): Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> {
  if (!content) return [];
  if (typeof content === 'string') return [{ text: content }];
  return content.map(part => {
    if (part.type === 'text') return { text: part.text };
    if (part.type === 'image_url') {
      const url = part.image_url.url;
      const isBase64 = url.startsWith('data:');
      if (isBase64) {
        const match = url.match(/^data:([^;]+);base64,/);
        const mimeType = match ? match[1] : 'image/jpeg';
        const base64 = url.replace(/^data:[^;]+;base64,/, '');
        return { inlineData: { mimeType, data: base64 } };
      }
      // ponytail: URL-based images as text reference; Gemini inlineData requires base64
      return { text: `[image](${url})` };
    }
    return { text: '' };
  });
}

function textFrom(response: GeminiResponse): string | undefined {
  const text = response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
  return text || undefined;
}

function toolCallsFrom(response: GeminiResponse): ToolCall[] {
  return (response.candidates?.[0]?.content?.parts ?? [])
    .filter((part): part is { functionCall: { name: string; args?: Record<string, unknown> } } => !!part.functionCall)
    .map((part) => ({
      id: crypto.randomUUID(),
      type: 'function',
      function: { name: part.functionCall.name, arguments: JSON.stringify(part.functionCall.args ?? {}) },
    }));
}

function usageFrom(metadata: GeminiResponse['usageMetadata']): TokenUsage | undefined {
  if (!metadata) return undefined;
  const promptTokens = metadata.promptTokenCount ?? 0;
  const completionTokens = metadata.candidatesTokenCount ?? 0;
  const totalTokens = metadata.totalTokenCount ?? (promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

function isContextOverflowError(status: number, text: string): boolean {
  if (status !== 400 && status !== 413) return false;
  const lower = text.toLowerCase();
  return lower.includes('context length')
    || lower.includes('maximum context length')
    || lower.includes('token limit')
    || lower.includes('too many tokens')
    || lower.includes('prompt is too long')
    || lower.includes('request payload size exceeds')
    || lower.includes('input token count exceeds');
}

async function providerError(response: Response): Promise<ProviderInvocationError> {
  const retryAfter = response.headers.get('retry-after');
  const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1_000 : undefined;
  const rawBody = await response.text().catch(() => '');
  let extractedMessage = '';
  try {
    const parsed = JSON.parse(rawBody) as { error?: { message?: string } | string; message?: string };
    extractedMessage = (typeof parsed.error === 'object' ? parsed.error?.message : parsed.error) || parsed.message || '';
  } catch {
    extractedMessage = rawBody.slice(0, 300);
  }

  const kind = isContextOverflowError(response.status, rawBody)
    ? 'context_overflow'
    : response.status === 401 || response.status === 403 ? 'authentication'
    : response.status === 429 ? 'rate_limit'
      : response.status === 408 || response.status >= 500 ? 'temporary'
        : response.status === 400 || response.status === 404 ? 'unsupported' : 'permanent';

  const errPrefix = `Gemini request failed with HTTP ${response.status}`;
  const fullMessage = extractedMessage ? `${errPrefix}: ${extractedMessage}` : errPrefix;
  return new ProviderInvocationError(fullMessage, { kind, retryAfterMs, message: extractedMessage });
}