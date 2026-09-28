/**
 * Phase 4 E2E Verification — no code changes, only verification.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createSqliteComboStore } from '../../src/storage/sqlite-combo-store.js';
import { InMemoryCatalogStore } from '../../src/catalog.js';
import { SqliteCredentialStore } from '../../src/storage/sqlite-credential-store.js';
import { SqliteRoutingEventStore } from '../../src/storage/sqlite-routing-event-store.js';
import { createFreeRouteServer } from '../../src/server.js';
import { ChatService, type ChatProviderAdapter } from '../../src/inference.js';
import { ExternalBenchmarkStorage } from '../../src/benchmarks/external/storage.js';
import type { ExternalBenchmarkSnapshot } from '../../src/benchmarks/external/interfaces.js';
import { constructAutoCombo } from '../../src/benchmarks/external/auto-combo-generator.js';
import { buildCanonicalIndex, normalizeToPermaslug, getRuntimeCandidates } from '../../src/benchmarks/external/canonical-identity.js';
import type { ConstructionContext } from '../../src/benchmarks/external/combo-types.js';
import type { ModelRecord } from '../../src/contracts.js';

const AUTH = 'Bearer e2e-token';
const JSON_AUTH = { authorization: AUTH, 'content-type': 'application/json' };

type SvcDeps = {
  dbPath: string;
  comboStore: ReturnType<typeof createSqliteComboStore>;
  catalog: InMemoryCatalogStore;
  creds: SqliteCredentialStore;
  events: SqliteRoutingEventStore;
  benchmarks: ExternalBenchmarkStorage | null;
};

async function makeServer(tmpDir: string): Promise<SvcDeps> {
  const dbPath = join(tmpDir, 'freeroute-e2e.sqlite');
  return {
    dbPath,
    comboStore: createSqliteComboStore(dbPath),
    catalog: new InMemoryCatalogStore(),
    creds: new SqliteCredentialStore(dbPath, 'master-secret-for-e2e-only'),
    events: new SqliteRoutingEventStore(dbPath),
    benchmarks: new ExternalBenchmarkStorage(tmpDir, 'bench-external-e2e.sqlite'),
  };
}

async function startServer(s: SvcDeps, chat: ChatService) {
  const srv = createFreeRouteServer({
    catalog: s.catalog,
    combos: s.comboStore,
    credentials: s.creds,
    events: s.events,
    externalBenchmarks: s.benchmarks ?? undefined,
    apiToken: 'e2e-token',
    chat,
  });
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const port = (srv.address() as AddressInfo).port;
  return { srv, port };
}

function makeCatalogRecord(provider: string, model: string, priority: number, enabled = true, status: 'live' | 'stale' = 'live'): ModelRecord {
  return { providerId: provider, modelId: model, capabilities: ['chat', 'streaming'], freeTier: 'free_verified', checkedAt: new Date(), priority, enabled, catalogStatus: status } as ModelRecord;
}

async function seedBenchmarks(bench: ExternalBenchmarkStorage) {
  const snap: ExternalBenchmarkSnapshot = {
    snapshotId: 'snap-e2e-1',
    sourceId: 'openrouter',
    fetchedAt: new Date('2024-06-01T00:00:00Z'),
    version: 1,
    status: 'fresh',
  };
  await bench.saveSnapshot(snap);
  await bench.saveEntries([
    { entryId: 'e-gpt4o', snapshotId: 'snap-e2e-1', modelPermaslug: 'gpt-4o', metricKey: 'price_per_1m_input_tokens', metricValue: '2.50' },
    { entryId: 'e-claude', snapshotId: 'snap-e2e-1', modelPermaslug: 'claude-3-opus', metricKey: 'price_per_1m_input_tokens', metricValue: '15.00' },
    { entryId: 'e-rare', snapshotId: 'snap-e2e-1', modelPermaslug: 'rare-unmapped-model', metricKey: 'price_per_1m_input_tokens', metricValue: '1.00' },
  ]);
}

// ── identity mapping ──────────────────────────────────────────────────────────

test('E2E: identity mapping — MAPPED / AMBIGUOUS / UNMAPPED / UNKNOWN', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-id-'));
  try {
    const { benchmarks } = await makeServer(tmp);
    await seedBenchmarks(benchmarks!);

    const catalog: ModelRecord[] = [
      makeCatalogRecord('openrouter', 'gpt-4o', 95),
      makeCatalogRecord('github', 'gpt-4o', 90),
      makeCatalogRecord('groq', 'llama-3.3-70b-versatile', 95),
      makeCatalogRecord('cerebras', 'llama-3.3-70b', 92),
      makeCatalogRecord('openrouter', 'gemini-2.5-flash', 98),
    ];
    const snapshots = await benchmarks!.listSnapshots();
    const snapMap = new Map<string, ExternalBenchmarkSnapshot>(snapshots.map((s: ExternalBenchmarkSnapshot) => [s.snapshotId, s]));
    const entriesResult = await benchmarks!.queryEntries({});
    const index = buildCanonicalIndex(catalog, entriesResult.entries, snapMap);

    const gpt4o = index.find((i: { canonicalSlug: string }) => i.canonicalSlug === 'gpt-4o');
    assert.equal(gpt4o!.identityState, 'AMBIGUOUS', 'gpt-4o should be AMBIGUOUS (2 candidates)');
    assert.equal(gpt4o!.runtimeCandidates.length, 2);
    assert.ok(gpt4o!.benchmarkEvidence, 'gpt-4o should have benchmark evidence');

    const llama = index.find((i: { canonicalSlug: string }) => i.canonicalSlug === 'llama-3.3-70b-versatile');
    assert.equal(llama!.identityState, 'MAPPED', 'llama-3.3-70b-versatile should be MAPPED');
    assert.equal(llama!.runtimeCandidates.length, 1);

    const rare = index.find((i: { canonicalSlug: string }) => i.canonicalSlug === 'rare-unmapped-model');
    assert.equal(rare!.identityState, 'UNMAPPED', 'rare model should be UNMAPPED');
    assert.equal(rare!.runtimeCandidates.length, 0);

    const unknown = index.find((i: { canonicalSlug: string }) => i.canonicalSlug === 'gemini-2.5-flash');
    // gemini-2.5-flash has 1 catalog entry but no benchmark → MAPPED (has runtime candidate)
    assert.equal(unknown!.identityState, 'MAPPED', 'gemini should be MAPPED (has runtime candidate, no benchmark)');

    const rc = getRuntimeCandidates(index, 'rare-unmapped-model');
    assert.equal(rc.length, 0);

    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('E2E: normalizeToPermaslug correctness', () => {
  assert.equal(normalizeToPermaslug('gpt-4o'), 'gpt-4o');
  assert.equal(normalizeToPermaslug('claude-3-opus-20240229'), 'claude-3-opus');
  assert.equal(normalizeToPermaslug('llama-3.3-70b-v2'), 'llama-3.3-70b');
  assert.equal(normalizeToPermaslug('gemini-2.5-flash'), 'gemini-2.5-flash');
  assert.equal(normalizeToPermaslug('GPT-4o'), 'gpt-4o');
});

// ── auto combo generation ────────────────────────────────────────────────────

test('E2E: auto combo generation with eligibility filtering', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-gen-'));
  try {
    const { benchmarks, creds } = await makeServer(tmp);
    await seedBenchmarks(benchmarks!);
    await creds.put('openrouter', 'cred-or', 'sk-or-123', new Date(), { enabled: true });
    await creds.put('groq', 'cred-groq', 'gsk-123', new Date(), { enabled: true });
    await creds.put('cerebras', 'cred-cb', 'sk-cb-123', new Date(), { enabled: false });

    const catalog: ModelRecord[] = [
      makeCatalogRecord('openrouter', 'gpt-4o', 95),
      makeCatalogRecord('github', 'gpt-4o', 90),
      makeCatalogRecord('groq', 'llama-3.3-70b-versatile', 95),
      makeCatalogRecord('cerebras', 'llama-3.3-70b', 92, true, 'stale'),
    ];
    const snapshots = await benchmarks!.listSnapshots();
    const snapMap = new Map<string, ExternalBenchmarkSnapshot>(snapshots.map((s: ExternalBenchmarkSnapshot) => [s.snapshotId, s]));
    const entriesResult = await benchmarks!.queryEntries({});
    const credentials = await creds.list().then((cs: Array<{ providerId: string; credentialId: string; enabled: boolean }>) =>
      cs.map((c: { providerId: string; credentialId: string; enabled: boolean }) => ({ providerId: c.providerId, credentialId: c.credentialId, enabled: c.enabled }))
    );

    const context: ConstructionContext = { catalog: catalog, credentials, benchmarks: entriesResult.entries, latestSnapshots: snapMap };
    const result = await constructAutoCombo(['gpt-4o', 'llama-3.3-70b'], { primary: 'catalog_priority', direction: 'desc' }, context);

    assert.ok(result.models.length > 0, 'Should produce models');
    for (const m of result.models) {
      assert.ok((m as string).includes('/'), `Model ${m} should be in provider/model format`);
    }
    const staleModels = result.models.filter((m: string) => m.startsWith('cerebras/'));
    assert.equal(staleModels.length, 0, 'Stale models should be filtered out');
    assert.ok(result.provenance.generatedAt);
    assert.ok(result.provenance.snapshotId);
    assert.ok(result.provenance.candidateCount > 0);

    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('E2E: UNMAPPED does NOT create candidate executable combos', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-unmap-'));
  try {
    const { benchmarks } = await makeServer(tmp);
    await seedBenchmarks(benchmarks!);

    const catalog: ModelRecord[] = [makeCatalogRecord('openrouter', 'gpt-4o', 95)];
    const snapshots = await benchmarks!.listSnapshots();
    const snapMap = new Map<string, ExternalBenchmarkSnapshot>(snapshots.map((s: ExternalBenchmarkSnapshot) => [s.snapshotId, s]));
    const entriesResult = await benchmarks!.queryEntries({});

    const context: ConstructionContext = {
      catalog: catalog,
      credentials: [],
      benchmarks: entriesResult.entries,
      latestSnapshots: snapMap,
    };

    const result = await constructAutoCombo(['rare-unmapped-model'], { primary: 'catalog_priority', direction: 'desc' }, context);
    assert.equal(result.models.length, 0, 'UNMAPPED model should yield no candidates');
    assert.equal(result.provenance.selectedCount, 0);

    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('E2E: autogenerate with AMBIGUOUS model — selects by priority', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-amb-'));
  try {
    const { comboStore, catalog, creds, events, benchmarks } = await makeServer(tmp);
    await creds.put('openrouter', 'c1', 'sk', new Date(), { enabled: true });
    await creds.put('github', 'c2', 'gh', new Date(), { enabled: true });
    await catalog.replaceProvider('openrouter', [makeCatalogRecord('openrouter', 'gpt-4o', 95)]);
    await catalog.replaceProvider('github', [makeCatalogRecord('github', 'gpt-4o', 90)]);
    await seedBenchmarks(benchmarks!);

    const chat = new ChatService({ candidates: async () => [], adapters: new Map() });
    const { srv, port } = await startServer({ dbPath: '', comboStore, catalog, creds, events, benchmarks }, chat);

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/combos/autogenerate`, {
        method: 'POST',
        headers: JSON_AUTH,
        body: JSON.stringify({ name: 'ambig-gpt4o', targetModels: ['gpt-4o'] }),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as { combo: { models: string[]; type: string } };
      assert.ok(body.combo.models.length > 0, 'Should generate models for AMBIGUOUS');
      const orIdx = body.combo.models.findIndex((m: string) => m.startsWith('openrouter/'));
      const ghIdx = body.combo.models.findIndex((m: string) => m.startsWith('github/'));
      if (orIdx >= 0 && ghIdx >= 0) {
        assert.ok(orIdx < ghIdx, 'Higher priority candidate should come first');
      }
    } finally {
      await new Promise<void>((resolve, reject) => srv.close((e: unknown) => e ? reject(e) : resolve()));
    }
    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

// ── combo:xxx runtime ────────────────────────────────────────────────────────

test('E2E: combo:xxx runtime resolves via expandComboModels unchanged', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-combo-'));
  try {
    const { comboStore, catalog, creds, events } = await makeServer(tmp);
    await creds.put('groq', 'c1', 'gsk-x', new Date(), { enabled: true });
    await creds.put('cerebras', 'c2', 'sk-cb', new Date(), { enabled: true });
    await catalog.replaceProvider('groq', [makeCatalogRecord('groq', 'llama-fail', 90)]);
    await catalog.replaceProvider('cerebras', [makeCatalogRecord('cerebras', 'llama-ok', 92)]);
    comboStore.put({ comboId: 'smart-fallback', name: 'Smart Fallback', models: ['groq/llama-fail', 'cerebras/llama-ok'] });

    const groqAdapter: ChatProviderAdapter = {
      providerId: 'groq',
      async chat() {
        const err = new Error('Rate limit');
        (err as { status?: number }).status = 429;
        throw err;
      },
    };
    const cbAdapter: ChatProviderAdapter = {
      providerId: 'cerebras',
      async chat() {
        return { id: 'cb-1', model: 'llama-ok', content: 'fallback ok' };
      },
    };
    const chat = new ChatService({
      candidates: async () => [
        { providerId: 'groq', modelId: 'llama-fail', credentialId: 'c1', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 90, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
        { providerId: 'cerebras', modelId: 'llama-ok', credentialId: 'c2', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 92, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
      ],
      adapters: new Map([['groq', groqAdapter], ['cerebras', cbAdapter]]),
    });

    const { srv, port } = await startServer({ dbPath: '', comboStore, catalog, creds, events, benchmarks: null }, chat);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: JSON_AUTH,
        body: JSON.stringify({ model: 'combo:smart-fallback', messages: [{ role: 'user', content: 'hello' }] }),
      });
      assert.equal(res.status, 200, `Chat should succeed via combo fallback, got ${res.status}`);
      const body = await res.json() as { choices: Array<{ message: { content: string } }> };
      assert.equal(body.choices[0]?.message.content, 'fallback ok');
      assert.equal(res.headers.get('x-freeroute-provider'), 'cerebras');
    } finally {
      await new Promise<void>((resolve, reject) => srv.close((e: unknown) => e ? reject(e) : resolve()));
    }
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

// ── API: autogenerate + provenance ───────────────────────────────────────────

test('E2E: POST /v1/combos/autogenerate creates automatic combo with provenance', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-autogen-'));
  try {
    const { comboStore, catalog, creds, events, benchmarks } = await makeServer(tmp);
    await creds.put('openrouter', 'c-or', 'sk-or', new Date(), { enabled: true });
    await creds.put('groq', 'c-groq', 'gsk', new Date(), { enabled: true });
    await catalog.replaceProvider('openrouter', [makeCatalogRecord('openrouter', 'gpt-4o', 95)]);
    await catalog.replaceProvider('groq', [makeCatalogRecord('groq', 'llama-3.3-70b-versatile', 95)]);
    await seedBenchmarks(benchmarks!);

    const chat = new ChatService({ candidates: async () => [], adapters: new Map() });
    const { srv, port } = await startServer({ dbPath: '', comboStore, catalog, creds, events, benchmarks }, chat);

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/combos/autogenerate`, {
        method: 'POST',
        headers: JSON_AUTH,
        body: JSON.stringify({ name: 'auto-gpt4o', targetModels: ['gpt-4o', 'llama-3.3-70b'] }),
      });
      assert.equal(res.status, 200, `Autogenerate should succeed, got ${res.status}`);
      const body = await res.json() as { status: string; combo: { comboId: string; type: string; provenance: unknown; version: number; locked: boolean }; provenance: unknown };
      assert.equal(body.status, 'ok');
      assert.ok(body.combo.comboId, 'Should have comboId');
      assert.equal(body.combo.type, 'automatic', `type should be 'automatic', got ${body.combo.type}`);
      assert.ok(body.combo.provenance, 'Should have provenance');
      assert.ok(body.combo.version >= 1, 'Should have version');
      assert.equal(body.combo.locked, false, 'New auto combo should not be locked');

      const comboRes = await fetch(`http://127.0.0.1:${port}/v1/combos/${body.combo.comboId}`, { headers: { authorization: AUTH } });
      assert.equal(comboRes.status, 200);
      const comboBody = await comboRes.json() as { comboId: string; models: string[] };
      assert.ok(comboBody.models.length > 0, 'Combo should have models');

      const provRes = await fetch(`http://127.0.0.1:${port}/v1/combos/${body.combo.comboId}/provenance`, { headers: { authorization: AUTH } });
      assert.equal(provRes.status, 200);
      const provBody = await provRes.json() as { provenance: Array<{ version: number }> };
      assert.equal(provBody.provenance.length, 1, 'Should have 1 provenance entry');
    } finally {
      await new Promise<void>((resolve, reject) => srv.close((e: unknown) => e ? reject(e) : resolve()));
    }
    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

// ── lock / unlock / regenerate ───────────────────────────────────────────────

test('E2E: regenerate — manual combo returns 400', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-regrn-manual-'));
  try {
    const { comboStore, catalog, creds, events, benchmarks } = await makeServer(tmp);
    await creds.put('openrouter', 'c1', 'sk', new Date(), { enabled: true });
    await catalog.replaceProvider('openrouter', [makeCatalogRecord('openrouter', 'gpt-4o', 95)]);
    await seedBenchmarks(benchmarks!);
    comboStore.put({ comboId: 'my-manual', name: 'My Manual', models: ['openrouter/gpt-4o'], type: 'manual' });

    const chat = new ChatService({ candidates: async () => [], adapters: new Map() });
    const { srv, port } = await startServer({ dbPath: '', comboStore, catalog, creds, events, benchmarks }, chat);

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/combos/my-manual/regenerate`, { method: 'POST', headers: { authorization: AUTH } });
      assert.equal(res.status, 400, 'Manual combo should return 400 on regenerate');
      const body = await res.json() as { error: { message: string } };
      assert.ok(body.error.message.includes('Only automatic'), `Expected error about automatic, got: ${body.error.message}`);
    } finally {
      await new Promise<void>((resolve, reject) => srv.close((e: unknown) => e ? reject(e) : resolve()));
    }
    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('E2E: regenerate — locked combo returns 409', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-lock-'));
  try {
    const { comboStore, catalog, creds, events, benchmarks } = await makeServer(tmp);
    await creds.put('openrouter', 'c1', 'sk', new Date(), { enabled: true });
    await catalog.replaceProvider('openrouter', [makeCatalogRecord('openrouter', 'gpt-4o', 95)]);
    await seedBenchmarks(benchmarks!);
    comboStore.put({ comboId: 'auto-locked', name: 'Auto Locked', models: ['openrouter/gpt-4o'], type: 'automatic' });
    // Lock via update since put() doesn't accept locked
    comboStore.update('auto-locked', { locked: true });

    const chat = new ChatService({ candidates: async () => [], adapters: new Map() });
    const { srv, port } = await startServer({ dbPath: '', comboStore, catalog, creds, events, benchmarks }, chat);

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/combos/auto-locked/regenerate`, { method: 'POST', headers: { authorization: AUTH } });
      assert.equal(res.status, 409, 'Locked combo should return 409 on regenerate');
      const body = await res.json() as { error: { message: string } };
      assert.ok(body.error.message.includes('locked'), `Expected locked error, got: ${body.error.message}`);
    } finally {
      await new Promise<void>((resolve, reject) => srv.close((e: unknown) => e ? reject(e) : resolve()));
    }
    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('E2E: unlock allows regeneration, provenance increments', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-unlock-'));
  try {
    const { comboStore, catalog, creds, events, benchmarks } = await makeServer(tmp);
    await creds.put('openrouter', 'c1', 'sk', new Date(), { enabled: true });
    await catalog.replaceProvider('openrouter', [makeCatalogRecord('openrouter', 'gpt-4o', 95)]);
    await seedBenchmarks(benchmarks!);
    comboStore.put({ comboId: 'auto-regen', name: 'Auto Regen', models: ['openrouter/gpt-4o'], type: 'automatic' });
    comboStore.update('auto-regen', { locked: true });
    const before = comboStore.getExtended('auto-regen');
    assert.ok(before?.locked, 'Should be locked initially');
    const v0 = before?.version ?? 0;
    // put() sets version=1, update({locked:true}) increments to 2
    assert.equal(before?.version, 2, 'Version after put+update should be 2');

    const chat = new ChatService({ candidates: async () => [], adapters: new Map() });
    const { srv, port } = await startServer({ dbPath: '', comboStore, catalog, creds, events, benchmarks }, chat);

    try {
      const unlockRes = await fetch(`http://127.0.0.1:${port}/v1/combos/auto-regen`, {
        method: 'PATCH',
        headers: JSON_AUTH,
        body: JSON.stringify({ locked: false }),
      });
      assert.equal(unlockRes.status, 200, 'Unlock should succeed');

      const regRes = await fetch(`http://127.0.0.1:${port}/v1/combos/auto-regen/regenerate`, { method: 'POST', headers: { authorization: AUTH } });
      assert.equal(regRes.status, 200, `Regenerate after unlock should succeed, got ${regRes.status}`);
      const regBody = await regRes.json() as { status: string; combo: { version: number }; provenance: unknown };
      assert.equal(regBody.status, 'ok');
      const afterVersion = regBody.combo.version;
      // After put(v1) + update(v2) + PATCH unlock(v3) + regenerate(v4)
      assert.equal(afterVersion, 4, `Version should be 4 after unlock+regen, got ${afterVersion}`);

      const provRes = await fetch(`http://127.0.0.1:${port}/v1/combos/auto-regen/provenance`, { headers: { authorization: AUTH } });
      const provBody = await provRes.json() as { provenance: Array<{ version: number }> };
      assert.equal(provBody.provenance.length, 1, 'Should have 1 provenance entry after regen');
      assert.equal(provBody.provenance[0].version, afterVersion);
    } finally {
      await new Promise<void>((resolve, reject) => srv.close((e: unknown) => e ? reject(e) : resolve()));
    }
    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('E2E: provenance history — multiple regenerations accumulate entries', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-prov-'));
  try {
    const { comboStore, catalog, creds, events, benchmarks } = await makeServer(tmp);
    await creds.put('openrouter', 'c1', 'sk', new Date(), { enabled: true });
    await catalog.replaceProvider('openrouter', [makeCatalogRecord('openrouter', 'gpt-4o', 95)]);
    await seedBenchmarks(benchmarks!);

    const chat = new ChatService({ candidates: async () => [], adapters: new Map() });
    const { srv, port } = await startServer({ dbPath: '', comboStore, catalog, creds, events, benchmarks }, chat);

    try {
      const genRes = await fetch(`http://127.0.0.1:${port}/v1/combos/autogenerate`, {
        method: 'POST',
        headers: JSON_AUTH,
        body: JSON.stringify({ name: 'multi-regen', targetModels: ['gpt-4o'] }),
      });
      const genBody = await genRes.json() as { combo: { comboId: string } };
      const comboId = genBody.combo.comboId;

      for (let i = 0; i < 2; i++) {
        const r = await fetch(`http://127.0.0.1:${port}/v1/combos/${comboId}/regenerate`, { method: 'POST', headers: { authorization: AUTH } });
        assert.equal(r.status, 200, `Regeneration ${i + 1} should succeed`);
      }

      const provRes = await fetch(`http://127.0.0.1:${port}/v1/combos/${comboId}/provenance`, { headers: { authorization: AUTH } });
      const provBody = await provRes.json() as { provenance: Array<{ version: number }> };
      assert.equal(provBody.provenance.length, 3, 'Should have 3 provenance entries (1 initial + 2 regen)');
      const versions = provBody.provenance.map((p: { version: number }) => p.version);
      assert.ok(versions[0] < versions[1] && versions[1] < versions[2], 'Versions should be strictly increasing');
    } finally {
      await new Promise<void>((resolve, reject) => srv.close((e: unknown) => e ? reject(e) : resolve()));
    }
    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

// ── existing combo stability ─────────────────────────────────────────────────

test('E2E: existing manual combo runtime unchanged after any API activity', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-stable-'));
  try {
    const { comboStore, catalog, creds, events } = await makeServer(tmp);
    await creds.put('groq', 'c1', 'gsk', new Date(), { enabled: true });
    await creds.put('cerebras', 'c2', 'sk-cb', new Date(), { enabled: true });
    await catalog.replaceProvider('groq', [makeCatalogRecord('groq', 'llama-fail', 90)]);
    await catalog.replaceProvider('cerebras', [makeCatalogRecord('cerebras', 'llama-ok', 92)]);
    comboStore.put({ comboId: 'stable-combo', name: 'Stable', models: ['groq/llama-fail', 'cerebras/llama-ok'], type: 'manual' });

    const before = comboStore.get('stable-combo');
    assert.ok(before, 'Combo should exist');
    const originalModels = [...before.models];
    const originalCreatedAt = before.createdAt;

    const groqAdapter: ChatProviderAdapter = {
      providerId: 'groq',
      async chat() {
        const err = new Error('Rate limit');
        (err as { status?: number }).status = 429;
        throw err;
      },
    };
    const cbAdapter: ChatProviderAdapter = {
      providerId: 'cerebras',
      async chat() {
        return { id: 'cb-1', model: 'llama-ok', content: 'stable' };
      },
    };
    const chat = new ChatService({
      candidates: async () => [
        { providerId: 'groq', modelId: 'llama-fail', credentialId: 'c1', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 90, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
        { providerId: 'cerebras', modelId: 'llama-ok', credentialId: 'c2', capabilities: ['chat'], freeTier: 'free_verified', checkedAt: new Date(), priority: 92, preference: 'neutral', healthScore: 1, latencyScore: 1, quotaScore: 1 },
      ],
      adapters: new Map([['groq', groqAdapter], ['cerebras', cbAdapter]]),
    });

    const { srv, port } = await startServer({ dbPath: '', comboStore, catalog, creds, events, benchmarks: null }, chat);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: 'POST',
        headers: JSON_AUTH,
        body: JSON.stringify({ model: 'combo:stable-combo', messages: [{ role: 'user', content: 'hi' }] }),
      });
      assert.equal(res.status, 200);
      const after = comboStore.get('stable-combo');
      assert.ok(after, 'Combo should still exist');
      assert.deepEqual(after.models, originalModels, 'Models should be unchanged');
      assert.equal(after.createdAt, originalCreatedAt, 'createdAt should be unchanged');
    } finally {
      await new Promise<void>((resolve, reject) => srv.close((e: unknown) => e ? reject(e) : resolve()));
    }
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

// ── credential eligibility ────────────────────────────────────────────────────

test('E2E: credential eligibility — missing cred blocks candidate', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-cred-'));
  try {
    const { benchmarks, creds } = await makeServer(tmp);
    await creds.put('groq', 'c-groq', 'gsk', new Date(), { enabled: true });
    // Do NOT add openrouter or github credentials

    await seedBenchmarks(benchmarks!);
    const catalog: ModelRecord[] = [
      makeCatalogRecord('openrouter', 'gpt-4o', 95),
      makeCatalogRecord('github', 'gpt-4o', 90),
      makeCatalogRecord('groq', 'llama-3.3-70b-versatile', 95),
    ];
    const snapshots = await benchmarks!.listSnapshots();
    const snapMap = new Map<string, ExternalBenchmarkSnapshot>(snapshots.map((s: ExternalBenchmarkSnapshot) => [s.snapshotId, s]));
    const entriesResult = await benchmarks!.queryEntries({});
    const credentials = await creds.list().then((cs: Array<{ providerId: string; credentialId: string; enabled: boolean }>) =>
      cs.map((c: { providerId: string; credentialId: string; enabled: boolean }) => ({ providerId: c.providerId, credentialId: c.credentialId, enabled: c.enabled }))
    );

    const context: ConstructionContext = { catalog: catalog, credentials, benchmarks: entriesResult.entries, latestSnapshots: snapMap };
    const result = await constructAutoCombo(['gpt-4o'], { primary: 'catalog_priority', direction: 'desc' }, context);
    assert.equal(result.models.length, 0, 'Should produce 0 models when no credentials available for gpt-4o providers');

    benchmarks!.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

// ── SQLite persistence ────────────────────────────────────────────────────────

test('E2E: SQLite persistence — combo survives store reopen', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-e2e-sql-'));
  const dbPath = join(tmp, 'combos.sqlite');
  try {
    const store1 = createSqliteComboStore(dbPath);
    store1.put({ comboId: 'persist-test', name: 'Persist', models: ['openrouter/gpt-4o'], type: 'automatic', policy: '{}', provenance: '{}', snapshotId: 'snap-x' });
    store1.close();

    const store2 = createSqliteComboStore(dbPath);
    const loaded = store2.getExtended('persist-test');
    assert.ok(loaded, 'Should load persisted combo');
    assert.equal(loaded.type, 'automatic');
    assert.equal(loaded.snapshotId, 'snap-x');
    assert.equal(loaded.version, 1);
    assert.equal(loaded.locked, false);
    store2.close();
  } finally {
    await new Promise(r => setTimeout(r, 200));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});
