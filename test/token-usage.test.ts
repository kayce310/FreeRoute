import assert from 'node:assert/strict';
import test from 'node:test';
import { SqliteRoutingEventStore } from '../src/storage/sqlite-routing-event-store.js';
import { estimateTokensFromText, estimatePromptTokens } from '../src/utils/token-estimator.js';

test('stores and retrieves token columns in routing_events', async () => {
  const store = new SqliteRoutingEventStore(':memory:');
  try {
    await store.record({
      requestId: 'req_token_1',
      occurredAt: new Date('2026-01-15T10:00:00Z'),
      profile: 'auto',
      providerId: 'groq',
      modelId: 'llama-3.1-8b-instant',
      credentialRef: 'cred_abc***',
      fallbackCount: 0,
      outcome: 'success',
      latencyMs: 1200,
      promptTokens: 42,
      completionTokens: 18,
      totalTokens: 60,
    });
    const events = await store.list(10);
    assert.equal(events.length, 1);
    assert.equal(events[0].promptTokens, 42);
    assert.equal(events[0].completionTokens, 18);
    assert.equal(events[0].totalTokens, 60);
  } finally { store.close(); }
});

test('token data is optional — defaults to undefined', async () => {
  const store = new SqliteRoutingEventStore(':memory:');
  try {
    await store.record({
      requestId: 'req_no_token',
      occurredAt: new Date('2026-01-15T10:00:00Z'),
      profile: 'auto',
      providerId: 'groq',
      modelId: 'model-x',
      credentialRef: '***key',
      fallbackCount: 0,
      outcome: 'success',
      latencyMs: 100,
    });
    const events = await store.list(10);
    assert.equal(events.length, 1);
    assert.equal(events[0].promptTokens, undefined);
    assert.equal(events[0].completionTokens, undefined);
    assert.equal(events[0].totalTokens, undefined);
  } finally { store.close(); }
});

test('tokenStats() aggregates by provider correctly', async () => {
  const store = new SqliteRoutingEventStore(':memory:');
  try {
    await store.record({
      requestId: 'r1', occurredAt: new Date(), profile: 'auto', providerId: 'groq',
      modelId: 'm1', credentialRef: '***', fallbackCount: 0, outcome: 'success', latencyMs: 100,
      promptTokens: 10, completionTokens: 20, totalTokens: 30,
    });
    await store.record({
      requestId: 'r2', occurredAt: new Date(), profile: 'auto', providerId: 'groq',
      modelId: 'm1', credentialRef: '***', fallbackCount: 0, outcome: 'success', latencyMs: 100,
      promptTokens: 5, completionTokens: 10, totalTokens: 15,
    });
    await store.record({
      requestId: 'r3', occurredAt: new Date(), profile: 'auto', providerId: 'gemini',
      modelId: 'm2', credentialRef: '***', fallbackCount: 0, outcome: 'success', latencyMs: 100,
      promptTokens: 100, completionTokens: 50, totalTokens: 150,
    });
    const stats = await store.tokenStats();
    assert.equal(stats.totalRequests, 3);
    assert.equal(stats.totalTokens, 195);
    assert.equal(stats.promptTokens, 115);
    assert.equal(stats.completionTokens, 80);
    assert.ok(stats.byProvider['groq']);
    assert.equal(stats.byProvider['groq'].count, 2);
    assert.equal(stats.byProvider['groq'].totalTokens, 45);
    assert.ok(stats.byProvider['gemini']);
    assert.equal(stats.byProvider['gemini'].count, 1);
    assert.equal(stats.byProvider['gemini'].totalTokens, 150);
  } finally { store.close(); }
});

test('tokenStats() excludes failure events from aggregate', async () => {
  const store = new SqliteRoutingEventStore(':memory:');
  try {
    await store.record({
      requestId: 's1', occurredAt: new Date(), profile: 'auto', providerId: 'groq',
      modelId: 'm1', credentialRef: '***', fallbackCount: 0, outcome: 'success', latencyMs: 100,
      promptTokens: 10, completionTokens: 20, totalTokens: 30,
    });
    await store.record({
      requestId: 'f1', occurredAt: new Date(), profile: 'auto', providerId: 'groq',
      modelId: 'm1', credentialRef: '***', fallbackCount: 0, outcome: 'failure', latencyMs: 100,
      promptTokens: 10, completionTokens: 20, totalTokens: 30,
    });
    const stats = await store.tokenStats();
    assert.equal(stats.totalRequests, 1);
    assert.equal(stats.totalTokens, 30);
  } finally { store.close(); }
});

test('estimateTokensFromText returns 0 for empty/null', () => {
  assert.equal(estimateTokensFromText(null), 0);
  assert.equal(estimateTokensFromText(undefined), 0);
  assert.equal(estimateTokensFromText(''), 0);
});

test('estimateTokensFromText returns at least 1 for non-empty', () => {
  assert.equal(estimateTokensFromText('a'), 1);
  assert.equal(estimateTokensFromText('Hi'), 1);
});

test('estimateTokensFromText scales proportionally', () => {
  const text = 'a'.repeat(100);
  const tokens = estimateTokensFromText(text);
  assert.ok(tokens >= 25 && tokens <= 35, `Expected ~29 tokens, got ${tokens}`);
});

test('estimatePromptTokens returns 0 for empty input', () => {
  assert.equal(estimatePromptTokens(null), 0);
  assert.equal(estimatePromptTokens(undefined), 0);
  assert.equal(estimatePromptTokens([]), 0);
});

test('estimatePromptTokens counts overhead and priming', () => {
  const count = estimatePromptTokens([{ role: 'user', content: '' }]);
  // 4 (overhead) + 0 (empty) + 2 (priming) = 6
  assert.equal(count, 6);
});

test('estimatePromptTokens handles multipart text content', () => {
  const count = estimatePromptTokens([
    { role: 'user', content: [
      { type: 'text', text: 'Hello world' } as { type: 'text'; text: string },
      { type: 'text', text: 'Second part' } as { type: 'text'; text: string },
    ] },
  ]);
  // overhead: 4, priming: 2, content: ~3 + ~3 = ~12
  assert.ok(count >= 10 && count <= 15, `Expected ~12 tokens, got ${count}`);
});
