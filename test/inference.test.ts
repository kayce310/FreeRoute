import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatService, createCatalogChatService, ProviderInvocationError, RouteState, type ChatProviderAdapter } from '../src/inference.js';
import type { RouteCandidate } from '../src/contracts.js';
import { InMemoryCatalogStore } from '../src/catalog.js';

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

test('wires cached models to matching encrypted-store credential metadata', async () => {
  const catalog = new InMemoryCatalogStore([{ ...candidate('openrouter', 'free-model', 0), checkedAt: now }]);
  const adapter: ChatProviderAdapter = {
    providerId: 'openrouter',
    async chat(input) {
      assert.equal(input.credentialId, 'imported-key');
      return { id: 'response-2', model: input.modelId, content: 'wired answer' };
    },
  };
  const service = createCatalogChatService({
    catalog,
    credentials: { async list() { return [{ providerId: 'openrouter', credentialId: 'imported-key' }]; } },
    adapters: [adapter],
  });
  const result = await service.complete({ profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(result.response.content, 'wired answer');
});

test('uses observed quota only as a route scoring preference', async () => {
  const catalog = new InMemoryCatalogStore([{ ...candidate('openrouter', 'free-model', 0), checkedAt: now }]);
  const adapter: ChatProviderAdapter = { providerId: 'openrouter', async chat() { return { id: 'response-4', model: 'free-model', content: 'quota-aware answer' }; } };
  const service = createCatalogChatService({
    catalog, credentials: { async list() { return [{ providerId: 'openrouter', credentialId: 'imported-key' }]; } }, adapters: [adapter],
    quotaScores: async () => new Map([['openrouter\u0000free-model\u0000***ed-key', 25]]),
  });
  const result = await service.complete({ profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hello' }] });
  assert.equal(result.decision.candidate.quotaScore, 25);
});

test('keeps a transient cooldown scoped to the failed route across requests', async () => {
  let firstCalls = 0;
  const first: ChatProviderAdapter = { providerId: 'first', async chat() { firstCalls += 1; throw new ProviderInvocationError('busy', { kind: 'rate_limit' }); } };
  const second: ChatProviderAdapter = { providerId: 'second', async chat() { return { id: 'response-3', model: 'model-b', content: 'healthy answer' }; } };
  const service = new ChatService({
    candidates: async () => [candidate('first', 'model-a', 20), candidate('second', 'model-b', 10)],
    adapters: new Map([['first', first], ['second', second]]), now: () => now, routeState: new RouteState(),
  });
  await service.complete({ profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'one' }] });
  const next = await service.complete({ profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'two' }] });
  assert.equal(firstCalls, 1);
  assert.equal(next.response.providerId, 'second');
});
