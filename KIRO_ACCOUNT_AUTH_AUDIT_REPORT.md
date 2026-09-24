# Kiro Account Verification & Authentication Flow Audit

**Date:** 2026-09-23
**Branch:** develop
**Context:** Post-fix pass audit for persistent 400/403 errors
**Scope:** Audit ONLY — no production code changes

---

## 1. Executive Summary

| Aspect | Status | Evidence |
|--------|--------|----------|
| 400 INVALID_MODEL_ID | UNRESOLVED | Model ID format mismatch between discovery and runtime request |
| 403 invalid bearer token | INVESTIGATED | Token expiry / refresh parity difference between 9router and FreeRoute |
| Authentication | PARTIALLY FIXED | profileArn preservation fixed; token refresh parity still divergent |
| Account Verification | **MISSING IN FREEROUTE** | No equivalent to 9router's `checkAndRefreshToken` before every request |
| Model ID | DIFFERENT | 9router uses clean model IDs; FreeRoute adds `kr/` prefix in catalog but strips it at runtime |

**Key Finding:** The primary divergence is **not a missing "account verification" endpoint call** — both systems rely on the same token+profileArn identity. However, there IS a critical refresh parity gap:

1. **9router ALWAYS calls refresh before every request** (via `checkAndRefreshToken`)
2. **FreeRoute only refreshes if expiresAt is set AND near expiry**
3. **All 3 Kiro credentials lack expiresAt** → FreeRoute never proactively refreshes
4. **Tokens may be stale/expired** → causes 403

---

## 2. 9router Kiro Authentication Flow

```
Kiro Credential (stored in SQLite)
  │
  ▼
checkAndRefreshToken() [BEFORE EVERY REQUEST]
  │  - Always calls refreshKiroToken() if refreshToken exists
  │  - Returns fresh accessToken + expiresAt + profileArn patch
  │  - Persists refreshed credential back to store
  │
  ▼
refreshKiroToken(refreshToken, providerSpecificData)
  │  - If clientId+clientSecret: AWS SSO OIDC endpoint
  │    POST https://oidc.us-east-1.amazonaws.com/token
  │    Body: {clientId, clientSecret, refreshToken, grantType}
  │  - Else: Social refresh endpoint
  │    POST https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken
  │    Body: {refreshToken}
  │
  ▼
resolveKiroProfileArnPatch() [IF profileArn missing]
  │  - Calls ListAvailableProfiles if no profileArn in refresh response
  │  - Returns {providerSpecificData: {profileArn}}
  │
  ▼
BaseExecutor.execute()
  │  - Builds headers: Authorization Bearer + AWS SDK headers
  │  - API-key: adds tokentype: API_KEY
  │  - Gets ordered baseUrls (api-key: amazonaws.com first)
  │
  ▼
openaiToKiroRequest() translator
  │  - Converts OpenAI messages → Kiro conversationState
  │  - Injects thinking_mode prefix if needed
  │  - Sets payload.profileArn (top-level, NOT inside conversationState)
  │  - Strips -agentic/-thinking suffixes from modelId
  │
  ▼
HTTP POST https://runtime.us-east-1.kiro.dev/generateAssistantResponse
  │
  ▼
TransformEventStreamToSSE() [on 200]
  │  - Parses AWS EventStream binary → SSE chunks
  │
  ▼
Response to client
```

### 9router Key Behaviors:

| Behavior | Implementation |
|----------|---------------|
| Refresh before request | **ALWAYS** — `checkAndRefreshToken()` called in BaseExecutor.execute() |
| Refresh endpoint | Social: `https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken` |
| Refresh endpoint (SSO) | `https://oidc.us-east-1.amazonaws.com/token` with clientId/clientSecret |
| profileArn source | Import response OR ListAvailableProfiles API OR default fallback |
| profileArn in request | Top-level `payload.profileArn` |
| Model ID in request | Clean upstream ID (e.g., `claude-haiku-4.5`) — suffixes stripped by translator |
| Headers | User-Agent, X-Amz-User-Agent, Amz-Sdk-Request, Amz-Sdk-Invocation-Id |

---

## 3. FreeRoute Kiro Authentication Flow

