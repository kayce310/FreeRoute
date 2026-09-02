import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteRoutingEventStore } from '../src/storage/sqlite-routing-event-store.js';

test('stores redacted routing metadata without prompt content', async () => {
  const store = new SqliteRoutingEventStore(':memory:');
  try {
    await store.record({ requestId: 'request-1', occurredAt: new Date('2026-09-03T00:00:00.000Z'), profile: 'auto:free', providerId: 'openrouter', modelId: 'free-model', credentialRef: '***ported', fallbackCount: 1, outcome: 'success', latencyMs: 42 });
    assert.deepEqual(await store.list(), [{ requestId: 'request-1', occurredAt: new Date('2026-09-03T00:00:00.000Z'), profile: 'auto:free', providerId: 'openrouter', modelId: 'free-model', credentialRef: '***ported', fallbackCount: 1, outcome: 'success', failureKind: undefined, latencyMs: 42 }]);
  } finally { store.close(); }
});
