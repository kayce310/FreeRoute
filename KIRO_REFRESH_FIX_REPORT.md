# Kiro Refresh Fix Report

## 1. Root Cause

Three issues prevented Kiro from working:

1. **No proactive refresh**: FreeRoute only refreshed when `expiresAt` was set AND near expiry. All 3 credentials lacked usable `expiresAt`, so refresh never triggered. 9router always refreshes before every request.

2. **`refreshToken` lost during import**: `local-detect.ts` extracted `accessToken` from 9router JSON but stored `refreshToken` at the wrong level. The 9router data has `refreshToken` at top level, but `server.ts` reads it from `providerSpecificData` where it doesn't exist.

3. **`authMethod` lost**: Same import path issue — `authMethod` was in `providerSpecificData` but the migration script stored it at top level where `parseCredential` couldn't find it.

## 2. Files Changed

| File | Change |
|------|--------|
| `src/providers/kiro.ts` | Proactive refresh: always refresh if `refreshToken` exists |
| `src/importers/local-detect.ts` | Preserve `refreshToken` and `expiresAt` from 9router source |
| `scripts/migrate-kiro-credentials.cjs` | Fix storage format to match `CredentialSecret` schema |
| `test/kiro-catalog-fix.test.ts` | Catalog refresh tests |
| `test/kiro-credential-preserve.test.ts` | Credential parsing tests |
| `test/kiro-refresh-parity.test.ts` | Proactive refresh tests |

## 3. Before → After

### Before
```
Credential loaded → no expiresAt → no refresh → stale token → 403
```

### After
```
Credential loaded → refreshToken exists → refresh called → fresh token → HTTP 2xx or 402 (quota)
```

## 4. Tests

```
ℹ tests 177
ℹ pass 177
ℹ fail 0
```

## 5. Runtime Evidence

```
=== Account-3 Credential ===
accessToken: aoaAAAAAGq0kFgavLB56...
refreshToken: aorAAAAAGsPvBY4XhqTS...
authMethod: builder-id
region: us-east-1
profileArn: NONE

=== Refreshing ===
Status: 200
New accessToken: aoaAAAAAGq0kGoMC_TBR...
expiresIn: 3600

=== Runtime Request ===
Status: 402
Response: {"message":"You have reached the limit.","reason":"MONTHLY_REQUEST_COUNT"}
```

**Key result**: The token refresh succeeds (HTTP 200), and the runtime request returns **402 (quota limit)**, NOT 403 (invalid token). This proves the authentication fix works.

## 6. 400/403 Classification

- **403**: Fixed. Caused by stale tokens that were never refreshed. Now resolved.
- **400**: Likely a cascade from 403. Should be re-evaluated after quota reset.
- **402**: NEW — this is a legitimate quota limit, not an auth error.

## 7. Scope Check

```
✓ Benchmark: untouched
✓ Custom Combos: untouched
✓ Generic routing: untouched
✓ Generic fallback: untouched
✓ Failure classification: untouched
✓ Other providers: untouched
✓ catalog.ts: Modified (enabled state fix from previous pass)
✓ kiro.ts: Modified (proactive refresh + profileArn persistence)
✓ local-detect.ts: Modified (refreshToken/expiresAt preservation)
✓ migrate-kiro-credentials.cjs: Modified (storage format fix)
```