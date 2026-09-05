import assert from 'node:assert/strict';
import test from 'node:test';
import { GeminiAdapter } from '../src/providers/gemini.js';
import { ProviderInvocationError } from '../src/inference.js';

test('discovers Gemini text-generation models and translates a chat request', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const adapter = new GeminiAdapter({
    baseUrl: 'https://gemini.test/v1beta', getCredential: async () => 'gemini-secret',
    fetch: async (input, init) => {
      requests.push({ url: String(input), init });
      if (String(input).endsWith('/models')) return new Response(JSON.stringify({ models: [
        { name: 'models/gemini-text', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-embed', supportedGenerationMethods: ['embedContent'] },
      ] }), { status: 200 });
      return new Response(JSON.stringify({ responseId: 'gemini-response', modelVersion: 'gemini-text', candidates: [{ content: { parts: [{ text: 'Gemini answer' }] } }] }), { status: 200 });
    },
  });
  assert.deepEqual(await adapter.discoverModels('key'), [{ modelId: 'gemini-text', capabilities: ['chat', 'streaming', 'tools', 'vision'], freeTier: 'free_unverified' }]);
  const result = await adapter.chat({ credentialId: 'key', modelId: 'gemini-text', request: { profile: 'auto:free', requiredCapabilities: ['chat'], temperature: 0.2, messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hello' }] } });
  assert.equal(result.content, 'Gemini answer');
  assert.equal(requests[1]?.url, 'https://gemini.test/v1beta/models/gemini-text:generateContent');
  assert.equal((requests[1]?.init?.headers as Record<string, string>)['x-goog-api-key'], 'gemini-secret');
  assert.deepEqual(JSON.parse(String(requests[1]?.init?.body)), { contents: [{ role: 'user', parts: [{ text: 'hello' }] }], systemInstruction: { parts: [{ text: 'be brief' }] }, generationConfig: { temperature: 0.2 } });
});

test('translates Gemini native SSE chunks', async () => {
  const adapter = new GeminiAdapter({
    baseUrl: 'https://gemini.test/v1beta', getCredential: async () => 'gemini-secret',
    fetch: async () => new Response('data: {"responseId":"r1","candidates":[{"content":{"parts":[{"text":"hel"}]}}]}\n\ndata: {"responseId":"r1","candidates":[{"content":{"parts":[{"text":"lo"}]}}]}\n\n', { status: 200 }),
  });
  const events = [];
  for await (const event of adapter.streamChat({ credentialId: 'key', modelId: 'gemini-text', request: { profile: 'auto:free', requiredCapabilities: ['chat', 'streaming'], messages: [{ role: 'user', content: 'hello' }] } })) events.push(event.delta);
  assert.deepEqual(events, ['hel', 'lo']);
});

test('flushes the final Gemini SSE chunk without a trailing newline', async () => {
  const adapter = new GeminiAdapter({
    baseUrl: 'https://gemini.test/v1beta', getCredential: async () => 'gemini-secret',
    fetch: async () => new Response('data: {"responseId":"r1","candidates":[{"content":{"parts":[{"text":"last"}]}}]}', { status: 200 }),
  });
  const events = [];
  for await (const event of adapter.streamChat({ credentialId: 'key', modelId: 'gemini-text', request: { profile: 'auto:free', requiredCapabilities: ['chat', 'streaming'], messages: [{ role: 'user', content: 'hello' }] } })) events.push(event);
  assert.equal(events[0]?.delta, 'last');
});

test('translates OpenAI tools to Gemini function declarations', async () => {
  let requestBody: unknown;
  const adapter = new GeminiAdapter({
    baseUrl: 'https://gemini.test/v1beta', getCredential: async () => 'gemini-secret',
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ responseId: 'tool-response', candidates: [{ content: { parts: [{ functionCall: { name: 'lookup', args: { city: 'Hanoi' } } }] } }] }), { status: 200 });
    },
  });
  const result = await adapter.chat({
    credentialId: 'key',
    modelId: 'gemini-text',
    request: {
      profile: 'named', requiredCapabilities: ['chat', 'tools'],
      messages: [{ role: 'user', content: 'What is the weather?' }],
      tools: [{ type: 'function', function: { name: 'lookup', description: 'Look up weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } } }],
    },
  });
  assert.deepEqual(requestBody, {
    contents: [{ role: 'user', parts: [{ text: 'What is the weather?' }] }],
    tools: [{ functionDeclarations: [{ name: 'lookup', description: 'Look up weather', parameters: { type: 'object', properties: { city: { type: 'string' } } } }] }],
  });
  assert.equal(result.content, '');
  assert.equal(result.toolCalls?.[0]?.function.name, 'lookup');
  assert.equal(result.toolCalls?.[0]?.function.arguments, '{"city":"Hanoi"}');
});

test('classifies Gemini retryable and unsupported failures for router fallback', async () => {
  for (const [status, kind] of [[429, 'rate_limit'], [503, 'temporary'], [400, 'unsupported']] as const) {
    const adapter = new GeminiAdapter({ baseUrl: 'https://gemini.test/v1beta', getCredential: async () => 'secret', fetch: async () => new Response('{}', { status }) });
    await assert.rejects(
      adapter.chat({ credentialId: 'key', modelId: 'gemini-text', request: { profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hello' }] } }),
      (error: unknown) => error instanceof ProviderInvocationError && error.failure.kind === kind,
    );
  }
});
