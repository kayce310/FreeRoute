/**
 * Phase 4: Automatic Custom Combos - Core Types
 * 
 * Extends Phase 3.5 interfaces with combo generation and management types.
 */

import type { ExternalBenchmarkEntry, ExternalBenchmarkSnapshot } from './interfaces.js';
import type { ModelRecord, Capability } from '../../contracts.js';

/**
 * State of model identity mapping between benchmark and runtime worlds.
 */
export type IdentityState =
  | 'MAPPED'      // Exactly 1 runtime candidate
  | 'AMBIGUOUS'   // Multiple runtime candidates match
  | 'UNMAPPED'    // Benchmark exists, no runtime candidate
  | 'UNKNOWN';    // No data available

/**
 * A runtime candidate for a canonical model identity.
 */
export interface RuntimeCandidate {
  providerId: string;
  modelId: string;
  credentialId: string;
  enabled: boolean;
  capabilities: Capability[];
  catalogStatus: 'live' | 'stale' | 'retired';
  priority: number;
}

/**
 * Benchmark evidence attached to a canonical model identity.
 */
export interface BenchmarkEvidence {
  sourceId: string;
  snapshotId: string;
  pricePer1mInput?: string;
  pricePer1mOutput?: string;
  contextLength?: number;
  lastFetchedAt: Date;
}

/**
 * Canonical model identity that bridges benchmark and runtime worlds.
 */
export interface CanonicalModelIdentity {
  /** Normalized benchmark permaslug (e.g., 'gpt-4o', 'llama-3.3-70b-versatile') */
  canonicalSlug: string;
  
  /** All runtime provider/model pairs for this model */
  runtimeCandidates: RuntimeCandidate[];
  
  /** Mapping confidence state */
  identityState: IdentityState;
  
  /** Benchmark evidence if available */
  benchmarkEvidence?: BenchmarkEvidence;
}

/**
 * Hard eligibility criteria (must pass).
 */
export interface HardEligibility {
  inCatalog: boolean;
  hasUsableCredential: boolean;
  isEnabled: boolean;
  isLive: boolean;
  supportsRequiredCapabilities: boolean;
}

/**
 * Soft eligibility criteria (policy-driven, configurable).
 */
export interface SoftEligibility {
  minSuccessRate?: number;
  maxLatencyP95Ms?: number;
  requireBenchmarkData?: boolean;
  requireFreshBenchmark?: boolean;
}

/**
 * Eligibility check result for a candidate.
 */
export interface EligibilityResult {
  candidate: RuntimeCandidate;
  hardEligibility: HardEligibility;
  softEligibility: SoftEligibility & Record<string, unknown>;
  isEligible: boolean;
  reasons: string[];
}

/**
 * Ranking policy for ordering candidates in automatic combos.
 */
export interface RankingPolicy {
  /** Primary sort key */
  primary: 'catalog_priority' | 'benchmark_price' | 'observed_latency' | 'recent_success_rate';
  
  /** Secondary sort key (tie-breaker) */
  secondary?: 'catalog_priority' | 'observed_latency' | 'recent_success_rate' | 'benchmark_price';
  
  /** Sort direction */
  direction: 'asc' | 'desc';
  
  /** Optional filters */
  filters?: {
    minSuccessRate?: number;
    maxLatencyP95Ms?: number;
    requireBenchmarkData?: boolean;
  };
}

/**
 * Default ranking policy for initial implementation.
 */
export const DEFAULT_RANKING_POLICY: RankingPolicy = {
  primary: 'catalog_priority',
  secondary: 'observed_latency',
  direction: 'desc',  // Higher priority = better
  filters: {
    minSuccessRate: 0.5,  // At least 50% historical success
  },
};

/**
 * Construction context passed to auto-combo generator.
 */
export interface ConstructionContext {
  catalog: ModelRecord[];
  credentials: Array<{ providerId: string; credentialId: string; enabled: boolean }>;
  benchmarks: ExternalBenchmarkEntry[];
  latestSnapshots: Map<string, ExternalBenchmarkSnapshot>;
  routingEvents?: Array<{
    providerId: string;
    modelId: string;
    success: boolean;
    latencyMs: number;
    occurredAt: Date;
  }>;
}

/**
 * Result of auto-combo construction.
 */
export interface AutoComboResult {
  /** Provider/model strings in fallback order */
  models: string[];
  
  /** Provenance metadata */
  provenance: {
    generatedAt: string;
    snapshotId: string;
    candidateCount: number;
    selectedCount: number;
    policyUsed: RankingPolicy;
  };
}

/**
 * Combo type discriminator.
 */
export type ComboType = 'manual' | 'automatic';

/**
 * Extended combo with Phase 4 fields.
 */
export interface ExtendedCustomCombo {
  comboId: string;
  name: string;
  models: string[];
  description?: string;
  createdAt: string;
  updatedAt: string;
  
  // Phase 4 additions
  type: ComboType;
  policy?: string;  // JSON string of RankingPolicy
  provenance?: string;  // JSON string of provenance metadata
  snapshotId?: string;
  version: number;
  locked: boolean;
}

/**
 * Provenance history entry.
 */
export interface ComboProvenanceEntry {
  version: number;
  generatedAt: string;
  snapshotId: string;
  policyUsed: RankingPolicy;
  candidateCount: number;
  selectedCount: number;
}
