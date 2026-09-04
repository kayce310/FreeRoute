import assert from 'node:assert/strict';
import test from 'node:test';
import { RouteState, ChatService, ProviderInvocationError, type ChatProviderAdapter } from '../src/inference.js';
import { applyFailureCooldown, chooseRoute } from '../src/router.js';
import type { RouteCandidate } from '../src/contracts.js';

test('applyFailureCooldown implements stepped progressive backoff without reset time', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const baseCandidate: RouteCandidate = {
    providerId: 'groq',
    modelId: 'llama-70b',
    credentialId: 'c1',
    capabilities: ['chat'],
    freeTier: 'free_verified',
    checkedAt: now,
    priority: 0,
    preference: 'neutral',
    healthScore: 1,
    latencyScore: 1,
    quotaScore: 1,
  };

  // 1 fail: 30s
  const f1 = applyFailureCooldown(baseCandidate, { kind: 'rate_limit' }, now, 1);
  assert.equal(f1.cooldownUntil?.getTime(), now.getTime() + 30_000);

  // 2 fails: 30s
  const f2 = applyFailureCooldown(baseCandidate, { kind: 'rate_limit' }, now, 2);
  assert.equal(f2.cooldownUntil?.getTime(), now.getTime() + 30_000);

  // 3 fails: 5 minutes (300,000 ms)
  const f3 = applyFailureCooldown(baseCandidate, { kind: 'rate_limit' }, now, 3);
  assert.equal(f3.cooldownUntil?.getTime(), now.getTime() + 5 * 60 * 1000);

  // 4 fails: 30 minutes (1,800,000 ms)
  const f4 = applyFailureCooldown(baseCandidate, { kind: 'rate_limit' }, now, 4);
  assert.equal(f4.cooldownUntil?.getTime(), now.getTime() + 30 * 60 * 1000);

  // 5 fails: 1 hour (3,600,000 ms)
  const f5 = applyFailureCooldown(baseCandidate, { kind: 'rate_limit' }, now, 5);
  assert.equal(f5.cooldownUntil?.getTime(), now.getTime() + 60 * 60 * 1000);

  // 6 fails: 3 hours max cap (10,800,000 ms)
  const f6 = applyFailureCooldown(baseCandidate, { kind: 'rate_limit' }, now, 6);
  assert.equal(f6.cooldownUntil?.getTime(), now.getTime() + 3 * 60 * 60 * 1000);

  // 10 fails: capped at 3 hours
  const f10 = applyFailureCooldown(baseCandidate, { kind: 'rate_limit' }, now, 10);
  assert.equal(f10.cooldownUntil?.getTime(), now.getTime() + 3 * 60 * 60 * 1000);

  // Explicit retryAfterMs takes precedence over progressive stepped cooldown
  const explicit = applyFailureCooldown(baseCandidate, { kind: 'rate_limit', retryAfterMs: 45_000 }, now, 6);
  assert.equal(explicit.cooldownUntil?.getTime(), now.getTime() + 45_000);
});

test('RouteState records progressive failures and resets failure count upon success', () => {
  const state = new RouteState();
  const now = new Date('2026-09-04T12:00:00.000Z');
  const candidate: RouteCandidate = {
    providerId: 'groq',
    modelId: 'llama-70b',
    credentialId: 'c1',
    capabilities: ['chat'],
    freeTier: 'free_verified',
    checkedAt: now,
    priority: 0,
    preference: 'neutral',
    healthScore: 1,
    latencyScore: 1,
    quotaScore: 1,
  };

  assert.equal(state.getFailureCount(candidate), 0);

  // Record 3 failures
  state.recordFailure(candidate, { kind: 'rate_limit' }, now);
  assert.equal(state.getFailureCount(candidate), 1);

  state.recordFailure(candidate, { kind: 'rate_limit' }, now);
  assert.equal(state.getFailureCount(candidate), 2);

  state.recordFailure(candidate, { kind: 'rate_limit' }, now);
  assert.equal(state.getFailureCount(candidate), 3);

  // Check cooldown is applied (5 minutes)
  const applied = state.apply([candidate], now);
  assert.equal(applied[0].cooldownUntil?.getTime(), now.getTime() + 5 * 60 * 1000);

  // Upon success, reset failures and cooldown
  state.recordSuccess(candidate);
  assert.equal(state.getFailureCount(candidate), 0);
  const afterSuccess = state.apply([candidate], now);
  assert.equal(afterSuccess[0].cooldownUntil, undefined);
});

