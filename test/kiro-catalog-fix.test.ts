import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryCatalogStore, CatalogService } from '../src/catalog.js';
import type { ModelRecord } from '../src/contracts.js';
import type { ProviderDiscoveryAdapter, DiscoveredModel } from '../src/catalog.js';

/** Helper to create a DiscoveredModel with proper typing */
function makeDiscovered(modelId: string, caps: string[] = ['chat'], priority = 90): DiscoveredModel {
  return { modelId, capabilities: caps as unknown as import('../src/contracts.js').Capability[], freeTier: 'free_verified', priority };
}

/**
 * Test: Catalog refresh behavior after fix.
 * 
 * Newly discovered models should start enabled=true.
 * Stale models (not returned by discovery) should be disabled.
 */
test('catalog refresh enables newly discovered models and disables stale ones', async () => {
  const store = new InMemoryCatalogStore([
    { 
      providerId: 'kiro', 
      modelId: 'kr/claude-sonnet-4.5', 
      capabilities: ['chat'], 
      freeTier: 'free_verified', 
      checkedAt: new Date('2026-09-22T00:00:00.000Z'), 
      priority: 95, 
      enabled: false,  // Previously disabled
      catalogStatus: 'live'
    } as ModelRecord,
    { 
      providerId: 'kiro', 
      modelId: 'kr/old-model', 
      capabilities: ['chat'], 
      freeTier: 'free_verified', 
      checkedAt: new Date('2026-09-22T00:00:00.000Z'), 
      priority: 90, 
      enabled: true, 
      catalogStatus: 'live'
    } as ModelRecord,
  ]);

  const adapter = {
    providerId: 'kiro',
    async discoverModels() {
      return [makeDiscovered('kr/claude-sonnet-4.5', ['chat', 'streaming'], 95)];
    },
  };

  const service = new CatalogService(store, [adapter]);
  const [result] = await service.refresh({ kiro: 'cred-1' });

  assert.equal(result?.status, 'updated');
  assert.equal(result?.modelCount, 1);

  const models = await store.list();
  const kiroModels = models.filter(m => m.providerId === 'kiro');
  
  // Newly discovered model should be enabled
  const sonnet = kiroModels.find(m => m.modelId === 'kr/claude-sonnet-4.5');
  assert.ok(sonnet, 'claude-sonnet-4.5 should exist after refresh');
  assert.equal(sonnet?.enabled, true, 'newly discovered model should be enabled');
  assert.equal(sonnet?.catalogStatus, 'live');

  // Old model should be stale and disabled
  const oldModel = kiroModels.find(m => m.modelId === 'kr/old-model');
  assert.ok(oldModel, 'old-model should still exist as stale');
  assert.equal(oldModel?.enabled, false, 'stale model should be disabled');
  assert.equal(oldModel?.catalogStatus, 'stale');
});

test('catalog refresh preserves manually enabled state', async () => {
  const store = new InMemoryCatalogStore([
    { 
      providerId: 'kiro', 
      modelId: 'kr/claude-sonnet-4.5', 
      capabilities: ['chat'], 
      freeTier: 'free_verified', 
      checkedAt: new Date('2026-09-22T00:00:00.000Z'), 
      priority: 95, 
      enabled: true,  // Manually enabled
      catalogStatus: 'live'
    } as ModelRecord,
  ]);

  const adapter = {
    providerId: 'kiro',
    async discoverModels() {
      return [makeDiscovered('kr/claude-sonnet-4.5', ['chat', 'streaming'], 95)];
    },
  };

  const service = new CatalogService(store, [adapter]);
  const [result] = await service.refresh({ kiro: 'cred-1' });

  assert.equal(result?.status, 'updated');

  const models = await store.list();
  const sonnet = models.find(m => m.providerId === 'kiro' && m.modelId === 'kr/claude-sonnet-4.5');
  assert.equal(sonnet?.enabled, true, 'manually enabled model stays enabled');
});