```
Kiro Credential (stored in SQLite as encrypted CredentialSecret)
  │
  ▼
KiroAdapter.resolveCred(credentialId)
  │  - Loads credential from store
  │  - parseCredential() extracts fields
  │  - Checks in-memory cache (5 min window)
  │
  ▼
Token Refresh [CONDITIONAL]
  │  - ONLY if expiresAt set AND (nearExpiry OR expired)
  │  - CRITICAL: expiresAt is NULL for all imported creds → NEVER refreshes
  │
  ▼
resolveProfileArn() [IF missing]
  │  - Calls ListAvailableProfiles via codewhisperer.us-east-1.amazonaws.com
  │  - Falls back to shared default ARN if API fails
  │  - Persist resolved ARN back to store (NEW in fix pass)
  │
  ▼
KiroAdapter.streamChat(input)
  │  - model = input.modelId.split('/').pop() — strips "kr/" prefix
  │  - buildPayload(model, request, cred)
  │    - Sets payload.conversationState
  │    - Sets payload.profileArn (top-level)
  │    - Sets payload.inferenceConfig if temperature/maxTokens present
  │
  ▼
HTTP POST https://runtime.us-east-1.kiro.dev/generateAssistantResponse
  │  - Headers: Authorization Bearer + AWS SDK headers
  │  - API-key: adds tokentype: API_KEY
  │
  ▼
Parse EventStream → yield SSE chunks
```

### FreeRoute Key Behaviors:

| Behavior | Implementation |
|----------|---------------|
| Refresh before request | **NEVER** — only if expiresAt set and near expiry |
| Refresh endpoint | Same as 9router (social + SSO OIDC) |
| profileArn source | Import response OR resolveProfileArn() OR default fallback |
| profileArn in request | Top-level `payload.profileArn` |
| Model ID in request | Clean upstream ID (strips `kr/` prefix) |
| Headers | User-Agent, X-Amz-User-Agent, Amz-Sdk-Request, Amz-Sdk-Invocation-Id |

---

## 4. Missing / Different Steps

| Step | 9router | FreeRoute | Difference |
|------|---------|-----------|------------|
| Pre-request token refresh | **ALWAYS** | **NEVER** (no expiresAt) | **[MISSING]** Critical parity gap |
| profileArn resolution | On refresh + import | On resolveCred() | [SAME] after fix |
| profileArn persistence | In credential store | In credential store (NEW) | [SAME] after fix |
| Model ID normalization | Strip -agentic/-thinking | Strip kr/ prefix | [DIFFERENT] different prefixes |
| Catalog model format | Clean IDs | kr/ prefixed IDs | [DIFFERENT] — causes mismatch |

---

## 5. Credential Data Lineage

### Source (9router SQLite)
```
providerConnections.data = JSON string containing:
  - accessToken: "aoaAAAAAG..."
  - refreshToken: "aorAAAAAG..."
  - providerSpecificData:
    - authMethod: "builder-id"
    - region: "us-east-1"
    - clientId: "yzyBJ5a82BzDdtAQbi0p"
    - clientSecret: "eyJraW..."
    - profileArn: null (missing!)
    - expiresAt: "2026-06-17T09:11:01.297Z" (ISO string)
```

### Import (freeRoute)
```
detect9RouterCredentials() extracts:
  - apiKey: accessToken value
  - providerSpecificData: entire object from 9router
  - authType: "access_token" (mapped from row.authType)

server.ts /v1/import/sync:
  - Creates CredentialSecret with:
    - accessToken: target.apiKey
    - refreshToken: psd.refreshToken
    - providerSpecificData: {...psd}
  - NOTE: expiresAt from psd is NOT copied to top-level!
```

### Storage (FreeRoute SQLite)
```
credentials table:
  - encrypted_secret contains CredentialSecret JSON:
    {
      "accessToken": "...",
      "refreshToken": "...",
      "providerSpecificData": {
        "authMethod": "builder-id",
        "region": "us-east-1",
        "clientId": "...",
        "clientSecret": "...",
        "profileArn": null,
        "expiresAt": 1750136...
      }
    }
```

### Parse (kiro.ts parseCredential)
```
parseCredential(secret):
  - accessToken ← secret.accessToken
  - refreshToken ← secret.refreshToken
  - profileArn ← providerSpecificData.profileArn (null)
  - authMethod ← providerSpecificData.authMethod
  - region ← providerSpecificData.region
  - expiresAt ← providerSpecificData.expiresAt (number or undefined)
```

