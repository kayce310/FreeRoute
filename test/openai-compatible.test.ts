import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { OpenAICompatibleAdapter } from '../src/providers/openai-compatible.js';
import { ProviderInvocationError } from '../src/inference.js';

async function withUpstream<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const server = createServer((request, response) => {
    if (request.headers.authorization !== 'Bearer test-secret') {
      response.writeHead(401).end();
      return;
    }
    if (request.url === '/v1/models') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ data: [
        { id: 'free-model', pricing: { prompt: '0', completion: '0' } },
        { id: 'paid-model', pricing: { prompt: '0.1', completion: '0.1' } },
      ] }));
      return;
    }
    if (request.url === '/v1/chat/completions') {
      let body = '';
      request.on('data', (chunk: Buffer) => { body += chunk; });
      request.on('end', () => {
        if (JSON.parse(body).stream === true) {
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.end('data: {"id":"chat-stream","model":"free-model","choices":[{"delta":{"content":"hello"},"finish_reason":null}]}\n\ndata: {"id":"chat-stream","model":"free-model","choices":[{"delta":{"content":" world"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json', 'x-ratelimit-remaining-requests': '12', 'x-ratelimit-remaining-tokens': '9000' }).end(JSON.stringify({
          id: 'chat-1', model: 'free-model', choices: [{ message: { content: 'hello from upstream' } }],
        }));
      });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await callback(`http://127.0.0.1:${port}/v1`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('discovers zero-priced models and translates chat completions', async () => {
  await withUpstream(async (baseUrl) => {
    const adapter = new OpenAICompatibleAdapter({ providerId: 'openrouter', baseUrl, getCredential: async () => 'test-secret' });
    const models = await adapter.discoverModels('personal');
    assert.deepEqual(models.map(({ modelId, freeTier }) => [modelId, freeTier]), [
      ['free-model', 'free_verified'], ['paid-model', 'paid'],
    ]);
    const response = await adapter.chat({
      credentialId: 'personal', modelId: 'free-model',
      request: { profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hello' }] },
    });
    assert.equal(response.content, 'hello from upstream');
    assert.deepEqual(response.quota, { remainingRequests: 12, remainingTokens: 9000, resetAt: undefined });
  });
});

test('translates OpenAI-compatible SSE chat chunks', async () => {
  await withUpstream(async (baseUrl) => {
    const adapter = new OpenAICompatibleAdapter({ providerId: 'openrouter', baseUrl, getCredential: async () => 'test-secret' });
    const events = [];
    for await (const event of adapter.streamChat!({ credentialId: 'personal', modelId: 'free-model', request: { profile: 'auto:free', requiredCapabilities: ['chat', 'streaming'], messages: [{ role: 'user', content: 'hello' }] } })) events.push(event);
    assert.deepEqual(events.map((event) => [event.delta, event.finishReason]), [['hello', null], [' world', 'stop']]);
  });
});

test('classifies an upstream 401 as an authentication error', async () => {
  const adapter = new OpenAICompatibleAdapter({ providerId: 'openrouter', baseUrl: 'https://example.test/v1', getCredential: async () => undefined });
  await assert.rejects(adapter.discoverModels('missing'), (error: unknown) => error instanceof ProviderInvocationError && error.failure.kind === 'authentication');
});

test('classifies an upstream 402 as quota exhaustion so routing can fall back', async () => {
  const adapter = new OpenAICompatibleAdapter({
    providerId: 'openrouter', baseUrl: 'https://example.test/v1', getCredential: async () => 'test-secret',
    fetch: async () => new Response(null, { status: 402 }),
  });
  await assert.rejects(adapter.discoverModels('personal'), (error: unknown) => error instanceof ProviderInvocationError && error.failure.kind === 'quota_exhausted');
});
