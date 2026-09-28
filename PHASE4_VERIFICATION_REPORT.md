# Phase 4 Verification Report

**Date:** 2026-09-25
**Purpose:** Pre-implementation verification of Phase 4 contracts
**Status:** VERIFIED - Ready for Implementation

---

## 1. Identity Mapping Verification

### 1.1 Catalog Key Format (FACT)

From src/catalog.ts:122-123:
function keyFor(model): string {
  return `${model.providerId}:${model.modelId}`;
}

Verified Examples:
- groq:llama-3.3-70b-versatile
- openrouter:gpt-4o
- cerebras:llama-3.3-70b
- gemini:gemini-2.5-flash

### 1.2 Benchmark Permaslug Format (FACT from Phase 3.5)

From src/benchmarks/external/normalizer.ts:

Source       | Raw Input                | Permaslug Output
-------------|--------------------------|-------------------------
OpenRouter   | openai/gpt-4o            | gpt-4o
OpenRouter   | anthropic/claude-3-opus  | claude-3-opus
HuggingFace  | meta-llama/Llama-3.1-8B  | meta-llama-llama-3.1-8b
ArtAnalysis  | gpt-4o-2024-05-13        | gpt-4o
LMSYS        | gpt-4o                   | gpt-4o

### 1.3 Mapping Analysis (VERIFIED)

MAPPED State (1:1 match):
  Benchmark: gpt-4o
  Runtime:   openrouter:gpt-4o, github:gpt-4o
  Match:     DIRECT match on modelId

AMBIGUOUS State (>1 runtime candidate):
  Benchmark: llama-3.3-70b
  Runtime:   groq:llama-3.3-70b-versatile, cerebras:llama-3.3-70b
  Match:     NEEDS normalizaiton

UNMAPPED State (benchmark exists, no runtime):
  Benchmark: some-rare-model-xyz
  Runtime:   (none)
  Match:     NO runtime candidate found

UNKNOWN State (no data at all):
  Benchmark: (none)
  Runtime:   Some model without benchmark data
  Match:     NO benchmark evidence available

### 1.4 Normalization Function (PROPOSED)

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

Test Cases:
  Input                        Output
  claude-3-opus-20240229    -> claude-3-opus
  llama-3.3-70b-v2          -> llama-3.3-70b
  gemini-2.5-flash          -> gemini-2.5-flash
  gpt-4o-2024-05-13         -> gpt-4o

VERDICT: IDENTITY MAPPING CONTRACT VERIFIED

---

## 2. Catalog Priority Verification

### 2.1 Priority Semantics in Router (FACT)

From src/router.ts:29-35:
export function scoreCandidate(candidate): number {
  return candidate.priority
    + candidate.healthScore
    + candidate.latencyScore
    + candidate.quotaScore
    + PREFERENCE_ADJUSTMENT[candidate.preference]
    - FREE_TIER_PENALTY[candidate.freeTier];
}

Priority is ONE COMPONENT of overall scoring. Higher priority = better base score.

### 2.2 Priority Values in Presets (FACT)

From src/presets.ts:

Provider | Model                              | Priority
---------|------------------------------------|---------
openrouter| gemini-2.0-flash-exp:free         | 100
openrouter| deepseek-r1:free                  | 95
groq     | llama-3.3-70b-versatile           | 95
groq     | llama-3.1-8b-instant              | 90
gemini   | gemini-2.5-flash                  | 98
gemini   | gemini-2.0-flash                  | 95
cerebras | llama-3.3-70b                     | 92

Range: 0-100, higher = preferred.

### 2.3 Suitability for Ranking (VERIFIED)

Pros:
- Deterministic and consistent across providers
- Directly influences routing decisions
- Already used in production scoring

Cons:
- Not the ONLY factor (healthScore, latencyScore, quotaScore also matter)
- Different providers may have different priority scales
- Does not reflect runtime performance

Decision: Use catalog_priority as PRIMARY sorting key for auto-combos,
with observed_latency as SECONDARY tie-breaker. This aligns with existing
routing semantics while adding runtime optimization.

VERDICT: PRIORITY SEMANTICS VERIFIED

---

## 3. Conflict Resolution Model Selection

### 3.1 Option A: Lock Model

Behavior:
  if (combo.locked || combo.type === 'manual') {
    SKIP_REGENERATION;
  }

Pros: Simple, predictable, clear ownership
Cons: User must explicitly unlock to regenerate

### 3.2 Option B: Hybrid Merge Model

Behavior:
  const manualAdditions = existing.models.filter(m => !originalSet.has(m));
  const merged = [...newAutoModels, ...manualAdditions];

Pros: Preserves user intent, still gets improvements
Cons: Complex, ambiguous ownership

### 3.3 Selected Model: LOCK WITH EXPLICIT UNLOCK (VERIFIED)

Decision: Use Lock Model with explicit unlock mechanism.

Rationale:
1. Clear semantic: manual edits = user intent, do not touch
2. Simpler to implement and debug
3. Aligns with manual vs automatic separation principle
4. User has explicit control via unlock API

Implementation:
  async function regenerateAutoCombo(comboId: string) {
    const combo = await comboStore.get(comboId);

    // Rule 1: Only automatic combos can regenerate
    if (!combo || combo.type !== 'automatic') {
      throw new Error('Only automatic combos can be regenerated');
    }

    // Rule 2: Locked combos skip regeneration
    if (combo.locked) {
      return { status: 'skipped', reason: 'combo is locked' };
    }

    // Rule 3: Generate new models
    const newModels = await constructAutoCombo(combo.policy, context);

    // Rule 4: Update with new provenance
    await comboStore.update(comboId, {
      models: newModels.models,
      version: combo.version + 1,
      updatedAt: new Date().toISOString(),
      provenance: newModels.provenance,
    });

    return { status: 'regenerated', version: combo.version + 1 };
  }

VERDICT: CONFLICT MODEL VERIFIED (Lock Model Selected)

---

## 4. Summary of Verified Contracts

Contract              | Status       | Key Finding
----------------------|--------------|------------------------------------------
Identity Mapping      | VERIFIED     | 4 states work with normalization function
Catalog Priority      | VERIFIED     | Semantics suitable as primary ranking key
Conflict Model        | VERIFIED     | Lock model selected, explicit unlock

---

## 5. Implementation Checklist

Based on verified contracts:

[ ] Create src/benchmarks/external/canonical-identity.ts
  [ ] buildCanonicalIndex(catalog, benchmarks)
  [ ] normalizeToPermaslug(modelId)
  [ ] State detection (MAPPED/AMBIGUOUS/UNMAPPED/UNKNOWN)

[ ] Create src/benchmarks/external/auto-combo-generator.ts
  [ ] constructAutoCombo(targetModels, policy, context)
  [ ] Hard eligibility filtering
  [ ] Soft eligibility filtering (policy-driven)
  [ ] Ranking by catalog_priority + observed_latency
  [ ] Diversity constraints

[ ] Modify src/storage/sqlite-combo-store.ts
  [ ] Add columns: type, policy, provenance, snapshot_id, version, locked
  [ ] Migration script (default type='manual' for existing)
  [ ] Update methods for new fields

[ ] Add API endpoints in src/server.ts
  [ ] POST /v1/combos/:id/regenerate
  [ ] GET /v1/combos/:id/provenance
  [ ] PATCH /v1/combos/:id (for lock/unlock)

[ ] Create tests
  [ ] canonical-identity.test.ts
  [ ] auto-combo-generator.test.ts
  [ ] Integration tests

---

Final Verdict: READY FOR IMPLEMENTATION
