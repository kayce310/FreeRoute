import type { AdapterFailure, RouteCandidate, RouteDecision, RouteRequest } from './contracts.js';
import type { CatalogStore } from './catalog.js';
import { applyFailureCooldown, chooseRoute } from './router.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

/** OpenAI-compatible function declaration; schemas stay opaque to the router. */
export interface ToolDefinition { type: 'function'; function: { name: string; description?: string; parameters?: unknown }; }
export interface ToolCall { id: string; type: 'function'; function: { name: string; arguments: string }; }

export interface NormalizedChatRequest extends RouteRequest {
  messages: ChatMessage[];
  temperature?: number;
  tools?: ToolDefinition[];
  traceId?: string;
}

export interface NormalizedChatResponse {
  id: string;
  model: string;
  content: string;
  providerId: string;
  modelId: string;
  quota?: QuotaObservation;
  toolCalls?: ToolCall[];
}

export interface QuotaObservation {
  remainingRequests?: number;
  remainingTokens?: number;
  resetAt?: Date;
}

export interface NormalizedChatStreamEvent {
  id: string;
  model: string;
  delta?: string;
  finishReason?: string | null;
  toolCalls?: ToolCall[];
}

export class ProviderInvocationError extends Error {
  constructor(message: string, readonly failure: AdapterFailure) {
    super(message);
  }
}

export interface ChatProviderAdapter {
  providerId: string;
  chat(input: {
    credentialId: string;
    modelId: string;
    request: NormalizedChatRequest;
  }): Promise<Omit<NormalizedChatResponse, 'providerId' | 'modelId'>>;
  streamChat?(input: {
    credentialId: string;
    modelId: string;
    request: NormalizedChatRequest;
  }): AsyncIterable<NormalizedChatStreamEvent>;
}

export interface ChatServiceOptions {
  candidates: (request: RouteRequest) => Promise<RouteCandidate[]>;
  adapters: Map<string, ChatProviderAdapter>;
  now?: () => Date;
  routeState?: RouteState;
  onEvent?: (event: RoutingEvent) => void | Promise<void>;
  onQuota?: (observation: QuotaObservation & { providerId: string; modelId: string; credentialRef: string; observedAt: Date }) => void | Promise<void>;
}

export interface RoutingEvent {
  requestId: string;
  occurredAt: Date;
  profile: string;
  providerId: string;
  modelId: string;
  credentialRef: string;
  fallbackCount: number;
  outcome: 'success' | 'failure';
  failureKind?: AdapterFailure['kind'];
  /** Elapsed time for the upstream attempt; no request content is retained. */
  latencyMs?: number;
}

export interface ChatResult {
  response: NormalizedChatResponse;
  decision: RouteDecision;
  fallbackCount: number;
}

/** Runtime-only health state. It deliberately contains no credentials or request content. */
export class RouteState {
  private readonly cooldowns = new Map<string, Date>();

  apply(candidates: RouteCandidate[], now: Date): RouteCandidate[] {
    return candidates.map((candidate) => {
      const cooldownUntil = this.cooldowns.get(routeKey(candidate));
      if (cooldownUntil && cooldownUntil <= now) this.cooldowns.delete(routeKey(candidate));
      return cooldownUntil && cooldownUntil > now ? { ...candidate, cooldownUntil } : candidate;
    });
  }

  recordFailure(candidate: RouteCandidate, failure: AdapterFailure, now: Date): void {
    const updated = applyFailureCooldown(candidate, failure, now);
    if (updated.cooldownUntil) this.cooldowns.set(routeKey(candidate), updated.cooldownUntil);
  }
}

/**
 * Routes a request through adapters. Only transient/quota failures get a
 * fallback attempt; invalid requests and authentication failures surface.
 */
export class ChatService {
  private readonly now: () => Date;

