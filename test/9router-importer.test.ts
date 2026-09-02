import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { importNineRouterApiKey } from '../src/importers/9router.js';
import { SqliteCredentialStore } from '../src/storage/sqlite-credential-store.js';

test('imports an active 9Router API key without exposing it in the result', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freeroute-9router-import-'));
  const sourceFile = join(directory, '9router.sqlite');
  const targetFile = join(directory, 'freeroute.sqlite');
  try {
    const source = new DatabaseSync(sourceFile);
    source.exec(`
      CREATE TABLE providerConnections (
        id TEXT PRIMARY KEY, provider TEXT, authType TEXT, name TEXT,
        priority INTEGER, isActive INTEGER, data TEXT, createdAt TEXT
      ) STRICT;
    `);
    source.prepare(`
      INSERT INTO providerConnections (id, provider, authType, name, priority, isActive, data, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('source-1', 'openrouter', 'apikey', 'Existing key', 0, 1, JSON.stringify({ apiKey: 'source-secret' }), '2026-09-03T00:00:00.000Z');
    source.close();

    const credentials = new SqliteCredentialStore(targetFile, 'test-master-secret-that-is-long-enough');
    const result = await importNineRouterApiKey({ sourceDatabasePath: sourceFile, providerId: 'openrouter', credentials });
    assert.deepEqual(result, {
      providerId: 'openrouter', credentialId: '9router-source-1', sourceConnectionId: 'source-1', displayName: 'Existing key',
    });
    assert.equal('secret' in result, false);
    assert.equal(await credentials.get('openrouter', '9router-source-1'), 'source-secret');
    credentials.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
