import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { ExternalBenchmarkStorage } from '../../src/benchmarks/external/storage.js';
import type { ExternalBenchmarkSnapshot, ExternalBenchmarkEntry, ExternalSourceMetadata, ExternalSourceRuntimeState } from '../../src/benchmarks/external/interfaces.js';

const TEST_DIR = './test-benchmark-data-external';

function cleanup() {
  try { rmSync(TEST_DIR, { recursive: true }); } catch {}
  mkdirSync(TEST_DIR, { recursive: true });
}

test('ExternalBenchmarkStorage: initialize schema', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  
  // Verify tables exist
  const tables = storage['database'].prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const tableNames = tables.map(t => t.name);
  
  assert.ok(tableNames.includes('external_benchmark_snapshots'), 'Should have snapshots table');
  assert.ok(tableNames.includes('external_benchmark_entries'), 'Should have entries table');
  assert.ok(tableNames.includes('external_source_metadata'), 'Should have metadata table');
  assert.ok(tableNames.includes('external_source_runtime'), 'Should have runtime table');
  
  storage.close();
});

test('ExternalBenchmarkStorage: save and retrieve snapshot', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  
  const snapshot: ExternalBenchmarkSnapshot = {
    snapshotId: 'snap-test-1',
    sourceId: 'openrouter',
    fetchedAt: new Date('2024-01-15T10:00:00Z'),
    version: 1,
    status: 'fresh',
  };
  
  await storage.saveSnapshot(snapshot);
  
  const retrieved = await storage.getLatestSnapshot('openrouter');
  assert.ok(retrieved, 'Should retrieve snapshot');
  assert.equal(retrieved!.snapshotId, 'snap-test-1');
  assert.equal(retrieved!.sourceId, 'openrouter');
  assert.equal(retrieved!.status, 'fresh');
  
  storage.close();
});

test('ExternalBenchmarkStorage: save multiple snapshots', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  
  const snapshot1: ExternalBenchmarkSnapshot = {
    snapshotId: 'snap-1',
    sourceId: 'huggingface',
    fetchedAt: new Date('2024-01-15T10:00:00Z'),
    version: 1,
    status: 'fresh',
  };
  
  const snapshot2: ExternalBenchmarkSnapshot = {
    snapshotId: 'snap-2',
    sourceId: 'huggingface',
    fetchedAt: new Date('2024-01-16T10:00:00Z'),
    version: 1,
    status: 'fresh',
  };
  
  await storage.saveSnapshot(snapshot1);
  await storage.saveSnapshot(snapshot2);
  
  const latest = await storage.getLatestSnapshot('huggingface');
  assert.equal(latest!.snapshotId, 'snap-2', 'Should get latest snapshot');
  
  const snapshots = await storage.listSnapshots('huggingface', 10);
  assert.equal(snapshots.length, 2, 'Should list all snapshots');
  assert.equal(snapshots[0].snapshotId, 'snap-2', 'Should be sorted by fetched_at DESC');
  
  storage.close();
});

test('ExternalBenchmarkStorage: save and retrieve entries', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  
  const snapshot: ExternalBenchmarkSnapshot = {
    snapshotId: 'snap-entries',
    sourceId: 'openrouter',
    fetchedAt: new Date(),
    version: 1,
    status: 'fresh',
  };
  
  const entries: ExternalBenchmarkEntry[] = [
    {
      entryId: 'entry-1',
      snapshotId: 'snap-entries',
      modelPermaslug: 'gpt-4o',
      modelName: 'GPT-4o',
      metricKey: 'price_per_1m_input_tokens',
      metricValue: '2.50',
      unit: 'USD',
    },
    {
      entryId: 'entry-2',
      snapshotId: 'snap-entries',
      modelPermaslug: 'gpt-4o',
      modelName: 'GPT-4o',
      metricKey: 'context_length',
      metricValue: '128000',
      unit: 'tokens',
    },
  ];
  
  await storage.saveSnapshot(snapshot);
  await storage.saveEntries(entries);
  
  const retrieved = await storage.getEntriesBySnapshot('snap-entries');
  assert.equal(retrieved.length, 2, 'Should retrieve all entries');
  assert.ok(retrieved.some(e => e.modelPermaslug === 'gpt-4o' && e.metricKey === 'price_per_1m_input_tokens'));
  
  storage.close();
});