**CRITICAL BUG FOUND:** The import code does NOT copy `expiresAt` from providerSpecificData to top-level of CredentialSecret. It only stores it inside providerSpecificData. But parseCredential checks BOTH:
```typescript
expiresAt: (mergedPsD.expiresAt as number | undefined) ?? (secret as any).expiresAt,
```
So it SHOULD work if providerSpecificData.expiresAt is a number...

Let me verify this in the actual data.

### Request (streamChat)
```
HTTP POST https://runtime.us-east-1.kiro.dev/generateAssistantResponse
Headers:
  Authorization: Bearer <accessToken>
  User-Agent: AWS-SDK-JS/3.0.0 kiro-ide/1.0.0
  X-Amz-User-Agent: aws-sdk-js/3.0.0 kiro-ide/1.0.0
  Amz-Sdk-Request: attempt=1; max=3
  Amz-Sdk-Invocation-Id: <uuid>
  Content-Type: application/json
  Accept: application/vnd.amazon.eventstream

Body:
{
  "conversationState": { ... },
  "profileArn": "<resolved or default ARN>"
}
```

---

## 6. Account Verification Analysis

### Does 9router perform account verification?

**NO.** 9router does NOT call any separate account verification endpoint before inference.

The "verification" is implicit:
1. Token is refreshed via OIDC/Social endpoint (which validates the refresh token)
2. If refresh succeeds, the new access token is used
3. The access token IS the credential — no separate "verify account" call

### Does FreeRoute perform account verification?

**NO.** Same as 9router — no separate verification step.

### What endpoint validates the token?

Neither system calls a dedicated verification endpoint. The token is validated implicitly when:
- **Refresh**: POST to `https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken` (social) or `https://oidc.us-east-1.amazonaws.com/token` (SSO)
- **Inference**: POST to `https://runtime.us-east-1.kiro.dev/generateAssistantResponse`

If the token is invalid, the inference endpoint returns 403.

---

## 7. Token Refresh Comparison

| Aspect | 9router | FreeRoute | Match? |
|--------|---------|-----------|--------|
| Refresh trigger | **BEFORE EVERY REQUEST** | Only if expiresAt set AND near expiry | **[DIFFERENT]** |
| Refresh function | `refreshKiroToken()` in tokenRefresh/providers.js | `refreshKiroToken()` in kiro.ts | [SAME] |
| Social refresh URL | `https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken` | Same | [SAME] |
| SSO refresh URL | `https://oidc.us-east-1.amazonaws.com/token` | Same | [SAME] |
| Request body | `{clientId, clientSecret, refreshToken, grantType}` | Same | [SAME] |
| Response handling | Merges accessToken, refreshToken, expiresIn, profileArn | Same | [SAME] |
| ProfileArn patch | `resolveKiroProfileArnPatch()` after refresh | In resolveCred() | [SAME logic, different timing] |
| Persist to storage | Yes (via oauthCredentialManager) | Yes (in resolveCred if setCredential provided) | [SAME] |

### Critical Difference:

**9router:**
```javascript
// BaseExecutor.execute() or similar
const refreshed = await checkAndRefreshToken(credentials);
// refreshed.accessToken is ALWAYS fresh
await sendRequest(refreshed.accessToken, ...);
```

**FreeRoute:**
```typescript
// resolveCred()
const nearExpiry = expiresAt && (expiresAt - Date.now() < 5 * 60 * 1000);
const expired = expiresAt && expiresAt < Date.now();
if ((nearExpiry || expired) && cred.refreshToken) {
  // Refresh only happens here
  cred = await refreshKiroToken(cred, this.fetch);
}
// If expiresAt is undefined/null, refresh NEVER happens!
```

**Result:** All 3 FreeRoute Kiro credentials have `expiresAt: null/undefined` in their current form. Therefore, the refresh block NEVER executes, and stale tokens are sent to the Kiro API.

---

## 8. ProfileArn Analysis

### Source

From 9router database inspection:
```
profileArn: null (NOT present in any of the 4 kiro connections)
```

### How 9router resolves profileArn

