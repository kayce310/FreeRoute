import type { ChatProviderAdapter, NormalizedChatRequest, NormalizedChatResponse, NormalizedChatStreamEvent, ToolCall } from '../inference.js';
import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';

export class OllamaAdapter implements ChatProviderAdapter, ProviderDiscoveryAdapter {
  readonly providerId: string;
  private readonly baseUrl: string;
  private readonly getCredential: (id: string) => Promise<string | undefined>;
  private readonly fetch: typeof globalThis.fetch;

  async discoverModels(credentialId: string): Promise<import('../catalog.js').DiscoveredModel[]> {
    return [{ modelId: 'llama3.2', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 85 }];
  }

  constructor(options: {
    providerId: string;
    baseUrl: string;
    getCredential: (id: string) => Promise<string | undefined> | string | undefined;
    fetch?: typeof globalThis.fetch;
  }) {
    this.providerId = options.providerId;
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getCredential = (id) => Promise.resolve(options.getCredential(id));
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async chat(input: {
    credentialId: string;
    modelId: string;
    request: NormalizedChatRequest;
  }): Promise<Omit<NormalizedChatResponse, 'providerId' | 'modelId'>> {
    const body = this.buildBody(input.modelId, input.request);
    const res = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: false }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = await res.json() as any;
    const msg = data.message ?? {};
    return {
      id: `ollama-${Date.now()}`,
      model: data.model ?? input.modelId,
      content: msg.content ?? '',
      thought: msg.thinking || undefined,
      toolCalls: this.convertToolCalls(msg.tool_calls),
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
    };
  }

  async *streamChat(input: {
    credentialId: string;
    modelId: string;
    request: NormalizedChatRequest;
  }): AsyncIterable<NormalizedChatStreamEvent> {
    const id = `ollama-${Date.now()}`;
    const body = this.buildBody(input.modelId, input.request);
    const res = await this.fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: true }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hadToolCalls = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let chunk: any;
        try { chunk = JSON.parse(trimmed); } catch { continue; }

        if (chunk.done) {
          const finishReason = hadToolCalls ? 'tool_calls' : (chunk.done_reason ?? 'stop');
          yield { id, model: chunk.model ?? input.modelId, finishReason };
          return;
        }

        const msg = chunk.message;
        if (!msg) continue;

        const event: NormalizedChatStreamEvent = { id, model: chunk.model ?? input.modelId };
        if (typeof msg.thinking === 'string' && msg.thinking) event.thought = msg.thinking;
        if (typeof msg.content === 'string' && msg.content) event.delta = msg.content;
        const toolCalls = this.convertToolCalls(msg.tool_calls);
        if (toolCalls?.length) { event.toolCalls = toolCalls; hadToolCalls = true; }
        if (event.delta || event.thought || event.toolCalls) yield event;
      }
    }
  }

  private buildBody(modelId: string, request: NormalizedChatRequest): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: modelId,
      messages: request.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content
          : Array.isArray(m.content) ? m.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('') : '',
      })),
    };
    const opts: Record<string, unknown> = {};
    if (request.temperature !== undefined) opts.temperature = request.temperature;
    // @ts-ignore
    if (request.maxTokens !== undefined) opts.num_predict = request.maxTokens;
    if (Object.keys(opts).length) body.options = opts;
    if (request.tools?.length) body.tools = request.tools;
    return body;
  }
  private convertToolCalls(raw: any[]): ToolCall[] | undefined {
    if (!Array.isArray(raw) || !raw.length) return undefined;
    return raw.map((tc, i) => ({
      id: tc.id ?? `call_${Date.now()}_${i}`,
      type: 'function' as const,
      function: {
        name: tc.function?.name ?? '',
        arguments: typeof tc.function?.arguments === 'string'
          ? tc.function.arguments
          : JSON.stringify(tc.function?.arguments ?? {}),
      },
    }));
  }
}
