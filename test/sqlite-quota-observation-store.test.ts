import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteQuotaObservationStore } from '../src/storage/sqlite-quota-observation-store.js';

test('persists provider-reported quota observations without credentials', async () => {
  const store = new SqliteQuotaObservationStore(':memory:');
  try {
    await store.record({ providerId: 'openrouter', modelId: 'free-model', credentialRef: '***ported', observedAt: new Date('2026-09-03T00:00:00.000Z'), remainingRequests: 5, remainingTokens: 1000 });
    assert.deepEqual(await store.list(), [{ providerId: 'openrouter', modelId: 'free-model', credentialRef: '***ported', observedAt: new Date('2026-09-03T00:00:00.000Z'), remainingRequests: 5, remainingTokens: 1000, resetAt: undefined }]);
  } finally { store.close(); }
});
