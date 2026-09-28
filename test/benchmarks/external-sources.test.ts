import assert from 'node:assert/strict';
import test from 'node:test';
import { BUILTIN_EXTERNAL_SOURCES, getExternalSource, getEnabledSources } from '../../src/benchmarks/external/sources.js';

test('BUILTIN_EXTERNAL_SOURCES: has expected sources', () => {
  const sourceIds = BUILTIN_EXTERNAL_SOURCES.map(s => s.sourceId);
  assert.ok(sourceIds.includes('openrouter'), 'Should have openrouter');
  assert.ok(sourceIds.includes('huggingface'), 'Should have huggingface');
  assert.ok(sourceIds.includes('lmsys'), 'Should have lmsys');
});

test('getExternalSource: returns source by ID', () => {
  const source = getExternalSource('openrouter');
  assert.ok(source, 'Should find openrouter source');
  assert.equal(source!.sourceId, 'openrouter');
});

test('getExternalSource: returns undefined for unknown', () => {
  const source = getExternalSource('unknown-source');
  assert.equal(source, undefined, 'Should return undefined for unknown');
});

test('getEnabledSources: returns only enabled sources', () => {
  const enabled = getEnabledSources();
  const enabledIds = enabled.map(s => s.sourceId);
  
  assert.ok(enabledIds.includes('openrouter'), 'openrouter should be enabled');
  assert.ok(enabledIds.includes('huggingface'), 'huggingface should be enabled');
  assert.ok(!enabledIds.includes('artificial_analysis'), 'artificial_analysis should be disabled');
});

test('sources: have valid TTL values', () => {
  for (const source of BUILTIN_EXTERNAL_SOURCES) {
    assert.ok(source.ttlMs > 0, `${source.sourceId} should have positive TTL`);
  }
});
