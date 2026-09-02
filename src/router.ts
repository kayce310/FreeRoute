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
  return candidate.preference !== 'block'
    && candidate.freeTier !== 'retired'
    && candidate.freeTier !== 'paid'
    && (!candidate.cooldownUntil || candidate.cooldownUntil <= now);
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

export function applyFailureCooldown(candidate: RouteCandidate, failure: AdapterFailure, now = new Date()): RouteCandidate {
  if (failure.kind !== 'rate_limit' && failure.kind !== 'quota_exhausted' && failure.kind !== 'temporary') {
    return candidate;
  }

  const fallbackMs = failure.kind === 'temporary' ? 15_000 : 60_000;
  return {
    ...candidate,
    cooldownUntil: new Date(now.getTime() + (failure.retryAfterMs ?? fallbackMs)),
  };
}
