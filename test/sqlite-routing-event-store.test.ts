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

test('derives bounded health and latency routing scores from redacted events', async () => {
  const store = new SqliteRoutingEventStore(':memory:');
  try {
    await store.record({ requestId: 'success', occurredAt: new Date(), profile: 'auto:fast', providerId: 'openrouter', modelId: 'fast', credentialRef: '***key', fallbackCount: 0, outcome: 'success', latencyMs: 100 });
    await store.record({ requestId: 'slow', occurredAt: new Date(), profile: 'auto:fast', providerId: 'openrouter', modelId: 'slow', credentialRef: '***key', fallbackCount: 0, outcome: 'success', latencyMs: 5_000 });
    assert.deepEqual(await store.scores(), new Map([['openrouter\u0000fast', { healthScore: 10, latencyScore: 20 }], ['openrouter\u0000slow', { healthScore: 10, latencyScore: -10 }]]));
  } finally { store.close(); }
});
