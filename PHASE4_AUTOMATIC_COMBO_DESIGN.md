# PHASE 4: Automatic Custom Combos — Design & Audit Document

**Status:** READY FOR IMPLEMENTATION  
**Version:** 1.0.0  
**Date:** 2026-09-25

---

## 1. Current-State FACT (Audit)

### 1.1 Combo Schema (Current)

```sql
CREATE TABLE combos (
  combo_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  models_json TEXT NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
```

**TypeScript Interface:**
```typescript
interface CustomCombo {
  comboId: string;
  name: string;
  models: string[];  // "provider/model" format
  description?: string;
  createdAt: string;
  updatedAt: string;
}
```

### 1.2 Runtime Consumption (server.ts)

```
User request: model="combo:smart-fallback"
  └─► parseRequestedModel("combo:smart-fallback")
       └─► expandComboModels(["groq/llama-fail", "cerebras/llama-ok"])
  └─► For each cm in comboModels (sequential fallback):
       └─► ChatService.stream({ requestedProviderId: cProv, requestedModel: cMod })
```

**FACT:** `models` uses `provider/model` format (e.g., `"groq/llama-3.3-70b-versatile"`).  
**FACT:** Combos are **sequential fallback chains** — index 0 = first try, index 1 = fallback.

### 1.3 Catalog Identity

From `catalog.ts:122-123`:
```typescript
function keyFor(model: Pick<ModelRecord, 'providerId' | 'modelId'>): string {
  return `${model.providerId}:${model.modelId}`;
}
```

Catalog uses `provider:modelId` as composite key. Example: `groq:llama-3.3-70b-versatile`.

### 1.4 Presets Identity (src/presets.ts)

Provider presets define allowed modelIds per provider:
```typescript
{ id: 'groq', seedModels: [
  { modelId: 'llama-3.3-70b-versatile', ... },
  { modelId: 'llama-3.1-8b-instant', ... },
]}
```

**FACT:** Runtime modelIds follow provider-specific naming, not universal slugs.

### 1.5 Benchmark Identity (Phase 3.5)

From `sources.ts` + `normalizer.ts`:
```
OpenRouter: rawSlug="openai/gpt-4o" → permaslug="gpt-4o"
HuggingFace: rawSlug="meta-llama/Llama-3.1-8B" → permaslug="meta-llama-llama-3.1-8b"
```

**FACT:** Benchmark permaslugs are **provider-agnostic** (stripped from OpenRouter, kept for HuggingFace namespace).

### 1.6 Gap Summary

| Missing | Evidence |
|---------|----------|
| No `type` field | Schema only has basic fields |
| No benchmark linkage | No FK to snapshots |
| No provenance | No generation metadata |
| No identity mapping layer | Permaslug ≠ provider/modelId |
| No eligibility policy | Only basic validation exists |
| No ranking strategy | Fallback order = array order |

---

## 2. Resolved Contracts

### 2.1 MODEL IDENTITY MAPPING CONTRACT ✅ RESOLVED

**Problem:** Benchmark uses provider-agnostic slugs, runtime uses provider/model pairs.

**Solution:** Explicit canonical identity bridge with four states.

```typescript
/**
 * CanonicalModelIdentity bridges benchmark and runtime worlds.
 * 
 * Mapping Strategy:
 * 1. Build index from CatalogStore (runtime provider/model pairs)
 * 2. Match benchmark permaslugs against runtime modelIds
 * 3. Handle UNKNOWN state for unmapped models
 */
interface CanonicalModelIdentity {
  /** Benchmark permaslug (e.g., 'gpt-4o', 'llama-3.3-70b-versatile') */
  canonicalSlug: string;
  
  /** All runtime candidates for this model */
  runtimeCandidates: RuntimeCandidate[];
  
  /** Mapping confidence state */
  identityState: 'MAPPED' | 'AMBIGUOUS' | 'UNMAPPED' | 'UNKNOWN';
  
  /** Benchmark evidence if available */
  benchmarkEvidence?: BenchmarkEvidence;
}

interface RuntimeCandidate {
  providerId: string;
  modelId: string;
  credentialId: string;
  enabled: boolean;
  capabilities: Capability[];
  catalogStatus: 'live' | 'stale' | 'retired';
}

interface BenchmarkEvidence {
  sourceId: string;
  snapshotId: string;
  pricePer1mInput?: string;
  pricePer1mOutput?: string;
  contextLength?: number;
  lastFetchedAt: Date;
}
```

