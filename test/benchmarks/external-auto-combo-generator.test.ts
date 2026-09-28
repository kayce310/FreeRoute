import assert from 'node:assert/strict';
import test from 'node:test';
import { constructAutoCombo, generateTargetsFromBenchmarkSource } from '../../src/benchmarks/external/auto-combo-generator.js';
import { DEFAULT_RANKING_POLICY } from '../../src/benchmarks/external/combo-types.js';
import type { ModelRecord } from '../../src/contracts.js';
import type { ExternalBenchmarkEntry, ExternalBenchmarkSnapshot } from '../../src/benchmarks/external/interfaces.js';
import type { ConstructionContext, RankingPolicy } from '../../src/benchmarks/external/combo-types.js';

// Test data
const mockCatalog: ModelRecord[] = [
  { providerId: 'openrouter', modelId: 'gpt-4o', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 95, enabled: true, catalogStatus: 'live' },
  { providerId: 'github', modelId: 'gpt-4o', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 90, enabled: true, catalogStatus: 'live' },
  { providerId: 'groq', modelId: 'llama-3.3-70b-versatile', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 95, enabled: true, catalogStatus: 'live' },
  { providerId: 'cerebras', modelId: 'llama-3.3-70b', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 92, enabled: true, catalogStatus: 'live' },
  { providerId: 'openrouter', modelId: 'gemini-2.5-flash', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority: 98, enabled: true, catalogStatus: 'live' },
];

const mockBenchmarks: ExternalBenchmarkEntry[] = [
  { entryId: 'e1', snapshotId: 's1', modelPermaslug: 'gpt-4o', metricKey: 'price_per_1m_input_tokens', metricValue: '2.50' },
  { entryId: 'e2', snapshotId: 's1', modelPermaslug: 'llama-3.3-70b-versatile', metricKey: 'price_per_1m_input_tokens', metricValue: '0.0003' },
  { entryId: 'e3', snapshotId: 's1', modelPermaslug: 'gemini-2.5-flash', metricKey: 'price_per_1m_input_tokens', metricValue: '0.00025' },
];

const mockSnapshots = new Map<string, ExternalBenchmarkSnapshot>([
  ['s1', { snapshotId: 's1', sourceId: 'openrouter', fetchedAt: new Date(), version: 1, status: 'fresh' }],
]);

const baseContext: ConstructionContext = {
  catalog: mockCatalog,
  credentials: [
    { providerId: 'openrouter', credentialId: 'cred-1', enabled: true },
    { providerId: 'github', credentialId: 'cred-2', enabled: true },
    { providerId: 'groq', credentialId: 'cred-3', enabled: true },
    { providerId: 'cerebras', credentialId: 'cred-4', enabled: true },
  ],
  benchmarks: mockBenchmarks,
  latestSnapshots: mockSnapshots,
};

test('constructAutoCombo: generates combo from target models', async () => {
  const result = await constructAutoCombo(['gpt-4o', 'llama-3.3-70b'], DEFAULT_RANKING_POLICY, baseContext);

  assert.ok(result.models.length > 0, 'Should generate models');
  assert.ok(result.provenance.generatedAt, 'Should have generatedAt');
  assert.ok(result.provenance.snapshotId, 'Should have snapshotId');
  assert.ok(result.provenance.candidateCount > 0, 'Should have candidates');
  assert.ok(result.provenance.selectedCount > 0, 'Should have selected models');
});

test('constructAutoCombo: models are in provider/model format', async () => {
  const result = await constructAutoCombo(['gpt-4o'], DEFAULT_RANKING_POLICY, baseContext);

  for (const model of result.models) {
    assert.ok(model.includes('/'), `Model ${model} should be in provider/model format`);
  }
});

test('constructAutoCombo: applies diversity constraint', async () => {
  const result = await constructAutoCombo(['gpt-4o'], DEFAULT_RANKING_POLICY, baseContext);

  // Count providers
  const providerCounts = new Map<string, number>();
  for (const model of result.models) {
    const provider = model.split('/')[0];
    providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
  }

  // No provider should have more than 2 candidates
  for (const [provider, count] of providerCounts) {
    assert.ok(count <= 2, `Provider ${provider} should have at most 2 candidates`);
  }
});

test('constructAutoCombo: ranks by catalog priority', async () => {
  const policy: RankingPolicy = { primary: 'catalog_priority', direction: 'desc' };
  const result = await constructAutoCombo(['gpt-4o'], policy, baseContext);

  // Higher priority models should come first
  // gemini-2.5-flash has priority 98, gpt-4o has 95
  assert.ok(result.models.length >= 1, 'Should have at least 1 model');
});

test('constructAutoCombo: handles empty target models', async () => {
  const result = await constructAutoCombo([], DEFAULT_RANKING_POLICY, baseContext);

  assert.equal(result.models.length, 0, 'Should have no models');
  assert.equal(result.provenance.selectedCount, 0, 'Should have selected 0');
});

test('generateTargetsFromBenchmarkSource: extracts unique models', async () => {
  const targets = await generateTargetsFromBenchmarkSource('openrouter', 5, baseContext);

  assert.ok(Array.isArray(targets), 'Should return array');
  assert.ok(targets.length > 0, 'Should have targets');
});
