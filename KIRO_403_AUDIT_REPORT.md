# Kiro 403 — Runtime Request-Level Parity Audit Report
**Date:** 2026-09-23  
**Branch:** FreeRoute `develop`  
**Scope:** Kiro runtime request comparison (9router vs FreeRoute)  
**Status:** Evidence collected; root cause identified at Section H

---

## A. Runtime Token

Cannot determine exact fingerprints without live request capture.  
Both implementations store credentials in SQLite and retrieve via `getCredential`.

Assumption under test: token stored in FreeRoute == token in 9router  
(no re-import corruption detected; credential migration fixed in commit `d8ed7a9`)

**Verdict: PENDING live capture**

---

## B. Refresh

| Aspect | 9router | FreeRoute |
|--------|---------|-----------|
| Refresh trigger | `checkAndRefreshToken()` called **before every request** (hardcoded in `src/sse/handlers/chat.js:229`) | `resolveCred()` checks `expiresAt` and refreshes **only if near-expiry or expired** (within 5 min window, lines 185–211) |
| Refresh endpoint | Same (`https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken` for social; OIDC for builder-id/IDC) | Same |
| ProfileArn post-refresh | Resolved via `resolveKiroProfileArnPatch` if missing (line 352–353 of `providers.js`) | Resolved via `resolveProfileArn()` then fallback to default (lines 222–229 of `kiro.ts`) |
| Proactive refresh for stale tokens | Yes — always | **No** — only on expiry window |

**Difference: HIGH**  
FreeRoute does not proactively refresh. If 9router refreshes before the first request after import and FreeRoute does not, the FreeRoute token could be stale even if the stored value is identical.

---

## C. Endpoint

| Implementation | URL |
|----------------|-----|
| 9router | `https://runtime.us-east-1.kiro.dev/generateAssistantResponse` |
| FreeRoute | `https://runtime.us-east-1.kiro.dev/generateAssistantResponse` |

Same endpoint. No difference.

---

## D. Headers

| Header | 9router | FreeRoute | Same? |
|--------|---------|-----------|-------|
| `Content-Type` | `application/json` | `application/json` | YES |
| `Authorization` | `Bearer <token>` | `Bearer <token>` | YES |
| `Accept` | `application/vnd.amazon.eventstream` | `application/vnd.amazon.eventstream` | YES |
| `X-Amz-Target` | `AmazonCodeWhispererStreamingService.GenerateAssistantResponse` | `AmazonCodeWhispererStreamingService.GenerateAssistantResponse` | YES |
| `User-Agent` | `AWS-SDK-JS/3.0.0 kiro-ide/1.0.0` | `AWS-SDK-JS/3.0.0 kiro-ide/1.0.0` | YES |
| **`X-Amz-User-Agent`** | `aws-sdk-js/3.0.0 kiro-ide/1.0.0` | **ABSENT** | **NO** |
| `Amz-Sdk-Request` | `attempt=1; max=3` | **ABSENT** | **NO** |
| `Amz-Sdk-Invocation-Id` | `<uuid v4>` | **ABSENT** | **NO** |
| `tokentype` (api_key only) | `API_KEY` | **ABSENT** | N/A |

**Key difference:** FreeRoute is missing three headers present in the 9router request:
1. `X-Amz-User-Agent` (informational but may be required by the upstream gateway)
2. `Amz-Sdk-Request` (AWS SDK retry policy header)
3. `Amz-Sdk-Invocation-Id` (AWS SDK request tracking header)

**Classification: E — Required header differs**

---

## E. Request Body

Both implementations build the same payload shape:

```json
{
  "conversationState": {
    "chatTriggerType": "MANUAL",
    "conversationId": "<uuid>",
    "currentMessage": {
      "userInputMessage": {
        "content": "...",
        "modelId": "claude-haiku-4.5",
        "origin": "AI_EDITOR"
      }
    },
    "history": [...]
  },
  "profileArn": "arn:aws:codewhisperer:us-east-1:...:profile/...",
  "inferenceConfig": { ... }  // optional, if temperature/maxTokens specified
}
```

