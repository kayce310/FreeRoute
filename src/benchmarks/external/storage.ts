import { DatabaseSync } from 'node:sqlite';
import type {
  ExternalBenchmarkSnapshot,
  ExternalBenchmarkEntry,
  ExternalBenchmarkFilter,
  ExternalBenchmarkQueryResult,
  ExternalSourceMetadata,
  ExternalSourceRuntimeState,
  ExternalSourceStatus,
  RefreshScope,
} from './interfaces.js';
import { mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

interface SnapshotRow {
  snapshot_id: string;
  source_id: string;
  fetched_at: string;
  version: number;
  status: string;
  error_message: string | null;
  metadata: string | null;
  created_at: string;
}

interface EntryRow {
  entry_id: string;
  snapshot_id: string;
  model_permaslug: string;
  model_name: string | null;
  provider_id: string | null;
  metric_key: string;
  metric_value: string;
  unit: string | null;
  source_url: string | null;
  created_at: string;
}

interface SourceMetaRow {
  source_id: string;
  name: string;
  description: string;
  url: string;
  ttl_ms: number;
  max_age_ms: number | null;
  enabled: number;
  last_successful_fetch: string | null;
  last_failure_timestamp: string | null;
  last_failure_error: string | null;
  last_failure_retryable: number | null;
}

interface SourceRuntimeRow {
  source_id: string;
  status: string;
  in_flight_scope: string | null;
  next_refresh_at: string | null;
  error_message: string | null;
}

/**
 * SQLite storage for external benchmark data.
 * Manages snapshots (one per fetch) and entries (many per snapshot).
 */
export class ExternalBenchmarkStorage {
  private readonly database: DatabaseSync;

  constructor(dataDir: string = './data', filename: string = 'benchmark-external.sqlite') {
    const resolvedDir = resolve(dataDir);
    if (!existsSync(resolvedDir)) {
      mkdirSync(resolvedDir, { recursive: true });
    }
    const dbPath = join(resolvedDir, filename);
    this.database = new DatabaseSync(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS external_benchmark_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL CHECK(status IN ('fresh', 'stale', 'refreshing', 'failed', 'unavailable')),
        error_message TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) STRICT;
    `);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS external_benchmark_entries (
        entry_id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL REFERENCES external_benchmark_snapshots(snapshot_id) ON DELETE CASCADE,
        model_permaslug TEXT NOT NULL,
        model_name TEXT,
        provider_id TEXT,
        metric_key TEXT NOT NULL,
        metric_value TEXT NOT NULL,
        unit TEXT,
        source_url TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(snapshot_id, model_permaslug, metric_key)
      ) STRICT;
    `);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS external_source_metadata (
        source_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        url TEXT NOT NULL,
        ttl_ms INTEGER NOT NULL,
        max_age_ms INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_successful_fetch TEXT,
        last_failure_timestamp TEXT,
        last_failure_error TEXT,
        last_failure_retryable INTEGER
      ) STRICT;
    `);

    this.database.exec(`
      CREATE TABLE IF NOT EXISTS external_source_runtime (
        source_id TEXT PRIMARY KEY,
        status TEXT NOT NULL DEFAULT 'unavailable',
        in_flight_scope TEXT,
        next_refresh_at TEXT,
        error_message TEXT
      ) STRICT;
    `);

    // Indexes
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_source_status
        ON external_benchmark_snapshots(source_id, status);
    `);
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshots_fetched_at
        ON external_benchmark_snapshots(source_id, fetched_at DESC);
    `);
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_model
        ON external_benchmark_entries(model_permaslug);
    `);
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_metric
        ON external_benchmark_entries(metric_key);
    `);
    this.database.exec(`
      CREATE INDEX IF NOT EXISTS idx_entries_snapshot
        ON external_benchmark_entries(snapshot_id);
    `);
  }

  // ===== Snapshot operations =====

  async saveSnapshot(snapshot: ExternalBenchmarkSnapshot): Promise<void> {
    const insertSnapshot = this.database.prepare(`
      INSERT OR REPLACE INTO external_benchmark_snapshots
        (snapshot_id, source_id, fetched_at, version, status, error_message, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertSnapshot.run(
      snapshot.snapshotId,
      snapshot.sourceId,
      snapshot.fetchedAt.toISOString(),
      snapshot.version,
      snapshot.status,
      snapshot.errorMessage ?? null,
      snapshot.metadata ? JSON.stringify(snapshot.metadata) : null
    );
  }

  async getLatestSnapshot(sourceId: string): Promise<ExternalBenchmarkSnapshot | undefined> {
      const row = this.database.prepare(`
        SELECT * FROM external_benchmark_snapshots
        WHERE source_id = ?
        ORDER BY fetched_at DESC
        LIMIT 1
      `).get(sourceId) as unknown as SnapshotRow | undefined;

      if (!row) return undefined;
      return this.convertSnapshotRow(row);
    }

    async listSnapshots(sourceId?: string, limit = 10): Promise<ExternalBenchmarkSnapshot[]> {
      let query = `SELECT * FROM external_benchmark_snapshots`;
      const params: unknown[] = [];

      if (sourceId) {
        query += ` WHERE source_id = ?`;
        params.push(sourceId);
      }
      query += ` ORDER BY fetched_at DESC LIMIT ?`;
      params.push(limit);

      const rows = this.database.prepare(query).all(...params as string[]) as unknown as SnapshotRow[];
      return rows.map(r => this.convertSnapshotRow(r));
    }

  async archiveOldSnapshots(sourceId: string, keepCount = 5): Promise<number> {
    // Delete snapshots older than the N most recent ones
    const deleteQuery = `
      DELETE FROM external_benchmark_snapshots
      WHERE source_id = ?
        AND snapshot_id NOT IN (
          SELECT snapshot_id FROM external_benchmark_snapshots
          WHERE source_id = ?
          ORDER BY fetched_at DESC
          LIMIT ?
        )
    `;
    const result = this.database.prepare(deleteQuery).run(sourceId, sourceId, keepCount);
    const changes = typeof result.changes === 'bigint' ? Number(result.changes) : result.changes;
    return changes;
  }

  // ===== Entry operations =====

  async saveEntries(entries: ExternalBenchmarkEntry[]): Promise<void> {
    const insertEntry = this.database.prepare(`
      INSERT OR REPLACE INTO external_benchmark_entries
        (entry_id, snapshot_id, model_permaslug, model_name, provider_id, metric_key, metric_value, unit, source_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const entry of entries) {
      insertEntry.run(
        entry.entryId,
        entry.snapshotId,
        entry.modelPermaslug,
        entry.modelName ?? null,
        entry.providerId ?? null,
        entry.metricKey,
        entry.metricValue,
        entry.unit ?? null,
        entry.sourceUrl ?? null
      );
    }
  }

  async getEntriesBySnapshot(snapshotId: string): Promise<ExternalBenchmarkEntry[]> {
    const rows = this.database.prepare(`
      SELECT * FROM external_benchmark_entries
      WHERE snapshot_id = ?
      ORDER BY model_permaslug, metric_key
    `).all(snapshotId) as unknown as EntryRow[];
    return rows.map(r => this.convertEntryRow(r));
  }

  async queryEntries(filter: ExternalBenchmarkFilter = {}): Promise<ExternalBenchmarkQueryResult> {
    let whereClause = '1=1';
    const params: unknown[] = [];

    if (filter.sourceId) {
      whereClause += ` AND e.source_id = ?`;
      params.push(filter.sourceId);
    }
    if (filter.modelPermaslug) {
      whereClause += ` AND e.model_permaslug = ?`;
      params.push(filter.modelPermaslug);
    }
    if (filter.metricKey) {
      whereClause += ` AND e.metric_key = ?`;
      params.push(filter.metricKey);
    }

    // Count total
    const countQuery = `
      SELECT COUNT(*) as total
      FROM external_benchmark_entries e
      JOIN external_benchmark_snapshots s ON e.snapshot_id = s.snapshot_id
      WHERE ${whereClause}
    `;
    const countResult = this.database.prepare(countQuery).get(...params as string[]) as { total: number | bigint };
    const total = typeof countResult.total === 'bigint' ? Number(countResult.total) : countResult.total;

    // Get entries
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    const queryParams = [...params, limit, offset] as string[];
    const rows = this.database.prepare(`
      SELECT e.*, s.source_id
      FROM external_benchmark_entries e
      JOIN external_benchmark_snapshots s ON e.snapshot_id = s.snapshot_id
      WHERE ${whereClause}
      ORDER BY s.fetched_at DESC, e.model_permaslug, e.metric_key
      LIMIT ? OFFSET ?
    `).all(...queryParams) as unknown as EntryRow[];

    const entries = rows.map(r => this.convertEntryRow(r));

    return { total, entries };
  }

  // ===== Source metadata operations =====

  async saveSourceMetadata(metadata: ExternalSourceMetadata): Promise<void> {
    const insertOrUpdate = this.database.prepare(`
      INSERT INTO external_source_metadata
        (source_id, name, description, url, ttl_ms, max_age_ms, enabled,
         last_successful_fetch, last_failure_timestamp, last_failure_error, last_failure_retryable)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        name = excluded.name,
        description = excluded.description,
        url = excluded.url,
        ttl_ms = excluded.ttl_ms,
        max_age_ms = excluded.max_age_ms,
        enabled = excluded.enabled,
        last_successful_fetch = excluded.last_successful_fetch,
        last_failure_timestamp = excluded.last_failure_timestamp,
        last_failure_error = excluded.last_failure_error,
        last_failure_retryable = excluded.last_failure_retryable
    `);
    insertOrUpdate.run(
      metadata.sourceId,
      metadata.name,
      metadata.description,
      metadata.url,
      metadata.ttlMs,
      metadata.maxAgeMs ?? null,
      metadata.enabled ? 1 : 0,
      metadata.lastSuccessfulFetch?.toISOString() ?? null,
      metadata.lastFailure?.timestamp.toISOString() ?? null,
      metadata.lastFailure?.error ?? null,
      metadata.lastFailure?.retryable ? 1 : null
    );
  }

  async getSourceMetadata(sourceId: string): Promise<ExternalSourceMetadata | undefined> {
    const row = this.database.prepare(`
      SELECT * FROM external_source_metadata WHERE source_id = ?
    `).get(sourceId) as unknown as SourceMetaRow | undefined;

    if (!row) return undefined;
    return {
      sourceId: row.source_id,
      name: row.name,
      description: row.description,
      url: row.url,
      ttlMs: row.ttl_ms,
      maxAgeMs: row.max_age_ms ?? undefined,
      enabled: row.enabled === 1,
      lastSuccessfulFetch: row.last_successful_fetch ? new Date(row.last_successful_fetch) : null,
      lastFailure: row.last_failure_timestamp ? {
        timestamp: new Date(row.last_failure_timestamp),
        error: row.last_failure_error ?? '',
        retryable: row.last_failure_retryable === 1,
      } : null,
    };
  }

  async listAllSourceMetadata(): Promise<ExternalSourceMetadata[]> {
    const rows = this.database.prepare(`
      SELECT * FROM external_source_metadata
    `).all() as unknown as SourceMetaRow[];
    return rows.map(r => ({
      sourceId: r.source_id,
      name: r.name,
      description: r.description,
      url: r.url,
      ttlMs: r.ttl_ms,
      maxAgeMs: r.max_age_ms ?? undefined,
      enabled: r.enabled === 1,
      lastSuccessfulFetch: r.last_successful_fetch ? new Date(r.last_successful_fetch) : null,
      lastFailure: r.last_failure_timestamp ? {
        timestamp: new Date(r.last_failure_timestamp),
        error: r.last_failure_error ?? '',
        retryable: r.last_failure_retryable === 1,
      } : null,
    }));
  }

  // ===== Source runtime state operations =====

  async saveRuntimeState(state: ExternalSourceRuntimeState): Promise<void> {
    const insertOrUpdate = this.database.prepare(`
      INSERT INTO external_source_runtime
        (source_id, status, in_flight_scope, next_refresh_at, error_message)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source_id) DO UPDATE SET
        status = excluded.status,
        in_flight_scope = excluded.in_flight_scope,
        next_refresh_at = excluded.next_refresh_at,
        error_message = excluded.error_message
    `);
    insertOrUpdate.run(
      state.sourceId,
      state.status,
      state.inFlightScope,
      state.nextRefreshAt?.toISOString() ?? null,
      state.error ?? null
    );
  }

  async getRuntimeState(sourceId: string): Promise<ExternalSourceRuntimeState | undefined> {
    const row = this.database.prepare(`
      SELECT * FROM external_source_runtime WHERE source_id = ?
    `).get(sourceId) as unknown as SourceRuntimeRow | undefined;

    if (!row) return undefined;
    return {
      sourceId: row.source_id,
      status: row.status as ExternalSourceStatus,
      inFlightScope: row.in_flight_scope as RefreshScope | null,
      nextRefreshAt: row.next_refresh_at ? new Date(row.next_refresh_at) : null,
      error: row.error_message ?? undefined,
    };
  }

  async listAllRuntimeStates(): Promise<ExternalSourceRuntimeState[]> {
    const rows = this.database.prepare(`
      SELECT * FROM external_source_runtime
    `).all() as unknown as SourceRuntimeRow[];
    return rows.map(r => ({
      sourceId: r.source_id,
      status: r.status as ExternalSourceStatus,
      inFlightScope: r.in_flight_scope as RefreshScope | null,
      nextRefreshAt: r.next_refresh_at ? new Date(r.next_refresh_at) : null,
      error: r.error_message ?? undefined,
    }));
  }

  // ===== Helper conversions =====

  private convertSnapshotRow(row: SnapshotRow): ExternalBenchmarkSnapshot {
    return {
      snapshotId: row.snapshot_id,
      sourceId: row.source_id,
      fetchedAt: new Date(row.fetched_at),
      version: row.version,
      status: row.status as NonNullable<ExternalBenchmarkSnapshot['status']>,
      errorMessage: row.error_message ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  private convertEntryRow(row: EntryRow): ExternalBenchmarkEntry {
    return {
      entryId: row.entry_id,
      snapshotId: row.snapshot_id,
      modelPermaslug: row.model_permaslug,
      modelName: row.model_name ?? undefined,
      providerId: row.provider_id ?? undefined,
      metricKey: row.metric_key,
      metricValue: row.metric_value,
      unit: row.unit ?? undefined,
      sourceUrl: row.source_url ?? undefined,
    };
  }

  close(): void {
    this.database.close();
  }
}
