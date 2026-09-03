import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { InMemoryCatalogStore } from '../src/catalog.js';
import { ChatService, type ChatProviderAdapter } from '../src/inference.js';
import { createFreeRouteServer } from '../src/server.js';
import { SqliteRoutingEventStore } from '../src/storage/sqlite-routing-event-store.js';

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

test('serves a local dashboard without embedding an API token', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/`, { headers: { authorization: 'Bearer local-token' } });
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /<title>FreeRoute<\/title>/);
    assert.doesNotMatch(html, /local-token/);
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

test('includes a request ID and exposes only redacted routing events', async () => {
  const events = new SqliteRoutingEventStore(':memory:');
  const adapter: ChatProviderAdapter = { providerId: 'groq', async chat() { return { id: 'chat-2', model: 'llama-free', content: 'done' }; } };
  const chat = new ChatService({ candidates: async () => [{ providerId: 'groq', modelId: 'llama-free', credentialId: 'private-credential', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }], adapters: new Map([['groq', adapter]]), onEvent: (event) => events.record(event) });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', chat, events });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'groq/llama-free', messages: [{ role: 'user', content: 'sensitive prompt' }] }) });
    assert.match(response.headers.get('x-freeroute-request-id') ?? '', /^[0-9a-f-]{36}$/);
    const eventResponse = await fetch(`http://127.0.0.1:${port}/v1/routing-events`, { headers: { authorization: 'Bearer local-token' } });
    const body = await eventResponse.json() as { data: Array<{ credentialRef: string }> };
    assert.deepEqual(body.data.map((event) => event.credentialRef), ['***ential']);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); events.close(); }
});

test('summarizes redacted routing outcomes as provider health', async () => {
  const events = new SqliteRoutingEventStore(':memory:');
  await events.record({ requestId: 'success', occurredAt: new Date(), profile: 'auto:free', providerId: 'groq', modelId: 'fast', credentialRef: '***local', fallbackCount: 0, outcome: 'success', latencyMs: 100 });
  await events.record({ requestId: 'failure', occurredAt: new Date(), profile: 'auto:free', providerId: 'groq', modelId: 'fast', credentialRef: '***local', fallbackCount: 0, outcome: 'failure', failureKind: 'rate_limit' });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', events });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/provider-health`, { headers: { authorization: 'Bearer local-token' } });
    assert.equal(response.status, 200);
    const body = await response.json() as { data: Array<{ providerId: string; requestCount: number; successRate: number; latencyP50Ms?: number; latencyP95Ms?: number }> };
    assert.deepEqual(body.data, [{ providerId: 'groq', requestCount: 2, successRate: 0.5, latencyP50Ms: 100, latencyP95Ms: 100 }]);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); events.close(); }
});

