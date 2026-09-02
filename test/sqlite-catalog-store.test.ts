import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ModelRecord } from '../src/contracts.js';
import { SqliteCatalogStore } from '../src/storage/sqlite-catalog-store.js';

function model(providerId: string, modelId: string): ModelRecord {
  return {
    providerId,
    modelId,
    capabilities: ['chat', 'tools'],
    freeTier: 'free_verified',
    checkedAt: new Date('2026-09-03T00:00:00.000Z'),
    priority: 10,
  };
}

test('persists a provider catalog across database reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freeroute-catalog-'));
  const databaseFile = join(directory, 'catalog.sqlite');
  try {
    const first = new SqliteCatalogStore(databaseFile);
    await first.replaceProvider('gemini', [model('gemini', 'gemini-2.5-flash')]);
    first.close();

    const second = new SqliteCatalogStore(databaseFile);
    const records = await second.list();
    second.close();
    assert.deepEqual(records.map((record) => [record.providerId, record.modelId]), [['gemini', 'gemini-2.5-flash']]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('replacing one provider does not remove another provider catalog', async () => {
  const store = new SqliteCatalogStore(':memory:');
  await store.replaceProvider('groq', [model('groq', 'old')]);
  await store.replaceProvider('gemini', [model('gemini', 'stable')]);
  await store.replaceProvider('groq', [model('groq', 'new')]);
  assert.deepEqual((await store.list()).map((record) => record.modelId), ['stable', 'new']);
  store.close();
});
