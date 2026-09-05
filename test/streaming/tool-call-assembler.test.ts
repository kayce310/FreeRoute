import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleToolCalls, extractToolCallDelta } from '../../src/streaming/tool-call-assembler.js';

test('assembleToolCalls merges fragmented chunks into complete tool call', () => {
  const fragments = [
    { index: 0, id: 'tc-1', name: 'search', argumentFragment: '{"query": "hello' },
    { index: 0, id: 'tc-1', name: undefined, argumentFragment: '"}' },
  ];
  const calls = assembleToolCalls(fragments);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].function.name, 'search');
  assert.strictEqual(calls[0].function.arguments, '{"query": "hello"}');
});

test('assembleToolCalls sorts by index', () => {
  const fragments = [
    { index: 1, id: 'tc-2', argumentFragment: '"world"' },
    { index: 0, id: 'tc-1', name: 'search', argumentFragment: '{"query": "test"' },
    { index: 0, id: 'tc-1', argumentFragment: '}' },
  ];
  const calls = assembleToolCalls(fragments);
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(calls[0].function.name, 'search');
});

test('assembleToolCalls returns empty for no fragments', () => {
  const calls = assembleToolCalls([]);
  assert.strictEqual(calls.length, 0);
});

test('assembleToolCalls returns empty for chunks with empty argumentFragment only when no fragments at all', () => {
  const calls = assembleToolCalls([]);
  assert.strictEqual(calls.length, 0);
});

test('extractToolCallDelta returns undefined for no arguments', () => {
  const delta = extractToolCallDelta('tc-1', undefined, 0);
  assert.strictEqual(delta, undefined);
});

test('extractToolCallDelta returns fragment when arguments present', () => {
  const delta = extractToolCallDelta('tc-1', { arguments: '{"key":1}', name: 'foo' }, 0);
  assert.notStrictEqual(delta, undefined);
  assert.strictEqual(delta!.id, 'tc-1');
  assert.strictEqual(delta!.name, 'foo');
  assert.strictEqual(delta!.argumentFragment, '{"key":1}');
});
