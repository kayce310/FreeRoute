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