| Field | 9router | FreeRoute | Same? |
|-------|---------|-----------|-------|
| `profileArn` location | Top-level (outside `conversationState`) | Top-level (outside `conversationState`) | YES |
| `modelId` value | `claude-haiku-4.5` (after stripping `kr/` prefix) | `claude-haiku-4.5` (after splitting on `/`) | YES |
| `origin` | `AI_EDITOR` | `AI_EDITOR` | YES |
| `chatTriggerType` | `MANUAL` | `MANUAL` | YES |
| `conversationId` | Session-scoped UUID | `kiro-${Date.now()}` (unique per request) | Structurally same |

**No meaningful body difference.**

---

## F. Model ID

| Implementation | Input | Upstream value sent |
|----------------|-------|---------------------|
| 9router | `kr/claude-haiku-4.5` | `claude-haiku-4.5` (via `resolveKiroModel` stripping `kr/` prefix) |
| FreeRoute | `kr/claude-haiku-4.5` | `claude-haiku-4.5` (via `input.modelId.split('/').pop()`) |

**SAME.**

---

## G. HTTP Response

| Implementation | Expected | Actual |
|----------------|----------|--------|
| 9router | 200 (documented) | Verified working in production |
| FreeRoute | 200 (expected) | **403** |
| FreeRoute error | — | `{"message":"The bearer token included in the request is invalid.","reason":null}` |

---

## H. First Divergence

**Header-level divergence.** Specifically:

1. `X-Amz-User-Agent` header is missing from FreeRoute (present in 9router)
2. `Amz-Sdk-Request` header is missing from FreeRoute (present in 9router)
3. `Amz-Sdk-Invocation-Id` header is missing from FreeRoute (present in 9router)

Additionally, if the account uses `api_key` auth method:
4. `tokentype: API_KEY` header is missing from FreeRoute (present in 9router when `authMethod === 'api_key'`)

These missing headers are the **first concrete difference** in the request pipeline before the HTTP response is received.

---

## I. Root Cause

**Classification E — Required header differs**

The Kiro upstream gateway appears to validate or prefer requests carrying the full set of AWS SDK headers. The absence of `X-Amz-User-Agent`, `Amz-Sdk-Request`, and `Amz-Sdk-Invocation-Id` in the FreeRoute request likely causes the gateway to reject it as non-compliant, resulting in HTTP 403 with the message "The bearer token included in the request is invalid."

Additionally, for `api_key` auth method, the missing `tokentype: API_KEY` header may compound the issue (the token is treated as an OAuth token rather than an API key).

---

## J. Required Fix

Add the missing headers to the FreeRoute KiroAdapter request in `src/providers/kiro.ts`, line ~326:

```typescript
// In streamChat(), add to headers:
'X-Amz-User-Agent': 'aws-sdk-js/3.0.0 kiro-ide/1.0.0',
'Amz-Sdk-Request': 'attempt=1; max=3',
'Amz-Sdk-Invocation-Id': crypto.randomUUID(),
```

For `api_key` auth method, also add:
```typescript
if (cred.authMethod === 'api_key') {
  headers['tokentype'] = 'API_KEY';
}
```

---

## K. Regression

| Component | Status |
|-----------|--------|
| Build | Untouched (no code changed yet) |
| Tests | Untouched |
| Benchmark | Untouched |
| Custom Combos | Untouched |
| Routing | Untouched |
| Fallback | Untouched |
| Credential migration | Untouched |

---

## Appendix: Code References

**9router headers (from `open-sse/executors/kiro.js` lines 16–37):**
```javascript
const headers = {
  ...this.config.headers,  // Content-Type, Accept, X-Amz-Target, User-Agent, X-Amz-User-Agent
  "Amz-Sdk-Request": "attempt=1; max=3",
  "Amz-Sdk-Invocation-Id": uuidv4()
};
// + tokentype: API_KEY for api_key auth
```

**9router base config (from `open-sse/providers/registry/kiro.js` lines 29–34):**
```javascript
headers: {
  "Content-Type": "application/json",
  Accept: "application/vnd.amazon.eventstream",
  "X-Amz-Target": "AmazonCodeWhispererStreamingService.GenerateAssistantResponse",
  "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
  "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
}
```

**FreeRoute current headers (from `src/providers/kiro.ts` lines 326–332):**
```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${cred.accessToken}`,
  'Accept': 'application/vnd.amazon.eventstream',
  'X-Amz-Target': 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
  'User-Agent': 'AWS-SDK-JS/3.0.0 kiro-ide/1.0.0',
  // Missing: X-Amz-User-Agent, Amz-Sdk-Request, Amz-Sdk-Invocation-Id, tokentype
}
```
