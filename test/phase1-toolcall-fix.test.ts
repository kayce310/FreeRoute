import assert from 'node:assert/strict';
import test from 'node:test';
import { ChatService, type ChatProviderAdapter, type NormalizedChatRequest } from '../src/inference.js';
import type { RouteCandidate } from '../src/contracts.js';

test('REGRESSION: Tool-call-only streaming (Phase 1 fix)', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'test-provider',
    async chat() {
      throw new Error('non-streaming not used');
    },
    async *streamChat() {
      // Tool-call-only: NO text delta
      yield {
        id: 'msg-1',
        model: 'test-model',
        toolCalls: [{
          id: 'call_test_1',
          type: 'function',
          function: { name: 'read_file', arguments: '{"path":"test.txt"}' }
        }],
      };
      yield {
        id: 'msg-1',
        model: 'test-model',
        finishReason: 'tool_calls',
      };
    },
  };

  const service = new ChatService({
    adapters: new Map([['test-provider', adapter]]),
    candidates: async () => [
      {
        providerId: 'test-provider',
        modelId: 'test-model',
        credentialId: 'test-cred',
        preference: 'neutral',
        capabilities: ['chat', 'streaming', 'tools'],
        freeTier: 'paid',
        checkedAt: new Date(),
        priority: 0,
        healthScore: 1,
        latencyScore: 1,
        quotaScore: 1,
      } as RouteCandidate,
    ],
  });

  const request: NormalizedChatRequest = {
    profile: 'test',
    requiredCapabilities: ['streaming'],
    messages: [{ role: 'user', content: 'test' }],
  };

  const result = await service.stream(request);
  
  // Collect events from generator
  const events = [];
  const toolCalls = [];
  for await (const event of result.events) {
    events.push(event);
    if (event.toolCalls) {
      toolCalls.push(...event.toolCalls);
    }
  }

  // Verify tool-calls were accumulated
  assert.strictEqual(toolCalls.length, 1, 'should have 1 tool-call');
  assert.strictEqual(toolCalls[0].function.name, 'read_file');
  assert.strictEqual(events.length, 2, 'should have 2 events');
  assert.strictEqual(events[0].toolCalls?.length, 1, 'first event has tool-call');
  assert.ok(true, '✓ Tool-call-only streaming succeeds (Bug #4 fixed)');
});

test('REGRESSION: Multiple tool-calls in stream (no duplication)', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'test-provider',
    async chat() {
      throw new Error('non-streaming not used');
    },
    async *streamChat() {
      yield {
        id: 'msg-1',
        model: 'test-model',
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'func_a', arguments: '{}' }
        }],
      };
      yield {
        id: 'msg-1',
        model: 'test-model',
        toolCalls: [{
          id: 'call_2',
          type: 'function',
          function: { name: 'func_b', arguments: '{}' }
        }],
      };
      yield {
        id: 'msg-1',
        model: 'test-model',
        finishReason: 'tool_calls',
      };
    },
  };

  const service = new ChatService({
    adapters: new Map([['test-provider', adapter]]),
    candidates: async () => [
      {
        providerId: 'test-provider',
        modelId: 'test-model',
        credentialId: 'test-cred',
        preference: 'neutral',
        capabilities: ['chat', 'streaming', 'tools'],
        freeTier: 'paid',
        checkedAt: new Date(),
        priority: 0,
        healthScore: 1,
        latencyScore: 1,
        quotaScore: 1,
      } as RouteCandidate,
    ],
  });

  const request: NormalizedChatRequest = {
    profile: 'test',
    requiredCapabilities: ['streaming'],
    messages: [{ role: 'user', content: 'test' }],
  };

  const result = await service.stream(request);
  
  const toolCalls = [];
  for await (const event of result.events) {
    if (event.toolCalls) {
      toolCalls.push(...event.toolCalls);
    }
  }

  assert.strictEqual(toolCalls.length, 2, 'should have 2 tool-calls total');
  assert.strictEqual(toolCalls[0].function.name, 'func_a');
  assert.strictEqual(toolCalls[1].function.name, 'func_b');
  assert.ok(true, '✓ Multiple tool-calls preserved without duplication (Bug #4 fixed)');
});

test('REGRESSION: Text + tool-call streaming', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'test-provider',
    async chat() {
      throw new Error('non-streaming not used');
    },
    async *streamChat() {
      yield {
        id: 'msg-1',
        model: 'test-model',
        delta: 'I ',
      };
      yield {
        id: 'msg-1',
        model: 'test-model',
        delta: 'will ',
      };
      yield {
        id: 'msg-1',
        model: 'test-model',
        toolCalls: [{
          id: 'call_1',
          type: 'function',
          function: { name: 'read_file', arguments: '{}' }
        }],
      };
      yield {
        id: 'msg-1',
        model: 'test-model',
        delta: 'the file.',
        finishReason: 'tool_calls',
      };
    },
  };

  const service = new ChatService({
    adapters: new Map([['test-provider', adapter]]),
    candidates: async () => [
      {
        providerId: 'test-provider',
        modelId: 'test-model',
        credentialId: 'test-cred',
        preference: 'neutral',
        capabilities: ['chat', 'streaming', 'tools'],
        freeTier: 'paid',
        checkedAt: new Date(),
        priority: 0,
        healthScore: 1,
        latencyScore: 1,
        quotaScore: 1,
      } as RouteCandidate,
    ],
  });

  const request: NormalizedChatRequest = {
    profile: 'test',
    requiredCapabilities: ['streaming'],
    messages: [{ role: 'user', content: 'test' }],
  };

  const result = await service.stream(request);
  
  let accumulatedText = '';
  const toolCalls = [];
  for await (const event of result.events) {
    if (event.delta) accumulatedText += event.delta;
    if (event.toolCalls) toolCalls.push(...event.toolCalls);
  }

  assert.strictEqual(accumulatedText, 'I will the file.');
  assert.strictEqual(toolCalls.length, 1);
  assert.ok(true, '✓ Text + tool-call streaming works (Bug #3 fixed)');
});

test('REGRESSION: Text-only streaming still works', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'test-provider',
    async chat() {
      throw new Error('non-streaming not used');
    },
    async *streamChat() {
      yield {
        id: 'msg-1',
        model: 'test-model',
        delta: 'Hello ',
      };
      yield {
        id: 'msg-1',
        model: 'test-model',
        delta: 'world',
        finishReason: 'stop',
      };
    },
  };

  const service = new ChatService({
    adapters: new Map([['test-provider', adapter]]),
    candidates: async () => [
      {
        providerId: 'test-provider',
        modelId: 'test-model',
        credentialId: 'test-cred',
        preference: 'neutral',
        capabilities: ['chat', 'streaming'],
        freeTier: 'paid',
        checkedAt: new Date(),
        priority: 0,
        healthScore: 1,
        latencyScore: 1,
        quotaScore: 1,
      } as RouteCandidate,
    ],
  });

  const request: NormalizedChatRequest = {
    profile: 'test',
    requiredCapabilities: ['streaming'],
    messages: [{ role: 'user', content: 'test' }],
  };

  const result = await service.stream(request);
  
  let accumulatedText = '';
  for await (const event of result.events) {
    if (event.delta) accumulatedText += event.delta;
  }

  assert.strictEqual(accumulatedText, 'Hello world');
  assert.ok(true, '✓ Text-only streaming still works (no regression)');
});
