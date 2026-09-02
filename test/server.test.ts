import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { InMemoryCatalogStore } from '../src/catalog.js';
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

test('rejects requests without the unified local API token', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/models`);
    assert.equal(response.status, 401);
  });
});
