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
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        id: 'chat-1', model: 'free-model', choices: [{ message: { content: 'hello from upstream' } }],
      }));
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
  });
});

test('classifies an upstream 401 as an authentication error', async () => {
  const adapter = new OpenAICompatibleAdapter({ providerId: 'openrouter', baseUrl: 'https://example.test/v1', getCredential: async () => undefined });
  await assert.rejects(adapter.discoverModels('missing'), (error: unknown) => error instanceof ProviderInvocationError && error.failure.kind === 'authentication');
});
