export type Capability =
  | 'chat'
  | 'streaming'
  | 'tools'
  | 'structured-output'
  | 'vision'
  | 'embeddings';

export type FreeTierClass =
  | 'free_verified'
  | 'free_unverified'
  | 'credits_only'
  | 'paid'
  | 'retired';

export type Preference = 'prefer' | 'neutral' | 'limit' | 'block';

export interface ModelRecord {
  providerId: string;
  modelId: string;
  capabilities: Capability[];
  freeTier: FreeTierClass;
  checkedAt: Date;
  expiresAt?: Date;
  priority: number;
}

export interface RouteRequest {
  profile: string;
  requiredCapabilities: Capability[];
  /** Restricts a named `provider/model` request to its advertised provider. */
  requestedProviderId?: string;
  requestedModel?: string;
}

export interface RouteCandidate extends ModelRecord {
  credentialId: string;
  preference: Preference;
  healthScore: number;
  latencyScore: number;
  quotaScore: number;
  cooldownUntil?: Date;
}

export interface RouteDecision {
  candidate: RouteCandidate;
  score: number;
  reasons: string[];
}

export interface AdapterFailure {
  kind: 'authentication' | 'rate_limit' | 'quota_exhausted' | 'temporary' | 'unsupported' | 'permanent';
  retryAfterMs?: number;
}
