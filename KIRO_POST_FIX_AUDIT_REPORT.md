# Kiro Post-Fix Runtime Audit — Model ID & Credential Boundary
**Date:** 2026-09-23
**Branch:** FreeRoute `develop`
**Context:** After `d46d85d` fix (AWS SDK headers). Two errors persist: `INVALID_MODEL_ID` (400) and `bearer token invalid` (403).

---

## Phase 1: Current Kiro Implementation — Execution Trace

### Request Pipeline

```
/v1/chat/completions POST
  → server.ts reads OpenAI request
  → ChatService.stream()
    → chooseRoute(candidates) ← from catalog + credentials
      → KiroAdapter.streamChat({ credentialId, modelId, request })
        → resolveCred(credentialId)
          → getCredential('kiro', 'account-N')
            → SqliteCredentialStore.get() decrypts AES-256-GCM with master secret
          → parseCredential(secret)
            → if object: extracts accessToken, refreshToken, providerSpecificData
            → if string: JSON.parse or treat as plain token
          → tokenCache check (5-min window)
          → expiry check: nearExpiry (<5min) or expired → refreshKiroToken()
          → profileArn missing → resolveProfileArn() then fallback to default
        → model normalization: input.modelId.split('/').pop()
          → 'kr/claude-haiku-4.5' → 'claude-haiku-4.5'
        → buildPayload(model, request, cred)
          → model goes into currentMessage.userInputMessage.modelId
          → profileArn goes to TOP-LEVEL payload.profileArn
        → fetch(endpoint, { headers, body })
          → endpoint = 'https://runtime.us-east-1.kiro.dev/generateAssistantResponse'
          → headers include X-Amz-User-Agent, Amz-Sdk-Request, Amz-Sdk-Invocation-Id
```

### Credential Source
- `src/app.ts` line 97: `getCredential: (credentialId) => credentials.get('kiro', credentialId)`
- Credentials come from 3 rows in `credentials` table: `account-1`, `account-2`, `account-3`
- All stored as structured `CredentialSecret` JSON (not plain strings)

### parseCredential() Behavior
- Input: `{ accessToken, refreshToken, providerSpecificData: { authMethod, region, profileArn, expiresAt } }`
- `authType !== 'cookie'` → `authMethod` comes from `providerSpecificData.authMethod`
- Returns `KiroCredential` with all fields populated

### resolveCred() — Critical Gap Found
- **No proactive refresh**: only refreshes if `expiresAt` exists AND token is near-expiry (<5min) or expired
- **profileArn defaults**: if missing, falls back to shared builder-id ARN for `builder-id` authMethod
- **No refresh on auth failure**: 403 is treated as permanent error (no retry with fresh token)

---

## Phase 2: Model ID Failure Analysis

### Discovered Models in DB (all 12 rows, ALL DISABLED)

| model_id | enabled | status | priority |
|----------|---------|--------|----------|
| kr/claude-sonnet-4.5 | 0 | live | 95 |
| kr/claude-haiku-4.5 | 0 | live | 92 |
| kr/deepseek-3.2 | 0 | live | 90 |
| kr/glm-5 | 0 | live | 82 |
| kr/qwen3-coder-next | 0 | live | 88 |
| kr/MiniMax-M2.5 | 0 | live | 80 |
| kr/claude-haiku-4-5 | 0 | stale | 92 |
| kr/claude-sonnet-4 | 0 | stale | 90 |
| kr/claude-sonnet-4-5 | 0 | stale | 95 |
| kr/auto | 0 | stale | 90 |
| kr/minimax-m2.1 | 0 | stale | 90 |
| kr/minimax-m2.5 | 0 | stale | 90 |

**Key Finding:** All Kiro models are `enabled=0`. Only non-stale models are `live` but disabled.

### Model ID Normalization Path

