import type {
  RefreshScope,
  RefreshResult,
  ExternalSourceMetadata,
  ExternalBenchmarkSource,
} from './interfaces.js';
import { ExternalBenchmarkStorage } from './storage.js';

interface InFlightJob {
  scope: RefreshScope;
  promise: Promise<RefreshResult>;
  startedAt: Date;
}

/**
 * Refresh coordinator that deduplicates refresh requests by scope.
 * Multiple triggers (startup, tab_open, manual) requesting the same scope
 * will reuse the same in-flight job instead of making duplicate API calls.
 */
export class RefreshCoordinator {
  private readonly storage: ExternalBenchmarkStorage;
  private inFlightJobs = new Map<string, InFlightJob>();
  private scheduleQueue = new Map<string, Array<{ scope: RefreshScope; priority: 'background' | 'foreground' }>>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(storage: ExternalBenchmarkStorage) {
    this.storage = storage;
  }

  /** Check if a refresh is currently in-flight for a scope */
  async isInFlight(scope: RefreshScope): Promise<boolean> {
    return this.inFlightJobs.has(scope);
  }

  /**
   * Get existing in-flight promise or create new one.
   * Returns a promise that resolves when refresh completes.
   */
  async acquireRefresh(
    scope: RefreshScope,
    sourceConfigs: ExternalBenchmarkSource[],
    priority: 'background' | 'foreground' = 'background'
  ): Promise<RefreshResult> {
    // If already in-flight for this scope, return existing promise
    const existing = this.inFlightJobs.get(scope);
    if (existing) {
      return existing.promise;
    }

    // Create new refresh job
    const promise = this.performRefresh(scope, sourceConfigs, priority);
    this.inFlightJobs.set(scope, { scope, promise, startedAt: new Date() });

    try {
      const result = await promise;
      return result;
    } finally {
      this.inFlightJobs.delete(scope);
    }
  }