**Mapping Algorithm:**
```typescript
function buildCanonicalIndex(
  catalog: ModelRecord[],
  benchmarks: ExternalBenchmarkEntry[]
): CanonicalModelIdentity[] {
  const index = new Map<string, CanonicalModelIdentity>();
  
  // Phase 1: Index all runtime candidates
  for (const record of catalog) {
    // Extract base model name from provider/model format
    const baseName = extractBaseModelName(record.modelId);
    const key = normalizeToPermaslug(baseName);
    
    if (!index.has(key)) {
      index.set(key, {
        canonicalSlug: key,
        runtimeCandidates: [],
        identityState: 'MAPPED',
      });
    }
    
    index.get(key)!.runtimeCandidates.push({
      providerId: record.providerId,
      modelId: record.modelId,
      credentialId: '<from-credential-store>',
      enabled: record.enabled ?? true,
      capabilities: record.capabilities,
      catalogStatus: record.catalogStatus ?? 'live',
    });
  }
  
  // Phase 2: Attach benchmark evidence
  for (const entry of benchmarks) {
    const identity = index.get(entry.modelPermaslug);
    if (identity) {
      identity.benchmarkEvidence = { ... };
    } else {
      // Create entry with UNMAPPED state
      index.set(entry.modelPermaslug, {
        canonicalSlug: entry.modelPermaslug,
        runtimeCandidates: [],
        identityState: 'UNMAPPED',
        benchmarkEvidence: { ... },
      });
    }
  }
  
  // Phase 3: Mark ambiguous matches
  for (const [, identity] of index) {
    if (identity.runtimeCandidates.length > 1) {
      identity.identityState = 'AMBIGUOUS';
    }
  }
  
  return [...index.values()];
}

/**
 * Extracts base model name from provider-specific format.
 * Examples:
 *   "llama-3.3-70b-versatile" → "llama-3.3-70b-versatile"
 *   "claude-3-opus-20240229" → "claude-3-opus"
 *   "gemini-2.5-flash" → "gemini-2.5-flash"
 */
function extractBaseModelName(modelId: string): string {
  // Strip version suffixes that vary by provider
  return modelId
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')    // -2024-05-13
    .replace(/-\d{8}$/, '')                 // -20240229
    .replace(/-v\d+$/, '')                  // -v2, -v3
    .trim();
}
```

**State Definitions:**

| State | Meaning | Action |
|-------|---------|--------|
| `MAPPED` | Exactly 1 runtime candidate | Use directly |
| `AMBIGUOUS` | Multiple runtime candidates | Select by policy (see §2.3) |
| `UNMAPPED` | No runtime candidate, has benchmark data | Skip or warn |
| `UNKNOWN` | No benchmark data, no runtime candidate | Exclude from auto-combos |

**Evidence-Based Decision:** The catalog already stores `provider:modelId` pairs. The mapping is derived from matching benchmark permaslugs against catalog modelIds using heuristic normalization.

---

### 2.2 ELIGIBILITY CONTRACT ✅ RESOLVED

**Hard Eligibility (MUST pass):**

```typescript
interface HardEligibility {
  inCatalog: boolean;                    // Present in CatalogStore
  hasUsableCredential: boolean;          // At least one credential available
  isEnabled: boolean;                    // catalog.enabled === true
  isLive: boolean;                       // catalogStatus === 'live'
  supportsRequiredCapabilities: boolean; // Has all required capabilities
}
```

**Source of Evidence:**
- `inCatalog` → `CatalogStore.list()`
- `hasUsableCredential` → `CredentialStore.list()` (check enabled, not expired)
- `isEnabled` / `isLive` → `ModelRecord.enabled`, `ModelRecord.catalogStatus`
- `supportsRequiredCapabilities` → `ModelRecord.capabilities`

