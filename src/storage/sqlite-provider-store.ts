import { DatabaseSync } from 'node:sqlite';

export interface ProviderDefinition {
  providerId: string;
  adapterType: 'openai-compatible' | 'gemini';
  baseUrl: string;
  classifyAsFree?: string;
  enabled: boolean;
}

export interface SqliteProviderStore {
  list(): ProviderDefinition[];
  put(def: ProviderDefinition): void;
  remove(providerId: string): void;
}

export function createSqliteProviderStore(filename: string): SqliteProviderStore {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      provider_id TEXT PRIMARY KEY,
      adapter_type TEXT NOT NULL,
      base_url TEXT NOT NULL,
      classify_as_free TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
    ) STRICT;
  `);
  return {
    list() {
      return db.prepare('SELECT * FROM providers ORDER BY provider_id').all() as unknown as ProviderDefinition[];
    },
    put(def) {
      db.prepare(`
        INSERT INTO providers (provider_id, adapter_type, base_url, classify_as_free, enabled)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(provider_id) DO UPDATE SET
          adapter_type = excluded.adapter_type,
          base_url = excluded.base_url,
          classify_as_free = excluded.classify_as_free,
          enabled = excluded.enabled
      `).run(def.providerId, def.adapterType, def.baseUrl, def.classifyAsFree ?? null, def.enabled ? 1 : 0);
    },
    remove(providerId) {
      db.prepare('DELETE FROM providers WHERE provider_id = ?').run(providerId);
    },
  };
}
