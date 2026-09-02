import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { createOpenRouterRuntime } from '../src/app.js';
import { SqliteCredentialStore } from '../src/storage/sqlite-credential-store.js';

test('refreshes a local OpenRouter catalog and serves a direct chat request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freeroute-app-'));
  const databasePath = join(directory, 'freeroute.sqlite');
  const credentials = new SqliteCredentialStore(databasePath, 'test-master-secret-that-is-long-enough');
  await credentials.put('openrouter', 'imported-key', 'upstream-secret');
  credentials.close();
  const runtime = createOpenRouterRuntime({
    databasePath,
    masterSecret: 'test-master-secret-that-is-long-enough',
    apiToken: 'local-client-token',
    baseUrl: 'https://upstream.test/v1',
    fetch: async (input, init) => {
      assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer upstream-secret');
      if (input === 'https://upstream.test/v1/models') {
        return new Response(JSON.stringify({ data: [{ id: 'free-model', pricing: { prompt: '0', completion: '0' } }] }), { status: 200 });
      }
      assert.equal(input, 'https://upstream.test/v1/chat/completions');
      return new Response(JSON.stringify({ id: 'upstream-chat', model: 'free-model', choices: [{ message: { content: 'answer from OpenRouter' } }] }), { status: 200 });
    },
  });
  try {
    const result = await runtime.refreshOpenRouter();
    assert.deepEqual(result, { providerId: 'openrouter', status: 'updated', modelCount: 1 });
    await new Promise<void>((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
    const { port } = runtime.server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST', headers: { authorization: 'Bearer local-client-token', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'auto:free', messages: [{ role: 'user', content: 'hello' }] }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { choices: Array<{ message: { content: string } }> };
    assert.equal(body.choices[0]?.message.content, 'answer from OpenRouter');
  } finally {
    if (runtime.server.listening) await new Promise<void>((resolve, reject) => runtime.server.close((error) => error ? reject(error) : resolve()));
    runtime.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('wires an imported Groq credential through the reusable compatible adapter', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freeroute-groq-'));
  const databasePath = join(directory, 'freeroute.sqlite');
  const credentials = new SqliteCredentialStore(databasePath, 'test-master-secret-that-is-long-enough');
  await credentials.put('groq', 'imported-groq', 'groq-secret');
  credentials.close();
  const runtime = createOpenRouterRuntime({
    databasePath, masterSecret: 'test-master-secret-that-is-long-enough', apiToken: 'local-client-token', groqBaseUrl: 'https://groq.test/openai/v1',
    fetch: async (input, init) => {
      assert.equal(input, 'https://groq.test/openai/v1/models');
      assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer groq-secret');
      return new Response(JSON.stringify({ data: [{ id: 'llama-free' }] }), { status: 200 });
    },
  });
  try {
    assert.deepEqual(await runtime.refreshProviders(), [
      { providerId: 'openrouter', status: 'failed', error: 'credential not configured' },
      { providerId: 'groq', status: 'updated', modelCount: 1 },
      { providerId: 'gemini', status: 'failed', error: 'credential not configured' },
    ]);
  } finally { runtime.close(); await rm(directory, { recursive: true, force: true }); }
});
