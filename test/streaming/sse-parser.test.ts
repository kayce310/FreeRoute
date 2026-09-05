import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSSE, splitSSE, formatSSE } from '../../src/streaming/sse-parser.js';

test('parseSSE handles newline-terminated chunks', () => {
  const buffer = 'data: {"id":"1"}\n\ndata: {"id":"2"}\n\n';
  const events = parseSSE(buffer);
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].data, '{"id":"1"}');
  assert.strictEqual(events[1].data, '{"id":"2"}');
});

test('parseSSE handles non-newline-terminated chunk', () => {
  const buffer = 'data: {"id":"1"}';
  const events = parseSSE(buffer);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].data, '{"id":"1"}');
});

test('parseSSE ignores empty lines', () => {
  const buffer = 'data: hello\n\ndata: world\n\n';
  const events = parseSSE(buffer);
  assert.strictEqual(events.length, 2);
});

test('splitSSE separates complete lines from pending', () => {
  const buffer = 'data: line1\n\ndata: line2';
  const result = splitSSE(buffer);
  assert.strictEqual(result.pending, 'data: line2');
  assert.strictEqual(result.completeLines.length, 2);
});

test('formatSSE wraps data with data: prefix', () => {
  const formatted = formatSSE('{"test":true}');
  assert.strictEqual(formatted, 'data: {"test":true}\n\n');
});

test('parseSSE handles mixed content lines', () => {
  const buffer = ': heartbeat\nevent: message\ndata: {"ok":true}\n\n';
  const events = parseSSE(buffer);
  assert.strictEqual(events.length, 1);
});
