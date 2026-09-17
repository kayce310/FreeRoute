import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureToolCallIds, fixMissingToolResponses } from '../src/translators/concerns/toolCall.js';
import { createFreeRouteServer } from '../src/server.js';
import { ChatService, type ChatProviderAdapter } from '../src/inference.js';
import { InMemoryCatalogStore } from '../src/catalog.js';
import type { AddressInfo } from 'node:net';

test('toolCall concern: sanitizes tool IDs and generates missing ones', () => {
  const body: any = {
    tools: [
      { type: 'function', function: { name: 'invalid.tool.name#123' } }
    ],
    messages: [
      {
        role: 'assistant',
        tool_calls: [
          { id: 'invalid id with spaces!', type: 'function', function: { name: 'calc', arguments: { a: 1 } } }
        ]
      },
      {
        role: 'tool',
        tool_call_id: 'invalid id with spaces!',
        content: '42'
      }
    ]
  };

  ensureToolCallIds(body);

  // Tool name sanitized
  assert.equal(body.tools[0].function.name, 'invalidtoolname123');

  // Tool call id sanitized and arguments stringified
  const tc = body.messages[0].tool_calls[0];
  assert.match(tc.id, /^[a-zA-Z0-9_-]+$/);
  assert.equal(typeof tc.function.arguments, 'string');
  assert.equal(tc.function.arguments, '{"a":1}');

  // Tool response id sanitized
  assert.match(body.messages[1].tool_call_id, /^[a-zA-Z0-9_-]+$/);
});

test('toolCall concern: fixMissingToolResponses fills empty tool result for orphaned tool call', () => {
  const body: any = {
    messages: [
      {
        role: 'assistant',
        tool_calls: [
          { id: 'call_123', type: 'function', function: { name: 'search', arguments: '{}' } }
        ]
      },
      {
        role: 'user',
        content: 'Now do this other thing'
      }
    ]
  };

  fixMissingToolResponses(body);

  // An empty tool response message should be injected between assistant and next user turn
  assert.equal(body.messages.length, 3);
  assert.equal(body.messages[1].role, 'tool');
  assert.equal(body.messages[1].tool_call_id, 'call_123');
  assert.equal(body.messages[1].content, '');
  assert.equal(body.messages[2].role, 'user');
});

test('Server SSE Wire Contract: emits initial assistant role chunk, delta chunks with null finish_reason, and final dedicated finish chunk with tool_calls override', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'test-prov',
    async chat() {
      return {
        id: 'test-res',
        model: 'test-model',
        content: 'done'
      };
    },
    async *streamChat() {
      // 1. Tool call chunk
      yield {
        id: 'ev-1',
        model: 'test-model',
        toolCalls: [
          { id: 'call-abc', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Hanoi"}' } }
        ]
      };
      // 2. Upstream signals 'stop' (Gemini or Anthropic or OpenAI might report 'stop')
      yield {
        id: 'ev-2',
        model: 'test-model',
        finishReason: 'stop'
      };
    }
  };

  const chat = new ChatService({
    candidates: async () => [{
      providerId: 'test-prov',
      modelId: 'test-model',
      credentialId: 'cred-1',
      capabilities: ['chat', 'streaming', 'tools'],
      freeTier: 'free_verified',
      checkedAt: new Date(),
      priority: 0,
      preference: 'neutral',
      healthScore: 1,
      latencyScore: 1,
      quotaScore: 1
    }],
    adapters: new Map([['test-prov', adapter]])
  });

  const server = createFreeRouteServer({ catalog: new InMemoryCatalogStore(), apiToken: 'test-token', chat });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'test-prov/test-model',
        stream: true,
        messages: [{ role: 'user', content: 'What is the weather?' }]
      })
    });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');

    const text = await res.text();
    const rawChunks = text.split('\n\n').map(c => c.trim()).filter(c => c.startsWith('data:') && c !== 'data: [DONE]');
    const chunks = rawChunks.map(c => JSON.parse(c.slice(5).trim()));

    // Chunk 0: Initial assistant role chunk
    assert.ok(chunks.length >= 3, `Expected at least 3 chunks, got ${chunks.length}`);
    const chunk0 = chunks[0];
    assert.equal(chunk0.choices[0].delta.role, 'assistant');
    assert.equal(chunk0.choices[0].finish_reason, null);

    // Chunk 1: Tool call delta chunk (finish_reason MUST be null)
    const chunk1 = chunks[1];
    assert.ok(chunk1.choices[0].delta.tool_calls);
    assert.equal(chunk1.choices[0].delta.tool_calls[0].function.name, 'get_weather');
    assert.equal(chunk1.choices[0].finish_reason, null);

    // Last Chunk: Dedicated terminal chunk (delta MUST be {}, finish_reason MUST be 'tool_calls')
    const lastChunk = chunks[chunks.length - 1];
    assert.deepEqual(lastChunk.choices[0].delta, {});
    assert.equal(lastChunk.choices[0].finish_reason, 'tool_calls', 'STOP should be overridden to tool_calls because tool calls were emitted');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
});
