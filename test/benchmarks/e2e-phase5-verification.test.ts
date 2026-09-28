/**
 * Phase 5 E2E Verification Tests
 *
 * Verifies:
 * - Test A: Production Runtime Boot & Component Wiring
 * - Test B: Graceful Degradation on Storage Initialization Failure
 * - Test C: Benchmark Data Ingestion & Storage Persistence
 * - Test D: HTTP Endpoint POST /v1/benchmarks/refresh with Network Ingestion
 * - Test E: Production Autogenerate Flow with Real Benchmark Context
 * - Test F: Resilience to Ingestion Failure & Stale Snapshot Preservation
 * - Test G: Clean Shutdown & File Lock Release
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { createOpenRouterRuntime } from '../../src/app.js';
import { ExternalBenchmarkStorage } from '../../src/benchmarks/external/storage.js';
import { RefreshCoordinator } from '../../src/benchmarks/external/refresh-coordinator.js';
import type { ExternalBenchmarkSnapshot, ExternalBenchmarkEntry } from '../../src/benchmarks/external/interfaces.js';
import { expandComboModels } from '../../src/server.js';
import { SqliteCredentialStore } from '../../src/storage/sqlite-credential-store.js';
import { SqliteCatalogStore } from '../../src/storage/sqlite-catalog-store.js';
import { createSqliteComboStore } from '../../src/storage/sqlite-combo-store.js';
import type { ModelRecord } from '../../src/contracts.js';

const AUTH = 'Bearer test-token-phase5';
const JSON_AUTH = { authorization: AUTH, 'content-type': 'application/json' };

function makeCatalogRecord(provider: string, model: string, priority: number, enabled = true): ModelRecord {
  return {
    providerId: provider,
    modelId: model,
    capabilities: ['chat', 'streaming'],
    freeTier: 'free_verified',
    checkedAt: new Date(),
    priority,
    enabled,
    catalogStatus: 'live',
  } as ModelRecord;
}

test('Test A: Production Runtime Boot & Component Wiring', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-p5-boot-'));
  const dbPath = join(tmp, 'freeroute.sqlite');
  const benchDir = join(tmp, 'bench-data');

  try {
    const runtime = createOpenRouterRuntime({
      databasePath: dbPath,
      masterSecret: 'test-secret-phase5-boot-32bytes!',
      benchmarkDataDir: benchDir,
      apiToken: 'test-token-phase5',
    });

    assert.ok(runtime.server, 'Server instance should exist');
    assert.ok(runtime.externalBenchmarks, 'externalBenchmarks should be wired');
    assert.ok(runtime.externalBenchmarks instanceof ExternalBenchmarkStorage, 'externalBenchmarks should be an ExternalBenchmarkStorage instance');
    assert.ok(runtime.benchmarkCoordinator, 'benchmarkCoordinator should be wired');
    assert.ok(runtime.benchmarkCoordinator instanceof RefreshCoordinator, 'benchmarkCoordinator should be a RefreshCoordinator instance');
    assert.equal(typeof runtime.refreshBenchmarks, 'function', 'refreshBenchmarks function should be exported');

    // Clean shutdown
    runtime.close();
  } finally {
    await new Promise((r) => setTimeout(r, 100));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('Test B: Graceful Degradation on Storage Initialization Failure', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-p5-degrade-'));
  const dbPath = join(tmp, 'freeroute.sqlite');
  // Create a file where a directory is expected, causing ExternalBenchmarkStorage init to fail
  const badBenchDir = join(tmp, 'bad-bench-file.txt');
  await writeFile(badBenchDir, 'not a directory');

  try {
    const runtime = createOpenRouterRuntime({
      databasePath: dbPath,
      masterSecret: 'test-secret-phase5-boot-32bytes!',
      benchmarkDataDir: badBenchDir,
      apiToken: 'test-token-phase5',
    });

    // Graceful degradation: server must boot, but benchmarks are undefined
    assert.ok(runtime.server, 'Server should still be created');
    assert.equal(runtime.externalBenchmarks, undefined, 'externalBenchmarks should be undefined on failure');
    assert.equal(runtime.benchmarkCoordinator, undefined, 'benchmarkCoordinator should be undefined on failure');

    // Start server to test HTTP routing still works
    await new Promise<void>((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
    const port = (runtime.server.address() as AddressInfo).port;

    try {
      // POST /v1/benchmarks/refresh should return 503
      const refreshRes = await fetch(`http://127.0.0.1:${port}/v1/benchmarks/refresh`, {
        method: 'POST',
        headers: JSON_AUTH,
        body: JSON.stringify({ source: 'openrouter' }),
      });
      assert.equal(refreshRes.status, 503, 'Should return 503 when benchmark storage is not configured');
      const errBody = await refreshRes.json() as { error: { message: string } };
      assert.ok(errBody.error.message.includes('not configured'), 'Error message should explain storage not configured');

      // GET /v1/combos should still work normally
      const combosRes = await fetch(`http://127.0.0.1:${port}/v1/combos`, {
        headers: { authorization: AUTH },
      });
      assert.equal(combosRes.status, 200, 'Normal combo endpoint should still work');
    } finally {
      await new Promise<void>((resolve, reject) => runtime.server.close((e) => (e ? reject(e) : resolve())));
    }

    // Clean shutdown must not throw
    runtime.close();
  } finally {
    await new Promise((r) => setTimeout(r, 100));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('Test C: Benchmark Data Ingestion & Storage Persistence across Reopen', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-p5-ingest-'));
  const dbPath = join(tmp, 'freeroute.sqlite');
  const benchDir = join(tmp, 'bench-data');

  try {
    const runtime = createOpenRouterRuntime({
      databasePath: dbPath,
      masterSecret: 'test-secret-phase5-boot-32bytes!',
      benchmarkDataDir: benchDir,
      apiToken: 'test-token-phase5',
    });

    const storage = runtime.externalBenchmarks!;
    assert.ok(storage, 'Storage should be initialized');

    const snap: ExternalBenchmarkSnapshot = {
      snapshotId: 'snap-p5-persist-01',
      sourceId: 'openrouter',
      fetchedAt: new Date('2026-09-28T10:00:00Z'),
      version: 1,
      status: 'fresh',
    };
    await storage.saveSnapshot(snap);

    const entries: ExternalBenchmarkEntry[] = [
      {
        entryId: 'e-llama-pricing',
        snapshotId: 'snap-p5-persist-01',
        modelPermaslug: 'llama-3.3-70b',
        metricKey: 'price_per_1m_input_tokens',
        metricValue: '0.35',
      },
      {
        entryId: 'e-llama-context',
        snapshotId: 'snap-p5-persist-01',
        modelPermaslug: 'llama-3.3-70b',
        metricKey: 'context_length',
        metricValue: '128000',
      },
      {
        entryId: 'e-gemini-pricing',
        snapshotId: 'snap-p5-persist-01',
        modelPermaslug: 'gemini-2.5-flash',
        metricKey: 'price_per_1m_input_tokens',
        metricValue: '0.00',
      },
    ];
    await storage.saveEntries(entries);

    // Verify stored
    const retrieved = await storage.getLatestSnapshot('openrouter');
    assert.ok(retrieved, 'Should retrieve latest snapshot');
    assert.equal(retrieved!.snapshotId, 'snap-p5-persist-01');

    const queryResult = await storage.getEntriesBySnapshot('snap-p5-persist-01');
    assert.equal(queryResult.length, 3, 'Should find all 3 entries');

    // Close runtime
    runtime.close();

    // Reopen external benchmark storage directly from disk and verify persistence
    const reopened = new ExternalBenchmarkStorage(benchDir);
    const reopenedSnap = await reopened.getLatestSnapshot('openrouter');
    assert.ok(reopenedSnap, 'Snapshot should persist across reopen');
    assert.equal(reopenedSnap!.snapshotId, 'snap-p5-persist-01');

    const reopenedEntries = await reopened.getEntriesBySnapshot('snap-p5-persist-01');
    assert.equal(reopenedEntries.length, 3, 'Entries should persist across reopen');
    reopened.close();
  } finally {
    await new Promise((r) => setTimeout(r, 100));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('Test D: HTTP Endpoint POST /v1/benchmarks/refresh with Mock Network', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-p5-refresh-'));
  const dbPath = join(tmp, 'freeroute.sqlite');
  const benchDir = join(tmp, 'bench-data');

  const originalFetch = globalThis.fetch;
  try {
    // Intercept fetch to mock OpenRouter models catalog response
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('openrouter.ai/api/v1/models')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'meta-llama/llama-3.3-70b-instruct',
                name: 'Llama 3.3 70B Instruct',
                pricing: { prompt: '0.0000003', completion: '0.0000004' },
                context_length: 128000,
              },
              {
                id: 'google/gemini-2.5-flash',
                name: 'Gemini 2.5 Flash',
                pricing: { prompt: '0', completion: '0' },
                context_length: 1000000,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return originalFetch(input, init);
    };

    const runtime = createOpenRouterRuntime({
      databasePath: dbPath,
      masterSecret: 'test-secret-phase5-boot-32bytes!',
      benchmarkDataDir: benchDir,
      apiToken: 'test-token-phase5',
    });

    await new Promise<void>((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
    const port = (runtime.server.address() as AddressInfo).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/benchmarks/refresh`, {
        method: 'POST',
        headers: JSON_AUTH,
        body: JSON.stringify({ source: 'openrouter' }),
      });

      assert.equal(res.status, 200, `Refresh should return 200, got ${res.status}`);
      const body = await res.json() as { status: string; scope: string; snapshotId: string };
      assert.equal(body.status, 'ok');
      assert.equal(body.scope, 'openrouter');
      assert.ok(body.snapshotId, 'Should return snapshotId');

      // Verify that snapshot and entries were saved in storage
      const storage = runtime.externalBenchmarks!;
      const snap = await storage.getLatestSnapshot('openrouter');
      assert.ok(snap, 'Latest snapshot should be saved');
      assert.equal(snap!.snapshotId, body.snapshotId);

      const entries = await storage.getEntriesBySnapshot(body.snapshotId);
      assert.ok(entries.length >= 2, 'Should have entries saved for mock models');
    } finally {
      await new Promise<void>((resolve, reject) => runtime.server.close((e) => (e ? reject(e) : resolve())));
    }

    runtime.close();
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((r) => setTimeout(r, 100));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('Test E: Production Autogenerate Flow with Real Benchmark Context', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-p5-autogen-'));
  const dbPath = join(tmp, 'freeroute.sqlite');
  const benchDir = join(tmp, 'bench-data');

  try {
    const runtime = createOpenRouterRuntime({
      databasePath: dbPath,
      masterSecret: 'test-secret-phase5-boot-32bytes!',
      benchmarkDataDir: benchDir,
      apiToken: 'test-token-phase5',
    });

    const storage = runtime.externalBenchmarks!;

    // Seed benchmark data
    const snap: ExternalBenchmarkSnapshot = {
      snapshotId: 'snap-p5-autogen-01',
      sourceId: 'openrouter',
      fetchedAt: new Date('2026-09-28T10:00:00Z'),
      version: 1,
      status: 'fresh',
    };
    await storage.saveSnapshot(snap);
    await storage.saveEntries([
      {
        entryId: 'e-p5-llama',
        snapshotId: 'snap-p5-autogen-01',
        modelPermaslug: 'llama-3.3-70b-versatile',
        metricKey: 'price_per_1m_input_tokens',
        metricValue: '0.10',
      },
      {
        entryId: 'e-p5-gemini',
        snapshotId: 'snap-p5-autogen-01',
        modelPermaslug: 'gemini-2.5-flash',
        metricKey: 'price_per_1m_input_tokens',
        metricValue: '0.00',
      },
    ]);

    // Add credentials and catalog models to database
    const credStore = new SqliteCredentialStore(dbPath, 'test-secret-phase5-boot-32bytes!');
    await credStore.put('groq', 'c-groq', 'gsk-key-test');
    await credStore.put('gemini', 'c-gemini', 'gemini-key-test');
    credStore.close();

    const catStore = new SqliteCatalogStore(dbPath);
    await catStore.replaceProvider('groq', [makeCatalogRecord('groq', 'llama-3.3-70b-versatile', 95)]);
    await catStore.replaceProvider('gemini', [makeCatalogRecord('gemini', 'gemini-2.5-flash', 98)]);
    catStore.close();

    // Start server
    await new Promise<void>((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
    const port = (runtime.server.address() as AddressInfo).port;

    let generatedComboId = '';
    try {
      const res = await fetch(`http://127.0.0.1:${port}/v1/combos/autogenerate`, {
        method: 'POST',
        headers: JSON_AUTH,
        body: JSON.stringify({
          name: 'p5-auto-combo',
          targetModels: ['llama-3.3-70b-versatile', 'gemini-2.5-flash'],
        }),
      });

      assert.equal(res.status, 200, `Autogenerate should succeed, got ${res.status}`);
      const body = await res.json() as {
        status: string;
        combo: { comboId: string; type: string; version: number };
        provenance: { snapshotId: string; candidatesConsidered: number };
      };

      assert.equal(body.status, 'ok');
      assert.equal(body.combo.type, 'automatic');
      assert.ok(body.combo.comboId, 'Should have comboId');
      generatedComboId = body.combo.comboId;
      assert.equal(body.provenance.snapshotId, 'snap-p5-autogen-01', 'Provenance should record real snapshotId from benchmark storage');

      // Verify combo is retrievable via GET /v1/combos/:id
      const getRes = await fetch(`http://127.0.0.1:${port}/v1/combos/${body.combo.comboId}`, {
        headers: { authorization: AUTH },
      });
      assert.equal(getRes.status, 200);
      const getBody = await getRes.json() as { comboId: string; models: string[] };
      assert.ok(getBody.models.length > 0, 'Combo should have models generated');
    } finally {
      await new Promise<void>((resolve, reject) => runtime.server.close((e) => (e ? reject(e) : resolve())));
    }

    runtime.close();

    // Verify combo can be resolved with expandComboModels from combo store
    const comboStore = createSqliteComboStore(dbPath);
    const expanded = expandComboModels([`combo:${generatedComboId}`], comboStore);
    assert.ok(expanded.length > 0, 'expandComboModels should resolve combo to concrete models');
    comboStore.close();
  } finally {
    await new Promise((r) => setTimeout(r, 100));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('Test F: Resilience to Ingestion Failure & Stale Snapshot Preservation', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-p5-resilience-'));
  const dbPath = join(tmp, 'freeroute.sqlite');
  const benchDir = join(tmp, 'bench-data');

  const originalFetch = globalThis.fetch;
  try {
    const runtime = createOpenRouterRuntime({
      databasePath: dbPath,
      masterSecret: 'test-secret-phase5-boot-32bytes!',
      benchmarkDataDir: benchDir,
      apiToken: 'test-token-phase5',
    });

    const storage = runtime.externalBenchmarks!;

    // Seed initial valid snapshot
    const initialSnap: ExternalBenchmarkSnapshot = {
      snapshotId: 'snap-p5-initial-stable',
      sourceId: 'openrouter',
      fetchedAt: new Date('2026-09-28T08:00:00Z'),
      version: 1,
      status: 'fresh',
    };
    await storage.saveSnapshot(initialSnap);

    // Mock network failure (500 Internal Server Error)
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('openrouter.ai/api/v1/models')) {
        return new Response('Internal Server Error', { status: 500, statusText: 'Internal Server Error' });
      }
      return originalFetch(input, init);
    };

    await new Promise<void>((resolve) => runtime.server.listen(0, '127.0.0.1', resolve));
    const port = (runtime.server.address() as AddressInfo).port;

    try {
      // POST /v1/benchmarks/refresh should fail with 502
      const res = await fetch(`http://127.0.0.1:${port}/v1/benchmarks/refresh`, {
        method: 'POST',
        headers: JSON_AUTH,
        body: JSON.stringify({ source: 'openrouter' }),
      });

      assert.equal(res.status, 502, `Should return 502 on upstream network failure, got ${res.status}`);
      const body = await res.json() as { status: string; error: string };
      assert.equal(body.status, 'failed');

      // CRITICAL: The previous snapshot must still be preserved in storage
      const latestSnap = await storage.getLatestSnapshot('openrouter');
      assert.ok(latestSnap, 'Previous snapshot must be preserved');
      assert.equal(latestSnap!.snapshotId, 'snap-p5-initial-stable', 'Previous snapshot should remain untouched');

      // Server must continue serving standard routes normally
      const combosRes = await fetch(`http://127.0.0.1:${port}/v1/combos`, {
        headers: { authorization: AUTH },
      });
      assert.equal(combosRes.status, 200, 'Server should remain healthy and responsive');
    } finally {
      await new Promise<void>((resolve, reject) => runtime.server.close((e) => (e ? reject(e) : resolve())));
    }

    runtime.close();
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise((r) => setTimeout(r, 100));
    try { await rm(tmp, { recursive: true, force: true }); } catch (e: any) { if (e?.code !== 'EBUSY') throw e; }
  }
});

test('Test G: Clean Shutdown & File Lock Release', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'freeroute-p5-shutdown-'));
  const dbPath = join(tmp, 'freeroute.sqlite');
  const benchDir = join(tmp, 'bench-data');

  const runtime = createOpenRouterRuntime({
    databasePath: dbPath,
    masterSecret: 'test-secret-phase5-boot-32bytes!',
    benchmarkDataDir: benchDir,
    apiToken: 'test-token-phase5',
  });

  // Verify DB connections were established
  assert.ok(runtime.externalBenchmarks);
  await runtime.externalBenchmarks.listSnapshots();

  // Close runtime
  runtime.close();

  // On Windows, if file locks were held, rm() would throw EBUSY.
  // We verify that cleanup succeeds immediately.
  await rm(tmp, { recursive: true, force: true });
  assert.ok(true, 'Directory removed cleanly without file lock issues');
});
