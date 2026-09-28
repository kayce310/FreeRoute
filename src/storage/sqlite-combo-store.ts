import { DatabaseSync } from 'node:sqlite';
import type { ExtendedCustomCombo, ComboProvenanceEntry } from '../benchmarks/external/combo-types.js';

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
  listExtended(): ExtendedCustomCombo[];
  get(comboId: string): CustomCombo | null;
  getExtended(comboId: string): ExtendedCustomCombo | null;
  put(combo: { comboId: string; name: string; models: string[]; description?: string; type?: 'manual' | 'automatic'; policy?: string; provenance?: string; snapshotId?: string }): CustomCombo;
  update(comboId: string, updates: Partial<{ name: string; models: string[]; description?: string; type: 'manual' | 'automatic'; policy: string; provenance: string; snapshotId: string; locked: boolean }>): ExtendedCustomCombo | null;
  delete(comboId: string): boolean;
  addProvenance(comboId: string, entry: ComboProvenanceEntry): void;
  getProvenance(comboId: string): ComboProvenanceEntry[];
  close(): void;
}

export function createSqliteComboStore(filename: string): SqliteComboStore {
  const db = new DatabaseSync(filename);

  // Create table with Phase 4 columns
  db.exec(`
    CREATE TABLE IF NOT EXISTS combos (
      combo_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      models_json TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL DEFAULT 'manual',
      policy TEXT,
      provenance TEXT,
      snapshot_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      locked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;
  `);

  // Add new columns if they don't exist (migration)
  const columns = db.prepare(`PRAGMA table_info(combos)`).all() as Array<{name: string}>;
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('type')) {
    try { db.exec('ALTER TABLE combos ADD COLUMN type TEXT NOT NULL DEFAULT \'manual\''); } catch {}
  }
  if (!columnNames.includes('policy')) {
    try { db.exec('ALTER TABLE combos ADD COLUMN policy TEXT'); } catch {}
  }
  if (!columnNames.includes('provenance')) {
    try { db.exec('ALTER TABLE combos ADD COLUMN provenance TEXT'); } catch {}
  }
  if (!columnNames.includes('snapshot_id')) {
    try { db.exec('ALTER TABLE combos ADD COLUMN snapshot_id TEXT'); } catch {}
  }
  if (!columnNames.includes('version')) {
    try { db.exec('ALTER TABLE combos ADD COLUMN version INTEGER NOT NULL DEFAULT 1'); } catch {}
  }
  if (!columnNames.includes('locked')) {
    try { db.exec('ALTER TABLE combos ADD COLUMN locked INTEGER NOT NULL DEFAULT 0'); } catch {}
  }

  // Create provenance table
  db.exec(`
    CREATE TABLE IF NOT EXISTS combo_provenance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      combo_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      generated_at TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      policy_json TEXT NOT NULL,
      candidate_count INTEGER NOT NULL,
      selected_count INTEGER NOT NULL,
      FOREIGN KEY (combo_id) REFERENCES combos(combo_id)
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

    listExtended(): ExtendedCustomCombo[] {
      const rows = db.prepare(`
        SELECT combo_id, name, models_json, description, type, policy, provenance, snapshot_id, version, locked, created_at, updated_at
        FROM combos
        ORDER BY created_at DESC
      `).all() as unknown as Array<{
        combo_id: string;
        name: string;
        models_json: string;
        description: string | null;
        type: string;
        policy: string | null;
        provenance: string | null;
        snapshot_id: string | null;
        version: number;
        locked: number;
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
        let policy: string | undefined;
        try {
          if (r.policy) policy = r.policy;
        } catch {}
        let provenance: string | undefined;
        try {
          if (r.provenance) provenance = r.provenance;
        } catch {}

        return {
          comboId: r.combo_id,
          name: r.name,
          models,
          description: r.description ?? undefined,
          type: r.type as 'manual' | 'automatic',
          policy,
          provenance,
          snapshotId: r.snapshot_id ?? undefined,
          version: r.version,
          locked: r.locked === 1,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      });
    },

    get(comboId: string): CustomCombo | null {
      const extended = this.getExtended(comboId);
      if (!extended) return null;
      return {
        comboId: extended.comboId,
        name: extended.name,
        models: extended.models,
        description: extended.description,
        createdAt: extended.createdAt,
        updatedAt: extended.updatedAt,
      };
    },

    getExtended(comboId: string): ExtendedCustomCombo | null {
      const rows = db.prepare(`
        SELECT combo_id, name, models_json, description, type, policy, provenance, snapshot_id, version, locked, created_at, updated_at
        FROM combos
        WHERE combo_id = ?
      `).get(comboId) as unknown as {
        combo_id: string;
        name: string;
        models_json: string;
        description: string | null;
        type: string;
        policy: string | null;
        provenance: string | null;
        snapshot_id: string | null;
        version: number;
        locked: number;
        created_at: string;
        updated_at: string;
      } | undefined;

      if (!rows) return null;

      let models: string[] = [];
      try {
        models = JSON.parse(rows.models_json);
      } catch {
        models = [];
      }
      let policy: string | undefined;
      try {
        if (rows.policy) policy = rows.policy;
      } catch {}
      let provenance: string | undefined;
      try {
        if (rows.provenance) provenance = rows.provenance;
      } catch {}

      return {
        comboId: rows.combo_id,
        name: rows.name,
        models,
        description: rows.description ?? undefined,
        type: rows.type as 'manual' | 'automatic',
        policy,
        provenance,
        snapshotId: rows.snapshot_id ?? undefined,
        version: rows.version,
        locked: rows.locked === 1,
        createdAt: rows.created_at,
        updatedAt: rows.updated_at,
      };
    },

    put(combo): CustomCombo {
      const now = new Date().toISOString();
      const existing = this.get(combo.comboId);
      const createdAt = existing ? existing.createdAt : now;
      const modelsJson = JSON.stringify(combo.models || []);
      const comboType = combo.type ?? 'manual';

      db.prepare(`
        INSERT INTO combos (combo_id, name, models_json, description, type, policy, provenance, snapshot_id, version, locked, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
        ON CONFLICT(combo_id) DO UPDATE SET
          name = excluded.name,
          models_json = excluded.models_json,
          description = excluded.description,
          policy = excluded.policy,
          provenance = excluded.provenance,
          snapshot_id = excluded.snapshot_id,
          updated_at = excluded.updated_at
      `).run(combo.comboId, combo.name, modelsJson, combo.description ?? null, comboType, combo.policy ?? null, combo.provenance ?? null, combo.snapshotId ?? null, createdAt, now);

      return {
        comboId: combo.comboId,
        name: combo.name,
        models: combo.models,
        description: combo.description,
        createdAt,
        updatedAt: now,
      };
    },

    update(comboId: string, updates): ExtendedCustomCombo | null {
      const existing = this.getExtended(comboId);
      if (!existing) return null;

      const now = new Date().toISOString();
      const modelsJson = updates.models !== undefined ? JSON.stringify(updates.models) : JSON.stringify(existing.models);
      const newVersion = existing.version + 1;

      db.prepare(`
        UPDATE combos SET
          name = COALESCE(?, name),
          models_json = COALESCE(?, models_json),
          description = COALESCE(?, description),
          type = COALESCE(?, type),
          policy = COALESCE(?, policy),
          provenance = COALESCE(?, provenance),
          snapshot_id = COALESCE(?, snapshot_id),
          version = COALESCE(?, version),
          locked = COALESCE(?, locked),
          updated_at = ?
        WHERE combo_id = ?
      `).run(
        updates.name ?? null,
        modelsJson as string,
        updates.description ?? null,
        updates.type ?? null,
        updates.policy ?? null,
        updates.provenance ?? null,
        updates.snapshotId ?? null,
        newVersion,
        updates.locked !== undefined ? (updates.locked ? 1 : 0) : null,
        now,
        comboId
      );

      return this.getExtended(comboId);
    },

    delete(comboId: string): boolean {
      // Also delete provenance entries
      db.prepare('DELETE FROM combo_provenance WHERE combo_id = ?').run(comboId);
      const result = db.prepare('DELETE FROM combos WHERE combo_id = ?').run(comboId);
      return (result.changes ?? 0) > 0;
    },

    addProvenance(comboId: string, entry: ComboProvenanceEntry): void {
      db.prepare(`
        INSERT INTO combo_provenance (combo_id, version, generated_at, snapshot_id, policy_json, candidate_count, selected_count)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        comboId,
        entry.version,
        entry.generatedAt,
        entry.snapshotId,
        JSON.stringify(entry.policyUsed),
        entry.candidateCount,
        entry.selectedCount
      );
    },

    getProvenance(comboId: string): ComboProvenanceEntry[] {
      const rows = db.prepare(`
        SELECT version, generated_at, snapshot_id, policy_json, candidate_count, selected_count
        FROM combo_provenance
        WHERE combo_id = ?
        ORDER BY version ASC, generated_at ASC
      `).all(comboId) as unknown as Array<{
        version: number;
        generated_at: string;
        snapshot_id: string;
        policy_json: string;
        candidate_count: number;
        selected_count: number;
      }>;

      return rows.map(r => {
        let policyUsed = { primary: 'catalog_priority' as const, direction: 'desc' as const };
        try {
          policyUsed = JSON.parse(r.policy_json);
        } catch {}

        return {
          version: r.version,
          generatedAt: r.generated_at,
          snapshotId: r.snapshot_id,
          policyUsed,
          candidateCount: r.candidate_count,
          selectedCount: r.selected_count,
        };
      });
    },

    close(): void {
      db.close();
    },
  };
}