test('Context overflow automatically fails over to another model with larger context', async () => {
  const smallContextAdapter: ChatProviderAdapter = {
    providerId: 'small-ai',
    async chat() {
      throw new ProviderInvocationError(
        'upstream request failed with HTTP 400: This model maximum context length is 8192 tokens. However, your messages resulted in 12000 tokens.',
        { kind: 'context_overflow' },
      );
    },
  };

  const largeContextAdapter: ChatProviderAdapter = {
    providerId: 'large-ai',
    async chat() {
      return { id: 'large-resp', model: 'large-model', content: 'processed large input successfully' };
    },
  };

  const cSmall: RouteCandidate = {
    providerId: 'small-ai',
    modelId: 'small-model',
    credentialId: 'c1',
    capabilities: ['chat'],
    freeTier: 'free_verified',
    checkedAt: new Date(),
    priority: 10, // Higher priority initially
    preference: 'neutral',
    healthScore: 1,
    latencyScore: 1,
    quotaScore: 1,
  };

  const cLarge: RouteCandidate = {
    providerId: 'large-ai',
    modelId: 'large-model',
    credentialId: 'c2',
    capabilities: ['chat'],
    freeTier: 'free_verified',
    checkedAt: new Date(),
    priority: 5,
    preference: 'neutral',
    healthScore: 1,
    latencyScore: 1,
    quotaScore: 1,
  };

  const chat = new ChatService({
    candidates: async () => [cSmall, cLarge],
    adapters: new Map([
      ['small-ai', smallContextAdapter],
      ['large-ai', largeContextAdapter],
    ]),
  });

  const res = await chat.complete({
    profile: 'auto:free',
    requiredCapabilities: ['chat'],
    messages: [{ role: 'user', content: 'huge document' }],
  });

  // Automatically routed to large-ai after small-ai failed with context_overflow
  assert.equal(res.response.providerId, 'large-ai');
  assert.equal(res.response.content, 'processed large input successfully');
  assert.equal(res.fallbackCount, 1);
});

test('When all candidates fail due to context overflow, informs user to refresh session', async () => {
  const failingAdapter: ChatProviderAdapter = {
    providerId: 'groq',
    async chat() {
      throw new ProviderInvocationError(
        'upstream request failed with HTTP 400: context_length_exceeded',
        { kind: 'context_overflow' },
      );
    },
  };

  const candidate: RouteCandidate = {
    providerId: 'groq',
    modelId: 'llama-small',
    credentialId: 'c1',
    capabilities: ['chat'],
    freeTier: 'free_verified',
    checkedAt: new Date(),
    priority: 0,
    preference: 'neutral',
    healthScore: 1,
    latencyScore: 1,
    quotaScore: 1,
  };

  const chat = new ChatService({
    candidates: async () => [candidate],
    adapters: new Map([['groq', failingAdapter]]),
  });

  await assert.rejects(
    async () => {
      await chat.complete({
        profile: 'auto:free',
        requiredCapabilities: ['chat'],
        messages: [{ role: 'user', content: 'overflowing message' }],
      });
    },
    (err: Error) => {
      assert.match(err.message, /Ngữ cảnh hội thoại vượt quá giới hạn token của tất cả model khả dụng/);
      assert.match(err.message, /clear context/);
      return true;
    },
  );
});
