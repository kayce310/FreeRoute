import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalRequest, assembleToolCalls } from '../src/canonical.js';

test('createCanonicalRequest extracts messages and vision flag', () => {
  const request = {
    profile: 'auto:free',
    requiredCapabilities: ['chat'] as const,
    messages: [{ role: 'user' as const, content: 'hello' }],
    requestedModel: 'test-model',
    temperature: 0.7,
  };
  const canonical = createCanonicalRequest(request as any);
  assert.strictEqual(canonical.model, 'test-model');
  assert.strictEqual(canonical.messages.length, 1);
  assert.strictEqual(canonical.hasVision, false);
});

test('createCanonicalRequest detects vision from image_url content', () => {
  const request = {
    profile: 'auto:free',
    requiredCapabilities: ['chat'],
    messages: [{ role: 'user', content: [{ type: 'image_url' as const, image_url: { url: 'data:image/png;base64,abc' } }] }],
    requestedModel: 'vision-model',
  };
  const canonical = createCanonicalRequest(request as any);
  assert.strictEqual(canonical.hasVision, true);
});

test('createCanonicalRequest strips system message to text', () => {
  const request = {
    profile: 'auto:free',
    requiredCapabilities: ['chat'],
    messages: [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'hello' },
    ],
    requestedModel: 'test-model',
  };
  const canonical = createCanonicalRequest(request as any);
  assert.strictEqual(canonical.messages.length, 2);
  assert.strictEqual(canonical.messages[0].content, 'You are helpful.');
  assert.strictEqual(canonical.messages[0].role, 'system');
});

test('assembleToolCalls merges fragmented tool call chunks', () => {
  const events = [
    { id: '1', toolCallDelta: { index: 0, id: 'tc-1', name: 'search', argumentFragment: '{"query": "hello' } },
    { id: '2', toolCallDelta: { index: 0, id: 'tc-1', name: undefined, argumentFragment: '"}' } },
    { id: '3', toolCallDelta: { index: 1, id: 'tc-2', name: undefined, argumentFragment: '"world"' } },
  ];
  const calls = assembleToolCalls(events);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].function.name, 'search');
  assert.strictEqual(calls[0].function.arguments, '{"query": "hello"}');
  assert.strictEqual(calls[1].function.arguments, '"world"');
});

test('assembleToolCalls returns empty array for no toolCallDelta', () => {
  const calls = assembleToolCalls([{ id: '1', text: 'hello' }]);
  assert.strictEqual(calls.length, 0);
});
