import { DatabaseSync } from 'node:sqlite';
import { createHash, createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main() {
  // Read actual master secret
  const secretFile = resolve(ROOT, 'data/.master_secret');
  let masterSecret;
  try {
    masterSecret = readFileSync(secretFile, 'utf8').trim();
  } catch {
    console.error('Cannot read master secret from', secretFile);
    process.exit(1);
  }
  console.log('Master secret length:', masterSecret.length);

  const db = new DatabaseSync(resolve(ROOT, 'data/freeroute.sqlite'));
  const key = createHash('sha256').update(masterSecret).digest();

  function decryptBase64url(b64url, key) {
    const packed = Buffer.from(b64url, 'base64url');
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  }

  console.log('\n=== KIRO CREDENTIALS (decrypted with real master secret) ===');
  const credRows = db.prepare(`SELECT provider_id, credential_id, encrypted_secret, test_status, enabled FROM credentials WHERE provider_id='kiro'`).all();
  credRows.forEach(r => {
    let secret;
    try { secret = decryptBase64url(r.encrypted_secret, key); } catch(e) { secret = '<decrypt failed: ' + e.message + '>'; }
    let parsed;
    try { parsed = JSON.parse(secret); } catch { parsed = { _raw: secret.slice(0, 60) + '...' }; }
    const psd = parsed.providerSpecificData || {};
    console.log(`\n[${r.provider_id}/${r.credential_id}] enabled=${r.enabled} test_status=${r.test_status}`);
    console.log(`  authMethod: ${psd.authMethod || '(none)'}`);
    console.log(`  region: ${psd.region || 'us-east-1'}`);
    if (psd.profileArn) {
      const arn = psd.profileArn;
      console.log(`  profileArn: ${arn}`);
    } else {
      console.log('  profileArn: (MISSING!)');
    }
    if (parsed.accessToken) {
      const tok = parsed.accessToken;
      const fp = createHash('sha256').update(tok).digest('hex');
      console.log(`  accessToken: ${tok.slice(0,12)}...${tok.slice(-8)} (len=${tok.length})`);
      console.log(`  accessToken SHA256: ${fp}`);
    }
    if (parsed.refreshToken) {
      const tok = parsed.refreshToken;
      console.log(`  refreshToken: ${tok.slice(0,12)}...${tok.slice(-8)} (len=${tok.length})`);
    }
    if (psd.expiresAt) {
      const exp = typeof psd.expiresAt === 'number' ? psd.expiresAt : new Date(psd.expiresAt).getTime();
      const now = Date.now();
      console.log(`  expiresAt: ${new Date(exp).toISOString()}`);
      console.log(`  ttl remaining: ${(exp - now) / 1000 / 60} min`);
      console.log(`  near-expiry (<5min): ${exp - now < 5 * 60 * 1000}`);
      console.log(`  expired: ${exp < now}`);
    } else {
      console.log('  expiresAt: (none — no proactive refresh)');
    }
  });

  console.log('\n\n=== KIRO CATALOG MODELS ===');
  const modelRows = db.prepare(`SELECT model_id, enabled, catalog_status, priority FROM catalog_models WHERE provider_id='kiro' ORDER BY model_id`).all();
  modelRows.forEach(r => {
    console.log(`  ${r.model_id} | enabled=${r.enabled} | status=${r.catalog_status} | priority=${r.priority}`);
  });

  console.log('\n\n=== ALL PROVIDERS IN PROVIDERS TABLE ===');
  const provRows = db.prepare(`SELECT * FROM providers`).all();
  provRows.forEach(r => console.log(`  ${r.provider_id} adapter=${r.adapter_type} baseUrl=${r.base_url} enabled=${r.enabled}`));

  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
