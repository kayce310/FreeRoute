import { DatabaseSync } from 'node:sqlite';
import type { Preference } from '../contracts.js';

export interface ModelPreference { providerId: string; modelId: string; preference: Preference; updatedAt: Date; }

/** Local user routing preferences; no requests or provider secrets are stored here. */
export class SqlitePreferenceStore {
  private readonly database: DatabaseSync;
  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec(`CREATE TABLE IF NOT EXISTS model_preferences (
      provider_id TEXT NOT NULL, model_id TEXT NOT NULL, preference TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (provider_id, model_id)
    ) STRICT;`);
  }
  async set(providerId: string, modelId: string, preference: Preference, now = new Date()): Promise<void> {
    this.database.prepare(`INSERT INTO model_preferences (provider_id, model_id, preference, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(provider_id, model_id) DO UPDATE SET preference = excluded.preference, updated_at = excluded.updated_at`)
      .run(providerId, modelId, preference, now.toISOString());
  }
  async list(): Promise<ModelPreference[]> {
    const rows = this.database.prepare('SELECT provider_id, model_id, preference, updated_at FROM model_preferences ORDER BY provider_id, model_id').all() as Array<{ provider_id: string; model_id: string; preference: Preference; updated_at: string }>;
    return rows.map((row) => ({ providerId: row.provider_id, modelId: row.model_id, preference: row.preference, updatedAt: new Date(row.updated_at) }));
  }
  async map(): Promise<Map<string, Preference>> { return new Map((await this.list()).map((item) => [`${item.providerId}\u0000${item.modelId}`, item.preference])); }
  close(): void { this.database.close(); }
}
