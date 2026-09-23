import type { ChatProviderAdapter, NormalizedChatRequest, NormalizedChatResponse, NormalizedChatStreamEvent, ToolCall } from '../inference.js';
import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
import type { CredentialSecret } from '../storage/sqlite-credential-store.js';

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
  authMethod?: 'social' | 'builder_id' | 'idc' | 'api_key' | 'imported' | 'cookie';
  clientId?: string;
  clientSecret?: string;
  expiresAt?: number; // Unix timestamp ms
}

// Default shared profile ARNs (from 9router open-sse/config/kiroConstants.js)
const KIRO_DEFAULT_PROFILE_ARNS = {
  'builder-id': 'arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX',
  social: 'arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK',
};

/** Resolve the shared default profileArn for a given auth method (9router convention). */
function resolveDefaultProfileArn(authMethod: string | undefined): string {
  const isSocial = authMethod === 'social' || authMethod === 'google' || authMethod === 'github';
  return isSocial ? KIRO_DEFAULT_PROFILE_ARNS.social : KIRO_DEFAULT_PROFILE_ARNS['builder-id'];
}

// Kiro API endpoints (from 9router open-sse/providers/registry/kiro.js)
const KIRO_SOCIAL_REFRESH_URL = 'https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken';
const KIRO_RUNTIME_BASE = 'https://runtime.us-east-1.kiro.dev/generateAssistantResponse';
const KIRO_CW_BASE = 'https://codewhisperer.us-east-1.amazonaws.com';
const KIRO_Q_BASE = 'https://q.us-east-1.amazonaws.com';

/** Parse credential secret: JSON or plain accessToken string. Also merges with CredentialSecret providerSpecificData. */
function parseCredential(secret: string | CredentialSecret, psd?: Record<string, unknown>): KiroCredential {
  if (typeof secret === 'object' && secret !== null) {
    // CredentialSecret from Phase A: extract token and merge providerSpecificData
    const accessToken = secret.accessToken ?? secret.apiKey;
    if (!accessToken) throw new Error('Kiro: no accessToken or apiKey in credential');
    const mergedPsD: Record<string, unknown> = { ...secret.providerSpecificData, ...psd };
    return {
      accessToken,
      refreshToken: secret.refreshToken ?? null,
      // Support both top-level and providerSpecificData fields
      profileArn: (mergedPsD.profileArn as string | undefined) ?? (secret as any).profileArn ?? null,
      region: (mergedPsD.region as string | undefined) ?? (secret as any).region,
      // Support both top-level authMethod (migrated creds) and providerSpecificData.authMethod
      authMethod: secret.authType === 'cookie' ? 'cookie' :
        ((mergedPsD.authMethod as KiroCredential['authMethod']) ?? (secret as any).authMethod),
      clientId: (mergedPsD.clientId as string | undefined) ?? (secret as any).clientId,
      clientSecret: (mergedPsD.clientSecret as string | undefined) ?? (secret as any).clientSecret,
      expiresAt: (mergedPsD.expiresAt as number | undefined) ?? (secret as any).expiresAt,
    };
  }
  // Plain string (backward compat): parse JSON or treat as accessToken
  try {
    const parsed = JSON.parse(secret);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.accessToken === 'string') {
      return parsed as KiroCredential;
    }
  } catch { /* not JSON */ }
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

