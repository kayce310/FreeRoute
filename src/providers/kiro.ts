import type { ChatProviderAdapter, NormalizedChatRequest, NormalizedChatResponse, NormalizedChatStreamEvent, ToolCall } from '../inference.js';
import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';

// ─── Kiro credential types ─────────────────────────────────────────────────────
/**
 * Kiro credential stored as JSON string in the credential store.
 * Backward-compat: if secret is a plain non-JSON string, it is treated as accessToken only.
 */
interface KiroCredential {
  accessToken: string;
  refreshToken?: string | null;
  profileArn?: string | null;
  region?: string;
  authMethod?: 'social' | 'builder_id' | 'idc' | 'api_key' | 'imported';
  clientId?: string;
  clientSecret?: string;
  expiresAt?: number; // Unix timestamp ms
}

// AWS SSO OIDC endpoints
const KIRO_SOCIAL_REFRESH_URL = 'https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken';
const KIRO_CW_BASE = 'https://codewhisperer.us-east-1.amazonaws.com';

/** Parse credential secret: JSON or plain accessToken string */
function parseCredential(secret: string): KiroCredential {
  try {
    const parsed = JSON.parse(secret);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.accessToken === 'string') {
      return parsed as KiroCredential;
    }
  } catch { /* not JSON */ }
  // Fallback: treat entire secret as accessToken
  return { accessToken: secret };
}

/** Refresh a Kiro token using refreshToken. Returns updated KiroCredential. */
async function refreshKiroToken(
  cred: KiroCredential,
  fetcher: typeof globalThis.fetch,
): Promise<KiroCredential> {
  if (!cred.refreshToken) throw new Error('Kiro: no refreshToken available');

  // Builder ID / IDC: use AWS SSO OIDC token endpoint
  if (cred.clientId && cred.clientSecret) {
    const region = cred.region ?? 'us-east-1';
    const endpoint = `https://oidc.${region}.amazonaws.com/token`;
    const res = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        refreshToken: cred.refreshToken,
        grantType: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Kiro SSO OIDC refresh failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { accessToken?: string; refreshToken?: string; expiresIn?: number };
    return {
      ...cred,
      accessToken: data.accessToken ?? cred.accessToken,
      refreshToken: data.refreshToken ?? cred.refreshToken,
      expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined,
    };
  }

  // Social (Google/GitHub) refresh
  const res = await fetcher(KIRO_SOCIAL_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: cred.refreshToken }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Kiro social refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { accessToken?: string; refreshToken?: string; profileArn?: string; expiresIn?: number };
  return {
    ...cred,
    accessToken: data.accessToken ?? cred.accessToken,
    refreshToken: data.refreshToken ?? cred.refreshToken,
    profileArn: data.profileArn ?? cred.profileArn,
    expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined,
  };
}

