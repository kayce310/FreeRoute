/**
 * Phase 4: Automatic Combo Generator
 * 
 * Generates automatic combos from benchmark data, catalog state, and routing history.
 * Uses deterministic ranking without invented weighted scores.
 */

import type {
  CanonicalModelIdentity,
  RankingPolicy,
  AutoComboResult,
  ConstructionContext,
  HardEligibility,
  EligibilityResult,
  RuntimeCandidate,
} from './combo-types.js';
import { DEFAULT_RANKING_POLICY } from './combo-types.js';
import {
  buildCanonicalIndex,
  normalizeToPermaslug,
  getRuntimeCandidates,
  hasBenchmarkData,
} from './canonical-identity.js';
import type { ModelRecord } from '../../contracts.js';
import type { ExternalBenchmarkEntry } from './interfaces.js';

// Re-export for server.ts
export { buildCanonicalIndex };
export type { CanonicalModelIdentity, RuntimeCandidate };

/**
 * Check hard eligibility for a candidate.
 */
function checkHardEligibility(
  candidate: import('./combo-types.js').RuntimeCandidate,
  requiredCapabilities: import('../../contracts.js').Capability[],
  hasCredential: boolean = true
): HardEligibility {
  return {
    inCatalog: true, // Already filtered by catalog
    hasUsableCredential: hasCredential,
    isEnabled: candidate.enabled,
    isLive: candidate.catalogStatus === 'live',
    supportsRequiredCapabilities: requiredCapabilities.every(cap =>
      candidate.capabilities.includes(cap)
    ),
  };
}

/**
 * Check soft eligibility against policy filters.
 */
function checkSoftEligibility(
  result: EligibilityResult,
  filters: NonNullable<RankingPolicy['filters']>
): boolean {
  // Success rate check
  if (filters.minSuccessRate !== undefined) {
    // This would need routing event data - skip for now
  }
  
  // Latency check
  if (filters.maxLatencyP95Ms !== undefined) {
    // This would need latency data - skip for now
  }
  
  // Benchmark data requirement
  if (filters.requireBenchmarkData) {
    // Would check benchmark evidence availability
  }
  
  return true;
}

/**
 * Construct an automatic combo from target models and policy.
 */
export async function constructAutoCombo(
  targetModels: string[],
  policy: RankingPolicy,
  context: ConstructionContext,
  requiredCapabilities: import('../../contracts.js').Capability[] = ['chat', 'streaming']
): Promise<AutoComboResult> {
  const { catalog, benchmarks, latestSnapshots } = context;
  const effectivePolicy = { ...DEFAULT_RANKING_POLICY, ...policy };
  
  // Build canonical identity index
  const snapshotMap = new Map<string, { sourceId: string; fetchedAt: Date }>();
  for (const snapshot of latestSnapshots.values()) {
    snapshotMap.set(snapshot.snapshotId, {
      sourceId: snapshot.sourceId,
      fetchedAt: snapshot.fetchedAt,
    });
  }
  
  const index = buildCanonicalIndex(catalog, benchmarks, snapshotMap);
  
  // Resolve target models to canonical identities
  const candidates: Array<{
    canonicalSlug: string;
    runtimeCandidate: import('./combo-types.js').RuntimeCandidate;
    eligibility: EligibilityResult;
  }> = [];
  
  for (const targetModel of targetModels) {
    const normalizedTarget = normalizeToPermaslug(targetModel);
    const runtimeCandidates = getRuntimeCandidates(index, normalizedTarget);
    
    for (const candidate of runtimeCandidates) {
      // Check if credential is available for this provider
      const hasCredential = context.credentials.some(
        c => c.providerId === candidate.providerId && c.enabled
      );
      const hardEligibility = checkHardEligibility(candidate, requiredCapabilities, hasCredential);
      
      if (!hardEligibility.isEnabled || !hardEligibility.isLive || !hardEligibility.hasUsableCredential) {
        continue;
      }
      
      const eligibilityResult: EligibilityResult = {
        candidate,
        hardEligibility,
        softEligibility: {},
        isEligible: true,
        reasons: [],
      };
      
      candidates.push({
        canonicalSlug: normalizedTarget,
        runtimeCandidate: candidate,
        eligibility: eligibilityResult,
      });
    }
  }
  
  // Apply soft filters
  const filtered = candidates.filter(c => {
    if (effectivePolicy.filters?.requireBenchmarkData && 
        !hasBenchmarkData(index, c.canonicalSlug)) {
      return false;
    }
    return true;
  });
  
  // Rank candidates
  const ranked = applyRanking(filtered, effectivePolicy, index);
  
  // Apply diversity constraints
  const diverse = applyDiversity(ranked);
  
  // Format as provider/model strings
  const models = diverse.map(c => `${c.runtimeCandidate.providerId}/${c.runtimeCandidate.modelId}`);
  
  // Get latest snapshot ID for provenance
  const latestSnapshotId = latestSnapshots.size > 0 
    ? Array.from(latestSnapshots.values())[0].snapshotId 
    : 'none';
  
  return {
    models,
    provenance: {
      generatedAt: new Date().toISOString(),
      snapshotId: latestSnapshotId,
      candidateCount: candidates.length,
      selectedCount: models.length,
      policyUsed: effectivePolicy,
    },
  };
}

