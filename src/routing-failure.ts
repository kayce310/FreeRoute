import type { RouteFailureScope, RouteFailureKind, AdapterFailure } from './contracts.js';

export type { RouteFailureScope, RouteFailureKind };
export type RouteFailureSource = 'client' | 'adapter' | 'upstream' | 'router';

export interface RouteFailure extends AdapterFailure {
  source: RouteFailureSource;
  message: string;
}

export function isAdapterBug(failure: AdapterFailure): boolean {
  return failure.scope === 'adapter';
}

export function isClientRequestError(failure: AdapterFailure): boolean {
  return failure.scope === 'request';
}

export function isKeyFailure(failure: AdapterFailure): boolean {
  return failure.scope === 'key';
}

export function isProviderFailure(failure: AdapterFailure): boolean {
  return failure.scope === 'provider';
}

export function classifyFailure(
  status: number | undefined,
  text: string | undefined,
  kind: string,
): RouteFailure {
  const sourceStatus = status;
  const isContextOverflow = status === 400 || status === 413
    ? (text ?? '').toLowerCase().includes('context') || (text ?? '').toLowerCase().includes('token limit')
    : kind === 'context_overflow';

  if (isContextOverflow) {
    return {
      kind: 'context_overflow',
      scope: 'model',
      retryable: true,
      fallbackAllowed: true,
      sourceStatus,
      source: 'upstream',
      message: 'Context overflow detected',
    };
  }

  if (kind === 'authentication') {
    return {
      kind: 'authentication',
      scope: 'key',
      retryable: false,
      fallbackAllowed: true,
      sourceStatus,
      source: 'upstream',
      message: text ?? 'Authentication failed',
    };
  }

  if (kind === 'rate_limit') {
    return {
      kind: 'rate_limit',
      scope: 'key',
      retryable: true,
      fallbackAllowed: true,
      sourceStatus,
      retryAfterMs: undefined,
      source: 'upstream',
      message: text ?? 'Rate limited',
    };
  }

  if (kind === 'quota_exhausted') {
    return {
      kind: 'quota_exhausted',
      scope: 'key',
      retryable: true,
      fallbackAllowed: true,
      sourceStatus,
      source: 'upstream',
      message: text ?? 'Quota exhausted',
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      kind: 'temporary',
      scope: 'provider',
      retryable: true,
      fallbackAllowed: true,
      sourceStatus,
      source: 'upstream',
      message: text ?? `Server error ${status}`,
    };
  }

  if (kind === 'adapter') {
    return {
      kind: 'unsupported',
      scope: 'adapter',
      retryable: false,
      fallbackAllowed: false,
      sourceStatus,
      source: 'adapter',
      message: text ?? 'Adapter internal error',
    };
  }

  if (kind === 'client_cancelled') {
    return {
      kind: 'no_candidate',
      scope: 'request',
      retryable: false,
      fallbackAllowed: false,
      sourceStatus,
      source: 'client',
      message: 'Client cancelled',
    };
  }

  if (status === 400 || status === 404) {
    return {
      kind: 'unsupported',
      scope: 'request',
      retryable: false,
      fallbackAllowed: false,
      sourceStatus,
      source: 'upstream',
      message: text ?? `Bad request ${status}`,
    };
  }

  return {
    kind: 'temporary',
    scope: 'provider',
    retryable: true,
    fallbackAllowed: true,
    sourceStatus,
    source: 'upstream',
    message: text ?? 'Temporary failure',
  };
}
