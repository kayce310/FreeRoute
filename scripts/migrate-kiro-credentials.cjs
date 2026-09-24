/**
 * Migration: upgrade Kiro credentials from plain apiKey string to full CredentialSecret.
 *
 * Before fix, `detect9RouterCredentials()` mapped `row.authType='oauth'` to `'apikey'`,
 * causing all imported Kiro tokens to be stored as {apiKey: '<token>'} — missing
 * refreshToken, profileArn, authMethod, expiresAt.
 *
 * This script reads the live 9router database, pairs each FreeRoute Kiro credential
 * by matching the token prefix (account-1/2/3 → dc649a85/6eab5dbc/c8caf613),
 * and re-saves with the full structured shape.
 */

const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const path = require('path');

const FREE_ROUTE_DB = process.cwd() + '/data/freeroute.sqlite';
const MASTER_SECRET_FILE = process.cwd() + '/data/.master_secret';
const NINE_ROUTER_DB = path.join(process.env.HOME || process.env.USERPROFILE, 'AppData', 'Roaming', '9router', 'db', 'data.sqlite');

// ─── Crypto helpers (mirrors sqlite-credential-store.ts) ───────────────────────
function getKey(masterSecret) {
  return createHash('sha256').update(masterSecret).digest();
}

function encrypt(value, key) {
  const iv = Buffer.alloc(12);
  require('node:crypto').randomFillSync(iv);
  const cipher = require('node:crypto').createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decrypt(value, key) {
  const packed = Buffer.from(value, 'base64url');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = require('node:crypto').createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ─── Mapping: account-N → 9router connection ──────────────────────────────────
// account-1 → dc649a85 (aoaAAAAAGqowfkemCFH6)
// account-2 → 6eab5dbc (aoaAAAAAGqowgM3W_zRX)
// account-3 → c8caf613 (aoaAAAAAGqyYSkW4GoTS)
const ACCOUNT_MAPPING = {
  'account-1': 'dc649a85-0604-4525-9bcc-33fdd794c4e2',
  'account-2': '6eab5dbc-59a3-427b-9123-8ee0b1cf1907',
  'account-3': 'c8caf613-b065-4672-bfd1-494792394d7a',
};

function main() {
  const masterSecret = require('fs').readFileSync(MASTER_SECRET_FILE, 'utf8').trim();
  const key = getKey(masterSecret);

  // Read 9router source data
  const nrDb = new DatabaseSync(NINE_ROUTER_DB, { readOnly: true });
  const nrRows = nrDb.prepare(
    "SELECT id, data FROM providerConnections WHERE provider = 'kiro'"
  ).all();
  nrDb.close();

  const nrMap = {};
  for (const row of nrRows) {
    const parsed = JSON.parse(row.data || '{}');
    const ak = parsed.accessToken || '';
    nrMap[row.id] = {
      accessToken: ak,
      refreshToken: parsed.refreshToken || null,
      authMethod: parsed.providerSpecificData?.authMethod || 'builder-id',
      profileArn: parsed.profileArn || null,
      clientId: parsed.providerSpecificData?.clientId || null,
      clientSecret: parsed.providerSpecificData?.clientSecret || null,
      region: parsed.providerSpecificData?.region || 'us-east-1',
      expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt).getTime() : null,
    };
  }

  console.log('9router Kiro connections found:', Object.keys(nrMap).length);
  for (const [id, d] of Object.entries(nrMap)) {
    console.log(`  ${id}: token=${d.accessToken.slice(0, 12)}... refresh=${!!d.refreshToken}`);
  }

  // Read FreeRoute credentials
  const frDb = new DatabaseSync(FREE_ROUTE_DB);
  const frRows = frDb.prepare(
    "SELECT credential_id, encrypted_secret, name FROM credentials WHERE provider_id = 'kiro'"
  ).all();

  let migrated = 0;
  for (const frRow of frRows) {
    const credId = frRow.credential_id;
    const mapping9routerId = ACCOUNT_MAPPING[credId];
    if (!mapping9routerId) {
      console.log(`  SKIP ${credId}: no mapping`);
      continue;
    }

    // Decrypt current secret
    const decrypted = decrypt(frRow.encrypted_secret, key);
    const current = JSON.parse(decrypted);
    console.log(`\n[${credId}] current shape:`, Object.keys(current));

    // Build full CredentialSecret from 9router source
    const nrData = nrMap[mapping9routerId];
    if (!nrData) {
      console.log(`  SKIP: no 9router data for ${mapping9routerId}`);
      continue;
    }

    const newSecret = {
      accessToken: nrData.accessToken,
      refreshToken: nrData.refreshToken,
      authType: 'access_token',
      providerSpecificData: {
        authMethod: nrData.authMethod,
        region: nrData.region,
        profileArn: nrData.profileArn,
        clientId: nrData.clientId,
        clientSecret: nrData.clientSecret,
        expiresAt: nrData.expiresAt || undefined,
      },
    };

    const encrypted = encrypt(JSON.stringify(newSecret), key);
    frDb.prepare(
      "UPDATE credentials SET encrypted_secret = ? WHERE provider_id = ? AND credential_id = ?"
    ).run(encrypted, 'kiro', credId);

    console.log(`  MIGRATED: accessToken=${newSecret.accessToken.slice(0, 12)}... refresh=${!!newSecret.refreshToken} authMethod=${newSecret.authMethod}`);
    migrated++;
  }
  frDb.close();

  console.log(`\nMigrated ${migrated}/3 Kiro credentials.`);
  console.log('Run: freeroute refresh or restart server to activate.');
}

main();
