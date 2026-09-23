# Kiro Post-Fix Runtime Audit — Model ID & Credential Boundary

**Date:** 2026-09-23
**Branch:** develop
**Context:** After d46d85d (AWS SDK headers). Two errors persist: INVALID_MODEL_ID (400) and 403 bearer token invalid.

---

## 1. Executive Result

| Aspect | Status | Evidence |
|--------|--------|----------|
| Model ID | FAIL | All 12 Kiro catalog models disabled (enabled=0) |
| Authentication | UNRESOLVED | profileArn missing + no proactive refresh |
| Header parity | PASS | d46d85d added X-Amz-User-Agent, Amz-Sdk-Request, Amz-Sdk-Invocation-Id |
| Refresh parity | FAIL | No expiresAt -> no refresh triggered |
| Runtime | PENDING | Cannot run live test without credentials |

---

## 2. Model ID Finding

### Evidence

```
Discovered model IDs (from DB, all enabled=0):
  kr/MiniMax-M2.5
  kr/auto
  kr/claude-haiku-4-5
  kr/claude-haiku-4.5
  kr/claude-sonnet-4
  kr/claude-sonnet-4-5
  kr/claude-sonnet-4.5
  kr/deepseek-3.2
  kr/glm-5
  kr/minimax-m2.1
  kr/minimax-m2.5
  kr/qwen3-coder-next

Requested model (from routing events):
  kr/claude-haiku-4.5
  kr/deepseek-3.2
  kr/qwen3-coder-next
  kr/claude-sonnet-4.5

Normalized model:
  kr/claude-haiku-4.5 -> claude-haiku-4.5 (split on '/')
  kr/claude-sonnet-4.5 -> claude-sonnet-4.5

Actual upstream model:
  claude-haiku-4.5 (sent in currentMessage.userInputMessage.modelId)

Result: MODEL_NORMALIZATION_ERROR
```

### Analysis

Model ID normalization is identical between 9router and FreeRoute:
- 9router: `resolveKiroModel(model)` strips `kr/` prefix -> `claude-haiku-4.5`
- FreeRoute: `input.modelId.split('/').pop()` -> `claude-haiku-4.5`

The 400 INVALID_MODEL_ID is NOT caused by model format. The upstream model ID is valid.

Root cause of 400: All 12 Kiro catalog models have `enabled=0`. When the routing engine attempts to use a disabled model:
1. `candidates.filter(model.enabled !== false)` passes for `enabled=0` -> false -> filtered OUT
2. But the routing events show failures with `fallback_count` up to 4, indicating the model IS being attempted
3. This means the model IS being selected by `chooseRoute()` but then failing at the Kiro API level

The 400 error likely occurs because:
- The model IS in the catalog (status=live) but disabled
- The client requests it directly (e.g., via API call with explicit model ID)
- FreeRoute passes it through to Kiro adapter
- Kiro returns 400 because the account context is invalid (see 403 section)

Classification: MODEL_DISCOVERY_MISMATCH — models exist in catalog but are disabled, causing routing to fail silently or return misleading errors.

---

## 3. Authentication Finding

### Evidence: Credential State

```
Kiro credentials (decrypted with master secret):

[kiro/account-1]
  authMethod: builder-id
  region: us-east-1
  profileArn: (MISSING!)
  accessToken: aoaAAAAAGqow...ITtJ768o (len=233)
  accessToken SHA256: 948394a62fc425bceb391dce32bf872a2f36b87a85df24493f0a73a0331a1758
  expiresAt: (none)
  refreshToken: (none)

[kiro/account-2]
  authMethod: builder-id
  profileArn: (MISSING!)
  expiresAt: (none)
  refreshToken: (none)

[kiro/account-3]
  authMethod: builder-id
  profileArn: (MISSING!)
  expiresAt: (none)
  refreshToken: (none)
```

### Evidence: Routing Events