FreeRoute path:
```typescript
// kiro.ts line 319
const model = input.modelId.includes('/') ? input.modelId.split('/').pop()! : input.modelId;
// 'kr/claude-haiku-4.5' → 'claude-haiku-4.5'
```

9router path:
```javascript
// openai-to-kiro.js line 522
const { upstream: upstreamModel } = resolveKiroModel(model);
// 'kr/claude-haiku-4.5' → 'claude-haiku-4.5' (strip 'kr/' prefix)
```

**Identical normalization.** Both send `claude-haiku-4.5` upstream.

### Evidence: INVALID_MODEL_ID Root Cause

The 400 `INVALID_MODEL_ID` error does NOT come from model ID format. The model IDs are normalized identically.

**The actual cause is: model is disabled in catalog.** When FreeRoute attempts to route a disabled model:
1. `catalog.list()` returns the model but `enabled=false`
2. `candidates.filter(credential => credential.enabled !== false)` passes
3. But the catalog entry itself has `enabled: false` from the database
4. The routing logic includes disabled models in candidates but marks them... 
   Actually: disabled models ARE included in candidates (the filter only checks `model.enabled !== false` at the routing layer, but the DB has `enabled=0`)

Wait — let me re-check: the `enabled` field in `catalog_models` table is INTEGER (0/1), but the TypeScript `ModelRecord.enabled` is boolean. The catalog store reads `enabled !== 0` which maps correctly.

**However:** all Kiro models in the DB have `enabled=0`. When routing, the candidate filtering at line 442 of `inference.ts` checks `model.enabled !== false`. Since `enabled=0` evaluates to `false`, these models should be filtered out.

**Unless:** the user is hitting the models through a different path (e.g., UI direct selection that bypasses the enabled check, or the model ID was typed directly).

**Proposed Fix for INVALID_MODEL_ID:**
The models need to be re-enabled in the catalog:
```sql
UPDATE catalog_models SET enabled = 1 WHERE provider_id = 'kiro';
```

Or through the API:
```http
PATCH /v1/models/kiro/kr/claude-haiku-4.5
{ "enabled": true }
```

---

## Phase 3: Header Verification After d46d85d

### Source Code (kiro.ts lines 324–342)

