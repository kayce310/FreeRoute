import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatService, ProviderInvocationError, type ChatProviderAdapter } from '../src/inference.js';
import type { RouteCandidate } from '../src/contracts.js';

const now = new Date('2026-09-03T00:00:00.000Z');

function candidate(providerId: string, modelId: string, freeTier: 'free_verified' | 'paid'): RouteCandidate {
  return {
    providerId,
    modelId,
    credentialId: `${providerId}-key`,
    capabilities: ['chat'],
    freeTier,
    checkedAt: now,
    priority: 0,
    preference: 'neutral',
    healthScore: 10,
    latencyScore: 10,
    quotaScore: 10,
  };
}

test('candidate with paid tier can be selected', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'paid-provider',
    async chat() {
      return { id: 'resp-paid', model: 'paid-model', content: 'paid answer' };
    },
  };
  const service = new ChatService({
    candidates: async () => [candidate('paid-provider', 'paid-model', 'paid')],
    adapters: new Map([['paid-provider', adapter]]),
    now: () => now,
  });

  const result = await service.complete({ 
    profile: 'auto:paid', 
    requiredCapabilities: ['chat'], 
    messages: [{ role: 'user', content: 'hello' }],
    requestedModel: 'paid-model'
  });
  
  assert.equal(result.response.model, 'paid-model');
  assert.equal(result.response.content, 'paid answer');
});

test('free tier candidate is preferred over paid tier when both are eligible', async () => {
  const freeAdapter: ChatProviderAdapter = {
    providerId: 'free-provider',
    async chat() {
      return { id: 'resp-free', model: 'free-model', content: 'free answer' };
    },
  };
  const paidAdapter: ChatProviderAdapter = {
    providerId: 'paid-provider',
    async chat() {
      throw new Error('Should not be called');
    },
  };
  const service = new ChatService({
    candidates: async () => [
      candidate('paid-provider', 'paid-model', 'paid'),
      candidate('free-provider', 'free-model', 'free_verified'),
    ],
    adapters: new Map([['free-provider', freeAdapter], ['paid-provider', paidAdapter]]),
    now: () => now,
  });

  const result = await service.complete({ 
    profile: 'auto:free', 
    requiredCapabilities: ['chat'], 
    messages: [{ role: 'user', content: 'hello' }] 
  });
  
  assert.equal(result.response.model, 'free-model');
});
