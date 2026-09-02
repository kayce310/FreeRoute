import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatService, ProviderInvocationError, type ChatProviderAdapter } from '../src/inference.js';
import type { RouteCandidate } from '../src/contracts.js';

const now = new Date('2026-09-03T00:00:00.000Z');

function candidate(providerId: string, modelId: string, priority: number): RouteCandidate {
  return {
    providerId,
    modelId,
    credentialId: `${providerId}-key`,
    capabilities: ['chat'],
    freeTier: 'free_verified',
    checkedAt: now,
    priority,
    preference: 'neutral',
    healthScore: 10,
    latencyScore: 10,
    quotaScore: 10,
  };
}

test('falls back after a provider reports a rate limit', async () => {
  const first: ChatProviderAdapter = {
    providerId: 'first',
    async chat() {
      throw new ProviderInvocationError('rate limited', { kind: 'rate_limit' });
    },
  };
  const second: ChatProviderAdapter = {
    providerId: 'second',
    async chat() {
      return { id: 'response-1', model: 'model-b', content: 'fallback answer' };
    },
  };
  const service = new ChatService({
    candidates: async () => [candidate('first', 'model-a', 20), candidate('second', 'model-b', 10)],
    adapters: new Map([['first', first], ['second', second]]),
    now: () => now,
  });

  const result = await service.complete({ profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(result.response.providerId, 'second');
  assert.equal(result.response.content, 'fallback answer');
  assert.equal(result.fallbackCount, 1);
});

test('does not hide authentication errors behind fallback', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'only',
    async chat() {
      throw new ProviderInvocationError('bad key', { kind: 'authentication' });
    },
  };
  const service = new ChatService({
    candidates: async () => [candidate('only', 'model-a', 10)],
    adapters: new Map([['only', adapter]]),
    now: () => now,
  });

  await assert.rejects(
    service.complete({ profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hello' }] }),
    ProviderInvocationError,
  );
});