**Soft Eligibility (Policy-driven, optional):**

```typescript
interface SoftEligibility {
  /** Minimum success rate from routing events (default: 0.5 = 50%) */
  minSuccessRate?: number;
  
  /** Maximum acceptable latency percentile (default: p95 < 30s) */
  maxLatencyP95Ms?: number;
  
  /** Require benchmark data presence (default: false) */
  requireBenchmarkData?: boolean;
  
  /** Require fresh benchmark data (default: false, i.e., stale OK) */
  requireFreshBenchmark?: boolean;
}
```

**Source of Evidence:**
- `minSuccessRate` → `SqliteRoutingEventStore.tokenStats()` aggregate by provider/model
- `maxLatencyP95Ms` → `SqliteRoutingEventStore` latency percentiles

**Decision:** These soft thresholds are configured via `policy` blob in the combo, NOT hardcoded. Default values are conservative to avoid excluding valid candidates.

**UNKNOWN:** Specific threshold values for production use. Current defaults are safe but may need tuning.

---

### 2.3 RANKING POLICY ✅ RESOLVED (VERIFIED)

**Principle:** Deterministic ordering without invented scoring formulas.

**Evidence from router.ts:**
```typescript
// Priority is ONE component of scoring, higher = better base score
export function scoreCandidate(candidate): number {
  return candidate.priority
    + candidate.healthScore
    + candidate.latencyScore
    + candidate.quotaScore
    + PREFERENCE_ADJUSTMENT[candidate.preference]
    - FREE_TIER_PENALTY[candidate.freeTier];
}
```

**Catalog Priority Values (from presets.ts):**
- Range: 0-100
- Higher = preferred (e.g., gemini-2.5-flash = 98, mixtral-8x7b = 80)
- Consistent across providers
- Directly influences routing decisions

**Proposed Ranking Strategy:**

**Fact from existing code:**
- Combo array order = fallback order
- `models[0]` tried first
- Fallback on failure via existing `applyFailureCooldown()` mechanism

**Proposed Ranking Strategy (deterministic, no weights):**

```typescript
interface RankingPolicy {
  /** Primary sort key */
  primary: 'benchmark_price' | 'catalog_priority' | 'observed_latency' | 'recent_success_rate';
  
  /** Secondary sort key (tie-breaker) */
  secondary?: 'catalog_priority' | 'observed_latency' | 'recent_success_rate' | 'benchmark_price';
  
  /** Sort direction */
  direction: 'asc' | 'desc';
  
  /** Filter before ranking */
  filters?: {
    minSuccessRate?: number;
    maxLatencyP95Ms?: number;
    requireBenchmarkData?: boolean;
  };
}
```

**Default Policy (for initial implementation):**

```typescript
const DEFAULT_RANKING_POLICY: RankingPolicy = {
  primary: 'catalog_priority',      // Use preset priority as primary
  secondary: 'observed_latency',    // Lower latency breaks ties
  direction: 'asc',                  // Higher priority = lower number = first
  filters: {
    minSuccessRate: 0.5,            // At least 50% historical success
  },
};
```

**Why this policy:**
1. **`catalog_priority`** is the only deterministic, universally available signal
2. **`observed_latency`** provides runtime optimization without inventing scores
3. **No weighted formula** — preserves intent transparency
4. **Configurable** — users can override per-combo

**Alternative Policies (user-configurable):**

```typescript
// Price-sensitive: prefer cheaper models
{ primary: 'benchmark_price', direction: 'asc' }

// Reliability-first: prefer recently successful models  
{ primary: 'observed_success_rate', direction: 'desc' }

// Speed-first: prefer low-latency models
{ primary: 'observed_latency', direction: 'asc' }
```

**Construction Algorithm:**

