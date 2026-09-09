import type { ChatProviderAdapter, NormalizedChatRequest, NormalizedChatResponse, NormalizedChatStreamEvent, ToolCall } from '../inference.js';
import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';

export class KiroAdapter implements ChatProviderAdapter, ProviderDiscoveryAdapter {
  readonly providerId: string;
  private readonly baseUrl: string;
  private readonly getCredential: (id: string) => Promise<string | undefined>;
  private readonly fetch: typeof globalThis.fetch;

  async discoverModels(credentialId: string): Promise<import('../catalog.js').DiscoveredModel[]> {
    return [{ modelId: 'claude-3-5-sonnet-latest', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 95 }];
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
    const accessToken = this.getCredential(input.credentialId);
    if (!accessToken) throw new Error('Kiro: no access token for credentialId ' + input.credentialId);
    const id = `kiro-${Date.now()}`;
    const model = input.modelId.includes('/') ? input.modelId.split('/').pop()! : input.modelId;
    const payload = this.buildPayload(model, input.request);

    const res = await this.fetch(`${this.baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Kiro ${res.status}: ${await res.text()}`);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let hadToolUse = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';

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

  private buildPayload(model: string, request: NormalizedChatRequest): Record<string, unknown> {
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
      if (item.userInputMessage) { currentMessage = history.splice(i, 1)[0]; break; }
    }
    if (!currentMessage) currentMessage = { userInputMessage: { content: '', modelId: model, origin: 'AI_EDITOR' } };
    if (request.tools?.length) {
      currentMessage.userInputMessage.userInputMessageContext = {
        tools: request.tools.map((t: any) => ({
          toolSpecification: { name: t.function?.name ?? t.name, description: t.function?.description ?? t.description ?? '', inputSchema: { json: t.function?.parameters ?? t.parameters ?? {} } },
        })),
      };
    }
    return { conversationState: { chatTriggerType: 'MANUAL', conversationId: `kiro-${Date.now()}`, currentMessage, history } };
  }
}