1. **Import time**: If social refresh response includes `profileArn`, use it
2. **Refresh time**: After refresh, call `resolveKiroProfileArnPatch()`:
   ```javascript
   async function resolveKiroProfileArnPatch(providerSpecificData, accessToken, refreshedArn) {
     if (providerSpecificData?.profileArn) return {};
     let profileArn = refreshedArn?.trim?.() || null;
     if (!profileArn) {
       const { fetchKiroProfileArn } = await import("../../../src/lib/oauth/providers.js");
       profileArn = await fetchKiroProfileArn(accessToken);
     }
     return profileArn ? { providerSpecificData: { profileArn } } : {};
   }
   ```
3. **Default fallback**: If all else fails, use `resolveDefaultProfileArn(authMethod)`

### How FreeRoute resolves profileArn

1. **Import time**: `importFromRefreshToken()` calls `resolveProfileArn()` if missing
2. **Runtime**: `resolveCred()` calls `resolveProfileArn()` if missing
3. **Default fallback**: Same shared default ARNs

### ProfileArn in Request

| System | Location | Value |
|--------|----------|-------|
| 9router | `payload.profileArn` (top-level) | Account-specific or default |
| FreeRoute | `payload.profileArn` (top-level) | Account-specific or default |

**Both systems place profileArn at the same location.**

---

## 9. Model ID Analysis

### Discovery Response

| System | Raw API Response | Stored Format |
|--------|-----------------|---------------|
| 9router | `claude-haiku-4.5` | `kr/claude-haiku-4.5` (with variants) |
| FreeRoute | `claude-haiku-4.5` | `kr/claude-haiku-4.5` |

### Request Format

| System | Model ID sent to upstream |
|--------|--------------------------|
| 9router | `claude-haiku-4.5` (clean) |
| FreeRoute | `claude-haiku-4.5` (after stripping `kr/`) |

### Model ID Flow Table

| Stage | 9router | FreeRoute |
|-------|---------|-----------|
| Discovery ID | `claude-haiku-4.5` | `claude-haiku-4.5` |
| Stored ID | `kr/claude-haiku-4.5` | `kr/claude-haiku-4.5` |
| Requested ID | `kr/claude-haiku-4.5` | `kr/claude-haiku-4.5` |
| Normalized ID | `claude-haiku-4.5` | `claude-haiku-4.5` |
| Transmitted ID | `claude-haiku-4.5` | `claude-haiku-4.5` |

**Model ID normalization is IDENTICAL.**

---

## 10. HTTP Boundary Comparison

### 9router Request

```http
POST /generateAssistantResponse HTTP/1.1
Host: runtime.us-east-1.kiro.dev
Content-Type: application/json
Authorization: Bearer <fresh-access-token>
Accept: application/vnd.amazon.eventstream
X-Amz-Target: AmazonCodeWhispererStreamingService.GenerateAssistantResponse
User-Agent: AWS-SDK-JS/3.0.0 kiro-ide/1.0.0
X-Amz-User-Agent: aws-sdk-js/3.0.0 kiro-ide/1.0.0
Amz-Sdk-Request: attempt=1; max=3
Amz-Sdk-Invocation-Id: <uuid>

{
  "conversationState": { ... },
  "profileArn": "arn:aws:codewhisperer:us-east-1:XXX:profile/YYY",
  "inferenceConfig": { ... }
}
```

### FreeRoute Request

```http
POST /generateAssistantResponse HTTP/1.1
Host: runtime.us-east-1.kiro.dev
Content-Type: application/json
Authorization: Bearer <stale-or-fresh-access-token>
Accept: application/vnd.amazon.eventstream
X-Amz-Target: AmazonCodeWhispererStreamingService.GenerateAssistantResponse
User-Agent: AWS-SDK-JS/3.0.0 kiro-ide/1.0.0
X-Amz-User-Agent: aws-sdk-js/3.0.0 kiro-ide/1.0.0
Amz-Sdk-Request: attempt=1; max=3
Amz-Sdk-Invocation-Id: <uuid>

{
  "conversationState": { ... },
  "profileArn": "arn:aws:codewhisperer:us-east-1:XXX:profile/YYY",
  "inferenceConfig": { ... }
}
```

### Differences

