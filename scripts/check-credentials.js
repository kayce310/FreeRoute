import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/freeroute.sqlite');
const rows = db.prepare('SELECT provider_id, credential_id, name, enabled, priority, test_status, cooldown_until FROM credentials WHERE provider_id = ?').all('kiro');
console.table(rows);
db.close();
