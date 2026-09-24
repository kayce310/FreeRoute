import assert from 'node:assert/strict';
import test from 'node:test';
import { KiroAdapter, parseCredential } from '../src/providers/kiro.js';
import type { CredentialSecret } from '../src/storage/sqlite-credential-store.js';

/**
 * Test: Proactive refresh parity with 9router.
 * 
 * 9router ALWAYS calls refresh before every request.
 * FreeRoute should now do the same.
 */
test('KiroAdapter refreshes token before use when refreshToken exists', async () => {
  let refreshCalled = false;
  const mockCredentials = new Map<string, CredentialSecret>();
  
  const mockSetCredential = async (id: string, secret: CredentialSecret) => {
    mockCredentials.set(id, secret);
  };

  // Create a mock fetch that simulates successful refresh
  const mockFetch = async (url: string, init: RequestInit) => {
    if (url.includes('refreshToken') || url.includes('oidc')) {
      refreshCalled = true;
      return {
        ok: true,
        json: async () => ({
          accessToken: 'fresh-token-after-refresh',
          refreshToken: 'fresh-refresh-token',
          expiresIn: 3600,
        }),
        text: async () => '',
      } as Response;
    }
    throw new Error('Unexpected fetch to: ' + url);
  };

  // Create adapter with mock credential provider
  const adapter = new KiroAdapter({
    providerId: 'kiro',
    getCredential: async (id) => mockCredentials.get(id),
    setCredential: mockSetCredential,
    fetch: mockFetch as typeof globalThis.fetch,
  });

  // Store a credential WITH refreshToken but WITHOUT expiresAt
  // This simulates the current FreeRoute state
  const credWithRefreshNoExpiry: CredentialSecret = {
    accessToken: 'old-stale-token',
    refreshToken: 'aor-refresh-token',
    authType: 'access_token',
    providerSpecificData: {
      authMethod: 'builder_id',
      region: 'us-east-1',
    },
  };
  mockCredentials.set('test-cred', credWithRefreshNoExpiry);

  // Call discoverModels which triggers resolveCred internally
  await adapter.discoverModels('test-cred');

  // Verify refresh was called
  assert.equal(refreshCalled, true, 'refresh should be called when refreshToken exists');
});

test('parseCredential preserves expiresAt from providerSpecificData', () => {
  const secret: CredentialSecret = {
    accessToken: 'test-token',
    refreshToken: 'test-refresh',
    authType: 'access_token',
    providerSpecificData: {
      expiresAt: Date.now() + 3600000,
      authMethod: 'builder_id',
    },
  };

  const cred = parseCredential(secret);
  assert.ok(cred.expiresAt, 'expiresAt should be preserved from providerSpecificData');
  assert.ok(cred.expiresAt! > Date.now(), 'expiresAt should be in the future');
});

test('parseCredential preserves profileArn from providerSpecificData', () => {
  const secret: CredentialSecret = {
    accessToken: 'test-token',
    providerSpecificData: {
      profileArn: 'arn:aws:codewhisperer:us-east-1:123456789012:profile/TEST',
      authMethod: 'builder_id',
    },
  };

  const cred = parseCredential(secret);
  assert.equal(cred.profileArn, 'arn:aws:codewhisperer:us-east-1:123456789012:profile/TEST');
});