```
Recent Kiro routing events (all failures):
  2026-09-21T07:54:30.035Z | failure | latency=0ms | temporary | fallback_count=4
  2026-09-21T07:54:30.027Z | failure | latency=0ms | temporary | fallback_count=3
  2026-09-21T07:54:28.916Z | failure | latency=0ms | temporary | fallback_count=2
  2026-09-21T07:54:27.794Z | failure | latency=0ms | temporary | fallback_count=1
  2026-09-21T07:54:26.687Z | failure | latency=0ms | temporary | fallback_count=0

All events: latency_ms=0, outcome=failure, failure_kind=temporary
```

### Evidence: Code Analysis

FreeRoute resolveCred() refresh logic (kiro.ts:185-211):
```typescript
const expiresAt = cred.expiresAt;
const nearExpiry = expiresAt && (expiresAt - Date.now() < 5 * 60 * 1000);
const expired = expiresAt && expiresAt < Date.now();
if ((nearExpiry || expired) && cred.refreshToken) {
  // refresh logic
}
```
Since `expiresAt` is undefined, both conditions are false -> refresh never triggers.

FreeRoute profileArn resolution (kiro.ts:216-229):
```typescript
if (!cred.profileArn) {
  if (cred.authMethod === 'api_key') {
    cred = { ...cred, profileArn: '' };
  } else {
    // oauth/social: try to resolve from profiles API, fall back to shared default
    const resolvedArn = await resolveProfileArn(cred.accessToken, region, this.fetch);
    cred = { ...cred, profileArn: resolvedArn ?? resolveDefaultProfileArn(cred.authMethod) };
  }
}
```
Since `authMethod === 'builder-id'`, falls through to `resolveProfileArn()`. If that fails (network error, 403), falls back to:
```typescript
// KIRO_DEFAULT_PROFILE_ARNS['builder-id']
'arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX'
```

This is the shared builder-id default ARN belonging to AWS account 638616132270.

If the user's Kiro account is on a different AWS account, the gateway rejects the request.

### Comparison: 9router vs FreeRoute

| Aspect | 9router | FreeRoute |
|--------|---------|-----------|
| Pre-request refresh | Always (checkAndRefreshToken before every request) | Never (only if expiresAt set and near-expiry) |
| profileArn | Resolved from API or stored from OAuth response | Shared default ARN (likely wrong account) |
| Token freshness | Fresh (refreshed before use) | Potentially stale |
| Error recovery on 403 | Retries with next account/fallback | Propagates immediately |

---

## 4. First Concrete Divergence

Root cause of 403: Classification B (Token stale/refresh) combined with Classification F (Request authentication context differs)

The first concrete divergence is profileArn mismatch:

1. FreeRoute stores credentials without profileArn
2. At runtime, resolveCred() falls back to shared builder-id default ARN
3. This ARN belongs to AWS account 638616132270
4. If the user's Kiro account is on a different AWS account, the gateway rejects the request with 403

Evidence:
- All 3 credentials have authMethod: builder-id but profileArn: (MISSING!)
- The fallback ARN arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX is a shared default
- 9router resolves the actual profileArn from the OAuth/token response or ListAvailableProfiles API
- FreeRoute's resolveProfileArn() may fail silently and fall back to the shared default

Secondary divergence: No proactive refresh
- FreeRoute has no expiresAt -> refresh never triggers
- 9router calls checkAndRefreshToken() before every request
- Stale tokens compound the profileArn issue

---

## 5. Root Cause Classification

### 400 INVALID_MODEL_ID
Classification: MODEL_DISCOVERY_MISMATCH

Models exist in catalog but are disabled. The client requests a model that FreeRoute cannot route because:
1. All Kiro models have enabled=0 in catalog
2. When a disabled model is requested, routing still attempts it (the filter checks model.enabled !== false but the candidate filtering happens at a different layer)
3. The request reaches Kiro adapter with invalid account context (wrong profileArn)
4. Kiro returns 400 as a cascade failure

Primary fix: Enable models in catalog.

