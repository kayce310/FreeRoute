import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createSqliteComboStore } from '../src/storage/sqlite-combo-store.js';
import { createFreeRouteServer } from '../src/server.js';
import { InMemoryCatalogStore } from '../src/catalog.js';
import { ChatService, type ChatProviderAdapter } from '../src/inference.js';

test('SqliteComboStore supports CRUD operations', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freeroute-combo-test-'));
  const dbPath = join(dir, 'freeroute.sqlite');
  const store = createSqliteComboStore(dbPath);

  try {
    // Initially empty
    const initialList = store.list();
    assert.equal(initialList.length, 0);

    // Put a new combo
    store.put({
      comboId: 'fast-coder',
      name: 'Fast Coder Combo',
      models: ['groq/llama-3.3-70b-versatile', 'cerebras/llama3.1-70b'],
      description: 'Ultra fast coding fallback',
    });

    // List has 1
    const list1 = store.list();
    assert.equal(list1.length, 1);
    assert.equal(list1[0].comboId, 'fast-coder');
    assert.equal(list1[0].name, 'Fast Coder Combo');
    assert.deepEqual(list1[0].models, ['groq/llama-3.3-70b-versatile', 'cerebras/llama3.1-70b']);

    // Get specific
    const combo = store.get('fast-coder');
    assert.ok(combo);
    assert.equal(combo.name, 'Fast Coder Combo');
    assert.equal(combo.description, 'Ultra fast coding fallback');

    // Update
    store.put({
      comboId: 'fast-coder',
      name: 'Fast Coder Combo v2',
      models: ['cerebras/llama3.1-70b'],
    });
    const updated = store.get('fast-coder');
    assert.ok(updated);
    assert.equal(updated.name, 'Fast Coder Combo v2');
    assert.deepEqual(updated.models, ['cerebras/llama3.1-70b']);

    // Delete
    const deleted = store.delete('fast-coder');
    assert.equal(deleted, true);
    assert.equal(store.get('fast-coder'), null);
    assert.equal(store.list().length, 0);

    // Delete non-existent
    const deleteAgain = store.delete('non-existent');
    assert.equal(deleteAgain, false);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('HTTP /v1/combos endpoints and chat routing with fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freeroute-server-combo-'));
  const dbPath = join(dir, 'freeroute.sqlite');
  const comboStore = createSqliteComboStore(dbPath);

  // Pre-seed combo
  comboStore.put({
    comboId: 'smart-fallback',
    name: 'Smart Fallback',
    models: ['groq/llama-fail', 'cerebras/llama-ok'],
    description: 'Falls back from failing groq to cerebras',
  });

  // Setup mock adapters
  const groqAdapter: ChatProviderAdapter = {
    providerId: 'groq',
    async chat() {
      const err = new Error('Rate limit exceeded');
      (err as unknown as { status: number }).status = 429;
      throw err;
    },
  };
  const cerebrasAdapter: ChatProviderAdapter = {
    providerId: 'cerebras',
    async chat() {
      return { id: 'chat-cb', model: 'llama-ok', content: 'hello from cerebras backup' };
    },
  };

  const chat = new ChatService({
    candidates: async () => [
      { providerId: 'groq', modelId: 'llama-fail', credentialId: 'c1', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
      { providerId: 'cerebras', modelId: 'llama-ok', credentialId: 'c2', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
    ],
    adapters: new Map([
      ['groq', groqAdapter],
      ['cerebras', cerebrasAdapter],
    ]),
  });

  const catalog = new InMemoryCatalogStore();
  const server = createFreeRouteServer({
    catalog,
    apiToken: 'test-token',
    chat,
    combos: comboStore,
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /v1/combos
    const listRes = await fetch(`${baseUrl}/v1/combos`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(listRes.status, 200);
    const body = await listRes.json() as { object: string; data: Array<{ comboId: string; name: string }> };
    assert.equal(body.object, 'list');
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].comboId, 'smart-fallback');

    // 2. GET /v1/combos/:id
    const getRes = await fetch(`${baseUrl}/v1/combos/smart-fallback`, {
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json() as { comboId: string; name: string };
    assert.equal(getBody.comboId, 'smart-fallback');

    // 3. POST /v1/combos (Create new)
    const createRes = await fetch(`${baseUrl}/v1/combos`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        comboId: 'new-combo',
        name: 'New Custom Combo',
        models: ['cerebras/llama-ok'],
      }),
    });
    assert.equal(createRes.status, 200);
    const createdBody = await createRes.json() as { status: string; combo: { comboId: string } };
    assert.equal(createdBody.status, 'ok');
    assert.equal(createdBody.combo.comboId, 'new-combo');

    // 4. Test chat routing using combo:smart-fallback
    // groq will fail with 429, then router automatically falls back to cerebras
    const chatRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'combo:smart-fallback',
        messages: [{ role: 'user', content: 'test fallback' }],
      }),
    });
    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.headers.get('x-freeroute-provider'), 'cerebras');
    const chatBody = await chatRes.json() as { choices: Array<{ message: { content: string } }> };
    assert.equal(chatBody.choices[0]?.message.content, 'hello from cerebras backup');

    // 5. DELETE /v1/combos/new-combo
    const delRes = await fetch(`${baseUrl}/v1/combos/new-combo`, {
      method: 'DELETE',
      headers: { authorization: 'Bearer test-token' },
    });
    assert.equal(delRes.status, 200);

    const listAfterDel = await fetch(`${baseUrl}/v1/combos`, {
      headers: { authorization: 'Bearer test-token' },
    });
    const bodyAfter = await listAfterDel.json() as { data: Array<{ comboId: string }> };
    assert.equal(bodyAfter.data.length, 1);
    assert.equal(bodyAfter.data[0].comboId, 'smart-fallback');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    comboStore.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('handles mid-stream generator errors gracefully in combo streaming', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freeroute-combo-stream-err-'));
  const dbPath = join(dir, 'freeroute.sqlite');
  const comboStore = createSqliteComboStore(dbPath);
  comboStore.put({
    comboId: 'stream-combo',
    name: 'Stream Combo',
    models: ['groq/llama-error', 'cerebras/llama-ok'],
  });

  const groqAdapter: ChatProviderAdapter = {
    providerId: 'groq',
    async chat() { return { id: 'x', model: 'llama-error', content: 'x' }; },
    async *streamChat() {
      yield { id: 'c1', model: 'llama-error', delta: 'chunk from groq' };
      throw new Error('groq mid-stream crash');
    },
  };
  const chat = new ChatService({
    candidates: async () => [
      { providerId: 'groq', modelId: 'llama-error', credentialId: 'c1', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
      { providerId: 'cerebras', modelId: 'llama-ok', credentialId: 'c2', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
    ],
    adapters: new Map([['groq', groqAdapter]]),
  });

  const server = createFreeRouteServer({
    catalog: new InMemoryCatalogStore(),
    apiToken: 'test-token',
    chat,
    combos: comboStore,
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'combo:stream-combo',
        stream: true,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /chunk from groq/);
    assert.match(body, /upstream_stream_error/);
    assert.match(body, /groq mid-stream crash/);
    assert.match(body, /data: \[DONE\]/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    comboStore.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('supports tool-call-only streaming in combo model', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freeroute-combo-tool-'));
  const dbPath = join(dir, 'freeroute.sqlite');
  const comboStore = createSqliteComboStore(dbPath);
  comboStore.put({
    comboId: 'tool-combo',
    name: 'Tool Combo',
    models: ['cerebras/llama-tool'],
  });

  const cerebrasAdapter: ChatProviderAdapter = {
    providerId: 'cerebras',
    async chat() { return { id: 'x', model: 'llama-tool', content: 'x' }; },
    async *streamChat() {
      yield {
        id: 'c1',
        model: 'llama-tool',
        toolCalls: [{ id: 'call_abc', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Tokyo"}' } }],
      };
      yield { id: 'c2', model: 'llama-tool', finishReason: 'tool_calls' };
    },
  };
  const chat = new ChatService({
    candidates: async () => [
      { providerId: 'cerebras', modelId: 'llama-tool', credentialId: 'c2', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
    ],
    adapters: new Map([['cerebras', cerebrasAdapter]]),
  });

  const server = createFreeRouteServer({
    catalog: new InMemoryCatalogStore(),
    apiToken: 'test-token',
    chat,
    combos: comboStore,
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'combo:tool-combo',
        stream: true,
        messages: [{ role: 'user', content: 'weather' }],
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /get_weather/);
    assert.match(body, /Tokyo/);
    assert.match(body, /data: \[DONE\]/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    comboStore.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('combo stream falls back from failing model to working model and emits Copilot-compatible SSE chunks', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freeroute-combo-fb-stream-'));
  const dbPath = join(dir, 'freeroute.sqlite');
  const comboStore = createSqliteComboStore(dbPath);
  comboStore.put({
    comboId: 'fb-stream-combo',
    name: 'Fallback Stream Combo',
    models: ['groq/broken-model', 'cerebras/good-model'],
  });

  const groqAdapter: ChatProviderAdapter = {
    providerId: 'groq',
    async chat() { throw new Error('groq down'); },
    async *streamChat() {
      throw new Error('groq upstream connection failed');
    },
  };

  const cerebrasAdapter: ChatProviderAdapter = {
    providerId: 'cerebras',
    async chat() { return { id: 'x', model: 'good-model', content: 'x' }; },
    async *streamChat() {
      yield {
        id: 'c1',
        model: 'good-model',
        toolCalls: [{ id: 'call_123', type: 'function', function: { name: 'calculator', arguments: '{"expr":"2+2"}' } }],
      };
      yield { id: 'c2', model: 'good-model', finishReason: 'tool_calls' };
    },
  };

  const chat = new ChatService({
    candidates: async () => [
      { providerId: 'groq', modelId: 'broken-model', credentialId: 'c1', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
      { providerId: 'cerebras', modelId: 'good-model', credentialId: 'c2', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
    ],
    adapters: new Map([['groq', groqAdapter], ['cerebras', cerebrasAdapter]]),
  });

  const server = createFreeRouteServer({
    catalog: new InMemoryCatalogStore(),
    apiToken: 'test-token',
    chat,
    combos: comboStore,
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'combo:fb-stream-combo',
        stream: true,
        tools: [{ type: 'function', function: { name: 'calculator', parameters: {} } }],
        messages: [{ role: 'user', content: 'calc' }],
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-freeroute-provider'), 'cerebras');
    assert.equal(res.headers.get('x-freeroute-model'), 'good-model');
    const body = await res.text();
    // 1. Initial assistant role chunk
    assert.match(body, /"delta":\{"role":"assistant"\}/);
    // 2. Tool calls chunk with index and function arguments
    assert.match(body, /calculator/);
    assert.match(body, /2\+2/);
    // 3. Dedicated terminal chunk with finish_reason: tool_calls
    assert.match(body, /"finish_reason":"tool_calls"/);
    // 4. Proper DONE
    assert.match(body, /data: \[DONE\]/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    comboStore.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('combo returns HTTP 503 JSON when all combo models fail', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freeroute-combo-exhaust-'));
  const dbPath = join(dir, 'freeroute.sqlite');
  const comboStore = createSqliteComboStore(dbPath);
  comboStore.put({
    comboId: 'failing-combo',
    name: 'Failing Combo',
    models: ['groq/broken-1', 'cerebras/broken-2'],
  });

  const chat = new ChatService({
    candidates: async () => [
      { providerId: 'groq', modelId: 'broken-1', credentialId: 'c1', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
      { providerId: 'cerebras', modelId: 'broken-2', credentialId: 'c2', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
    ],
    adapters: new Map([
      ['groq', { providerId: 'groq', async chat() { throw new Error('groq 500'); }, async *streamChat() { throw new Error('groq 500'); } }],
      ['cerebras', { providerId: 'cerebras', async chat() { throw new Error('cerebras 500'); }, async *streamChat() { throw new Error('cerebras 500'); } }],
    ]),
  });

  const server = createFreeRouteServer({
    catalog: new InMemoryCatalogStore(),
    apiToken: 'test-token',
    chat,
    combos: comboStore,
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'combo:failing-combo',
        stream: true,
        messages: [{ role: 'user', content: 'test' }],
      }),
    });
    assert.equal(res.status, 503);
    const body = await res.json() as { error: { message: string; type: string } };
    assert.equal(body.error.type, 'combo_exhausted');
    assert.match(body.error.message, /Không có model nào trong combo/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    comboStore.close();
    await rm(dir, { recursive: true, force: true });
  }
});


