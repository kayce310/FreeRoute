import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseStoredCredential, formatCredentialForStorage, type OAuthCredential } from '../src/storage/credential-types.js';
import { SqliteCredentialStore } from '../src/storage/sqlite-credential-store.js';

test('parseStoredCredential parses plain API key strings', () => {
  const parsed = parseStoredCredential('sk-proj-1234567890');
  assert.equal(parsed.isOAuth, false);
  assert.equal(parsed.apiKey, 'sk-proj-1234567890');
  assert.equal(parsed.raw, 'sk-proj-1234567890');
});

test('parseStoredCredential parses JSON OAuth credentials', () => {
  const oauthJson = JSON.stringify({
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: '2026-09-18T02:00:00.000Z',
    providerSpecificData: {
      authMethod: 'builder-id',
      clientId: 'client-123',
      region: 'us-east-1',
    },
  });

  const parsed = parseStoredCredential(oauthJson);
  assert.equal(parsed.isOAuth, true);
  assert.equal(parsed.authMethod, 'builder-id');
  assert.equal(parsed.accessToken, 'test-access-token');
  assert.equal(parsed.refreshToken, 'test-refresh-token');
  assert.equal(parsed.expiresAt, '2026-09-18T02:00:00.000Z');
  assert.equal(parsed.oauth?.providerSpecificData?.clientId, 'client-123');
});

test('SqliteCredentialStore seamlessly supports OAuth credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freeroute-cred-test-'));
  const dbPath = join(dir, 'credentials.sqlite');

  let store: SqliteCredentialStore | undefined;
  try {
    store = new SqliteCredentialStore(dbPath, 'test-master-secret-123456');

    // 1. Put plain API key
    await store.put('openai', 'key-1', 'sk-openai-key', new Date(), { name: 'OpenAI Prod' });

    // 2. Put OAuth credential
    const kiroOAuth: OAuthCredential = {
      accessToken: 'kiro-access-token',
      refreshToken: 'kiro-refresh-token',
      expiresAt: '2026-09-18T03:00:00.000Z',
      providerSpecificData: {
        authMethod: 'builder-id',
        region: 'us-east-1',
      },
    };
    await store.put('kiro', 'kiro-acc-1', kiroOAuth, new Date(), { name: 'Kiro Builder ID', priority: 10 });

    // 3. Verify get & getParsed
    const openaiParsed = await store.getParsed('openai', 'key-1');
    assert.ok(openaiParsed);
    assert.equal(openaiParsed.isOAuth, false);
    assert.equal(openaiParsed.apiKey, 'sk-openai-key');

    const kiroParsed = await store.getParsed('kiro', 'kiro-acc-1');
    assert.ok(kiroParsed);
    assert.equal(kiroParsed.isOAuth, true);
    assert.equal(kiroParsed.authMethod, 'builder-id');
    assert.equal(kiroParsed.accessToken, 'kiro-access-token');
    assert.equal(kiroParsed.refreshToken, 'kiro-refresh-token');

    // 4. Update secret without losing name or priority
    const refreshedOAuth: OAuthCredential = {
      ...kiroOAuth,
      accessToken: 'kiro-new-access-token',
      expiresAt: '2026-09-18T04:00:00.000Z',
    };
    const updated = await store.updateSecret('kiro', 'kiro-acc-1', refreshedOAuth);
    assert.equal(updated, true);

    const list = await store.list();
    const kiroMeta = list.find((m) => m.providerId === 'kiro');
    assert.ok(kiroMeta);
    assert.equal(kiroMeta.name, 'Kiro Builder ID');
    assert.equal(kiroMeta.priority, 10);
    assert.equal(kiroMeta.authType, 'oauth');
    assert.equal(kiroMeta.authMethod, 'builder-id');
    assert.equal(kiroMeta.expiresAt?.toISOString(), '2026-09-18T04:00:00.000Z');

    const openaiMeta = list.find((m) => m.providerId === 'openai');
    assert.ok(openaiMeta);
    assert.equal(openaiMeta.authType, 'api_key');
  } finally {
    try { store?.close(); } catch {}
    await rm(dir, { recursive: true, force: true });
  }
});