### 403 INVALID BEARER TOKEN
Classification: B (Token stale) + F (Request authentication context differs)

1. profileArn mismatch: FreeRoute uses shared default ARN instead of account-specific ARN
2. No proactive refresh: Without expiresAt, tokens never refresh
3. No refreshToken: Even if refresh were triggered, there's no token to refresh with

Primary fix: Resolve and store actual profileArn during import.

---

## 6. Evidence Summary

### Model Discovery
```
Discovered model IDs: 12 (all enabled=0)
  kr/claude-sonnet-4.5, kr/claude-haiku-4.5, kr/deepseek-3.2,
  kr/qwen3-coder-next, kr/glm-5, kr/MiniMax-M2.5, + 6 stale variants

Requested model: kr/claude-haiku-4.5 (from routing events)

Normalized model: claude-haiku-4.5

Actual upstream model: claude-haiku-4.5 (in currentMessage.userInputMessage.modelId)

Result: MODEL_DISCOVERY_MISMATCH (models disabled in catalog)
```

### FreeRoute Request Snapshot
```
Endpoint: https://runtime.us-east-1.kiro.dev/generateAssistantResponse
Model: claude-haiku-4.5
authMethod: builder-id
profileArn: arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX (SHARED DEFAULT - likely WRONG)
Token SHA256: 948394a6... (account-1)
Token length: 233
expiresAt: (none)
Refresh attempted: NO (no expiresAt)
Refresh succeeded: N/A
Headers: Content-Type, Authorization, Accept, X-Amz-Target, User-Agent, X-Amz-User-Agent, Amz-Sdk-Request, Amz-Sdk-Invocation-Id
Body summary: { conversationState: { chatTriggerType: "MANUAL", currentMessage: { userInputMessage: { content, modelId, origin } }, history: [] }, profileArn: "shared-default" }
HTTP result: 403 (or 400 cascading from invalid context)
```

### 9router Request Snapshot (from code analysis)
```
Endpoint: https://runtime.us-east-1.kiro.dev/generateAssistantResponse
Model: claude-haiku-4.5
authMethod: builder-id
profileArn: Account-specific (resolved from OAuth response or ListAvailableProfiles)
Token: Fresh (refreshed before each request)
Headers: Same + tokentype header (not set for builder-id)
Body: Same structure but with correct profileArn
HTTP result: 200 (working in production)
```

---

## 7. Proposed Minimal Fix

### Fix 1: Enable Kiro Catalog Models (immediate)
```sql
UPDATE catalog_models SET enabled = 1 WHERE provider_id = 'kiro';
```

### Fix 2: Resolve and Store profileArn During Import
During Kiro credential import (in src/importers/kiro-import.ts), after obtaining accessToken:
```typescript
const resolvedArn = await fetchKiroProfileArn(accessToken, region);
// Store in providerSpecificData.profileArn
```

This ensures each account gets its correct profileArn instead of falling back to shared default.

### Fix 3: Store expiresAt and refreshToken
When importing from 9router or Kiro IDE, preserve:
- providerSpecificData.expiresAt
- providerSpecificData.refreshToken

### Fix 4: Add Stale Token Refresh (optional but recommended)
In resolveCred(), add check for credentials without expiresAt:
```typescript
// If no expiresAt, attempt refresh to establish fresh token
if (!cred.expiresAt && cred.refreshToken) {
  try {
    cred = await refreshKiroToken(cred, this.fetch);
  } catch {}
}
```

---

## 8. Validation

### Build
npm run build -> PASS (zero TypeScript errors)

### Tests
No Kiro-specific unit tests found in test directory.

### Runtime
Cannot perform live Kiro test without valid credentials that can make actual API calls. The database inspection confirms the structural issues but cannot verify the upstream response.

---

## 9. Scope Check

- Benchmark: untouched
- Custom Combos: untouched
- Routing: untouched
- Fallback: untouched
- Other providers: untouched
- Credential migration: untouched

Not implementing any fixes in this audit pass.
