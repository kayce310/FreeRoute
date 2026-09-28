/**
 * Phase 3.5 + 4: External Benchmark Data Ingestion
 * 
 * This module ingests external benchmark data from public model leaderboards
 * and provider catalogs, storing results in SQLite for UI consumption.
 * Phase 4 adds automatic combo generation on top of this foundation.
 */

export type {
  ExternalSourceStatus,
  RefreshScope,
  RefreshResult,
  ExternalSourceMetadata,
  ExternalSourceRuntimeState,
  ExternalBenchmarkEntry,
  ExternalBenchmarkSnapshot,
  ModelSlugTransformer,
  MetricTransformer,
  SourceTransforms,
  ExternalBenchmarkSource,
  RawBenchmarkData,
  RawModelData,
  BenchmarkDataSourceResponse,
  ExternalBenchmarkFilter,
  ExternalBenchmarkQueryResult,
} from './interfaces.js';

export type {
  IdentityState,
  RuntimeCandidate,
  BenchmarkEvidence,
  CanonicalModelIdentity,
  HardEligibility,
  SoftEligibility,
  EligibilityResult,
  RankingPolicy,
  ConstructionContext,
  AutoComboResult,
  ComboType,
  ExtendedCustomCombo,
  ComboProvenanceEntry,
} from './combo-types.js';

export { ExternalBenchmarkStorage } from './storage.js';
export { RefreshCoordinator } from './refresh-coordinator.js';
export { RateLimiter } from './rate-limiter.js';
export {
  defaultModelSlugTransformer,
  openrouterModelSlugTransformer,
  huggingfaceModelSlugTransformer,
  artificialAnalysisModelSlugTransformer,
  getModelSlugTransformer,
  MODEL_SLUG_TRANSFORMERS,
} from './normalizer.js';
export {
  BUILTIN_EXTERNAL_SOURCES,
  getExternalSource,
  getEnabledSources,
} from './sources.js';

// Phase 4 exports
export {
  buildCanonicalIndex,
  normalizeToPermaslug,
  getRuntimeCandidates,
  getBenchmarkEvidence,
  hasBenchmarkData,
  isBenchmarkFresh,
} from './canonical-identity.js';

export {
  constructAutoCombo,
  generateTargetsFromBenchmarkSource,
} from './auto-combo-generator.js';

export { DEFAULT_RANKING_POLICY } from './combo-types.js';
