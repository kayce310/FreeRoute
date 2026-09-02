import assert from 'node:assert/strict';
import test from 'node:test';
import { SqlitePreferenceStore } from '../src/storage/sqlite-preference-store.js';

test('persists and updates local model preferences', async () => {
  const store = new SqlitePreferenceStore(':memory:');
  try {
    const first = new Date('2026-09-03T00:00:00.000Z');
    await store.set('openrouter', 'free-model', 'prefer', first);
    await store.set('openrouter', 'free-model', 'block', new Date('2026-09-03T00:01:00.000Z'));
    assert.deepEqual(await store.list(), [{ providerId: 'openrouter', modelId: 'free-model', preference: 'block', updatedAt: new Date('2026-09-03T00:01:00.000Z') }]);
  } finally { store.close(); }
});
