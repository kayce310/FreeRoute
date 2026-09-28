/**
 * Phase 4: Model Identity Mapping
 *
 * Bridges benchmark permaslugs with runtime provider/model identities.
 * Implements the 4-state mapping: MAPPED / AMBIGUOUS / UNMAPPED / UNKNOWN
 */

import type {
  CanonicalModelIdentity,
  RuntimeCandidate,
  BenchmarkEvidence,
  IdentityState,
} from './combo-types.js';
import type { ModelRecord } from '../../contracts.js';
import type { ExternalBenchmarkEntry } from './interfaces.js';

// Re-export for use in other modules
export type { CanonicalModelIdentity, RuntimeCandidate, BenchmarkEvidence, IdentityState };

/**
 * Normalize a runtime modelId to benchmark permaslug format.
 * Strips version suffixes and normalizes casing.
 */
export function normalizeToPermaslug(modelId: string): string {
  return modelId
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')    // -2024-05-13
    .replace(/-\d{8}$/, '')                 // -20240229
    .replace(/-v\d+$/, '')                  // -v2, -v3
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build canonical model identity index from catalog and benchmark data.
 * 
 * Mapping Algorithm:
 * 1. Index all runtime candidates by normalized modelId
 * 2. Match benchmark permaslugs against runtime candidates
 * 3. Mark state based on match count
 */
export function buildCanonicalIndex(
  catalog: ModelRecord[],
  benchmarks: ExternalBenchmarkEntry[],
  latestSnapshots: Map<string, { sourceId: string; fetchedAt: Date }>
): CanonicalModelIdentity[] {
  const index = new Map<string, CanonicalModelIdentity>();
  
  // Phase 1: Index all runtime candidates
  for (const record of catalog) {
    const normalizedSlug = normalizeToPermaslug(record.modelId);
    
    if (!index.has(normalizedSlug)) {
      index.set(normalizedSlug, {
        canonicalSlug: normalizedSlug,
        runtimeCandidates: [],
        identityState: 'UNKNOWN',
      });
    }
    
    const identity = index.get(normalizedSlug)!;
    
    // Check if this candidate has a matching credential
    // (credential info would be passed separately in production)
    identity.runtimeCandidates.push({
      providerId: record.providerId,
      modelId: record.modelId,
      credentialId: '', // Will be populated from CredentialStore
      enabled: record.enabled ?? true,
      capabilities: record.capabilities,
      catalogStatus: record.catalogStatus ?? 'live',
      priority: record.priority ?? 0,
    });
  }
  
  // Phase 2: Attach benchmark evidence
  for (const entry of benchmarks) {
    const identity = index.get(entry.modelPermaslug);
    
    if (identity) {
      // Found existing runtime candidate
      if (!identity.benchmarkEvidence) {
        const snapshot = latestSnapshots.get(entry.snapshotId);
        identity.benchmarkEvidence = {
          sourceId: entry.providerId ?? 'unknown',
          snapshotId: entry.snapshotId,
          pricePer1mInput: entry.metricKey === 'price_per_1m_input_tokens' ? entry.metricValue : undefined,
          pricePer1mOutput: entry.metricKey === 'price_per_1m_output_tokens' ? entry.metricValue : undefined,
          contextLength: entry.metricKey === 'context_length' ? parseInt(entry.metricValue) : undefined,
          lastFetchedAt: snapshot?.fetchedAt ?? new Date(),
        };
      }
    } else {
      // New benchmark entry with no runtime candidate
      const snapshot = latestSnapshots.get(entry.snapshotId);
      index.set(entry.modelPermaslug, {
        canonicalSlug: entry.modelPermaslug,
        runtimeCandidates: [],
        identityState: 'UNMAPPED',
        benchmarkEvidence: {
          sourceId: 'unknown',
          snapshotId: entry.snapshotId,
          lastFetchedAt: snapshot?.fetchedAt ?? new Date(),
        },
      });
    }
  }
  
  // Phase 3: Mark states and attach evidence to existing candidates
  for (const [slug, identity] of index) {
    if (identity.runtimeCandidates.length === 0 && !identity.benchmarkEvidence) {
      identity.identityState = 'UNKNOWN';
    } else if (identity.runtimeCandidates.length === 0 && identity.benchmarkEvidence) {
      identity.identityState = 'UNMAPPED';
    } else if (identity.runtimeCandidates.length === 1) {
      identity.identityState = 'MAPPED';
    } else if (identity.runtimeCandidates.length > 1) {
      identity.identityState = 'AMBIGUOUS';
    }
  }
  
  return [...index.values()];
}

/**
 * Get runtime candidates for a canonical slug.
 * Returns empty array if not found or UNMAPPED.
 */
export function getRuntimeCandidates(
  index: CanonicalModelIdentity[],
  canonicalSlug: string
): RuntimeCandidate[] {
  const identity = index.find(i => i.canonicalSlug === canonicalSlug);
  if (!identity || identity.identityState === 'UNMAPPED') {
    return [];
  }
  return identity.runtimeCandidates;
}

/**
 * Get benchmark evidence for a canonical slug.
 */
export function getBenchmarkEvidence(
  index: CanonicalModelIdentity[],
  canonicalSlug: string
): BenchmarkEvidence | undefined {
  const identity = index.find(i => i.canonicalSlug === canonicalSlug);
  return identity?.benchmarkEvidence;
}

/**
 * Check if a model has benchmark data.
 */
export function hasBenchmarkData(
  index: CanonicalModelIdentity[],
  canonicalSlug: string
): boolean {
  const identity = index.find(i => i.canonicalSlug === canonicalSlug);
  return !!identity?.benchmarkEvidence;
}

/**
 * Check if benchmark data is fresh (within TTL).
 */
export function isBenchmarkFresh(
  index: CanonicalModelIdentity[],
  canonicalSlug: string,
  ttlMs: number
): boolean {
  const evidence = getBenchmarkEvidence(index, canonicalSlug);
  if (!evidence) return false;
  
  const age = Date.now() - evidence.lastFetchedAt.getTime();
  return age <= ttlMs;
}
