import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCredential } from '../src/providers/kiro.js';
import type { CredentialSecret } from '../src/storage/sqlite-credential-store.js';

test('parseCredential preserves account-specific profileArn from CredentialSecret providerSpecificData', () => {
  const secret: CredentialSecret = {
    accessToken: 'aoa-test-token',
    refreshToken: 'aor-refresh-token',
    authType: 'access_token',
    providerSpecificData: {
      profileArn: 'arn:aws:codewhisperer:us-east-1:123456789012:profile/ABCDE12345',
      authMethod: 'builder_id',
      region: 'us-east-1',
      expiresAt: Date.now() + 3600000,
    },
  };
  const cred = parseCredential(secret);
  assert.equal(cred.accessToken, 'aoa-test-token');
  assert.equal(cred.refreshToken, 'aor-refresh-token');
  assert.equal(cred.profileArn, 'arn:aws:codewhisperer:us-east-1:123456789012:profile/ABCDE12345');
  assert.equal(cred.authMethod, 'builder_id');
  assert.equal(cred.region, 'us-east-1');
  assert.ok(cred.expiresAt && cred.expiresAt > Date.now());
});

test('parseCredential with no profileArn returns null and does not default', () => {
  const cred = parseCredential({
    accessToken: 'aoa-test',
    authType: 'access_token',
  });
  assert.strictEqual(cred.profileArn, null);
});

test('parseCredential handles plain accessToken string backward compat', () => {
  const cred = parseCredential('plain-api-key-string');
  assert.equal(cred.accessToken, 'plain-api-key-string');
  assert.strictEqual(cred.profileArn, undefined);
});