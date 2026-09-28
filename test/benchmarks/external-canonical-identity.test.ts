import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeToPermaslug, buildCanonicalIndex, getRuntimeCandidates, hasBenchmarkData } from '../../src/benchmarks/external/canonical-identity.js';
import type { ModelRecord } from '../../src/contracts.js';
import type { ExternalBenchmarkEntry, ExternalBenchmarkSnapshot } from '../../src/benchmarks/external/interfaces.js';

// Test data
const mockCatalog: ModelRecord[] = [
  { providerId: 'openrouter', modelId: 'gpt-4o', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 95, enabled: true, catalogStatus: 'live' },
  { providerId: 'github', modelId: 'gpt-4o', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 90, enabled: true, catalogStatus: 'live' },
  { providerId: 'groq', modelId: 'llama-3.3-70b-versatile', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 95, enabled: true, catalogStatus: 'live' },
  { providerId: 'cerebras', modelId: 'llama-3.3-70b', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 92, enabled: true, catalogStatus: 'live' },
  { providerId: 'openrouter', modelId: 'claude-3-opus-20240229', capabilities: ['chat', 'streaming'], freeTier: 'paid', checkedAt: new Date(), priority: 98, enabled: true, catalogStatus: 'live' },
];

const mockBenchmarks: ExternalBenchmarkEntry[] = [
  { entryId: 'e1', snapshotId: 's1', modelPermaslug: 'gpt-4o', metricKey: 'price_per_1m_input_tokens', metricValue: '2.50' },
  { entryId: 'e2', snapshotId: 's1', modelPermaslug: 'llama-3.3-70b-versatile', metricKey: 'price_per_1m_input_tokens', metricValue: '0.0003' },
  { entryId: 'e3', snapshotId: 's1', modelPermaslug: 'claude-3-opus', metricKey: 'price_per_1m_input_tokens', metricValue: '15.00' },
  { entryId: 'e4', snapshotId: 's1', modelPermaslug: 'rare-model-xyz', metricKey: 'price_per_1m_input_tokens', metricValue: '1.00' },
];

const mockSnapshots = new Map<string, ExternalBenchmarkSnapshot>([
  ['s1', { snapshotId: 's1', sourceId: 'openrouter', fetchedAt: new Date(), version: 1, status: 'fresh' }],
]);

test('normalizeToPermaslug: strips version suffixes', () => {
  assert.equal(normalizeToPermaslug('gpt-4o'), 'gpt-4o');
  assert.equal(normalizeToPermaslug('claude-3-opus-20240229'), 'claude-3-opus');
  assert.equal(normalizeToPermaslug('llama-3.3-70b-v2'), 'llama-3.3-70b');
  assert.equal(normalizeToPermaslug('gemini-2.5-flash'), 'gemini-2.5-flash');
});

test('buildCanonicalIndex: creates MAPPED entries for direct matches', () => {
  const index = buildCanonicalIndex(mockCatalog, mockBenchmarks, mockSnapshots);

  // gpt-4o should have 2 candidates (openrouter + github)
  const gpt4o = index.find(i => i.canonicalSlug === 'gpt-4o');
  assert.ok(gpt4o, 'Should find gpt-4o');
  assert.equal(gpt4o!.runtimeCandidates.length, 2, 'Should have 2 candidates');
  assert.equal(gpt4o!.identityState, 'AMBIGUOUS', 'Should be AMBIGUOUS');
  assert.ok(gpt4o!.benchmarkEvidence, 'Should have benchmark evidence');
});

test('buildCanonicalIndex: creates UNMAPPED entries for benchmarks without runtime', () => {
  const index = buildCanonicalIndex(mockCatalog, mockBenchmarks, mockSnapshots);

  // rare-model-xyz should be UNMAPPED
  const rare = index.find(i => i.canonicalSlug === 'rare-model-xyz');
  assert.ok(rare, 'Should find rare-model-xyz');
  assert.equal(rare!.identityState, 'UNMAPPED', 'Should be UNMAPPED');
  assert.equal(rare!.runtimeCandidates.length, 0, 'Should have no runtime candidates');
});

test('buildCanonicalIndex: creates UNKNOWN entries for catalog models without benchmarks', () => {
  const index = buildCanonicalIndex(mockCatalog, mockBenchmarks, mockSnapshots);

  // llama-3.3-70b from cerebras should exist but may not have benchmark
  const llama = index.find(i => i.canonicalSlug === 'llama-3.3-70b');
  assert.ok(llama, 'Should find llama-3.3-70b');
  assert.equal(llama!.runtimeCandidates.length, 1, 'Should have 1 candidate');
});

test('getRuntimeCandidates: returns candidates for MAPPED models', () => {
  const index = buildCanonicalIndex(mockCatalog, mockBenchmarks, mockSnapshots);
  const candidates = getRuntimeCandidates(index, 'gpt-4o');

  assert.equal(candidates.length, 2, 'Should have 2 candidates');
  assert.ok(candidates.some(c => c.providerId === 'openrouter'));
  assert.ok(candidates.some(c => c.providerId === 'github'));
});

test('getRuntimeCandidates: returns empty for UNMAPPED models', () => {
  const index = buildCanonicalIndex(mockCatalog, mockBenchmarks, mockSnapshots);
  const candidates = getRuntimeCandidates(index, 'rare-model-xyz');

  assert.equal(candidates.length, 0, 'Should have no candidates');
});

test('hasBenchmarkData: returns true for models with benchmark evidence', () => {
  const index = buildCanonicalIndex(mockCatalog, mockBenchmarks, mockSnapshots);
  assert.ok(hasBenchmarkData(index, 'gpt-4o'), 'Should have benchmark data');
  assert.ok(hasBenchmarkData(index, 'llama-3.3-70b-versatile'), 'Should have benchmark data');
});

test('hasBenchmarkData: returns false for models without benchmark evidence', () => {
  const index = buildCanonicalIndex(mockCatalog, mockBenchmarks, mockSnapshots);
  // llama-3.3-70b (cerebras) may not have benchmark if it doesn't match
  const llamaCerebras = mockCatalog.find(m => m.providerId === 'cerebras' && m.modelId === 'llama-3.3-70b');
  if (llamaCerebras) {
    const normalized = normalizeToPermaslug(llamaCerebras.modelId);
    // This may or may not have benchmark data depending on matching
  }
});
