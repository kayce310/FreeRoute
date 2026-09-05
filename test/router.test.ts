import assert from 'node:assert/strict';
import test from 'node:test';
import type { RouteCandidate } from '../src/contracts.js';
import { applyFailureCooldown, chooseRoute, getCandidateDiagnostics } from '../src/router.js';

const now = new Date('2026-09-03T00:00:00.000Z');

function candidate(overrides: Partial<RouteCandidate> = {}): RouteCandidate {
  return {
    providerId: 'provider',
    modelId: 'model',
    credentialId: 'key-1',
    capabilities: ['chat', 'streaming'],
    freeTier: 'free_verified',
    checkedAt: now,
    priority: 10,
    preference: 'neutral',
    healthScore: 70,
    latencyScore: 10,
    quotaScore: 10,
    ...overrides,
  };
}

test('auto:code requires tools capability', () => {
  const decision = chooseRoute(
    { profile: 'auto:code', requiredCapabilities: ['chat'] },
    [candidate({ modelId: 'tools-only', capabilities: ['tools'] })],
    now,
  );
  assert.strictEqual(decision, undefined);
});

test('auto:code routes to tools-capable candidate', () => {
  const decision = chooseRoute(
    { profile: 'auto:code', requiredCapabilities: ['chat', 'tools'] },
    [candidate({ modelId: 'tools-only', capabilities: ['chat', 'tools'] })],
    now,
  );
  assert.strictEqual(decision?.candidate?.modelId, 'tools-only');
});

test('auto:long-context routes to chat-capable candidate', () => {
  const decision = chooseRoute(
    { profile: 'auto:long-context', requiredCapabilities: ['chat'] },
    [candidate({ modelId: 'chat-only', capabilities: ['chat'] })],
    now,
  );
  assert.strictEqual(decision?.candidate?.modelId, 'chat-only');
});

test('getCandidateDiagnostics returns empty when all candidates available', () => {
  const diagnostics = getCandidateDiagnostics(
    { profile: 'auto:free', requiredCapabilities: ['chat'] },
    [candidate({ modelId: 'a' }), candidate({ modelId: 'b' })],
    now,
  );
  assert.strictEqual(diagnostics.length, 0);
});

test('getCandidateDiagnostics reports blocked candidate', () => {
  const diagnostics = getCandidateDiagnostics(
    { profile: 'auto:free', requiredCapabilities: ['chat'] },
    [candidate({ modelId: 'a', preference: 'block' })],
    now,
  );
  assert.strictEqual(diagnostics.length, 1);
  assert.strictEqual(diagnostics[0].reason, 'blocked');
  assert.strictEqual(diagnostics[0].modelId, 'a');
});

test('getCandidateDiagnostics reports missing capability', () => {
  const diagnostics = getCandidateDiagnostics(
    { profile: 'auto:free', requiredCapabilities: ['chat', 'tools'] },
    [candidate({ modelId: 'a', capabilities: ['chat'] })],
    now,
  );
  assert.strictEqual(diagnostics.length, 1);
  assert.strictEqual(diagnostics[0].reason, 'missing_capability');
});

test('getCandidateDiagnostics reports cooldown with retryAt', () => {
  const retryAt = new Date(now.getTime() + 60_000);
  const diagnostics = getCandidateDiagnostics(
    { profile: 'auto:free', requiredCapabilities: ['chat'] },
    [candidate({ modelId: 'a', cooldownUntil: retryAt })],
    now,
  );
  assert.strictEqual(diagnostics.length, 1);
  assert.strictEqual(diagnostics[0].reason, 'cooldown');
  assert.strictEqual(diagnostics[0].retryAt?.getTime(), retryAt.getTime());
});