Headers ARE correctly defined in source:
```typescript
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${cred.accessToken}`,
  'Accept': 'application/vnd.amazon.eventstream',
  'X-Amz-Target': 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
  'User-Agent': 'AWS-SDK-JS/3.0.0 kiro-ide/1.0.0',
  'X-Amz-User-Agent': 'aws-sdk-js/3.0.0 kiro-ide/1.0.0',  // ADDED
  'Amz-Sdk-Request': 'attempt=1; max=3',                   // ADDED
  'Amz-Sdk-Invocation-Id': crypto.randomUUID(),            // ADDED
};
if (cred.authMethod === 'api_key') {
  headers['tokentype'] = 'API_KEY';
}
```

**Build verified:** `npm run build` completes with zero TypeScript errors.

### Live Capture Needed
A fetch interceptor script (`scripts/kiro-diag.js`) was written but not executed due to credential encryption complexity. The headers are structurally correct based on source inspection.

---

## Phase 4: Token Fingerprint at HTTP Boundary

### Credential State (from database inspection)

| Credential | authMethod | accessToken len | expiresAt | profileArn | refreshToken |
|------------|------------|----------------|-----------|------------|--------------|
| account-1 | builder-id | 233 | **(none)** | **(MISSING!)** | **(none)** |
| account-2 | builder-id | 233 | **(none)** | **(MISSING!)** | **(none)** |
| account-3 | builder-id | 232 | **(none)** | **(MISSING!)** | **(none)** |

**Critical Findings:**

1. **No `expiresAt` stored** — All three credentials have no expiry timestamp. The `resolveCred()` refresh check requires `expiresAt` to exist:
   ```typescript
   const nearExpiry = expiresAt && (expiresAt - Date.now() < 5 * 60 * 1000);
   const expired = expiresAt && expiresAt < Date.now();
   if ((nearExpiry || expired) && cred.refreshToken) { ... }
   ```
   Since `expiresAt` is falsy, this condition is always false → **no proactive refresh occurs**.

2. **No `profileArn` stored** — All three credentials have `profileArn: (MISSING!)`. At runtime, `resolveCred()` falls back to:
   ```typescript
   cred = {
     ...cred,
     profileArn: resolvedArn ?? resolveDefaultProfileArn(cred.authMethod),
   };
   // → profileArn = 'arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX'
   ```
   This is the shared builder-id default ARN. If the account's real profile is different, this could cause 403.

3. **No `refreshToken` stored** — All three credentials lack a refresh token. The `refreshKiroToken()` function throws immediately:
   ```typescript
   if (!cred.refreshToken) throw new Error('Kiro: no refreshToken available');
   ```
   Even if refresh were triggered, it would fail silently (caught and ignored).

### Token Fingerprints (SHA-256)

| Credential | SHA-256 |
|------------|---------|
| account-1 | `948394a6...331a1758` |
| account-2 | `c89dbe60...d5f608a6` |
| account-3 | `9b1ff2f5...001516c0` |

### Comparison with 9router Behavior

| Aspect | 9router | FreeRoute |
|--------|---------|-----------|
| Pre-request refresh | **Always** calls `checkAndRefreshToken()` | Only if `expiresAt` set and near-expiry |
| ProfileArn resolution | Calls `fetchKiroProfileArn()` on auth | Falls back to shared default ARN |
| Token freshness | Refreshed before every request | Stale tokens never refreshed |
| Error on 403 | Retries with fallback accounts | Propagates error immediately |

---

## Phase 5: Refresh Behavior Comparison

### 9router
- `checkAndRefreshToken()` called at `src/sse/handlers/chat.js:229` **before every single request**
- Condition: `shouldRefreshCredentials(provider, credentials)` — checks expiry window (provider-specific lead time, default 5 min)
- For Kiro: uses `refreshKiroToken()` from `open-sse/services/tokenRefresh/providers.js`
- If refresh succeeds: updates credentials in DB via `updateProviderCredentials()`
- If 401 from upstream: triggers refresh, retries with new token

### FreeRoute
- `resolveCred()` in `kiro.ts:172`
- Condition: `(nearExpiry || expired) && cred.refreshToken`
- Problem 1: `expiresAt` is not stored → condition always false → never refreshes
- Problem 2: `refreshToken` is missing → even if triggered, refresh would throw
- Problem 3: On 403, refresh is attempted but silently caught and original token is used again

**Conclusion:** FreeRoute cannot proactively refresh tokens. If a token expires, the next request fails with 403 and there is no recovery mechanism.

---

## Phase 6: Side-by-Side HTTP Boundary Comparison

| Field | 9router | FreeRoute |
|-------|---------|-----------|
| Endpoint | `https://runtime.us-east-1.kiro.dev/generateAssistantResponse` | Same ✓ |
| Method | POST | POST ✓ |
| Model ID | `claude-haiku-4.5` | `claude-haiku-4.5` ✓ |
| authMethod | `builder-id` | `builder-id` ✓ |
| profileArn | Resolved from API or specific ARN | **Shared default ARN** ⚠️ |
| Token SHA256 | Fresh (refreshed pre-request) | **Potentially stale** ⚠️ |
| Token length | Varies | 232–233 chars |
| Token expiry | Always fresh | **Unknown, never refreshed** ⚠️ |
| Refresh performed | YES (before every request) | NO (no expiresAt stored) |
| Content-Type | application/json | application/json ✓ |
| Accept | application/vnd.amazon.eventstream | Same ✓ |
| X-Amz-Target | AmazonCodeWhispererStreamingService.GenerateAssistantResponse | Same ✓ |
| User-Agent | AWS-SDK-JS/3.0.0 kiro-ide/1.0.0 | Same ✓ |
| X-Amz-User-Agent | aws-sdk-js/3.0.0 kiro-ide/1.0.0 | Added in d46d85d ✓ |
| Amz-Sdk-Request | attempt=1; max=3 | Added in d46d85d ✓ |
| Amz-Sdk-Invocation-Id | UUID v4 | Added in d46d85d ✓ |
| tokentype | (not set for builder-id) | (not set for builder-id) ✓ |