/**
 * Apply ranking to candidates.
 */
function applyRanking(
  candidates: Array<{
    canonicalSlug: string;
    runtimeCandidate: import('./combo-types.js').RuntimeCandidate;
    eligibility: EligibilityResult;
  }>,
  policy: RankingPolicy,
  index: import('./canonical-identity.js').CanonicalModelIdentity[]
): typeof candidates {
  return [...candidates].sort((a, b) => {
    // Primary sort
    let primaryDiff = 0;
    if (policy.primary === 'catalog_priority') {
      primaryDiff = a.runtimeCandidate.priority - b.runtimeCandidate.priority;
    } else if (policy.primary === 'observed_latency') {
      // Would use routing event data
      primaryDiff = 0;
    } else if (policy.primary === 'benchmark_price') {
      // Would use benchmark evidence
      primaryDiff = 0;
    }
    
    if (policy.direction === 'desc') {
      if (primaryDiff !== 0) return -primaryDiff;
    } else {
      if (primaryDiff !== 0) return primaryDiff;
    }
    
    // Secondary sort (tie-breaker)
    if (policy.secondary) {
      let secondaryDiff = 0;
      if (policy.secondary === 'observed_latency') {
        // Lower latency = better
        secondaryDiff = 0;
      }
      
      if (policy.direction === 'desc') {
        if (secondaryDiff !== 0) return -secondaryDiff;
      } else {
        if (secondaryDiff !== 0) return secondaryDiff;
      }
    }
    
    // Final tie-breaker: provider/model ID
    return a.runtimeCandidate.providerId.localeCompare(b.runtimeCandidate.providerId) ||
           a.runtimeCandidate.modelId.localeCompare(b.runtimeCandidate.modelId);
  });
}

/**
 * Apply diversity constraints to prevent single-provider dominance.
 */
function applyDiversity(
  candidates: Array<{
    canonicalSlug: string;
    runtimeCandidate: import('./combo-types.js').RuntimeCandidate;
    eligibility: EligibilityResult;
  }>
): typeof candidates {
  const result = [];
  const providerCounts = new Map<string, number>();
  
  for (const candidate of candidates) {
    const providerId = candidate.runtimeCandidate.providerId;
    const count = providerCounts.get(providerId) || 0;
    
    // Allow at most 2 candidates per provider
    if (count < 2) {
      result.push(candidate);
      providerCounts.set(providerId, count + 1);
    }
  }
  
  return result;
}

/**
 * Generate default target models from a benchmark source.
 * Useful for creating combos based on top-ranked models from a source.
 */
export async function generateTargetsFromBenchmarkSource(
  sourceId: string,
  limit: number = 10,
  context: ConstructionContext
): Promise<string[]> {
  const { benchmarks } = context;
  
  // Filter benchmarks for this source (sourceId is not in benchmark entries, use snapshot source)
  const sourceBenchmarks = benchmarks.filter(b => {
    const snapshot = context.latestSnapshots.get(b.snapshotId);
    return snapshot?.sourceId === sourceId;
  });
  
  // Get unique models
  const uniqueModels = new Set(sourceBenchmarks.map(b => b.modelPermaslug));
  
  // Return top models (would sort by metric if needed)
  return Array.from(uniqueModels).slice(0, limit);
}
