import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyFailure } from '../src/routing-failure.js';

test('HTTP 400 becomes unsupported with fallbackAllowed false and sourceStatus 400', () => {
  const failure = classifyFailure(400, 'bad input', 'unsupported');
  assert.strictEqual(failure.kind, 'unsupported');
  assert.strictEqual(failure.scope, 'request');
  assert.strictEqual(failure.fallbackAllowed, false);
  assert.strictEqual(failure.retryable, false);
  assert.strictEqual(failure.sourceStatus, 400);
});

test('HTTP 401 becomes authentication with key scope', () => {
  const failure = classifyFailure(401, undefined, 'authentication');
  assert.strictEqual(failure.kind, 'authentication');
  assert.strictEqual(failure.scope, 'key');
  assert.strictEqual(failure.fallbackAllowed, true);
  assert.strictEqual(failure.retryable, false);
});

test('HTTP 402 becomes quota_exhausted', () => {
  const failure = classifyFailure(402, undefined, 'quota_exhausted');
  assert.strictEqual(failure.kind, 'quota_exhausted');
  assert.strictEqual(failure.scope, 'key');
  assert.strictEqual(failure.fallbackAllowed, true);
});

test('HTTP 429 keeps retryAfterMs and rate_limit kind', () => {
  const failure = classifyFailure(429, undefined, 'rate_limit');
  assert.strictEqual(failure.kind, 'rate_limit');
  assert.strictEqual(failure.scope, 'key');
  assert.strictEqual(failure.fallbackAllowed, true);
  assert.strictEqual(failure.retryable, true);
});

test('HTTP 5xx becomes temporary with provider scope', () => {
  const failure = classifyFailure(500, 'internal', 'temporary');
  assert.strictEqual(failure.kind, 'temporary');
  assert.strictEqual(failure.scope, 'provider');
  assert.strictEqual(failure.retryable, true);
});

test('Context overflow maps to context_overflow kind', () => {
  const failure = classifyFailure(400, 'context length exceeded', 'context_overflow');
  assert.strictEqual(failure.kind, 'context_overflow');
  assert.strictEqual(failure.scope, 'model');
  assert.strictEqual(failure.fallbackAllowed, true);
});

test('Adapter internal failure maps to scope: adapter and fallbackAllowed false', () => {
  const failure = classifyFailure(undefined, undefined, 'adapter');
  assert.strictEqual(failure.scope, 'adapter');
  assert.strictEqual(failure.fallbackAllowed, false);
  assert.strictEqual(failure.retryable, false);
});

test('Client cancellation has fallbackAllowed false', () => {
  const failure = classifyFailure(undefined, undefined, 'client_cancelled');
  assert.strictEqual(failure.kind, 'no_candidate');
  assert.strictEqual(failure.scope, 'request');
  assert.strictEqual(failure.fallbackAllowed, false);
  assert.strictEqual(failure.retryable, false);
});