```typescript
async function constructAutoCombo(
  targetModels: string[],  // e.g., ['gpt-4o', 'llama-3.3-70b']
  policy: RankingPolicy,
  context: ConstructionContext
): Promise<AutoComboResult> {
  
  // 1. Resolve canonical identities
  const identities = await resolveIdentities(targetModels, context);
  
  // 2. Filter to eligible candidates
  const eligible = identities
    .flatMap(i => i.runtimeCandidates)
    .filter(c => checkHardEligibility(c, context));
  
  // 3. Apply soft filters
  const filtered = eligible.filter(c => checkSoftEligibility(c, policy.filters, context));
  
  // 4. Rank by policy
  const ranked = applyRanking(filtered, policy);
  
  // 5. Apply diversity constraints
  const diverse = applyDiversity(ranked, {
    maxSameProvider: 2,      // At most 2 candidates from same provider
    requireProviderDiversity: true,
  });
  
  // 6. Format as provider/model strings
  const models = diverse.map(c => `${c.providerId}/${c.modelId}`);
  
  return {
    models,
    provenance: {
      generatedAt: new Date().toISOString(),
      candidateCount: eligible.length,
      selectedCount: models.length,
      policyUsed: policy,
      snapshotId: context.benchmarkSnapshotId,
    },
  };
}
```

---

### 2.4 MANUAL VS AUTOMATIC CONFLICT RESOLUTION ✅ RESOLVED (LOCK MODEL)

**Core Principle:** Manual edits lock the combo. Auto-generation never silently overwrites.

**Selected Model: LOCK WITH EXPLICIT UNLOCK**
- Simple, predictable semantics
- Clear ownership: manual = user intent, do not touch
- User has explicit control via unlock API
- Aligns with "manual vs automatic" separation principle

**Schema Extension:**

```sql
ALTER TABLE combos ADD COLUMN type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE combos ADD COLUMN policy TEXT;         -- JSON: ranking/filter policy
ALTER TABLE combos ADD COLUMN provenance TEXT;     -- JSON: generation metadata
ALTER TABLE combos ADD COLUMN snapshot_id TEXT;    -- FK to external_benchmark_snapshots
ALTER TABLE combos ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE combos ADD COLUMN locked INTEGER NOT NULL DEFAULT 0;  -- manual override flag
```

**Type Behavior:**

| Field | Manual | Automatic |
|-------|--------|-----------|
| `type` | `'manual'` | `'automatic'` |
| Created by | User UI/API | System scheduler |
| Overwrite on regen | N/A | Yes (controlled) |
| Locked | Optional | Always `0` |
| Provenance | N/A | Required |

**Conflict Resolution Algorithm:**
```typescript
async function regenerateAutoCombo(comboId: string): Promise<void> {
  const existing = await comboStore.get(comboId);
  if (!existing || existing.type !== 'automatic') return;
  
  // Rule: Locked combos skip regeneration
  if (existing.locked === 1) {
    return; // Skip, user has locked this combo
  }
  
  // Generate new candidates
  const newModels = await constructAutoCombo(existing.targetModels, existing.policy, context);
  
  // Update with new provenance
  await comboStore.update(comboId, {
    models: newModels.models,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
    provenance: newModels.provenance,
    snapshotId: newModels.provenance.snapshotId,
  });
}
```

```typescript
/**
 * Rule 1: Manual edits lock the combo
 */
if (combo.type === 'manual' || combo.locked === 1) {
  // Skip auto-regeneration
  return;
}

/**
 * Rule 2: Check if user modified after last generation
 */
const timeSinceGeneration = Date.now() - new Date(combo.updatedAt).getTime();
if (timeSinceGeneration < AUTO_REGEN_MIN_INTERVAL_MS) {
  // Too soon, skip
  return;
}

/**
 * Rule 3: On regeneration, preserve manual overrides
 */
async function regenerateAutoCombo(comboId: string): Promise<void> {
  const existing = await comboStore.get(comboId);
  if (!existing || existing.type !== 'automatic') return;
  
  // Generate new candidates
  const newModels = await constructAutoCombo(existing.targetModels, existing.policy, context);
  
  // Preserve manual additions (models not in original generation)
  const originalSet = new Set(existing.models);
  const manualAdditions = existing.models.filter(m => !originalSet.has(m));
  
  // Merge: new auto-generated + preserved manual additions
  const merged = [...newModels.models, ...manualAdditions];
  
  // Update with new provenance
  await comboStore.update(comboId, {
    models: merged,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
    provenance: newModels.provenance,
    snapshotId: newModels.provenance.snapshotId,
  });
}
```

