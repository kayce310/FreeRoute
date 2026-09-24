/**
 * Test Kiro refresh with runtime logging
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const root = process.cwd();
  const masterSecret = readFileSync(join(root, 'data', '.master_secret'), 'utf8').trim();

  const { SqliteCredentialStore } = await import('../dist/src/storage/sqlite-credential-store.js');
  const store = new SqliteCredentialStore(join(root, 'data', 'freeroute.sqlite'), masterSecret);

  const cred = await store.get('kiro', 'account-3');
  if (!cred || typeof cred !== 'object') {
    console.log('No credential found');
    return;
  }

  console.log('=== Account-3 Credential ===');
  console.log('accessToken:', (cred.accessToken || '').slice(0, 20) + '...');
  console.log('refreshToken:', (cred.refreshToken || 'NONE').slice(0, 20) + '...');
  const psd = cred.providerSpecificData || {};
  console.log('psd.authMethod:', psd.authMethod);
  console.log('psd.region:', psd.region);
  console.log('psd.clientId:', (psd.clientId || 'NONE').slice(0, 20) + '...');
  console.log('psd.clientSecret present:', !!psd.clientSecret);
  console.log('psd.expiresAt:', psd.expiresAt);
  console.log('top-level expiresAt:', cred.expiresAt);

  // Test refresh
  console.log('\n=== Testing Refresh ===');
  const res = await fetch('https://oidc.us-east-1.amazonaws.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: psd.clientId,
      clientSecret: psd.clientSecret,
      refreshToken: cred.refreshToken,
      grantType: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15000),
  });

  console.log('Status:', res.status);
  if (res.ok) {
    const data = await res.json();
    console.log('✓ Refresh SUCCESS');
    console.log('New accessToken:', (data.accessToken || '').slice(0, 20) + '...');
    console.log('expiresIn:', data.expiresIn);

    // Update credential in DB
    const updatedSecret = {
      ...cred,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || cred.refreshToken,
      expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : cred.expiresAt,
    };
    await store.put('kiro', 'account-3', updatedSecret);
    console.log('✓ Credential updated in database');
  } else {
    const text = await res.text();
    console.log('✗ Refresh FAILED:', text.slice(0, 100));
  }

  store.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