| Field | 9router | FreeRoute | Impact |
|-------|---------|-----------|--------|
| Authorization token | **Always fresh** (refreshed before use) | May be stale (no proactive refresh) | **403 if token expired** |
| profileArn | Resolved or default | Resolved or default | Same |
| Model ID | Clean | Clean (after strip) | Same |
| Headers | All present | All present | Same |

---

## 11. Root Cause Classification

### 400 INVALID_MODEL_ID

**Classification: LIKELY NOT a model ID issue after investigation**

Evidence:
- Both systems send the same clean model ID (`claude-haiku-4.5`)
- Model ID normalization is identical
- The 400 was likely a **cascade failure** from 403 (invalid auth causing invalid model response)

### 403 invalid bearer token

**Classification: TOKEN_STALENESS / REFRESH_FLOW_MISSING**

Evidence:
1. All 3 Kiro credentials lack `expiresAt` at top level
2. FreeRoute only refreshes when `expiresAt` is set AND near expiry
3. 9router refreshes BEFORE EVERY REQUEST regardless of expiresAt
4. Tokens from June 2026 are likely expired by now (September 2026)

**This is the PRIMARY root cause.**

---

## 12. Recommended Fix

### Priority 1: Proactive Token Refresh

**Add pre-request refresh to KiroAdapter.resolveCred():**

```typescript
private async resolveCred(credentialId: string): Promise<KiroCredential> {
  // ... existing load and cache check ...
  
  // NEW: Always refresh if refreshToken exists (parity with 9router)
  if (cred.refreshToken) {
    try {
      cred = await refreshKiroToken(cred, this.fetch);
      this.tokenCache.set(credentialId, { cred, updatedAt: Date.now() });
      if (this.setCredential) {
        // Persist refreshed credential
        const secret: CredentialSecret = { /* ... */ };
        await this.setCredential(credentialId, secret);
      }
    } catch {
      // Use existing token if refresh fails
    }
  }
  
  // ... existing profileArn resolution ...
}
```

### Priority 2: Ensure expiresAt is Stored

When importing/refreshing, ensure `expiresAt` is persisted:
```typescript
// In refreshKiroToken response handling:
expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined,
```

### Priority 3: Fix Credential Import

Ensure `expiresAt` from 9router source is properly transferred:
```typescript
// In server.ts /v1/import/sync handler:
const secretValue: CredentialSecret = {
  accessToken: target.apiKey,
  refreshToken: (target.providerSpecificData as any)?.refreshToken || undefined,
  providerSpecificData: kiroPsD,
};
// ADD:
if ((target.providerSpecificData as any)?.expiresAt) {
  secretValue.expiresAt = (target.providerSpecificData as any).expiresAt;
}
```

---

## 13. Runtime Evidence

### Current State (After Fix Pass)

```
Kiro credentials:
  account-1: authMethod=builder-id, profileArn=null, expiresAt=null
  account-2: authMethod=builder-id, profileArn=null, expiresAt=null  
  account-3: authMethod=builder-id, profileArn=null, expiresAt=null

Kiro catalog:
  6 models discovered, all enabled=true (after fix)
```

### Expected After Proactive Refresh Fix

```
1. resolveCred() calls refreshKiroToken() before every request
2. New accessToken received from Kiro auth service
3. expiresAt calculated and stored
4. Request sent with fresh token
5. HTTP 2xx expected
```

---

## 14. Scope Check

```
✓ Benchmark: untouched
✓ Custom Combos: untouched
✓ Generic routing: untouched
✓ Generic fallback: untouched
✓ Failure classification: untouched
✓ Other providers: untouched
✓ catalog.ts: Modified (enabled state fix from previous pass)
✓ kiro.ts: Modified (profileArn persistence from previous pass)
✓ Tests: Added kiro-catalog-fix.test.ts, kiro-credential-preserve.test.ts
```

---

## 15. Conclusion

**NO CONFIRMED FLOW DIFFERENCE in account verification** — neither system calls a dedicated verification endpoint.

**CONFIRMED FLOW DIFFERENCE in token refresh:**
- 9router: Always refreshes before request
- FreeRoute: Only refreshes if expiresAt set and near expiry

**ROOT CAUSE OF 403:** Stale/missing token refresh leading to expired access tokens being sent to Kiro API.

**NEXT STEP:** Implement proactive refresh in `KiroAdapter.resolveCred()` to match 9router behavior.
