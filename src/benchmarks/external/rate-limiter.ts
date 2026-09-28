/**
 * Rate limiter for external benchmark sources.
 * Prevents exceeding API rate limits by tracking request consumption.
 */
import type { ExternalBenchmarkSource } from './interfaces.js';

interface TokenBucket {
  tokens: number;
  lastRefill: Date;
  ratePerMinute: number;
}

interface SlidingWindow {
  timestamps: Date[];
  maxRequests: number;
  windowMs: number;
}

/**
 * Rate limiter that prevents exceeding per-source API limits.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly windows = new Map<string, SlidingWindow>();
  private readonly sourceConfigs: Map<string, ExternalBenchmarkSource>;

  constructor(sources: ExternalBenchmarkSource[]) {
    this.sourceConfigs = new Map(sources.map(s => [s.sourceId, s]));
  }

  /** Check if a request is allowed for the given source */
  allow(sourceId: string): boolean {
    const config = this.sourceConfigs.get(sourceId);
    if (!config) return true; // Unknown source, allow

    const strategy = config.rateLimit.strategy;

    switch (strategy) {
      case 'token_bucket':
        return this.tokenBucketAllow(sourceId);
      case 'sliding_window':
        return this.slidingWindowAllow(sourceId);
      case 'exponential_backoff':
        // Always allow, but caller should handle 429 with backoff
        return true;
      default:
        return true;
    }
  }

  /** Record that a request was made */
  record(sourceId: string): void {
    const config = this.sourceConfigs.get(sourceId);
    if (!config) return;

    const strategy = config.rateLimit.strategy;
    const now = new Date();

    switch (strategy) {
      case 'token_bucket':
        this.tokenBucketRecord(sourceId, now);
        break;
      case 'sliding_window':
        this.slidingWindowRecord(sourceId, now);
        break;
      case 'exponential_backoff':
        // No tracking needed, caller handles 429
        break;
    }
  }

  /** Wait until a request is allowed (for rate-limited sources) */
  async waitForAllowance(sourceId: string): Promise<void> {
    const config = this.sourceConfigs.get(sourceId);
    if (!config) return;

    while (!this.allow(sourceId)) {
      const waitMs = this.calculateWaitTime(sourceId);
      if (waitMs <= 0) return;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }

  private tokenBucketAllow(sourceId: string): boolean {
    const bucket = this.buckets.get(sourceId);
    if (!bucket) return true;

    this.refillTokenBucket(sourceId);
    return bucket.tokens > 0;
  }

  private tokenBucketRecord(sourceId: string, now: Date): void {
    let bucket = this.buckets.get(sourceId);
    if (!bucket) {
      const config = this.sourceConfigs.get(sourceId)!;
      bucket = {
        tokens: config.rateLimit.requestsPerMinute,
        lastRefill: now,
        ratePerMinute: config.rateLimit.requestsPerMinute,
      };
      this.buckets.set(sourceId, bucket);
    }
    bucket.tokens--;
  }

  private refillTokenBucket(sourceId: string): void {
    const bucket = this.buckets.get(sourceId);
    if (!bucket) return;

    const config = this.sourceConfigs.get(sourceId)!;
    const now = new Date();
    const elapsedMinutes = (now.getTime() - bucket.lastRefill.getTime()) / 60000;
    const tokensToAdd = elapsedMinutes * config.rateLimit.requestsPerMinute;

    if (tokensToAdd >= 1) {
      bucket.tokens = Math.min(config.rateLimit.requestsPerMinute, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  private slidingWindowAllow(sourceId: string): boolean {
    const window = this.windows.get(sourceId);
    if (!window) return true;

    this.cleanupSlidingWindow(sourceId);
    return window.timestamps.length < window.maxRequests;
  }

  private slidingWindowRecord(sourceId: string, now: Date): void {
    const config = this.sourceConfigs.get(sourceId)!;
    let window = this.windows.get(sourceId);
    if (!window) {
      window = {
        timestamps: [],
        maxRequests: config.rateLimit.requestsPerMinute,
        windowMs: 60_000, // 1 minute window
      };
      this.windows.set(sourceId, window);
    }
    window.timestamps.push(now);
  }

  private cleanupSlidingWindow(sourceId: string): void {
    const window = this.windows.get(sourceId);
    if (!window) return;

    const now = new Date();
    const cutoff = now.getTime() - window.windowMs;
    window.timestamps = window.timestamps.filter(t => t.getTime() > cutoff);
  }

  private calculateWaitTime(sourceId: string): number {
    const bucket = this.buckets.get(sourceId);
    if (bucket && bucket.tokens <= 0) {
      // Wait until next token is available
      const config = this.sourceConfigs.get(sourceId)!;
      const msPerToken = 60_000 / config.rateLimit.requestsPerMinute;
      return msPerToken;
    }

    const window = this.windows.get(sourceId);
    if (window && window.timestamps.length >= window.maxRequests) {
      // Wait until oldest request expires from window
      const oldest = window.timestamps[0];
      const waitMs = (oldest.getTime() + window.windowMs) - Date.now();
      return Math.max(0, waitMs);
    }

    return 0;
  }
}
