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

test('scores reported remaining capacity without treating unknown quota as exhausted', async () => {
  const store = new SqliteQuotaObservationStore(':memory:');
  try {
    const now = new Date('2026-09-03T00:00:00.000Z');
    await store.record({ providerId: 'openrouter', modelId: 'available', credentialRef: '***key-a', observedAt: now, remainingRequests: 20, remainingTokens: 20_000 });
    await store.record({ providerId: 'openrouter', modelId: 'limited', credentialRef: '***key-b', observedAt: now, remainingRequests: 0, resetAt: new Date('2026-09-03T00:01:00.000Z') });
    const scores = await store.scores(now);
    assert.equal(scores.get('openrouter\u0000available\u0000***key-a'), 40);
    assert.equal(scores.get('openrouter\u0000limited\u0000***key-b'), -40);
    assert.equal(scores.get('unknown'), undefined);
  } finally { store.close(); }
});
