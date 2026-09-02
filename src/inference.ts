import type { AdapterFailure, RouteCandidate, RouteDecision, RouteRequest } from './contracts.js';
import { applyFailureCooldown, chooseRoute } from './router.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
}

export interface NormalizedChatRequest extends RouteRequest {
  messages: ChatMessage[];
  temperature?: number;
}

export interface NormalizedChatResponse {
  id: string;
  model: string;
  content: string;
  providerId: string;
  modelId: string;
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
}

export interface ChatServiceOptions {
  candidates: () => Promise<RouteCandidate[]>;
  adapters: Map<string, ChatProviderAdapter>;
  now?: () => Date;
}

export interface ChatResult {
  response: NormalizedChatResponse;
  decision: RouteDecision;
  fallbackCount: number;
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
    let candidates = await this.options.candidates();
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
        const result = await adapter.chat({
          credentialId: decision.candidate.credentialId,
          modelId: decision.candidate.modelId,
          request,
        });
        return {
          response: { ...result, providerId: decision.candidate.providerId, modelId: decision.candidate.modelId },
          decision,
          fallbackCount,
        };
      } catch (error) {
        if (!(error instanceof ProviderInvocationError)) throw error;
        const { kind } = error.failure;
        if (kind !== 'rate_limit' && kind !== 'quota_exhausted' && kind !== 'temporary') throw error;
        candidates = candidates.map((candidate) => candidate === decision.candidate
          ? applyFailureCooldown(candidate, error.failure, this.now())
          : candidate);
        fallbackCount += 1;
      }
    }
  }
}
