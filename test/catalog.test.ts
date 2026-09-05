import assert from 'node:assert/strict';
import test from 'node:test';
import { CatalogService, InMemoryCatalogStore, type ProviderDiscoveryAdapter } from '../src/catalog.js';
import type { ModelRecord } from '../src/contracts.js';

const checkedAt = new Date('2026-09-03T00:00:00.000Z');

function cached(providerId: string, modelId: string): ModelRecord {
  return {
    providerId,
    modelId,
    capabilities: ['chat'],
    freeTier: 'free_verified',
    checkedAt,
    priority: 0,
  };
}

test('loads cached models before a refresh replaces provider records', async () => {
  const store = new InMemoryCatalogStore([cached('groq', 'old-model')]);
  const adapter: ProviderDiscoveryAdapter = {
    providerId: 'groq',
    async discoverModels() {
      return [{ modelId: 'new-model', capabilities: ['chat', 'streaming'], freeTier: 'free_verified' }];
    },
  };
  const service = new CatalogService(store, [adapter]);

  assert.equal((await service.loadCached())[0]?.modelId, 'old-model');
  const result = await service.refresh({ groq: 'credential-1' }, checkedAt);
  assert.deepEqual(result, [{ providerId: 'groq', status: 'updated', modelCount: 1 }]);
  assert.equal((await service.loadCached())[0]?.modelId, 'new-model');
});

test('a discovery failure retains the last good provider catalog', async () => {
  const store = new InMemoryCatalogStore([cached('gemini', 'gemini-cached')]);
  const adapter: ProviderDiscoveryAdapter = {
    providerId: 'gemini',
    async discoverModels() {
      throw new Error('upstream unavailable');
    },
  };
  const service = new CatalogService(store, [adapter]);

  const [result] = await service.refresh({ gemini: 'credential-1' }, checkedAt);
  assert.equal(result?.status, 'failed');
  assert.equal((await service.loadCached())[0]?.modelId, 'gemini-cached');
});

test('a successful empty discovery retains the last good provider catalog', async () => {
  const store = new InMemoryCatalogStore([cached('groq', 'cached-model')]);
  const adapter: ProviderDiscoveryAdapter = { providerId: 'groq', async discoverModels() { return []; } };
  const service = new CatalogService(store, [adapter]);

  const [result] = await service.refresh({ groq: 'credential-1' }, checkedAt);
  assert.deepEqual(result, { providerId: 'groq', status: 'failed', error: 'provider returned no models; retained cached catalog' });
  assert.equal((await service.loadCached())[0]?.modelId, 'cached-model');
});
