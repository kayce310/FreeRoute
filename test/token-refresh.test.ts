import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  shouldRefreshCredentials,
  withRefreshLock,
  refreshKiroToken,
} from '../src/auth/token-refresh.js';
import { CredentialManager } from '../src/auth/credential-manager.js';
import { SqliteCredentialStore } from '../src/storage/sqlite-credential-store.js';
import type { OAuthCredential } from '../src/storage/credential-types.js';

test('shouldRefreshCredentials detects expiring tokens correctly', () => {
  const now = Date.now();

  // 1. Expired 10 minutes ago
  const expiredCred: OAuthCredential = {
    accessToken: 'old-token',
    refreshToken: 'ref-token',
    expiresAt: new Date(now - 10 * 60 * 1000).toISOString(),
  };
  assert.equal(shouldRefreshCredentials(expiredCred, 5 * 60 * 1000, now), true);

  // 2. Expires in 2 minutes (leadMs is 5 minutes) -> should refresh
  const soonExpiringCred: OAuthCredential = {
    accessToken: 'old-token',
    refreshToken: 'ref-token',
    expiresAt: new Date(now + 2 * 60 * 1000).toISOString(),
  };
  assert.equal(shouldRefreshCredentials(soonExpiringCred, 5 * 60 * 1000, now), true);

  // 3. Expires in 45 minutes -> should NOT refresh yet
  const freshCred: OAuthCredential = {
    accessToken: 'fresh-token',
    refreshToken: 'ref-token',
    expiresAt: new Date(now + 45 * 60 * 1000).toISOString(),
  };
  assert.equal(shouldRefreshCredentials(freshCred, 5 * 60 * 1000, now), false);

  // 4. No refresh token -> cannot refresh
  const noRefreshCred: OAuthCredential = {
    accessToken: 'fresh-token',
    expiresAt: new Date(now - 1000).toISOString(),
  };
  assert.equal(shouldRefreshCredentials(noRefreshCred, 5 * 60 * 1000, now), false);
});

test('withRefreshLock dedups concurrent calls', async () => {
  let callCount = 0;
  const mockWork = async () => {
    callCount++;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return 'result';
  };

  const [res1, res2, res3] = await Promise.all([
    withRefreshLock('lock-key-1', mockWork),
    withRefreshLock('lock-key-1', mockWork),
    withRefreshLock('lock-key-1', mockWork),
  ]);

  assert.equal(res1, 'result');
  assert.equal(res2, 'result');
  assert.equal(res3, 'result');
  assert.equal(callCount, 1);
});

test('CredentialManager automatically refreshes expired Kiro OAuth credential', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'freeroute-mgr-test-'));
  const dbPath = join(dir, 'credentials.sqlite');
  let store: SqliteCredentialStore | undefined;

  try {
    store = new SqliteCredentialStore(dbPath, 'test-master-secret-123456');

    // Expired Kiro Builder ID credential
    const expiredKiro: OAuthCredential = {
      accessToken: 'stale-access-token',
      refreshToken: 'valid-refresh-token',
      expiresAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      providerSpecificData: {
        authMethod: 'builder-id',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        region: 'us-east-1',
      },
    };

    await store.put('kiro', 'builder-id-1', expiredKiro);

    // Mock fetch for AWS SSO OIDC refresh endpoint
    const mockFetch: typeof fetch = async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes('oidc.us-east-1.amazonaws.com/token')) {
        const body = JSON.parse(String(init?.body || '{}'));
        assert.equal(body.clientId, 'test-client-id');
        assert.equal(body.refreshToken, 'valid-refresh-token');
        assert.equal(body.grantType, 'refresh_token');

        return new Response(JSON.stringify({
          accessToken: 'fresh-kiro-access-token',
          refreshToken: 'rotated-refresh-token',
          expiresIn: 3600,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('Not Found', { status: 404 });
    };

    const manager = new CredentialManager(store, mockFetch);
    const resolved = await manager.getValidCredential('kiro', 'builder-id-1');

    assert.ok(resolved);
    assert.equal(resolved.isOAuth, true);
    assert.equal(resolved.token, 'fresh-kiro-access-token');

    // Verify the store was updated with the fresh token and new expiry
    const updated = await store.getParsed('kiro', 'builder-id-1');
    assert.ok(updated);
    assert.equal(updated.accessToken, 'fresh-kiro-access-token');
    assert.equal(updated.refreshToken, 'rotated-refresh-token');
  } finally {
    try { store?.close(); } catch {}
    await rm(dir, { recursive: true, force: true });
  }
});
