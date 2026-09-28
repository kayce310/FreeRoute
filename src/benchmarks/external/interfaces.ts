/** Core types for External Benchmark Data Ingestion (Phase 3.5) */

/** Status of an external benchmark source */
export type ExternalSourceStatus =
  | 'fresh'       // Last fetched within TTL
  | 'stale'       // Last fetched beyond TTL
  | 'refreshing'  // In-flight refresh
  | 'failed'      // Last refresh threw error
  | 'unavailable'; // Source unreachable or never fetched

/** Refresh scope for deduplication */
export type RefreshScope =
  | 'all'
  | 'openrouter'
  | 'huggingface'
  | 'artificial_analysis'
  | 'lmsys';

/** Result of a refresh operation */
export interface RefreshResult {
  sourceId: string;
  scope: RefreshScope;
  status: 'success' | 'partial_failure' | 'total_failure';
  snapshotId?: string;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

/** Metadata about a source (persistent, config-like) */
export interface ExternalSourceMetadata {
  sourceId: string;
  name: string;
  description: string;
  url: string;
  ttlMs: number;
  maxAgeMs?: number;
  enabled: boolean;
  lastSuccessfulFetch: Date | null;
  lastFailure: {
    timestamp: Date;
    error: string;
    retryable: boolean;
  } | null;
}

/** Runtime state for a source (ephemeral, operational) */
export interface ExternalSourceRuntimeState {
  sourceId: string;
  status: ExternalSourceStatus;
  inFlightScope: RefreshScope | null;
  nextRefreshAt: Date | null;
  error?: string;
}

/** A single benchmark entry from an external source */
export interface ExternalBenchmarkEntry {
  entryId: string;
  snapshotId: string;
  modelPermaslug: string;
  modelName?: string;
  providerId?: string;
  metricKey: string;
  metricValue: string;
  unit?: string;
  sourceUrl?: string;
}

/** A snapshot is one fetch operation containing multiple entries */
export interface ExternalBenchmarkSnapshot {
  snapshotId: string;
  sourceId: string;
  fetchedAt: Date;
  version: number;
  status: 'fresh' | 'stale' | 'refreshing' | 'failed' | 'unavailable';
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/** Model/permaslug normalization transform function */
export type ModelSlugTransformer = (source: string, rawSlug: string) => string;

/** Metric transform function for a specific metric key */
export type MetricTransformer = (raw: unknown) => string;

/** Transforms to apply when ingesting data from a source */
export interface SourceTransforms {
  modelSlugTransformer: ModelSlugTransformer;
  metricTransformers: Record<string, MetricTransformer>;
}

/** Definition of an external benchmark source */
export interface ExternalBenchmarkSource {
  sourceId: string;
  name: string;
  description: string;
  url: string;
  ttlMs: number;
  maxAgeMs?: number;
  rateLimit: {
    requestsPerMinute: number;
    strategy: 'token_bucket' | 'sliding_window' | 'exponential_backoff';
  };
  transforms: SourceTransforms;
  enabled: boolean;
  /** Function to fetch raw data from this source */
  fetch(): Promise<RawBenchmarkData>;
}

/** Raw data returned by a source's fetch function */
export interface RawBenchmarkData {
  models: RawModelData[];
}

/** Raw model data from an external API (before transformation) */
export interface RawModelData {
  rawSlug: string;
  name?: string;
  providerId?: string;
  metrics: Record<string, unknown>;
  sourceUrl?: string;
}

/** Response shape for UI consumption */
export interface BenchmarkDataSourceResponse {
  sourceId: string;
  sourceName: string;
  status: ExternalSourceStatus;
  lastFetchedAt: Date | null;
  ttlRemainingMs: number | null;
  error?: string;
  entries: ExternalBenchmarkEntry[];
}

/** Filter for querying external benchmark data */
export interface ExternalBenchmarkFilter {
  sourceId?: string;
  modelPermaslug?: string;
  metricKey?: string;
  limit?: number;
  offset?: number;
}

/** Query result for external benchmark data */
export interface ExternalBenchmarkQueryResult {
  total: number;
  entries: ExternalBenchmarkEntry[];
}
