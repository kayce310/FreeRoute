import { DatabaseSync } from 'node:sqlite';

export interface CustomCombo {
  comboId: string;
  name: string;
  models: string[];
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SqliteComboStore {
  list(): CustomCombo[];
  get(comboId: string): CustomCombo | null;
  put(combo: { comboId: string; name: string; models: string[]; description?: string }): CustomCombo;
  delete(comboId: string): boolean;
  close(): void;
}

export function createSqliteComboStore(filename: string): SqliteComboStore {
  const db = new DatabaseSync(filename);
  db.exec(`
    CREATE TABLE IF NOT EXISTS combos (
      combo_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      models_json TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
  `);

  return {
    list(): CustomCombo[] {
      const rows = db.prepare(`
        SELECT combo_id, name, models_json, description, created_at, updated_at 
        FROM combos 
        ORDER BY created_at DESC
      `).all() as unknown as Array<{
        combo_id: string;
        name: string;
        models_json: string;
        description: string | null;
        created_at: string;
        updated_at: string;
      }>;

      return rows.map((r) => {
        let models: string[] = [];
        try {
          models = JSON.parse(r.models_json);
        } catch {
          models = [];
        }
        return {
          comboId: r.combo_id,
          name: r.name,
          models,
          description: r.description ?? undefined,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      });
    },

    get(comboId: string): CustomCombo | null {
      const row = db.prepare(`
        SELECT combo_id, name, models_json, description, created_at, updated_at 
        FROM combos 
        WHERE combo_id = ?
      `).get(comboId) as unknown as {
        combo_id: string;
        name: string;
        models_json: string;
        description: string | null;
        created_at: string;
        updated_at: string;
      } | undefined;

      if (!row) return null;
      let models: string[] = [];
      try {
        models = JSON.parse(row.models_json);
      } catch {
        models = [];
      }
      return {
        comboId: row.combo_id,
        name: row.name,
        models,
        description: row.description ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    put(combo): CustomCombo {
      const now = new Date().toISOString();
      const existing = this.get(combo.comboId);
      const createdAt = existing ? existing.createdAt : now;
      const modelsJson = JSON.stringify(combo.models || []);

      db.prepare(`
        INSERT INTO combos (combo_id, name, models_json, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(combo_id) DO UPDATE SET
          name = excluded.name,
          models_json = excluded.models_json,
          description = excluded.description,
          updated_at = excluded.updated_at
      `).run(combo.comboId, combo.name, modelsJson, combo.description ?? null, createdAt, now);

      return {
        comboId: combo.comboId,
        name: combo.name,
        models: combo.models,
        description: combo.description,
        createdAt,
        updatedAt: now,
      };
    },

    delete(comboId: string): boolean {
      const result = db.prepare('DELETE FROM combos WHERE combo_id = ?').run(comboId);
      return (result.changes ?? 0) > 0;
    },

    close(): void {
      db.close();
    },
  };
}
