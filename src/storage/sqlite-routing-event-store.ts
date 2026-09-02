import { DatabaseSync } from 'node:sqlite';
import type { RoutingEvent } from '../inference.js';

interface RoutingEventRow {
  request_id: string; occurred_at: string; profile: string; provider_id: string; model_id: string;
  credential_ref: string; fallback_count: number; outcome: RoutingEvent['outcome']; failure_kind: RoutingEvent['failureKind'] | null;
}

/** Stores only route metadata; prompts, responses, and plaintext credentials never enter this table. */
export class SqliteRoutingEventStore {
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec(`CREATE TABLE IF NOT EXISTS routing_events (
      request_id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, profile TEXT NOT NULL,
      provider_id TEXT NOT NULL, model_id TEXT NOT NULL, credential_ref TEXT NOT NULL,
      fallback_count INTEGER NOT NULL, outcome TEXT NOT NULL, failure_kind TEXT
    ) STRICT;`);
  }

  async record(event: RoutingEvent): Promise<void> {
    this.database.prepare(`INSERT OR REPLACE INTO routing_events
      (request_id, occurred_at, profile, provider_id, model_id, credential_ref, fallback_count, outcome, failure_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(event.requestId, event.occurredAt.toISOString(), event.profile, event.providerId, event.modelId, event.credentialRef, event.fallbackCount, event.outcome, event.failureKind ?? null);
  }

  async list(limit = 50): Promise<RoutingEvent[]> {
    const rows = this.database.prepare(`SELECT request_id, occurred_at, profile, provider_id, model_id, credential_ref, fallback_count, outcome, failure_kind
      FROM routing_events ORDER BY occurred_at DESC LIMIT ?`).all(limit) as unknown as RoutingEventRow[];
    return rows.map((row) => ({ requestId: row.request_id, occurredAt: new Date(row.occurred_at), profile: row.profile, providerId: row.provider_id, modelId: row.model_id, credentialRef: row.credential_ref, fallbackCount: row.fallback_count, outcome: row.outcome, failureKind: row.failure_kind ?? undefined }));
  }

  close(): void { this.database.close(); }
}
