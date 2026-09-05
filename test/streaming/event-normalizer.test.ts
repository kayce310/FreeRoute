import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStreamEvents, mergeUsage, isErrorBeforeCommit } from '../../src/streaming/event-normalizer.js';

test('normalizeStreamEvents passes through chunks', () => {
  const chunks = [
    { id: '1', model: 'test', delta: 'hello' },
    { id: '2', model: 'test', finishReason: 'stop' },
  ];
  const result = normalizeStreamEvents(chunks);
  assert.strictEqual(result.events.length, 2);
  assert.strictEqual(result.events[0].delta, 'hello');
  assert.strictEqual(result.events[1].finishReason, 'stop');
});

test('normalizeStreamEvents handles empty chunks', () => {
  const result = normalizeStreamEvents([]);
  assert.strictEqual(result.events.length, 0);
});

test('mergeUsage returns last usage', () => {
  const events = [
    { usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
    { usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 } },
  ];
  const merged = mergeUsage(events);
  assert.strictEqual(merged?.totalTokens, 30);
});

test('mergeUsage returns undefined for empty', () => {
  const merged = mergeUsage([]);
  assert.strictEqual(merged, undefined);
});

test('isErrorBeforeCommit returns true when error is before any content', () => {
  const contentEvents = [{ id: '1', model: 'test', delta: 'text' }];
  const result = isErrorBeforeCommit(contentEvents, -1);
  assert.strictEqual(result, true);
});

test('isErrorBeforeCommit returns false when content precedes error', () => {
  const contentEvents = [
    { id: '1', model: 'test', delta: 'text' },
    { id: 'err', model: 'test', delta: undefined },
  ];
  const result = isErrorBeforeCommit(contentEvents, 1);
  assert.strictEqual(result, false);
});

test('isErrorBeforeCommit returns true when no content', () => {
  const contentEvents: any[] = [];
  const result = isErrorBeforeCommit(contentEvents, 0);
  assert.strictEqual(result, true);
});
