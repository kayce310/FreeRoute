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
  close(): void;
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
    list(): ProviderDefinition[] {
      const rows = db.prepare('SELECT provider_id, adapter_type, base_url, classify_as_free, enabled FROM providers ORDER BY provider_id').all() as unknown as Array<{
        provider_id: string;
        adapter_type: 'openai-compatible' | 'gemini';
        base_url: string;
        classify_as_free: string | null;
        enabled: number;
      }>;
      return rows.map((r) => ({
        providerId: r.provider_id,
        adapterType: r.adapter_type,
        baseUrl: r.base_url,
        classifyAsFree: r.classify_as_free ?? undefined,
        enabled: Boolean(r.enabled),
      }));
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
    close() {
      db.close();
    },
  };
}
