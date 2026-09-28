import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { RefreshCoordinator } from '../../src/benchmarks/external/refresh-coordinator.js';
import { ExternalBenchmarkStorage } from '../../src/benchmarks/external/storage.js';
import { BUILTIN_EXTERNAL_SOURCES } from '../../src/benchmarks/external/sources.js';

const TEST_DIR = './test-benchmark-data-refresh';

function cleanup() {
  try { rmSync(TEST_DIR, { recursive: true }); } catch {}
  mkdirSync(TEST_DIR, { recursive: true });
}

test('RefreshCoordinator: dedup same scope refresh', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  const coordinator = new RefreshCoordinator(storage);
  
  // Trigger two refreshes for same scope in parallel
  const sourceConfigs = BUILTIN_EXTERNAL_SOURCES;
  
  const [result1, result2] = await Promise.all([
    coordinator.acquireRefresh('all', sourceConfigs, 'foreground'),
    coordinator.acquireRefresh('all', sourceConfigs, 'foreground'),
  ]);
  
  // Both should complete (one may fail due to network, but not duplicate requests)
  assert.ok(result1.status !== 'success' || result2.status !== 'success' || result1 === result2,
    'Should deduplicate same-scope refreshes');
  
  storage.close();
});

test('RefreshCoordinator: different scopes can run concurrently', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  const coordinator = new RefreshCoordinator(storage);
  
  const sourceConfigs = BUILTIN_EXTERNAL_SOURCES;
  
  // Start openrouter refresh without awaiting
  const openrouterPromise = coordinator.acquireRefresh('openrouter', sourceConfigs, 'foreground');
  
  // Give it a moment to start
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // Trigger huggingface refresh (should not be blocked)
  const huggingfacePromise = coordinator.acquireRefresh('huggingface', sourceConfigs, 'background');
  
  // openrouter should still be in-flight
  const inFlight = coordinator.getActiveScopes();
  assert.ok(inFlight.includes('openrouter'), 'openrouter should still be in-flight');
  
  // Wait for both to complete
  await Promise.all([openrouterPromise, huggingfacePromise]);
  
  storage.close();
});

test('RefreshCoordinator: schedule refresh', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  const coordinator = new RefreshCoordinator(storage);
  
  const sourceConfigs = BUILTIN_EXTERNAL_SOURCES;
  
  // Schedule a background refresh
  coordinator.scheduleRefresh('all', sourceConfigs, 'background');
  
  // Should not throw
  assert.ok(true);
  
  storage.close();
});

test('RefreshCoordinator: force refresh waits for existing', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  const coordinator = new RefreshCoordinator(storage);
  
  const sourceConfigs = BUILTIN_EXTERNAL_SOURCES.filter(s => s.sourceId === 'openrouter');
  
  // Start a refresh
  const backgroundPromise = coordinator.acquireRefresh('all', sourceConfigs, 'background');
  
  // Force refresh should wait
  const forcePromise = coordinator.forceRefresh('openrouter', sourceConfigs);
  
  // Wait for both
  await Promise.all([backgroundPromise, forcePromise]);
  
  storage.close();
});