  /**
   * Schedule a refresh with rate limiting consideration.
   * Background refreshes are delayed if another refresh is in progress.
   */
  scheduleRefresh(
    scope: RefreshScope,
    sourceConfigs: ExternalBenchmarkSource[],
    priority: 'background' | 'foreground' = 'background'
  ): void {
    const queue = this.scheduleQueue.get(scope) || [];
    queue.push({ scope, priority });
    this.scheduleQueue.set(scope, queue);

    // Debounce rapid schedule calls
    const existingTimer = this.timers.get(scope);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.timers.delete(scope);
      this.processQueue(scope, sourceConfigs);
    }, priority === 'foreground' ? 0 : 1000);

    this.timers.set(scope, timer);
  }

  /**
   * Trigger immediate force refresh (for manual refresh).
   * Waits for any existing in-flight job for this scope to complete first.
   */
  async forceRefresh(
    scope: RefreshScope,
    sourceConfigs: ExternalBenchmarkSource[]
  ): Promise<RefreshResult> {
    // Wait for any existing in-flight job
    const existing = this.inFlightJobs.get(scope);
    if (existing) {
      await existing.promise;
    }

    // Clear any queued requests for this scope
    this.scheduleQueue.delete(scope);

    return this.acquireRefresh(scope, sourceConfigs, 'foreground');
  }

  /** Get all in-flight scopes */
  getActiveScopes(): RefreshScope[] {
    return Array.from(this.inFlightJobs.keys()) as RefreshScope[];
  }

  /**
   * Cancel all pending timers. Call during shutdown to avoid resource leaks.
   * In-flight async jobs are not cancelled (they complete normally).
   */
  close(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.scheduleQueue.clear();
  }

  // ===== Private methods =====

  private async processQueue(scope: RefreshScope, sourceConfigs: ExternalBenchmarkSource[]): Promise<void> {
    const queue = this.scheduleQueue.get(scope);
    if (!queue || queue.length === 0) return;

    // Process highest priority first
    queue.sort((a, b) => (a.priority === 'foreground' ? -1 : 1));
    const request = queue.shift();
    if (!request) return;

    this.scheduleQueue.set(scope, queue);

    try {
      await this.acquireRefresh(scope, sourceConfigs, request.priority);
    } catch (error) {
      console.error(`[RefreshCoordinator] Failed to process queued refresh for scope ${scope}:`, error);
    }
  }

  private async performRefresh(
    scope: RefreshScope,
    sourceConfigs: ExternalBenchmarkSource[],
    priority: 'background' | 'foreground'
  ): Promise<RefreshResult> {
    const sources = this.resolveSources(scope, sourceConfigs);

    if (sources.length === 0) {
      return {
        sourceId: scope,
        scope,
        status: 'total_failure',
        error: { code: 'NO_SOURCES', message: 'No sources configured for scope', retryable: false },
      };
    }

    // Update runtime states to refreshing
    for (const source of sources) {
      await this.updateRuntimeState(source.sourceId, 'refreshing', scope);
    }

    // Execute refresh for each source
    const results = await Promise.allSettled(
      sources.map(source => this.refreshSource(source))
    );

    // Determine overall result
    const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success');
    const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status !== 'success'));

    if (failures.length === 0) {
      const firstSuccess = successes[0] as PromiseFulfilledResult<RefreshResult> | undefined;
      return {
        sourceId: scope,
        scope,
        status: 'success' as const,
        snapshotId: firstSuccess?.value?.snapshotId,
      };
    }

    if (successes.length === 0) {
      const lastError = failures[failures.length - 1];
      return {
        sourceId: scope,
        scope,
        status: 'total_failure' as const,
        error: lastError.status === 'rejected'
          ? { code: 'ALL_FAILED', message: lastError.reason?.message ?? 'All sources failed', retryable: true }
          : lastError.value.error,
      };
    }

    // Partial success
    return {
      sourceId: scope,
      scope,
      status: 'partial_failure' as const,
      error: {
        code: 'PARTIAL_FAILURE',
        message: `${successes.length} succeeded, ${failures.length} failed`,
        retryable: true,
      },
    };
  }

  private async refreshSource(source: ExternalBenchmarkSource): Promise<RefreshResult> {
    try {
      const result = await source.fetch();
      const snapshotId = `snap-${Date.now()}-${source.sourceId}`;
      
      // Transform and save entries
      const entries = result.models.map(model => ({
        entryId: `entry-${Date.now()}-${source.sourceId}-${model.rawSlug}`,
        snapshotId,
        modelPermaslug: source.transforms.modelSlugTransformer(source.sourceId, model.rawSlug),
        modelName: model.name,
        providerId: model.providerId,
        metricKey: Object.keys(model.metrics)[0] || 'unknown',
        metricValue: Object.values(model.metrics)[0]?.toString() ?? '',
        unit: undefined,
        sourceUrl: model.sourceUrl,
      }));

      const snapshot = {
        snapshotId,
        sourceId: source.sourceId,
        fetchedAt: new Date(),
        version: 1,
        status: 'fresh' as const,
      };

      await this.storage.saveSnapshot(snapshot);
      await this.storage.saveEntries(entries);

      // Update metadata
      const metadata = await this.getOrCreateMetadata(source);
      await this.storage.saveSourceMetadata({
        ...metadata,
        lastSuccessfulFetch: new Date(),
        lastFailure: null,
      });

      await this.updateRuntimeState(source.sourceId, 'fresh', null);

      return {
        sourceId: source.sourceId,
        scope: source.sourceId as RefreshScope,
        status: 'success',
        snapshotId,
      };
    } catch (error) {
      const refreshError = error as Error;
      const metadata = await this.getOrCreateMetadata(source);
      await this.storage.saveSourceMetadata({
        ...metadata,
        lastFailure: {
          timestamp: new Date(),
          error: refreshError.message,
          retryable: true,
        },
      });
      await this.updateRuntimeState(source.sourceId, 'failed', null, refreshError.message);

      return {
        sourceId: source.sourceId,
        scope: source.sourceId as RefreshScope,
        status: 'total_failure',
        error: {
          code: 'FETCH_ERROR',
          message: refreshError.message,
          retryable: true,
        },
      };
    }
  }

  private async updateRuntimeState(
    sourceId: string,
    status: 'fresh' | 'stale' | 'refreshing' | 'failed' | 'unavailable',
    inFlightScope: RefreshScope | null,
    errorMessage?: string
  ): Promise<void> {
    const state = await this.storage.getRuntimeState(sourceId) || {
      sourceId,
      status: 'unavailable' as const,
      inFlightScope: null,
      nextRefreshAt: null,
    };
    await this.storage.saveRuntimeState({
      ...state,
      status,
      inFlightScope,
      error: errorMessage,
    });
  }

  private async getOrCreateMetadata(source: ExternalBenchmarkSource): Promise<ExternalSourceMetadata> {
    const existing = await this.storage.getSourceMetadata(source.sourceId);
    if (existing) return existing;

    return {
      sourceId: source.sourceId,
      name: source.name,
      description: source.description,
      url: source.url,
      ttlMs: source.ttlMs,
      maxAgeMs: source.maxAgeMs,
      enabled: source.enabled,
      lastSuccessfulFetch: null,
      lastFailure: null,
    };
  }

  private resolveSources(scope: RefreshScope, sources: ExternalBenchmarkSource[]): ExternalBenchmarkSource[] {
    if (scope === 'all') {
      return sources.filter(s => s.enabled);
    }
    return sources.filter(s => s.sourceId === scope && s.enabled);
  }
}
