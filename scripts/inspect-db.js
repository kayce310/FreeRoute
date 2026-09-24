const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');

const db = new DatabaseSync('data/freeroute.sqlite');
const masterSecret = process.argv[2] || 'freeroute-master-secret';
const key = createHash('sha256').update(masterSecret).digest();

function decryptBase64url(b64url, key) {
  const { createDecipheriv } = require('node:crypto');
  const packed = Buffer.from(b64url, 'base64url');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

const rows = db.prepare(`SELECT provider_id, credential_id, encrypted_secret, test_status, enabled FROM credentials`).all();
console.log('Credentials count:', rows.length);
rows.forEach(r => {
  let secret;
  try { secret = decryptBase64url(r.encrypted_secret, key); } catch(e) { secret = '<decrypt failed: ' + e.message + '>'; }
  let parsed;
  try { parsed = JSON.parse(secret); } catch { parsed = { _raw: secret.slice(0, 40) + '... (plain string)' }; }
  console.log(`\n[${r.provider_id}/${r.credential_id}] enabled=${r.enabled} status=${r.test_status}`);
  if (parsed.accessToken) {
    const tok = parsed.accessToken;
    console.log(`  accessToken: ${tok.slice(0,12)}...${tok.slice(-8)} (len=${tok.length})`);
  }
  if (parsed.refreshToken) {
    const tok = parsed.refreshToken;
    console.log(`  refreshToken: ${tok.slice(0,12)}...${tok.slice(-8)} (len=${tok.length})`);
  }
  if (parsed.providerSpecificData) {
    const psd = parsed.providerSpecificData;
    console.log(`  authMethod: ${psd.authMethod || '(none)'}`);
    console.log(`  region: ${psd.region || 'us-east-1'}`);
    if (psd.profileArn) console.log(`  profileArn: ${psd.profileArn.slice(0,50)}...`);
    if (psd.expiresAt) console.log(`  expiresAt: ${new Date(psd.expiresAt).toISOString()}`);
    if (psd.clientId) console.log(`  clientId: ${psd.clientId.slice(0,8)}...`);
  }
  if (parsed.authType) console.log(`  authType: ${parsed.authType}`);
});

const modelRows = db.prepare(`SELECT model_id, enabled, catalog_status FROM catalog_models WHERE provider_id='kiro'`).all();
console.log('\n\nKiro models in catalog:', modelRows.length);
modelRows.forEach(r => console.log(`  ${r.model_id} enabled=${r.enabled} status=${r.catalog_status}`));

db.close();