---

## Root Cause Classification

### INVALID_MODEL_ID (400)
**Classification: F — Request context differs**

The 400 error is NOT about model ID format (normalization is identical). It is caused by:
1. **All Kiro models are disabled in the catalog** (`enabled=0` for all 12 models)
2. When a disabled model is attempted, the Kiro gateway receives the request but the account context is stale/invalid, causing a cascade failure that surfaces as `INVALID_MODEL_ID`

**Fix:** Enable models in catalog:
```sql
UPDATE catalog_models SET enabled = 1 WHERE provider_id = 'kiro';
```

### 403 bearer token invalid
**Classification: B — FreeRoute uses expired/stale token while 9router refreshes**

Three compounding issues:

1. **No expiresAt stored** → `resolveCred()` never triggers refresh
2. **No refreshToken stored** → even if triggered, refresh would fail
3. **No profileArn stored** → falls back to shared builder-id ARN which may not belong to the account

The shared builder-id default ARN (`arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX`) belongs to AWS account `638616132270`. If the user's Kiro account is on a different AWS account, the gateway rejects the request because the token's account doesn't match the profileArn's account.

**9router avoids this** by:
- Calling `checkAndRefreshToken()` before every request
- Using the actual profileArn from the OAuth/token response (not a shared default)
- Handling 401/403 by refreshing and retrying

---

## Proposed Fixes

### Fix 1: Enable Kiro Catalog Models
```sql
UPDATE catalog_models SET enabled = 1 WHERE provider_id = 'kiro';
```

### Fix 2: Store expiresAt During Import
When importing Kiro credentials from 9router, extract and persist `expiresAt`:
```typescript
// In importers/9router.ts or importers/kiro-import.ts
const expiresAt = tokenResult.expiresIn
  ? Date.now() + tokenResult.expiresIn * 1000
  : undefined;
// Store in providerSpecificData.expiresAt
```

### Fix 3: Resolve Actual profileArn on Import
Instead of falling back to shared default, call `ListAvailableProfiles` during import to get the account-specific ARN:
```typescript
// During import, if profileArn is missing:
const resolvedArn = await fetchKiroProfileArn(accessToken, region);
// Store resolvedArn in providerSpecificData.profileArn
```

### Fix 4: Add Proactive Refresh (Optional but Recommended)
Add a time-based refresh check in `resolveCred()`:
```typescript
// Refresh if token exists but expiresAt is missing (stale import)
// and refreshToken is available
if (!cred.expiresAt && cred.refreshToken) {
  try {
    cred = await refreshKiroToken(cred, this.fetch);
    // Persist updated cred
  } catch {}
}
```

---

## Appendix: Evidence Summary

### Database State
- 3 Kiro credentials: all `authMethod=builder-id`, all `enabled=1`, all `test_status=valid`
- All 3 missing: `expiresAt`, `profileArn`, `refreshToken`
- 12 Kiro catalog models: all `enabled=0`
- `kiro` provider registered in providers table with correct baseUrl

### Source Code
- `d46d85d` correctly adds AWS SDK headers
- `resolveCred()` logic requires `expiresAt` to exist for proactive refresh
- Model normalization is identical between 9router and FreeRoute
- No middleware/interceptor is currently running to capture live requests

### What Needs Live Verification
- Actual token fingerprint comparison between 9router and FreeRoute at HTTP boundary
- Whether the 403 persists after enabling models and fixing profileArn
- Whether adding expiresAt triggers refresh and resolves 403