/** Resolve profileArn via ListAvailableProfiles if not already cached */
async function resolveProfileArn(
  accessToken: string,
  region: string,
  fetcher: typeof globalThis.fetch,
): Promise<string | null> {
  try {
    const endpoint = `https://codewhisperer.${region}.amazonaws.com`;
    const res = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'x-amz-target': 'AmazonCodeWhispererService.ListAvailableProfiles',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      body: JSON.stringify({ maxResults: 10 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { profiles?: Array<{ arn?: string; profileArn?: string }> };
    const profiles = data.profiles ?? [];
    const arnOf = (p: { arn?: string; profileArn?: string }) => p.arn ?? p.profileArn ?? null;
    const match = profiles.find((p) => arnOf(p)?.split(':')[3] === region) ?? profiles[0];
    return match ? arnOf(match) : null;
  } catch {
    return null;
  }
}

export class KiroAdapter implements ChatProviderAdapter, ProviderDiscoveryAdapter {
  readonly providerId: string;
  private readonly baseUrl: string;
  private readonly getCredential: (id: string) => Promise<string | undefined>;
  private readonly fetch: typeof globalThis.fetch;
  /** In-memory cache: credentialId → refreshed credential (avoids repeated refresh per request) */
  private readonly tokenCache = new Map<string, { cred: KiroCredential; updatedAt: number }>();

  constructor(options: {
    providerId: string;
    baseUrl?: string;
    getCredential: (id: string) => Promise<string | undefined> | string | undefined;
    fetch?: typeof globalThis.fetch;
  }) {
    this.providerId = options.providerId;
    this.baseUrl = (options.baseUrl ?? KIRO_CW_BASE).replace(/\/$/, '');
    this.getCredential = (id) => Promise.resolve(options.getCredential(id));
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  /** Resolve and optionally refresh the credential for a given credentialId */
  private async resolveCred(credentialId: string): Promise<KiroCredential> {
    const secret = await this.getCredential(credentialId);
    if (!secret) throw new Error('Kiro: no credential for id ' + credentialId);
    let cred = parseCredential(secret);

    // Check in-memory cache (valid for 5 minutes window before expiry)
    const cached = this.tokenCache.get(credentialId);
    if (cached && Date.now() - cached.updatedAt < 5 * 60 * 1000) {
      cred = cached.cred;
    }

    // Auto-refresh if token is near expiry (within 5 minutes) and refreshToken available
    const expiresAt = cred.expiresAt;
    const nearExpiry = expiresAt && expiresAt - Date.now() < 5 * 60 * 1000;
    if (nearExpiry && cred.refreshToken) {
      try {
        cred = await refreshKiroToken(cred, this.fetch);
        this.tokenCache.set(credentialId, { cred, updatedAt: Date.now() });
      } catch {
        // Use existing token even if refresh failed
      }
    }

    // Resolve profileArn if missing
    if (!cred.profileArn) {
      const region = cred.region ?? 'us-east-1';
      const arn = await resolveProfileArn(cred.accessToken, region, this.fetch);
      if (arn) {
        cred = { ...cred, profileArn: arn };
        this.tokenCache.set(credentialId, { cred, updatedAt: Date.now() });
      }
    }

    return cred;
  }

  async discoverModels(credentialId: string): Promise<DiscoveredModel[]> {
    try {
      const cred = await this.resolveCred(credentialId);
      const region = cred.region ?? 'us-east-1';
      const endpoint = `https://codewhisperer.${region}.amazonaws.com`;

      const res = await this.fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.0',
          'x-amz-target': 'AmazonCodeWhispererService.ListAvailableModels',
          'Authorization': `Bearer ${cred.accessToken}`,
          'Accept': 'application/json',
        },
        body: JSON.stringify({ origin: 'AI_EDITOR', profileArn: cred.profileArn }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json() as { models?: Array<{ modelId?: string; modelName?: string }> };
        const models = (data.models ?? []).filter((m) => m.modelId);
        if (models.length > 0) {
          return models.map((m) => ({
            modelId: `kr/${m.modelId!}`,
            capabilities: ['chat', 'streaming', 'tools'] as const,
            freeTier: 'free_verified' as const,
            priority: 90,
          }));
        }
      }
    } catch { /* fall through to static */ }

    // Static fallback
    return [
      { modelId: 'kr/claude-sonnet-4-5', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'kr/claude-haiku-4-5', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 92 },
      { modelId: 'kr/deepseek-3.2', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'kr/qwen3-coder-next', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 88 },
    ];
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

    const lastWithUsage = [...chunks].reverse().find((c) => c.usage);
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
    const cred = await this.resolveCred(input.credentialId);
    const region = cred.region ?? 'us-east-1';
    const id = `kiro-${Date.now()}`;
    // Strip prefix like "kr/" from modelId
    const model = input.modelId.includes('/') ? input.modelId.split('/').pop()! : input.modelId;
    const payload = this.buildPayload(model, input.request, cred.profileArn ?? undefined);

    const endpoint = `https://codewhisperer.${region}.amazonaws.com`;
    const res = await this.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'x-amz-target': 'AmazonCodeWhispererService.GenerateAssistantResponse',
        'Authorization': `Bearer ${cred.accessToken}`,
        'Accept': 'application/vnd.amazon.eventstream',
        'x-amz-content-sha256': 'required',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        // Try refresh once on auth failure
        if (cred.refreshToken) {
          this.tokenCache.delete(input.credentialId);
        }
        throw new Error(`Kiro auth error ${res.status}: ${errText}`);
      }
      throw new Error(`Kiro ${res.status}: ${errText}`);
    }

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

  private buildPayload(model: string, request: NormalizedChatRequest, profileArn?: string): Record<string, unknown> {
    const history: unknown[] = [];
    let currentMessage: any = null;
    for (const msg of request.messages) {
      if (msg.role === 'user' || msg.role === 'system') {
        const content = typeof msg.content === 'string' ? msg.content
          : (Array.isArray(msg.content) ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') : '');
        currentMessage = { userInputMessage: { content, modelId: model, origin: 'AI_EDITOR' } };
        history.push(currentMessage);
      } else if (msg.role === 'assistant') {
        const content = typeof msg.content === 'string' ? msg.content
          : (Array.isArray(msg.content) ? msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n') : '');
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
    const conversationState: Record<string, unknown> = {
      chatTriggerType: 'MANUAL',
      conversationId: `kiro-${Date.now()}`,
      currentMessage,
      history,
    };
    if (profileArn) conversationState.profileArn = profileArn;
    return { conversationState };
  }
}
