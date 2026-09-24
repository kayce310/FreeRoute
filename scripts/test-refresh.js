/**
 * Direct Kiro token refresh test
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function main() {
  const root = process.cwd();
  const masterSecret = readFileSync(join(root, 'data', '.master_secret'), 'utf8').trim();

  const { SqliteCredentialStore } = await import('../dist/src/storage/sqlite-credential-store.js');
  const store = new SqliteCredentialStore(join(root, 'data', 'freeroute.sqlite'), masterSecret);

  const credentials = await store.list();
  const kiroCreds = credentials.filter(c => c.providerId === 'kiro');

  console.log(`Found ${kiroCreds.length} Kiro credentials\n`);

  for (const cred of kiroCreds) {
    console.log(`=== ${cred.credentialId} ===`);
    const secret = await store.get('kiro', cred.credentialId);
    if (typeof secret !== 'object' || !secret) {
      console.log('  ERROR: no secret\n');
      continue;
    }

    const psd = secret.providerSpecificData || {};
    const refreshToken = secret.refreshToken;
    const clientId = psd.clientId;
    const clientSecret = psd.clientSecret;
    const region = psd.region || 'us-east-1';
    const authMethod = psd.authMethod;

    console.log(`  accessToken: ${(secret.accessToken || '').slice(0, 15)}...`);
    console.log(`  refreshToken: ${(refreshToken || 'NONE').slice(0, 15)}...`);
    console.log(`  authMethod: ${authMethod}`);
    console.log(`  clientId: ${(clientId || 'NONE').slice(0, 15)}...`);
    console.log(`  clientSecret present: ${!!clientSecret}`);
    console.log(`  expiresAt: ${secret.expiresAt || psd.expiresAt || 'NONE'}`);
    console.log('');

    if (!refreshToken) {
      console.log('  SKIP: no refreshToken\n');
      continue;
    }

    // Try SSO OIDC refresh if we have client credentials
    if (clientId && clientSecret) {
      console.log('  Attempting SSO OIDC refresh...');
      try {
        const res = await fetch(`https://oidc.${region}.amazonaws.com/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            clientSecret,
            refreshToken,
            grantType: 'refresh_token',
          }),
          signal: AbortSignal.timeout(15000),
        });
        console.log(`  Status: ${res.status}`);
        if (res.ok) {
          const data = await res.json();
          console.log(`  ✓ Refresh SUCCESS`);
          console.log(`  New accessToken: ${(data.accessToken || '').slice(0, 15)}...`);
          console.log(`  expiresIn: ${data.expiresIn}`);
          console.log(`  New refreshToken: ${(data.refreshToken || refreshToken).slice(0, 15)}...`);
        } else {
          const text = await res.text();
          console.log(`  ✗ Refresh FAILED: ${text.slice(0, 150)}`);
        }
      } catch (err) {
        console.log(`  ✗ Refresh ERROR: ${err.message}`);
      }
    } else {
      console.log('  Attempting social refresh...');
      try {
        const res = await fetch('https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
          signal: AbortSignal.timeout(15000),
        });
        console.log(`  Status: ${res.status}`);
        if (res.ok) {
          const data = await res.json();
          console.log(`  ✓ Refresh SUCCESS`);
          console.log(`  New accessToken: ${(data.accessToken || '').slice(0, 15)}...`);
          console.log(`  expiresIn: ${data.expiresIn}`);
        } else {
          const text = await res.text();
          console.log(`  ✗ Refresh FAILED: ${text.slice(0, 150)}`);
        }
      } catch (err) {
        console.log(`  ✗ Refresh ERROR: ${err.message}`);
      }
    }
    console.log('');
  }

  store.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
