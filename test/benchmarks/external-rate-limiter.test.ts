import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimiter } from '../../src/benchmarks/external/rate-limiter.js';
import { BUILTIN_EXTERNAL_SOURCES } from '../../src/benchmarks/external/sources.js';

test('RateLimiter: allows requests within limit', () => {
  const limiter = new RateLimiter(BUILTIN_EXTERNAL_SOURCES);
  
  // OpenRouter allows 60 requests/minute
  for (let i = 0; i < 60; i++) {
    assert.ok(limiter.allow('openrouter'), `Should allow request ${i + 1}`);
    limiter.record('openrouter');
  }
  
  // 61st should be blocked
  assert.ok(!limiter.allow('openrouter'), 'Should block after limit');
});

test('RateLimiter: sliding window tracks correctly', () => {
  const limiter = new RateLimiter(BUILTIN_EXTERNAL_SOURCES);
  
  // HuggingFace allows ~16 requests/minute
  for (let i = 0; i < 16; i++) {
    assert.ok(limiter.allow('huggingface'), `Should allow request ${i + 1}`);
    limiter.record('huggingface');
  }
  
  assert.ok(!limiter.allow('huggingface'), 'Should block after limit');
});

test('RateLimiter: unknown source is allowed', () => {
  const limiter = new RateLimiter([]);
  
  assert.ok(limiter.allow('unknown-source'), 'Unknown source should be allowed');
});