test('ExternalBenchmarkStorage: query entries with filter', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  
  const snapshot: ExternalBenchmarkSnapshot = {
    snapshotId: 'snap-query',
    sourceId: 'openrouter',
    fetchedAt: new Date(),
    version: 1,
    status: 'fresh',
  };
  
  await storage.saveSnapshot(snapshot);
  await storage.saveEntries([
    {
      entryId: 'e1',
      snapshotId: 'snap-query',
      modelPermaslug: 'gpt-4o',
      metricKey: 'price',
      metricValue: '2.50',
    },
    {
      entryId: 'e2',
      snapshotId: 'snap-query',
      modelPermaslug: 'claude-3-opus',
      metricKey: 'price',
      metricValue: '15.00',
    },
  ]);
  
  const result = await storage.queryEntries({ modelPermaslug: 'gpt-4o' });
  assert.equal(result.total, 1, 'Should filter by model');
  assert.equal(result.entries[0].modelPermaslug, 'gpt-4o');
  
  storage.close();
});

test('ExternalBenchmarkStorage: save source metadata', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  
  const metadata: ExternalSourceMetadata = {
    sourceId: 'openrouter',
    name: 'OpenRouter',
    description: 'Model catalog',
    url: 'https://openrouter.ai',
    ttlMs: 6 * 60 * 60 * 1000,
    enabled: true,
    lastSuccessfulFetch: null,
    lastFailure: null,
  };
  
  await storage.saveSourceMetadata(metadata);
  
  const retrieved = await storage.getSourceMetadata('openrouter');
  assert.ok(retrieved, 'Should retrieve metadata');
  assert.equal(retrieved!.sourceId, 'openrouter');
  assert.equal(retrieved!.ttlMs, 6 * 60 * 60 * 1000);
  assert.equal(retrieved!.enabled, true);
  
  storage.close();
});

test('ExternalBenchmarkStorage: update runtime state', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  
  const state: ExternalSourceRuntimeState = {
    sourceId: 'openrouter',
    status: 'refreshing',
    inFlightScope: 'all',
    nextRefreshAt: null,
  };
  
  await storage.saveRuntimeState(state);
  
  const retrieved = await storage.getRuntimeState('openrouter');
  assert.ok(retrieved, 'Should retrieve runtime state');
  assert.equal(retrieved!.status, 'refreshing');
  assert.equal(retrieved!.inFlightScope, 'all');
  
  storage.close();
});

test('ExternalBenchmarkStorage: archive old snapshots', async () => {
  cleanup();
  const storage = new ExternalBenchmarkStorage(TEST_DIR);
  
  // Save 5 snapshots
  for (let i = 1; i <= 5; i++) {
    const snapshot: ExternalBenchmarkSnapshot = {
      snapshotId: `snap-archive-${i}`,
      sourceId: 'openrouter',
      fetchedAt: new Date(`2024-01-${i.toString().padStart(2, '0')}T10:00:00Z`),
      version: 1,
      status: 'fresh',
    };
    await storage.saveSnapshot(snapshot);
  }
  
  // Archive keeping only 3 most recent
  const deleted = await storage.archiveOldSnapshots('openrouter', 3);
  assert.equal(deleted, 2, 'Should delete 2 old snapshots');
  
  const remaining = await storage.listSnapshots('openrouter', 10);
  assert.equal(remaining.length, 3, 'Should have 3 snapshots remaining');
  
  storage.close();
});
