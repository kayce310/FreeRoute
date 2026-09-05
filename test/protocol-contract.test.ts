import assert from 'node:assert/strict';
import test from 'node:test';
import { inferModelCapabilities } from '../src/providers/openai-compatible.js';
import { OpenAICompatibleAdapter } from '../src/providers/openai-compatible.js';
import { GeminiAdapter } from '../src/providers/gemini.js';
import { ChatService, ProviderInvocationError } from '../src/inference.js';
import { isAdapterBug, isClientRequestError, isKeyFailure, isProviderFailure } from '../src/routing-failure.js';

test('inferModelCapabilities detects tools for coding and agentic models', () => {
  assert.ok(inferModelCapabilities('qwen/qwen-2.5-coder-32b').includes('tools'));
  assert.ok(inferModelCapabilities('codestral-2508').includes('tools'));
  assert.ok(inferModelCapabilities('claude-3-5-sonnet-20241022').includes('tools'));
  assert.ok(inferModelCapabilities('llama-3.3-70b-versatile').includes('tools'));
  assert.ok(inferModelCapabilities('gemini-2.5-flash').includes('tools'));
  assert.ok(inferModelCapabilities('deepseek-chat').includes('tools'));
  assert.ok(inferModelCapabilities('chatgpt-4o-latest').includes('tools'));

  // Non-coding plain text models do not get tools by default
  assert.ok(!inferModelCapabilities('babbage-002').includes('tools'));
  assert.ok(!inferModelCapabilities('BAAI/bge-reranker-v2-m3').includes('tools'));
});

test('inferModelCapabilities detects vision for multimodal models', () => {
  assert.ok(inferModelCapabilities('gemini-2.5-flash').includes('vision'));
  assert.ok(inferModelCapabilities('claude-3-5-sonnet-20241022').includes('vision'));
  assert.ok(inferModelCapabilities('gpt-4o').includes('vision'));
  assert.ok(inferModelCapabilities('qwen-vl-max').includes('vision'));
});

test('OpenAICompatibleAdapter classifies 400 Bad Request as non-fallbackable request scope', async () => {
  const fetchMock = async () => new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });

  const adapter = new OpenAICompatibleAdapter({
    providerId: 'mock-openai',
    baseUrl: 'https://mock.api/v1',
    getCredential: async () => 'test-key',
    fetch: fetchMock as unknown as typeof fetch,
  });

  await assert.rejects(
    () => adapter.chat({
      credentialId: 'test',
      modelId: 'gpt-4o',
      request: { profile: 'test', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hi' }] },
    }),
    (err: unknown) => {
      assert.ok(err instanceof ProviderInvocationError);
      assert.strictEqual(err.failure.kind, 'unsupported');
      assert.strictEqual(err.failure.scope, 'request');
      assert.strictEqual(err.failure.fallbackAllowed, false);
      assert.strictEqual(err.failure.retryable, false);
      assert.strictEqual(isClientRequestError(err.failure), true);
      return true;
    }
  );
});

test('OpenAICompatibleAdapter classifies 429 Rate Limit as key scope with fallbackAllowed true', async () => {
  const fetchMock = async () => new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'retry-after': '30' },
  });

  const adapter = new OpenAICompatibleAdapter({
    providerId: 'mock-openai',
    baseUrl: 'https://mock.api/v1',
    getCredential: async () => 'test-key',
    fetch: fetchMock as unknown as typeof fetch,
  });

  await assert.rejects(
    () => adapter.chat({
      credentialId: 'test',
      modelId: 'gpt-4o',
      request: { profile: 'test', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hi' }] },
    }),
    (err: unknown) => {
      assert.ok(err instanceof ProviderInvocationError);
      assert.strictEqual(err.failure.kind, 'rate_limit');
      assert.strictEqual(err.failure.scope, 'key');
      assert.strictEqual(err.failure.fallbackAllowed, true);
      assert.strictEqual(err.failure.retryable, true);
      assert.strictEqual(err.failure.retryAfterMs, 30_000);
      assert.strictEqual(isKeyFailure(err.failure), true);
      return true;
    }
  );
});

test('GeminiAdapter classifies 429 Resource Exhausted as key scope with fallbackAllowed true', async () => {
  const fetchMock = async () => new Response(JSON.stringify({ error: { message: 'Resource has been exhausted (e.g. check quota).' } }), {
    status: 429,
    headers: { 'content-type': 'application/json' },
  });

  const adapter = new GeminiAdapter({
    getCredential: async () => 'test-key',
    fetch: fetchMock as unknown as typeof fetch,
  });

  await assert.rejects(
    () => adapter.chat({
      credentialId: 'test',
      modelId: 'gemini-2.5-flash',
      request: { profile: 'test', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hi' }] },
    }),
    (err: unknown) => {
      assert.ok(err instanceof ProviderInvocationError);
      assert.strictEqual(err.failure.kind, 'rate_limit');
      assert.strictEqual(err.failure.scope, 'key');
      assert.strictEqual(err.failure.fallbackAllowed, true);
      assert.strictEqual(isKeyFailure(err.failure), true);
      return true;
    }
  );
});

test('Inference halts immediately when fallbackAllowed is false', async () => {
  let attempts = 0;

  const mockAdapter = {
    providerId: 'bad-adapter',
    chat: async () => {
      attempts += 1;
      throw new ProviderInvocationError('Internal adapter serialization bug', {
        kind: 'unsupported',
        scope: 'adapter',
        fallbackAllowed: false,
        retryable: false,
      });
    },
  };

  const service = new ChatService({
    candidates: async () => [
      {
        providerId: 'bad-adapter',
        modelId: 'model-1',
        credentialId: 'c1',
        capabilities: ['chat'],
        freeTier: 'free_verified',
        preference: 'neutral',
        priority: 100,
        healthScore: 100,
        latencyScore: 0,
        quotaScore: 0,
        checkedAt: new Date(),
      },
      {
        providerId: 'bad-adapter',
        modelId: 'model-2',
        credentialId: 'c2',
        capabilities: ['chat'],
        freeTier: 'free_verified',
        preference: 'neutral',
        priority: 90,
        healthScore: 90,
        latencyScore: 0,
        quotaScore: 0,
        checkedAt: new Date(),
      },
    ],
    adapters: new Map([[mockAdapter.providerId, mockAdapter]]),
  });

  await assert.rejects(
    () => service.complete({
      profile: 'auto:chat',
      requiredCapabilities: ['chat'],
      messages: [{ role: 'user', content: 'hello' }],
    }),
    (err: unknown) => {
      assert.ok(err instanceof ProviderInvocationError);
      assert.strictEqual(isAdapterBug(err.failure), true);
      assert.strictEqual(attempts, 1); // Crucial: did NOT attempt fallback to model-2!
      return true;
    }
  );
});