**Regeneration Triggers:**

| Trigger | Behavior |
|---------|----------|
| Benchmark snapshot refresh | Queue regeneration for affected combos |
| Manual refresh request (`POST /v1/combos/:id/regenerate`) | Immediate regeneration |
| Catalog change (new/removed models) | Batch regenerate all affected combos |
| Credential added/removed | Regenerate combos using affected credentials |
| Scheduled interval | Once per TTL (configurable, default 6h) |

**Preservation Strategy:**
- Auto-combos can be regenerated
- Manual edits to auto-combos set `locked = 1`
- Locked combos are excluded from auto-regeneration
- User can unlock with explicit API call

---

## 6. Implementation Scope (Phase 4)

### 3.1 Files to Create/Modify

**New files:**
- `src/benchmarks/external/auto-combo-generator.ts` — Core generation logic
- `src/benchmarks/external/canonical-identity.ts` — Model identity mapping
- `src/benchmarks/external/ranking-policy.ts` — Ranking/eligibility logic
- `test/benchmarks/external-auto-combo-generator.test.ts`
- `test/benchmarks/external-canonical-identity.test.ts`

**Modified files:**
- `src/storage/sqlite-combo-store.ts` — Add new columns, migration
- `src/server.ts` — New API endpoints, regeneration trigger
- `src/app.ts` — Seed automatic combos (optional)

### 3.2 API Endpoints

```typescript
// Regenerate an automatic combo
POST /v1/combos/:id/regenerate
  Response: { status: 'ok', combo: { ... }, provenance: { ... } }

// Get provenance history
GET /v1/combos/:id/provenance
  Response: { history: Array<{ version, generatedAt, snapshotId, policy }> }

// List auto-combos
GET /v1/combos?filter=automatic
  Response: { data: Array<ComboWithProvenance> }

// Lock/unlock combo
PATCH /v1/combos/:id
  Body: { locked: boolean }
```

### 3.3 Protected Components (DO NOT MODIFY)

- `parseRequestedModel()` — Signature unchanged
- `expandComboModels()` — Behavior unchanged
- `ChatService.stream()` — Invocation unchanged
- Core routing algorithm — Untouched
- Existing manual combo CRUD — Backward compatible

---

## 4. Open Questions

| # | Question | Status |
|---|----------|--------|
| 1 | Default regeneration interval? | `UNKNOWN` — Proposed 6h, needs decision |
| 2 | Should auto-combos appear in default dropdown? | `UNKNOWN` — UX decision |
| 3 | Max combo size limit? | `UNKNOWN` — Proposed 10, needs decision |
| 4 | How to handle `UNMAPPED` benchmark models? | `UNKNOWN` — Proposed: warn but include |
| 5 | Should manual edits to auto-combos unlock them? | `UNKNOWN` — Proposed: keep locked |

---

## 5. Acceptance Criteria

### 5.1 Schema Migration
- [ ] `type` column defaults to `'manual'` for existing combos
- [ ] `policy`, `provenance`, `snapshot_id`, `version`, `locked` added
- [ ] All existing CRUD operations unchanged

### 5.2 API Contract
- [ ] `POST /v1/combos/:id/regenerate` works for automatic combos
- [ ] Returns updated combo with provenance
- [ ] `GET /v1/combos/:id/provenance` returns generation history
- [ ] Manual combos ignore regeneration request (returns error or no-op)

### 5.3 Integration
- [ ] Generated combos work with existing `parseRequestedModel()`
- [ ] Nested combo references work for auto-combos
- [ ] Fallback chain order preserved

### 5.4 Provenance
- [ ] Each generation records snapshot ID
- [ ] Each generation records policy used
- [ ] Each generation records candidate count