/** Resolve profileArn via ListAvailableProfiles if not already cached (9router pattern). */
async function resolveProfileArn(
  accessToken: string,
  region: string,
  fetcher: typeof globalThis.fetch,
): Promise<string | null> {
  try {
    const res = await fetcher(KIRO_CW_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'x-amz-target': 'AmazonCodeWhispererService.ListAvailableProfiles',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
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
  private readonly getCredential: (id: string) => Promise<string | CredentialSecret | undefined>;
  private readonly setCredential?: (id: string, secret: CredentialSecret) => Promise<void>;
  private readonly fetch: typeof globalThis.fetch;
  /** In-memory cache: credentialId → refreshed credential (avoids repeated refresh per request) */
  private readonly tokenCache = new Map<string, { cred: KiroCredential; updatedAt: number }>();

  constructor(options: {
    providerId: string;
    baseUrl?: string;
    getCredential: (id: string) => Promise<string | CredentialSecret | undefined>;
    setCredential?: (id: string, secret: CredentialSecret) => Promise<void>;
    fetch?: typeof globalThis.fetch;
  }) {
    this.providerId = options.providerId;
    this.baseUrl = (options.baseUrl ?? KIRO_RUNTIME_BASE).replace(/\/$/, '');
    this.getCredential = options.getCredential;
    this.setCredential = options.setCredential;
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

    // Auto-refresh if token is near expiry (within 5 minutes) or already expired,
    // and refreshToken available
    const expiresAt = cred.expiresAt;
    const nearExpiry = expiresAt && (expiresAt - Date.now() < 5 * 60 * 1000);
    const expired = expiresAt && expiresAt < Date.now();
    if ((nearExpiry || expired) && cred.refreshToken) {
      try {
        cred = await refreshKiroToken(cred, this.fetch);
        this.tokenCache.set(credentialId, { cred, updatedAt: Date.now() });
        // Persist refreshed credential back to storage
        if (this.setCredential) {
          const secret: CredentialSecret = {
            accessToken: cred.accessToken,
            refreshToken: cred.refreshToken || undefined,
            providerSpecificData: {
              ...(cred.profileArn ? { profileArn: cred.profileArn } : {}),
              ...(cred.region ? { region: cred.region } : {}),
              ...(cred.authMethod ? { authMethod: cred.authMethod } : {}),
              ...(cred.clientId ? { clientId: cred.clientId } : {}),
              ...(cred.clientSecret ? { clientSecret: cred.clientSecret } : {}),
              ...(cred.expiresAt ? { expiresAt: cred.expiresAt } : {}),
            },
          };
          await this.setCredential(credentialId, secret);
        }
      } catch {
        // Use existing token even if refresh failed
      }
    }

    // Resolve profileArn if missing
    // Per 9router convention: api_key auth must NOT use default profileArn (gets 403)
    // oauth/social auth falls back to shared default profileArn
    if (!cred.profileArn) {
      if (cred.authMethod === 'api_key') {
        // API key auth: no default profileArn allowed, leave empty
        cred = { ...cred, profileArn: '' };
      } else {
        // OAuth/social: try to resolve from profiles API, fall back to shared default
        const region = cred.region ?? 'us-east-1';
        const resolvedArn = await resolveProfileArn(cred.accessToken, region, this.fetch);
        cred = {
          ...cred,
          profileArn: resolvedArn ?? resolveDefaultProfileArn(cred.authMethod),
        };
        this.tokenCache.set(credentialId, { cred, updatedAt: Date.now() });
      }
    }

    return cred;
  }

  async discoverModels(credentialId: string): Promise<DiscoveredModel[]> {
    try {
      const cred = await this.resolveCred(credentialId);
      const profileArn = cred.profileArn ?? '';
      const region = cred.region ?? 'us-east-1';
      const params = new URLSearchParams();
      params.set('origin', 'AI_EDITOR');
      if (profileArn) params.set('profileArn', profileArn);
      // Use Q endpoint for ListAvailableModels (matches 9router implementation)
      const endpoint = `https://q.${region}.amazonaws.com/ListAvailableModels?${params.toString()}`;

      const res = await this.fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cred.accessToken}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json() as { models?: Array<{ modelId?: string; modelName?: string }> };
        const models = (data.models ?? []).filter((m) => m.modelId !== undefined);
        if (models.length > 0) {
          return models.map((m) => ({
            modelId: `kr/${m.modelId}`,
            capabilities: ['chat', 'streaming', 'tools'] as const,
            freeTier: 'free_verified' as const,
            priority: 90,
          }));
        }
      }
    } catch { /* fall through to static */ }

    // Static fallback - matches 9router's static catalog
    return [
      { modelId: 'kr/claude-sonnet-4.5', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'kr/claude-haiku-4.5', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 92 },
      { modelId: 'kr/deepseek-3.2', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'kr/qwen3-coder-next', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 88 },
      { modelId: 'kr/glm-5', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 82 },
      { modelId: 'kr/MiniMax-M2.5', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 80 },
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
    const id = `kiro-${Date.now()}`;
    // Strip prefix like "kr/" from modelId
    const model = input.modelId.includes('/') ? input.modelId.split('/').pop()! : input.modelId;
    const payload = this.buildPayload(model, input.request, cred);

    // Use the correct Kiro runtime endpoint (matches 9router)
    const endpoint = `${this.baseUrl}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cred.accessToken}`,
        'Accept': 'application/vnd.amazon.eventstream',
        'X-Amz-Target': 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
        'User-Agent': 'AWS-SDK-JS/3.0.0 kiro-ide/1.0.0',
        // Parity with 9router: these AWS SDK headers are required by the Kiro gateway.
        // Their absence causes HTTP 403 "bearer token included in the request is invalid".
        'X-Amz-User-Agent': 'aws-sdk-js/3.0.0 kiro-ide/1.0.0',
        'Amz-Sdk-Request': 'attempt=1; max=3',
        'Amz-Sdk-Invocation-Id': crypto.randomUUID(),
      };

    // API-key auth requires a tokentype header so the gateway treats the token
    // as a long-lived API key rather than an OIDC/social access token.
    // Mirrors 9router open-sse/executors/kiro.js buildHeaders().
    if (cred.authMethod === 'api_key') {
      headers['tokentype'] = 'API_KEY';
    }

    const res = await this.fetch(endpoint, {
      method: 'POST',
      headers,
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
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'content_block_start' && data.content_block?.type === 'text') {
              // Start of content
            } else if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
              const delta = data.delta.text;
              if (delta) yield { id, model: input.modelId, delta };
            } else if (data.type === 'content_block_delta' && data.delta?.type === 'thinking_delta') {
              const thought = data.delta.thinking;
              if (thought) yield { id, model: input.modelId, thought };
            } else if (data.type === 'tool_use') {
              hadToolUse = true;
              const toolCall: ToolCall = {
                id: data.id ?? `call_${Date.now()}`,
                type: 'function',
                function: { name: data.name ?? '', arguments: JSON.stringify(data.input ?? {}) },
              };
              yield { id, model: input.modelId, toolCalls: [toolCall] };
            } else if (data.type === 'message_stop') {
              yield { id, model: input.modelId, finishReason: hadToolUse ? 'tool_calls' : 'stop' };
              return;
            } else if (data.type === 'usage') {
              yield {
                id,
                model: input.modelId,
                usage: {
                  promptTokens: data.usage?.input_tokens ?? 0,
                  completionTokens: data.usage?.output_tokens ?? 0,
                  totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
                },
              };
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    }
  }

  private buildPayload(model: string, request: NormalizedChatRequest, cred: KiroCredential): Record<string, unknown> {
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

    const payload: Record<string, unknown> = { conversationState };

    // profileArn at TOP LEVEL (per 9router openai-to-kiro.js):
    //   if (profileArn) payload.profileArn = profileArn;
    // NOT inside conversationState!
    if (cred.profileArn) {
      payload.profileArn = cred.profileArn;
    }

    // inferenceConfig if present (9router adds it when maxTokens/temperature/topP specified)
    if (request.temperature !== undefined || (request as any).maxTokens !== undefined) {
      const inferenceConfig: Record<string, unknown> = {};
      const maxTokens = (request as any).maxTokens;
      if (maxTokens) inferenceConfig.maxTokens = maxTokens;
      if (request.temperature !== undefined) inferenceConfig.temperature = request.temperature;
      payload.inferenceConfig = inferenceConfig;
    }

    return payload;
  }
}
