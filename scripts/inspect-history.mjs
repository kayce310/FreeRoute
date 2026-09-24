import { DatabaseSync } from 'node:sqlite';
import { createHash, createDecipheriv } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main() {
  const secretFile = resolve(ROOT, 'data/.master_secret');
  const masterSecret = readFileSync(secretFile, 'utf8').trim();
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

  // Check when catalog was last updated
  const models = db.prepare(`SELECT model_id, checked_at, enabled, catalog_status FROM catalog_models WHERE provider_id='kiro' ORDER BY model_id`).all();
  console.log('\n=== KIRO CATALOG ===');
  models.forEach(m => {
    console.log(`  ${m.model_id} | checked=${m.checked_at} | enabled=${m.enabled} | status=${m.catalog_status}`);
  });

  // Check recent routing events
  const events = db.prepare(`SELECT * FROM routing_events WHERE provider_id='kiro' ORDER BY occurred_at DESC LIMIT 20`).all();
  console.log(`\n=== RECENT KIRO ROUTING EVENTS (${events.length}) ===`);
  events.forEach(e => {
    console.log(`  ${e.occurred_at} | ${e.outcome} | latency=${e.latency_ms}ms | ${e.failure_kind || ''} | ${e.error_message || ''}`);
  });

  // Check table schema for routing_events
  const schema = db.prepare(`PRAGMA table_info(routing_events)`).all();
  console.log('\n=== routing_events SCHEMA ===');
  schema.forEach(c => console.log(`  ${c.name}: ${c.type}`));

  db.close();
}

main().catch(err => { console.error(err); process.exit(1); });
