import { DatabaseSync } from 'node:sqlite';
import type { RoutingEvent } from '../inference.js';

interface RoutingEventRow {
  request_id: string; occurred_at: string; profile: string; provider_id: string; model_id: string;
  credential_ref: string; fallback_count: number; outcome: RoutingEvent['outcome']; failure_kind: RoutingEvent['failureKind'] | null;
  latency_ms: number | null; prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null;
}

export interface AggregateTokenStats {
  totalRequests: number;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  byProvider: Record<string, {
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    count: number;
    models: Record<string, { totalTokens: number; promptTokens: number; completionTokens: number; count: number }>;
  }>;
}

/** Stores only route metadata; prompts, responses, and plaintext credentials never enter this table. */
export class SqliteRoutingEventStore {
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec(`CREATE TABLE IF NOT EXISTS routing_events (
      request_id TEXT PRIMARY KEY, occurred_at TEXT NOT NULL, profile TEXT NOT NULL,
      provider_id TEXT NOT NULL, model_id TEXT NOT NULL, credential_ref TEXT NOT NULL,
      fallback_count INTEGER NOT NULL, outcome TEXT NOT NULL, failure_kind TEXT, latency_ms INTEGER,
      prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER
    ) STRICT;`);

    // Safe backwards-compatible migrations
    for (const col of ['latency_ms', 'prompt_tokens', 'completion_tokens', 'total_tokens']) {
      try { this.database.exec(`ALTER TABLE routing_events ADD COLUMN ${col} INTEGER`); }
      catch (error) { if (!(error instanceof Error) || !error.message.includes('duplicate column name')) throw error; }
    }
  }

  async record(event: RoutingEvent): Promise<void> {
    this.database.prepare(`INSERT OR REPLACE INTO routing_events
      (request_id, occurred_at, profile, provider_id, model_id, credential_ref, fallback_count, outcome, failure_kind, latency_ms, prompt_tokens, completion_tokens, total_tokens)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        event.requestId, event.occurredAt.toISOString(), event.profile, event.providerId, event.modelId,
        event.credentialRef, event.fallbackCount, event.outcome, event.failureKind ?? null, event.latencyMs ?? null,
        event.promptTokens ?? null, event.completionTokens ?? null, event.totalTokens ?? null
      );
  }

  async list(limit = 50): Promise<RoutingEvent[]> {
    const rows = this.database.prepare(`SELECT request_id, occurred_at, profile, provider_id, model_id, credential_ref, fallback_count, outcome, failure_kind, latency_ms, prompt_tokens, completion_tokens, total_tokens
      FROM routing_events ORDER BY occurred_at DESC LIMIT ?`).all(limit) as unknown as RoutingEventRow[];
    return rows.map((row) => ({
      requestId: row.request_id,
      occurredAt: new Date(row.occurred_at),
      profile: row.profile,
      providerId: row.provider_id,
      modelId: row.model_id,
      credentialRef: row.credential_ref,
      fallbackCount: row.fallback_count,
      outcome: row.outcome,
      failureKind: row.failure_kind ?? undefined,
      ...(row.latency_ms === null ? {} : { latencyMs: row.latency_ms }),
      ...(row.prompt_tokens === null ? {} : { promptTokens: row.prompt_tokens }),
      ...(row.completion_tokens === null ? {} : { completionTokens: row.completion_tokens }),
      ...(row.total_tokens === null ? {} : { totalTokens: row.total_tokens }),
    }));
  }

  async tokenStats(): Promise<AggregateTokenStats> {
    // Group by provider + model for detailed breakdown
    const rows = this.database.prepare(`
      SELECT provider_id, model_id,
             COUNT(*) as req_count,
             SUM(COALESCE(prompt_tokens, 0)) as sum_prompt,
             SUM(COALESCE(completion_tokens, 0)) as sum_completion,
             SUM(COALESCE(total_tokens, 0)) as sum_total
      FROM routing_events
      WHERE outcome = 'success'
      GROUP BY provider_id, model_id
      ORDER BY sum_total DESC
    `).all() as Array<{ provider_id: string; model_id: string; req_count: number; sum_prompt: number; sum_completion: number; sum_total: number }>;

    let totalTokens = 0;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalRequests = 0;
    const byProvider: AggregateTokenStats['byProvider'] = {};

    for (const r of rows) {
      const reqCount = Number(r.req_count);
      const sumPrompt = Number(r.sum_prompt);
      const sumComp = Number(r.sum_completion);
      const sumTotal = Number(r.sum_total);
      totalRequests += reqCount;
      promptTokens += sumPrompt;
      completionTokens += sumComp;
      totalTokens += sumTotal;
      if (!byProvider[r.provider_id]) {
        byProvider[r.provider_id] = {
          count: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0,
          models: {},
        };
      }
      byProvider[r.provider_id].count += reqCount;
      byProvider[r.provider_id].promptTokens += sumPrompt;
      byProvider[r.provider_id].completionTokens += sumComp;
      byProvider[r.provider_id].totalTokens += sumTotal;
      byProvider[r.provider_id].models[r.model_id] = {
        count: reqCount,
        promptTokens: sumPrompt,
        completionTokens: sumComp,
        totalTokens: sumTotal,
      };
    }

    return { totalRequests, totalTokens, promptTokens, completionTokens, byProvider };
  }

  /** Scores are deliberately bounded and derived only from redacted outcome/timing facts. */
  async scores(): Promise<Map<string, { healthScore: number; latencyScore: number }>> {
    const totals = new Map<string, { requests: number; successes: number; latencies: number[] }>();
    for (const event of await this.list(10_000)) {
      const key = `${event.providerId}\u0000${event.modelId}`;
      const total = totals.get(key) ?? { requests: 0, successes: 0, latencies: [] };
      total.requests += 1;
      if (event.outcome === 'success') total.successes += 1;
      if (event.latencyMs !== undefined) total.latencies.push(event.latencyMs);
      totals.set(key, total);
    }
    return new Map([...totals].map(([key, total]) => {
      const healthScore = Math.round((total.successes / total.requests - 0.5) * 20);
      const p50 = total.latencies.sort((left, right) => left - right)[Math.ceil(total.latencies.length / 2) - 1];
      const latencyScore = p50 === undefined ? 0 : p50 <= 500 ? 20 : p50 <= 1_500 ? 10 : p50 <= 4_000 ? 0 : -10;
      return [key, { healthScore, latencyScore }];
    }));
  }

  close(): void { this.database.close(); }
}