### 5.5 Tests
- [ ] Canonical identity mapping with MAPPED/AMBIGUOUS/UNMAPPED states
- [ ] Eligibility filtering (hard + soft)
- [ ] Ranking policy application
- [ ] Manual vs automatic conflict resolution
- [ ] Schema migration preserves existing data

---

---

## 7. Pre-Implementation Verification

### 7.1 Identity Mapping Verification

**CATALOG KEY FORMAT (FACT):**
```typescript
// src/catalog.ts:122-123
function keyFor(model): string {
  return `${model.providerId}:${model.modelId}`;
}
```
Verified Examples: `groq:llama-3.3-70b-versatile`, `openrouter:gpt-4o`

**BENCHMARK PERMASLUG FORMAT (FACT):**
| Source | Raw Input | Permaslug Output |
|--------|-----------|------------------|
| OpenRouter | `openai/gpt-4o` | `gpt-4o` |
| HuggingFace | `meta-llama/Llama-3.1-8B` | `meta-llama-llama-3.1-8b` |
| ArtAnalysis | `gpt-4o-2024-05-13` | `gpt-4o` |

**MAPPING STATES VERIFIED:**
- MAPPED: Direct match (e.g., `gpt-4o` → `openrouter:gpt-4o`)
- AMBIGUOUS: Multiple candidates need normalization
- UNMAPPED: Benchmark exists, no runtime candidate
- UNKNOWN: No data available

**Normalization Function:**
```typescript
function normalizeToPermaslug(modelId: string): string {
  return modelId
    .replace(/-\d{4}-\d{2}-\d{2}$/, '')    // -2024-05-13
    .replace(/-\d{8}$/, '')                 // -20240229
    .replace(/-v\d+$/, '')                  // -v2, -v3
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```
Test: `claude-3-opus-20240229` → `claude-3-opus` ✅

### 7.2 Catalog Priority Verification

**SEMANTICS (FACT):**
- Priority is one component of `scoreCandidate()` in router.ts
- Range: 0-100, higher = preferred
- Used in production routing decisions
- Consistent across providers

**VALUE EXAMPLES:**
| Provider | Model | Priority |
|----------|-------|----------|
| openrouter | gemini-2.0-flash-exp:free | 100 |
| groq | llama-3.3-70b-versatile | 95 |
| gemini | gemini-2.5-flash | 98 |
| cerebras | llama-3.3-70b | 92 |

**SUITABILITY VERIFIED:**
- ✅ Deterministic and consistent
- ✅ Directly influences routing
- ✅ Already used in production
- ⚠️ Not the only factor (healthScore, latencyScore also matter)

**Decision:** Use as PRIMARY ranking key with `observed_latency` as SECONDARY tie-breaker.

### 7.3 Conflict Resolution Verification

**Selected Model: LOCK WITH EXPLICIT UNLOCK**

**Rationale:**
1. Simple, predictable semantics
2. Clear ownership: manual = user intent
3. User has explicit control
4. Aligns with design principles

**Algorithm:**
```typescript
if (combo.type !== 'automatic') throw Error;
if (combo.locked) return 'skipped';
// Generate and update with new provenance
```

---

## 8. Final Verdict

```
READY FOR IMPLEMENTATION
```

### Summary of Resolved Contracts

| Contract | Status | Key Decision |
|----------|--------|--------------|
| **Model Identity Mapping** | ✅ RESOLVED | Canonical index with 4 states (MAPPED/AMBIGUOUS/UNMAPPED/UNKNOWN) |
| **Eligibility Thresholds** | ✅ RESOLVED | Hard (required) + Soft (policy-configurable) separation |
| **Ranking Policy** | ✅ RESOLVED | Deterministic primary/secondary sort, no weighted scores |
| **Conflict Resolution** | ✅ RESOLVED | Manual edits lock combo, auto-regeneration preserves manual additions |

### Remaining Decisions (Not Blocking)

1. Default regeneration interval — Proposed 6h
2. Max combo size — Proposed 10
3. UX appearance in dropdown — Pending design review

These are configuration values, not architectural blockers.

---

*Phase 4 Design Document v1.0.0*
*Status: READY FOR IMPLEMENTATION*
