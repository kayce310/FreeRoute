import { DatabaseSync } from 'node:sqlite';
import type { CatalogStore } from '../catalog.js';
import type { ModelRecord } from '../contracts.js';

interface ModelRow {
  provider_id: string;
  model_id: string;
  capabilities_json: string;
  free_tier: ModelRecord['freeTier'];
  checked_at: string;
  expires_at: string | null;
  priority: number;
  enabled: number;
  pricing_status: ModelRecord['pricingStatus'] | null;
  catalog_status: ModelRecord['catalogStatus'] | null;
}

/** Durable local catalog cache. Secrets deliberately do not belong in this store. */
export class SqliteCatalogStore implements CatalogStore {
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS catalog_models (
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        free_tier TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        expires_at TEXT,
        priority INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        pricing_status TEXT NOT NULL DEFAULT 'unknown',
        catalog_status TEXT NOT NULL DEFAULT 'live',
        PRIMARY KEY (provider_id, model_id)
      ) STRICT;
    `);
    for (const statement of [
      'ALTER TABLE catalog_models ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1',
      "ALTER TABLE catalog_models ADD COLUMN pricing_status TEXT NOT NULL DEFAULT 'unknown'",
      "ALTER TABLE catalog_models ADD COLUMN catalog_status TEXT NOT NULL DEFAULT 'live'",
    ]) { try { this.database.exec(statement); } catch {} }
  }

  async list(): Promise<ModelRecord[]> {
    const rows = this.database.prepare(`
      SELECT provider_id, model_id, capabilities_json, free_tier, checked_at, expires_at, priority, enabled, pricing_status, catalog_status
      FROM catalog_models ORDER BY provider_id, model_id
    `).all() as unknown as ModelRow[];
    return rows.map(rowToModel);
  }

  async replaceProvider(providerId: string, models: ModelRecord[]): Promise<void> {
    const deleteRows = this.database.prepare('DELETE FROM catalog_models WHERE provider_id = ?');
    const insertRow = this.database.prepare(`
      INSERT INTO catalog_models (
        provider_id, model_id, capabilities_json, free_tier, checked_at, expires_at, priority, enabled, pricing_status, catalog_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.database.exec('BEGIN');
    try {
      deleteRows.run(providerId);
      for (const model of models) {
        insertRow.run(
          model.providerId,
          model.modelId,
          JSON.stringify(model.capabilities),
          model.freeTier,
          model.checkedAt.toISOString(),
          model.expiresAt?.toISOString() ?? null,
          model.priority,
          model.enabled === false ? 0 : 1,
          model.pricingStatus ?? 'unknown',
          model.catalogStatus ?? 'live',
        );
      }
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}

function rowToModel(row: ModelRow): ModelRecord {
  return {
    providerId: row.provider_id,
    modelId: row.model_id,
    capabilities: JSON.parse(row.capabilities_json),
    freeTier: row.free_tier,
    checkedAt: new Date(row.checked_at),
    expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
    priority: row.priority,
    enabled: row.enabled !== 0,
    pricingStatus: row.pricing_status ?? 'unknown',
    catalogStatus: row.catalog_status ?? 'live',
  };
}
