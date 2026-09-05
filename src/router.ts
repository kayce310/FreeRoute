import type { AdapterFailure, Capability, RouteCandidate, RouteDecision, RouteRequest } from './contracts.js';

const FREE_TIER_PENALTY = {
  free_verified: 0,
  free_unverified: 10,
  credits_only: 35,
  paid: 1000,
  retired: 1000,
} as const;

const PREFERENCE_ADJUSTMENT = {
  prefer: 30,
  neutral: 0,
  limit: -45,
  block: -10000,
} as const;

export function supports(candidate: RouteCandidate, required: Capability[]): boolean {
  return required.every((capability) => candidate.capabilities.includes(capability));
}

export function isAvailable(candidate: RouteCandidate, now = new Date()): boolean {
  return Boolean(candidate.preference !== 'block')
    && Boolean(candidate.freeTier !== 'retired')
    && Boolean(candidate.freeTier !== 'paid')
    && Boolean(candidate.credentialId) // Ensure a credentialId is present
    && Boolean(!candidate.cooldownUntil || candidate.cooldownUntil <= now);
}

export function scoreCandidate(candidate: RouteCandidate): number {
  return candidate.priority
    + candidate.healthScore
    + candidate.latencyScore
    + candidate.quotaScore
    + PREFERENCE_ADJUSTMENT[candidate.preference]
    - FREE_TIER_PENALTY[candidate.freeTier];
}

export function chooseRoute(request: RouteRequest, candidates: RouteCandidate[], now = new Date()): RouteDecision | undefined {
  const eligible = candidates
    .filter((candidate) => !request.requestedProviderId || candidate.providerId === request.requestedProviderId)
    .filter((candidate) => !request.requestedModel || candidate.modelId === request.requestedModel)
    .filter((candidate) => supports(candidate, request.requiredCapabilities))
    .filter((candidate) => isAvailable(candidate, now))
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate) }));

  eligible.sort((left, right) => right.score - left.score || left.candidate.modelId.localeCompare(right.candidate.modelId));
  const selected = eligible[0];
  if (!selected) return undefined;

  return {
    ...selected,
    reasons: [
      `profile:${request.profile}`,
      `preference:${selected.candidate.preference}`,
      `tier:${selected.candidate.freeTier}`,
      `capabilities:${request.requiredCapabilities.join(',') || 'none'}`,
    ],
  };
}

export type CandidateRejectReason =
  | 'blocked'
  | 'cooldown'
  | 'missing_credential'
  | 'missing_capability'
  | 'retired'
  | 'paid_tier'
  | 'provider_mismatch'
  | 'model_mismatch';

export interface CandidateDiagnostic {
  providerId: string;
  modelId: string;
  reason: CandidateRejectReason;
  retryAt?: Date;
}

export function getCandidateDiagnostics(request: RouteRequest, candidates: RouteCandidate[], now = new Date()): CandidateDiagnostic[] {
  const diagnostics: CandidateDiagnostic[] = [];
  for (const c of candidates) {
    if (c.preference === 'block') {
      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'blocked' });
    } else if (c.freeTier === 'retired') {
      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'retired' });
    } else if (c.freeTier === 'paid') {
      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'paid_tier' });
    } else if (!supports(c, request.requiredCapabilities)) {
      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'missing_capability' });
    } else if (request.requestedProviderId && c.providerId !== request.requestedProviderId) {
      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'provider_mismatch' });
    } else if (request.requestedModel && c.modelId !== request.requestedModel) {
      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'model_mismatch' });
    } else if (!c.credentialId) {
      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'missing_credential' });
    } else if (c.cooldownUntil && c.cooldownUntil > now) {
      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'cooldown', retryAt: c.cooldownUntil });
    }
  }
  return diagnostics;
}

export function applyFailureCooldown(
  candidate: RouteCandidate,
  failure: AdapterFailure,
  now = new Date(),
  consecutiveFailures = 1,
): RouteCandidate {
  if (
    failure.kind !== 'rate_limit'
    && failure.kind !== 'quota_exhausted'
    && failure.kind !== 'temporary'
    && failure.kind !== 'context_overflow'
  ) {
    return candidate;
  }

  let fallbackMs = 60_000;
  if (failure.retryAfterMs) {
    fallbackMs = failure.retryAfterMs;
  } else if (failure.kind === 'context_overflow') {
    fallbackMs = 15_000; // Cooldown ngắn để prompt dài chuyển ngay sang candidate khác
  } else {
    // Stepped progressive backoff: 3 fails = 5m, 4 fails = 30m, 5 fails = 1h, 6+ fails = 3h (tối đa)
    if (consecutiveFailures < 3) {
      fallbackMs = failure.kind === 'temporary' ? 15_000 : 30_000;
    } else if (consecutiveFailures === 3) {
      fallbackMs = 5 * 60 * 1_000; // 5 phút
    } else if (consecutiveFailures === 4) {
      fallbackMs = 30 * 60 * 1_000; // 30 phút
    } else if (consecutiveFailures === 5) {
      fallbackMs = 60 * 60 * 1_000; // 1 tiếng
    } else {
      fallbackMs = 3 * 60 * 60 * 1_000; // 3 tiếng tối đa
    }
  }

  return {
    ...candidate,
    cooldownUntil: new Date(now.getTime() + fallbackMs),
  };
}
