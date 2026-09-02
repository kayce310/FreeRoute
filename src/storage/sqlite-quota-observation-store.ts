import { DatabaseSync } from 'node:sqlite';
import type { QuotaObservation } from '../inference.js';

export interface StoredQuotaObservation extends QuotaObservation {
  providerId: string;
  modelId: string;
  credentialRef: string;
  observedAt: Date;
}

/** Provider-reported limits only; absence means unknown, never unlimited. */
export class SqliteQuotaObservationStore {
  private readonly database: DatabaseSync;
  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec(`CREATE TABLE IF NOT EXISTS quota_observations (
      provider_id TEXT NOT NULL, model_id TEXT NOT NULL, credential_ref TEXT NOT NULL,
      observed_at TEXT NOT NULL, remaining_requests REAL, remaining_tokens REAL, reset_at TEXT,
      PRIMARY KEY (provider_id, model_id, credential_ref)
    ) STRICT;`);
  }
  async record(observation: StoredQuotaObservation): Promise<void> {
    this.database.prepare(`INSERT INTO quota_observations (provider_id, model_id, credential_ref, observed_at, remaining_requests, remaining_tokens, reset_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(provider_id, model_id, credential_ref) DO UPDATE SET
      observed_at = excluded.observed_at, remaining_requests = excluded.remaining_requests, remaining_tokens = excluded.remaining_tokens, reset_at = excluded.reset_at`)
      .run(observation.providerId, observation.modelId, observation.credentialRef, observation.observedAt.toISOString(), observation.remainingRequests ?? null, observation.remainingTokens ?? null, observation.resetAt?.toISOString() ?? null);
  }
  async list(limit = 100): Promise<StoredQuotaObservation[]> {
    const rows = this.database.prepare(`SELECT provider_id, model_id, credential_ref, observed_at, remaining_requests, remaining_tokens, reset_at
      FROM quota_observations ORDER BY observed_at DESC LIMIT ?`).all(limit) as Array<{ provider_id: string; model_id: string; credential_ref: string; observed_at: string; remaining_requests: number | null; remaining_tokens: number | null; reset_at: string | null }>;
    return rows.map((row) => ({ providerId: row.provider_id, modelId: row.model_id, credentialRef: row.credential_ref, observedAt: new Date(row.observed_at), remainingRequests: row.remaining_requests ?? undefined, remainingTokens: row.remaining_tokens ?? undefined, resetAt: row.reset_at ? new Date(row.reset_at) : undefined }));
  }
  async scores(now = new Date()): Promise<Map<string, number>> {
    const scores = new Map<string, number>();
    for (const observation of await this.list(10_000)) {
      const requestScore = observation.remainingRequests === undefined ? 0 : Math.min(40, observation.remainingRequests);
      const tokenScore = observation.remainingTokens === undefined ? 0 : Math.min(40, observation.remainingTokens / 1_000);
      const exhaustedPenalty = observation.resetAt && observation.resetAt > now && observation.remainingRequests === 0 ? -40 : 0;
      scores.set(keyFor(observation), requestScore + tokenScore + exhaustedPenalty);
    }
    return scores;
  }
  close(): void { this.database.close(); }
}

function keyFor(observation: Pick<StoredQuotaObservation, 'providerId' | 'modelId' | 'credentialRef'>): string {
  return `${observation.providerId}\u0000${observation.modelId}\u0000${observation.credentialRef}`;
}