  constructor(private readonly options: ChatServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async complete(request: NormalizedChatRequest): Promise<ChatResult> {
    let candidates = this.withRouteState(await this.options.candidates(request));
    let fallbackCount = 0;

    while (true) {
      const decision = chooseRoute(request, candidates, this.now());
      if (!decision) throw new Error('no eligible route candidates');
      const adapter = this.options.adapters.get(decision.candidate.providerId);
      if (!adapter) {
        candidates = candidates.map((candidate) => candidate === decision.candidate
          ? { ...candidate, preference: 'block' as const }
          : candidate);
        fallbackCount += 1;
        continue;
      }

      try {
        const startedAt = this.now();
        const result = await adapter.chat({
          credentialId: decision.candidate.credentialId,
          modelId: decision.candidate.modelId,
          request,
        });
        const completed = {
          response: { ...result, providerId: decision.candidate.providerId, modelId: decision.candidate.modelId },
          decision,
          fallbackCount,
        };
        await this.emitEvent(request, decision.candidate, fallbackCount, 'success', undefined, Math.max(0, this.now().getTime() - startedAt.getTime()));
        if (result.quota) await this.options.onQuota?.({ ...result.quota, providerId: decision.candidate.providerId, modelId: decision.candidate.modelId, credentialRef: redactCredential(decision.candidate.credentialId), observedAt: this.now() });
        return completed;
      } catch (error) {
        if (!(error instanceof ProviderInvocationError)) throw error;
        const { kind } = error.failure;
        if (kind !== 'rate_limit' && kind !== 'quota_exhausted' && kind !== 'temporary') {
          await this.emitEvent(request, decision.candidate, fallbackCount, 'failure', kind);
          throw error;
        }
        candidates = candidates.map((candidate) => candidate === decision.candidate
          ? applyFailureCooldown(candidate, error.failure, this.now())
          : candidate);
        this.options.routeState?.recordFailure(decision.candidate, error.failure, this.now());
        fallbackCount += 1;
      }
    }
  }

  async stream(request: NormalizedChatRequest): Promise<{ decision: RouteDecision; events: AsyncIterable<NormalizedChatStreamEvent> }> {
    const decision = chooseRoute(request, this.withRouteState(await this.options.candidates(request)), this.now());
    if (!decision) throw new Error('no eligible route candidates');
    const adapter = this.options.adapters.get(decision.candidate.providerId);
    if (!adapter?.streamChat) throw new ProviderInvocationError('streaming is not supported by the selected provider', { kind: 'unsupported' });
    return {
      decision,
      events: adapter.streamChat({
        credentialId: decision.candidate.credentialId,
        modelId: decision.candidate.modelId,
        request,
      }),
    };
  }

  private withRouteState(candidates: RouteCandidate[]): RouteCandidate[] {
    return this.options.routeState?.apply(candidates, this.now()) ?? candidates;
  }

  private async emitEvent(request: NormalizedChatRequest, candidate: RouteCandidate, fallbackCount: number, outcome: RoutingEvent['outcome'], failureKind?: AdapterFailure['kind'], latencyMs?: number): Promise<void> {
    if (!this.options.onEvent) return;
    await this.options.onEvent({
      requestId: request.traceId ?? crypto.randomUUID(), occurredAt: this.now(), profile: request.profile,
      providerId: candidate.providerId, modelId: candidate.modelId,
      credentialRef: redactCredential(candidate.credentialId), fallbackCount, outcome, failureKind,
      ...(latencyMs === undefined ? {} : { latencyMs }),
    });
  }
}

/**
 * Wires cached catalog models to the encrypted credential metadata store.
 * Secrets remain inside each adapter's `getCredential` callback.
 */
export function createCatalogChatService(options: {
  catalog: CatalogStore;
  credentials: { list(): Promise<Array<{ providerId: string; credentialId: string }>> };
  adapters: Iterable<ChatProviderAdapter>;
  routeState?: RouteState;
  onEvent?: ChatServiceOptions['onEvent'];
  onQuota?: ChatServiceOptions['onQuota'];
  quotaScores?: () => Promise<Map<string, number>>;
  healthScores?: () => Promise<Map<string, { healthScore: number; latencyScore: number }>>;
  preferences?: () => Promise<Map<string, import('./contracts.js').Preference>>;
}): ChatService {
  return new ChatService({
    candidates: async (request) => {
      const [models, credentials, quotaScores, preferences, healthScores] = await Promise.all([options.catalog.list(), options.credentials.list(), options.quotaScores?.() ?? Promise.resolve(new Map<string, number>()), options.preferences?.() ?? Promise.resolve(new Map<string, import('./contracts.js').Preference>()), options.healthScores?.() ?? Promise.resolve(new Map<string, { healthScore: number; latencyScore: number }>())]);
      return models.flatMap((model) => credentials
        .filter((credential) => credential.providerId === model.providerId)
        .map((credential): RouteCandidate => {
          const health = healthScores.get(`${model.providerId}\u0000${model.modelId}`);
          return {
          ...model,
          credentialId: credential.credentialId,
          preference: preferences.get(`${model.providerId}\u0000${model.modelId}`) ?? 'neutral',
          healthScore: health?.healthScore ?? 0,
          latencyScore: request.profile === 'auto:fast' ? (health?.latencyScore ?? 0) * 3 : health?.latencyScore ?? 0,
          quotaScore: quotaScores.get(quotaKey(model.providerId, model.modelId, redactCredential(credential.credentialId))) ?? 0,
          };
        }));
    },
    adapters: new Map([...options.adapters].map((adapter) => [adapter.providerId, adapter])),
    routeState: options.routeState,
    onEvent: options.onEvent,
    onQuota: options.onQuota,
  });
}

function redactCredential(credentialId: string): string {
  return credentialId.length <= 6 ? '***' : `***${credentialId.slice(-6)}`;
}

function quotaKey(providerId: string, modelId: string, credentialRef: string): string {
  return `${providerId}\u0000${modelId}\u0000${credentialRef}`;
}

function routeKey(candidate: Pick<RouteCandidate, 'providerId' | 'credentialId' | 'modelId'>): string {
  return `${candidate.providerId}\u0000${candidate.credentialId}\u0000${candidate.modelId}`;
}