test('translates a Responses API request into routed chat output', async () => {
  const adapter: ChatProviderAdapter = { providerId: 'openrouter', async chat(input) { assert.deepEqual(input.request.messages, [{ role: 'user', content: 'hello responses' }]); return { id: 'resp-1', model: 'free-model', content: 'response API answer' }; } };
  const chat = new ChatService({ candidates: async () => [{ providerId: 'openrouter', modelId: 'free-model', credentialId: 'local', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }], adapters: new Map([['openrouter', adapter]]) });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'openrouter/free-model', input: 'hello responses' }) });
    assert.equal(response.status, 200);
    const body = await response.json() as { object: string; output_text: string; output: Array<{ content: Array<{ text: string }> }> };
    assert.equal(body.object, 'response');
    assert.equal(body.output_text, 'response API answer');
    assert.equal(body.output[0]?.content[0]?.text, 'response API answer');
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('streams Responses API events for Codex-oriented clients', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'openrouter', async chat() { return { id: 'unused', model: 'free-model', content: 'unused' }; },
    async *streamChat() { yield { id: 'chunk-1', model: 'free-model', delta: 'hello' }; yield { id: 'chunk-1', model: 'free-model', finishReason: 'stop' }; },
  };
  const chat = new ChatService({ candidates: async () => [{ providerId: 'openrouter', modelId: 'free-model', credentialId: 'local', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }], adapters: new Map([['openrouter', adapter]]) });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'openrouter/free-model', input: 'hello', stream: true }) });
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const body = await response.text();
    assert.match(body, /event: response\.created/);
    assert.match(body, /event: response\.output_text\.delta/);
    assert.match(body, /"delta":"hello"/);
    assert.match(body, /event: response\.completed/);
    assert.match(body, /data: \[DONE\]/);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('translates an Anthropic Messages request into routed chat output', async () => {
  const adapter: ChatProviderAdapter = { providerId: 'openrouter', async chat(input) { assert.deepEqual(input.request.messages, [{ role: 'system', content: 'be concise' }, { role: 'user', content: 'hello anthropic' }]); return { id: 'claude-1', model: 'free-model', content: 'anthropic-compatible answer' }; } };
  const chat = new ChatService({ candidates: async () => [{ providerId: 'openrouter', modelId: 'free-model', credentialId: 'local', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }], adapters: new Map([['openrouter', adapter]]) });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'openrouter/free-model', system: 'be concise', max_tokens: 100, messages: [{ role: 'user', content: 'hello anthropic' }] }) });
    assert.equal(response.status, 200);
    const body = await response.json() as { type: string; content: Array<{ text: string }> };
    assert.equal(body.type, 'message');
    assert.equal(body.content[0]?.text, 'anthropic-compatible answer');
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('streams Anthropic Messages events for Claude-oriented clients', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'openrouter', async chat() { return { id: 'unused', model: 'free-model', content: 'unused' }; },
    async *streamChat() { yield { id: 'chunk-1', model: 'free-model', delta: 'hello' }; yield { id: 'chunk-1', model: 'free-model', finishReason: 'stop' }; },
  };
  const chat = new ChatService({ candidates: async () => [{ providerId: 'openrouter', modelId: 'free-model', credentialId: 'local', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }], adapters: new Map([['openrouter', adapter]]) });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: 'openrouter/free-model', max_tokens: 100, stream: true, messages: [{ role: 'user', content: 'hello' }] }) });
    assert.equal(response.headers.get('content-type'), 'text/event-stream; charset=utf-8');
    const body = await response.text();
    assert.match(body, /event: message_start/);
    assert.match(body, /event: content_block_delta/);
    assert.match(body, /"text":"hello"/);
    assert.match(body, /event: message_stop/);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('accepts vision content parts in chat messages', async () => {
  const adapter: ChatProviderAdapter = { providerId: 'groq', async chat(input) {
    assert.ok(Array.isArray(input.request.messages[0].content));
    return { id: 'vision-1', model: 'llama-free', content: 'seen image' };
  }};
  const chat = new ChatService({ candidates: async () => [{ providerId: 'groq', modelId: 'llama-free', credentialId: 'local', capabilities: ['chat', 'vision'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }], adapters: new Map([['groq', adapter]]) });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'groq/llama-free', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.com/image.png' } }] }] }) });
    assert.equal(response.status, 200);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('rejects requests without the unified local API token', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/models`);
    assert.equal(response.status, 401);
  });
});

test('routes a request with response_format through a structured-output-capable adapter', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'groq',
    async chat(input) {
      assert.ok(input.request.responseFormat, 'responseFormat should be forwarded to adapter');
      return { id: 'chat-json', model: 'llama-free', content: '{"key":"value"}' };
    },
  };
  const chat = new ChatService({
    candidates: async () => [{ providerId: 'groq', modelId: 'llama-free', credentialId: 'local', capabilities: ['chat', 'structured-output'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }],
    adapters: new Map([['groq', adapter]]),
  });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'groq/llama-free', messages: [{ role: 'user', content: 'return json' }], response_format: { type: 'json_object' } }) });
    assert.equal(response.status, 200);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});

test('rejects a request with an invalid response_format type', async () => {
  const adapter: ChatProviderAdapter = { providerId: 'groq', async chat() { return { id: 'unused', model: 'llama-free', content: 'ignored' }; } };
  const chat = new ChatService({ candidates: async () => [{ providerId: 'groq', modelId: 'llama-free', credentialId: 'local', capabilities: ['chat', 'structured-output'], freeTier: 'free_verified', checkedAt: new Date(), priority: 0, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 }], adapters: new Map([['groq', adapter]]) });
  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'local-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: 'Bearer local-token', 'content-type': 'application/json' }, body: JSON.stringify({ model: 'groq/llama-free', messages: [{ role: 'user', content: 'hi' }], response_format: { type: 'text' } }) });
    assert.equal(response.status, 400);
    const body = await response.json() as { error: { message: string } };
    assert.match(body.error.message, /response_format/);
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
});
