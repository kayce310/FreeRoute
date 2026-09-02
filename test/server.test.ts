import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { InMemoryCatalogStore } from '../src/catalog.js';
import { ChatService, type ChatProviderAdapter } from '../src/inference.js';
import { createFreeRouteServer } from '../src/server.js';

async function withServer<T>(callback: (baseUrl: string) => Promise<T>): Promise<T> {
  const catalog = new InMemoryCatalogStore([{
    providerId: 'groq',
    modelId: 'llama-free',
    capabilities: ['chat', 'streaming'],
    freeTier: 'free_verified',
    checkedAt: new Date('2026-09-03T00:00:00.000Z'),
    priority: 0,
  }]);
  const server = createFreeRouteServer({ catalog, apiToken: 'local-token' });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('lists cached catalog models in an OpenAI-compatible envelope', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/models`, { headers: { authorization: 'Bearer local-token' } });
    assert.equal(response.status, 200);
    const body = await response.json() as { object: string; data: Array<{ id: string; owned_by: string }> };
    assert.equal(body.object, 'list');
    assert.deepEqual(body.data.map(({ id, owned_by }) => [id, owned_by]), [['groq/llama-free', 'groq']]);
  });
});

test('routes OpenAI-compatible chat requests and reports the selected upstream', async () => {
  const adapter: ChatProviderAdapter = { providerId: 'groq', async chat() { return { id: 'chat-1', model: 'llama-free', content: 'hello client' }; } };
  const chat = new ChatService({
    candidates: async () => [{ providerId: 'groq', modelId: 'llama-free', credentialId: 'local', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }],
    adapters: new Map([['groq', adapter]]),
  });
  const catalog = new InMemoryCatalogStore();
  const server = createFreeRouteServer({ catalog, apiToken: 'local-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'groq/llama-free', messages: [{ role: 'user', content: 'hi' }] }) });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-freeroute-provider'), 'groq');
    const body = await response.json() as { model: string; choices: Array<{ message: { content: string } }> };
    assert.equal(body.model, 'groq/llama-free');
    assert.equal(body.choices[0]?.message.content, 'hello client');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('streams OpenAI-compatible chat chunks as SSE', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'groq', async chat() { return { id: 'unused', model: 'llama-free', content: 'unused' }; },
    async *streamChat() { yield { id: 'chunk-1', model: 'llama-free', delta: 'hello' }; yield { id: 'chunk-1', model: 'llama-free', finishReason: 'stop' }; },
  };
  const chat = new ChatService({ candidates: async () => [{ providerId: 'groq', modelId: 'llama-free', credentialId: 'local', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }], adapters: new Map([['groq', adapter]]) });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'groq/llama-free', stream: true, messages: [{ role: 'user', content: 'hi' }] }) });
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const body = await response.text();
    assert.match(body, /"content":"hello"/);
    assert.match(body, /data: \[DONE\]/);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('rejects requests without the unified local API token', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/models`);
    assert.equal(response.status, 401);
  });
});
