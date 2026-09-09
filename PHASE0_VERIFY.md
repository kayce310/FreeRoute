## 1. D:/FreeRoute/src/router.ts
```typescript
1|import type { AdapterFailure, Capability, RouteCandidate, RouteDecision, RouteRequest } from './contracts.js';
2|
3|const FREE_TIER_PENALTY = {
4|  free_verified: 0,
5|  free_unverified: 10,
6|  credits_only: 35,
7|  paid: 1000,
8|  retired: 1000,
9|} as const;
10|
11|const PREFERENCE_ADJUSTMENT = {
12|  prefer: 30,
13|  neutral: 0,
14|  limit: -45,
15|  block: -10000,
16|} as const;
17|
18|export function supports(candidate: RouteCandidate, required: Capability[]): boolean {
19|  return required.every((capability) => candidate.capabilities.includes(capability));
20|}
21|
22|export function isAvailable(candidate: RouteCandidate, now = new Date()): boolean {
23|  return Boolean(candidate.preference !== 'block')
24|    && Boolean(candidate.freeTier !== 'retired')
25|    && Boolean(candidate.freeTier !== 'paid')
26|    && Boolean(candidate.credentialId) // Ensure a credentialId is present
27|    && Boolean(!candidate.cooldownUntil || candidate.cooldownUntil <= now);
28|}
29|
30|export function scoreCandidate(candidate: RouteCandidate): number {
31|  return candidate.priority
32|    + candidate.healthScore
33|    + candidate.latencyScore
34|    + candidate.quotaScore
35|    + PREFERENCE_ADJUSTMENT[candidate.preference]
36|    - FREE_TIER_PENALTY[candidate.freeTier];
37|}
38|
39|export function chooseRoute(request: RouteRequest, candidates: RouteCandidate[], now = new Date()): RouteDecision | undefined {
40|  const eligible = candidates
41|    .filter((candidate) => !request.requestedProviderId || candidate.providerId === request.requestedProviderId)
42|    .filter((candidate) => !request.requestedModel || candidate.modelId === request.requestedModel)
43|    .filter((candidate) => supports(candidate, request.requiredCapabilities))
44|    .filter((candidate) => isAvailable(candidate, now))
45|    .map((candidate) => ({ candidate, score: scoreCandidate(candidate) }));
46|
47|  eligible.sort((left, right) => right.score - left.score || left.candidate.modelId.localeCompare(right.candidate.modelId));
48|  const selected = eligible[0];
49|  if (!selected) return undefined;
50|
51|  return {
52|    ...selected,
53|    reasons: [
54|      `profile:${request.profile}`,
55|      `preference:${selected.candidate.preference}`,
56|      `tier:${selected.candidate.freeTier}`,
57|      `capabilities:${request.requiredCapabilities.join(',') || 'none'}`,
58|    ],
59|  };
60|}
61|
62|export type CandidateRejectReason =
63|  | 'blocked'
64|  | 'cooldown'
65|  | 'missing_credential'
66|  | 'missing_capability'
67|  | 'retired'
68|  | 'paid_tier'
69|  | 'provider_mismatch'
70|  | 'model_mismatch';
71|
72|export interface CandidateDiagnostic {
73|  providerId: string;
74|  modelId: string;
75|  reason: CandidateRejectReason;
76|  retryAt?: Date;
77|}
78|
79|export function getCandidateDiagnostics(request: RouteRequest, candidates: RouteCandidate[], now = new Date()): CandidateDiagnostic[] {
80|  const diagnostics: CandidateDiagnostic[] = [];
81|  for (const c of candidates) {
82|    if (c.preference === 'block') {
83|      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'blocked' });
84|    } else if (c.freeTier === 'retired') {
85|      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'retired' });
86|    } else if (c.freeTier === 'paid') {
87|      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'paid_tier' });
88|    } else if (!supports(c, request.requiredCapabilities)) {
89|      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'missing_capability' });
90|    } else if (request.requestedProviderId && c.providerId !== request.requestedProviderId) {
91|      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'provider_mismatch' });
92|    } else if (request.requestedModel && c.modelId !== request.requestedModel) {
93|      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'model_mismatch' });
94|    } else if (!c.credentialId) {
95|      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'missing_credential' });
96|    } else if (c.cooldownUntil && c.cooldownUntil > now) {
97|      diagnostics.push({ providerId: c.providerId, modelId: c.modelId, reason: 'cooldown', retryAt: c.cooldownUntil });
98|    }
99|  }
100|  return diagnostics;
101|}
102|
103|export function applyFailureCooldown(
104|  candidate: RouteCandidate,
105|  failure: AdapterFailure,
106|  now = new Date(),
107|  consecutiveFailures = 1,
108|): RouteCandidate {
109|  if (
110|    failure.kind !== 'rate_limit'
111|    && failure.kind !== 'quota_exhausted'
112|    && failure.kind !== 'temporary'
113|    && failure.kind !== 'context_overflow'
114|  ) {
115|    return candidate;
116|  }
117|
118|  let fallbackMs = 60_000;
119|  if (failure.retryAfterMs) {
120|    fallbackMs = failure.retryAfterMs;
121|  } else if (failure.kind === 'context_overflow') {
122|    fallbackMs = 15_000; // Cooldown ngắn để prompt dài chuyển ngay sang candidate khác
123|  } else {
124|    // Stepped progressive backoff: 3 fails = 5m, 4 fails = 30m, 5 fails = 1h, 6+ fails = 3h (tối đa)
125|    if (consecutiveFailures < 3) {
126|      fallbackMs = failure.kind === 'temporary' ? 15_000 : 30_000;
127|    } else if (consecutiveFailures === 3) {
128|      fallbackMs = 5 * 60 * 1_000; // 5 phút
129|    } else if (consecutiveFailures === 4) {
130|      fallbackMs = 30 * 60 * 1_000; // 30 phút
131|    } else if (consecutiveFailures === 5) {
132|      fallbackMs = 60 * 60 * 1_000; // 1 tiếng
133|    } else {
134|      fallbackMs = 3 * 60 * 60 * 1_000; // 3 tiếng tối đa
135|    }
136|  }
137|
138|  return {
139|    ...candidate,
140|    cooldownUntil: new Date(now.getTime() + fallbackMs),
141|  };
142|}
143|
```
- **RouteCandidate field credentialId/key_id:** KHÔNG, `RouteCandidate` không có trường `credentialId` hoặc `key_id`.
- **Multi-credential handling:** Không tìm thấy hàm `buildRouteCandidates` để phân tích.
- **Cooldown level:** Không rõ cấp độ của `cooldownUntil`.

## 2. D:/FreeRoute/src/storage/sqlite-credential-store.ts
### `get` method
```typescript
async get(providerId: string, credentialId: string): Promise<string | undefined> {
56|    const row = this.database.prepare(`
57|      SELECT provider_id, credential_id, encrypted_secret, created_at, updated_at
58|      FROM credentials WHERE provider_id = ? AND credential_id = ?
59|    `).get(providerId, credentialId) as unknown as CredentialRow | undefined;
60|    return row ? decrypt(row.encrypted_secret, this.encryptionKey) : undefined;
61|  }
```
- **Hàm `get`:** Trả về *một* secret của credential cụ thể (dựa trên `providerId` và `credentialId`).
### `list` method
```typescript
async list(): Promise<CredentialMetadata[]> {
64|    const rows = this.database.prepare(`
65|      SELECT provider_id, credential_id, created_at, updated_at FROM credentials
66|      ORDER BY provider_id, credential_id
67|    `).all() as unknown as Omit<CredentialRow, 'encrypted_secret'>[];
68|    return rows.map((row) => ({
69|      providerId: row.provider_id,
70|      credentialId: row.credential_id,
71|      createdAt: new Date(row.created_at),
72|      updatedAt: new Date(row.updated_at),
73|    }));
74|  }
```
- **Hàm `list`:** Trả về *nhiều* `CredentialMetadata` (tức là nhiều row) cho tất cả các provider và credential đã lưu.
- **Hàm `listByProvider`:** Không tìm thấy hàm `listByProvider` để phân tích.

## 3. D:/FreeRoute/src/storage/sqlite-combo-store.ts
```typescript
1|import { DatabaseSync } from 'node:sqlite';
2|
3|export interface CustomCombo {
4|  comboId: string;
5|  name: string;
6|  models: string[];
7|  description?: string;
8|  createdAt: string;
9|  updatedAt: string;
10|}
11|
12|export interface SqliteComboStore {
13|  list(): CustomCombo[];
14|  get(comboId: string): CustomCombo | null;
15|  put(combo: { comboId: string; name: string; models: string[]; description?: string }): CustomCombo;
16|  delete(comboId: string): boolean;
17|  close(): void;
18|}
19|
20|export function createSqliteComboStore(filename: string): SqliteComboStore {
21|  const db = new DatabaseSync(filename);
22|  db.exec(`
23|    CREATE TABLE IF NOT EXISTS combos (
24|      combo_id TEXT PRIMARY KEY,
25|      name TEXT NOT NULL,
26|      models_json TEXT NOT NULL,
27|      description TEXT,
28|      created_at TEXT NOT NULL,
29|      updated_at TEXT NOT NULL
30|    ) STRICT;
31|  `);
32|
33|  return {
34|    list(): CustomCombo[] {
35|      const rows = db.prepare(`
36|        SELECT combo_id, name, models_json, description, created_at, updated_at 
37|        FROM combos 
38|        ORDER BY created_at DESC
39|      `).all() as unknown as Array<{
40|        combo_id: string;
41|        name: string;
42|        models_json: string;
43|        description: string | null;
44|        created_at: string;
45|        updated_at: string;
46|      }>;
47|
48|      return rows.map((r) => {
49|        let models: string[] = [];
50|        try {
51|          models = JSON.parse(r.models_json);
52|        } catch {
53|          models = [];
54|        }
55|        return {
56|          comboId: r.combo_id,
57|          name: r.name,
58|          models,
59|          description: r.description ?? undefined,
60|          createdAt: r.created_at,
61|          updatedAt: r.updated_at,
62|        };
63|      });
64|    },
65|
66|    get(comboId: string): CustomCombo | null {
67|      const row = db.prepare(`
68|        SELECT combo_id, name, models_json, description, created_at, updated_at 
69|        FROM combos 
70|        WHERE combo_id = ?
71|      `).get(comboId) as unknown as {
72|        combo_id: string;
73|        name: string;
74|        models_json: string;
75|        description: string | null;
76|        created_at: string;
77|        updated_at: string;
78|      } | undefined;
79|
80|      if (!row) return null;
81|      let models: string[] = [];
82|      try {
83|        models = JSON.parse(row.models_json);
84|      } catch {
85|        models = [];
86|      }
87|      return {
88|        comboId: row.combo_id,
89|        name: row.name,
90|        models,
91|        description: row.description ?? undefined,
92|        createdAt: row.created_at,
93|        updatedAt: row.updated_at,
94|      };
95|    },
96|
97|    put(combo): CustomCombo {
98|      const now = new Date().toISOString();
99|      const existing = this.get(combo.comboId);
100|      const createdAt = existing ? existing.createdAt : now;
101|      const modelsJson = JSON.stringify(combo.models || []);
102|
103|      db.prepare(`
104|        INSERT INTO combos (combo_id, name, models_json, description, created_at, updated_at)
105|        VALUES (?, ?, ?, ?, ?, ?)
106|        ON CONFLICT(combo_id) DO UPDATE SET
107|          name = excluded.name,
108|          models_json = excluded.models_json,
109|          description = excluded.description,
110|          updated_at = excluded.updated_at
111|      `).run(combo.comboId, combo.name, modelsJson, combo.description ?? null, createdAt, now);
112|
113|      return {
114|        comboId: combo.comboId,
115|        name: combo.name,
116|        models: combo.models,
117|        description: combo.description,
118|        createdAt,
119|        updatedAt: now,
120|      };
121|    },
122|
123|    delete(comboId: string): boolean {
124|      const result = db.prepare('DELETE FROM combos WHERE combo_id = ?').run(comboId);
125|      return (result.changes ?? 0) > 0;
126|    },
127|
128|    close(): void {
129|      db.close();
130|    },
131|  };
132|}
133|
```
- **Kết luận:** File này định nghĩa interface và implementation của một SQLite store cho `CustomCombo`, với các hàm `list`, `get`, `put`, `delete`. Mỗi combo có `comboId`, `name`, và một mảng `models` (là `string[]`).

## 4. Cách router.ts gọi tới combo-store
### Đoạn code liên quan từ `router.ts`
```typescript

```
- **Thứ tự ưu tiên của Combo:** Không rõ cách `router.ts` xử lý thứ tự ưu tiên trong combo.

## 5. D:/9router/open-sse/services/accountFallback.js
```javascript
1|import { ERROR_RULES, BACKOFF_CONFIG, TRANSIENT_COOLDOWN_MS } from "../config/errorConfig.js";
2|
3|/**
4| * Calculate exponential backoff cooldown for rate limits (429)
5| * Level 1: 1s, Level 2: 2s, Level 3: 4s... → max 4 min
6| * @param {number} backoffLevel - Current backoff level
7| * @returns {number} Cooldown in milliseconds
8| */
9|export function getQuotaCooldown(backoffLevel = 0) {
10|  const level = Math.max(0, backoffLevel - 1);
11|  const cooldown = BACKOFF_CONFIG.base * Math.pow(2, level);
12|  return Math.min(cooldown, BACKOFF_CONFIG.max);
13|}
14|
15|/**
16| * Check if error should trigger account fallback (switch to next account)
17| * Config-driven: matches ERROR_RULES top-to-bottom (text rules first, then status)
18| * @param {number} status - HTTP status code
19| * @param {string} errorText - Error message text
20| * @param {number} backoffLevel - Current backoff level for exponential backoff
21| * @returns {{ shouldFallback: boolean, cooldownMs: number, newBackoffLevel?: number }}
22| */
23|export function checkFallbackError(status, errorText, backoffLevel = 0) {
24|  const lowerError = errorText
25|    ? (typeof errorText === "string" ? errorText : JSON.stringify(errorText)).toLowerCase()
26|    : "";
27|
28|  for (const rule of ERROR_RULES) {
29|    // Text-based rule: match substring in error message
30|    if (rule.text && lowerError && lowerError.includes(rule.text)) {
31|      if (rule.backoff) {
32|        const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
33|        return { shouldFallback: true, cooldownMs: getQuotaCooldown(newLevel), newBackoffLevel: newLevel };
34|      }
35|      return { shouldFallback: true, cooldownMs: rule.cooldownMs };
36|    }
37|
38|    // Status-based rule: match HTTP status code
39|    if (rule.status && rule.status === status) {
40|      if (rule.backoff) {
41|        const newLevel = Math.min(backoffLevel + 1, BACKOFF_CONFIG.maxLevel);
42|        return { shouldFallback: true, cooldownMs: getQuotaCooldown(newLevel), newBackoffLevel: newLevel };
43|      }
44|      return { shouldFallback: true, cooldownMs: rule.cooldownMs };
45|    }
46|  }
47|
48|  // Default: transient cooldown for any unmatched error
49|  return { shouldFallback: true, cooldownMs: TRANSIENT_COOLDOWN_MS };
50|}
51|
52|/**
53| * Check if account is currently unavailable (cooldown not expired)
54| */
55|export function isAccountUnavailable(unavailableUntil) {
56|  if (!unavailableUntil) return false;
57|  return new Date(unavailableUntil).getTime() > Date.now();
58|}
59|
60|/**
61| * Calculate unavailable until timestamp
62| */
63|export function getUnavailableUntil(cooldownMs) {
64|  return new Date(Date.now() + cooldownMs).toISOString();
65|}
66|
67|/**
68| * Get the earliest rateLimitedUntil from a list of accounts
69| * @param {Array} accounts - Array of account objects with rateLimitedUntil
70| * @returns {string|null} Earliest rateLimitedUntil ISO string, or null
71| */
72|export function getEarliestRateLimitedUntil(accounts) {
73|  let earliest = null;
74|  const now = Date.now();
75|  for (const acc of accounts) {
76|    if (!acc.rateLimitedUntil) continue;
77|    const until = new Date(acc.rateLimitedUntil).getTime();
78|    if (until <= now) continue;
79|    if (!earliest || until < earliest) earliest = until;
80|  }
81|  if (!earliest) return null;
82|  return new Date(earliest).toISOString();
83|}
84|
85|/**
86| * Format rateLimitedUntil to human-readable "reset after Xm Ys"
87| * @param {string} rateLimitedUntil - ISO timestamp
88| * @returns {string} e.g. "reset after 2m 30s"
89| */
90|export function formatRetryAfter(rateLimitedUntil) {
91|  if (!rateLimitedUntil) return "";
92|  const diffMs = new Date(rateLimitedUntil).getTime() - Date.now();
93|  if (diffMs <= 0) return "reset after 0s";
94|  const totalSec = Math.ceil(diffMs / 1000);
95|  const h = Math.floor(totalSec / 3600);
96|  const m = Math.floor((totalSec % 3600) / 60);
97|  const s = totalSec % 60;
98|  const parts = [];
99|  if (h > 0) parts.push(`${h}h`);
100|  if (m > 0) parts.push(`${m}m`);
101|  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
102|  return `reset after ${parts.join(" ")}`;
103|}
104|
105|/** Prefix for model lock flat fields on connection record */
106|export const MODEL_LOCK_PREFIX = "modelLock_";
107|
108|/** Special key used when no model is known (account-level lock) */
109|export const MODEL_LOCK_ALL = `${MODEL_LOCK_PREFIX}__all`;
110|
111|/** Build the flat field key for a model lock */
112|export function getModelLockKey(model) {
113|  return model ? `${MODEL_LOCK_PREFIX}${model}` : MODEL_LOCK_ALL;
114|}
115|
116|/**
117| * Check if a model lock on a connection is still active.
118| * Reads flat field `modelLock_${model}` (or `modelLock___all` when model=null).
119| */
120|export function isModelLockActive(connection, model) {
121|  const key = getModelLockKey(model);
122|  const expiry = connection[key] || connection[MODEL_LOCK_ALL];
123|  if (!expiry) return false;
124|  return new Date(expiry).getTime() > Date.now();
125|}
126|
127|/**
128| * Get earliest active model lock expiry across all modelLock_* fields.
129| * Used for UI cooldown display.
130| */
131|export function getEarliestModelLockUntil(connection) {
132|  if (!connection) return null;
133|  let earliest = null;
134|  const now = Date.now();
135|  for (const [key, val] of Object.entries(connection)) {
136|    if (!key.startsWith(MODEL_LOCK_PREFIX) || !val) continue;
137|    const t = new Date(val).getTime();
138|    if (t <= now) continue;
139|    if (!earliest || t < earliest) earliest = t;
140|  }
141|  return earliest ? new Date(earliest).toISOString() : null;
142|}
143|
144|/**
145| * Build update object to set a model lock on a connection.
146| */
147|export function buildModelLockUpdate(model, cooldownMs) {
148|  const key = getModelLockKey(model);
149|  return { [key]: new Date(Date.now() + cooldownMs).toISOString() };
150|}
151|
152|/**
153| * Build update object to clear all model locks on a connection.
154| */
155|export function buildClearModelLocksUpdate(connection) {
156|  const cleared = {};
157|  for (const key of Object.keys(connection)) {
158|    if (key.startsWith(MODEL_LOCK_PREFIX)) cleared[key] = null;
159|  }
160|  return cleared;
161|}
162|
163|/**
164| * Filter available accounts (not in cooldown)
165| */
166|export function filterAvailableAccounts(accounts, excludeId = null) {
167|  const now = Date.now();
168|  return accounts.filter(acc => {
169|    if (excludeId && acc.id === excludeId) return false;
170|    if (acc.rateLimitedUntil) {
171|      const until = new Date(acc.rateLimitedUntil).getTime();
172|      if (until > now) return false;
173|    }
174|    return true;
175|  });
176|}
177|
178|/**
179| * Reset account state when request succeeds
180| * Clears cooldown and resets backoff level to 0
181| * @param {object} account - Account object
182| * @returns {object} Updated account with reset state
183| */
184|export function resetAccountState(account) {
185|  if (!account) return account;
186|  return {
187|    ...account,
188|    rateLimitedUntil: null,
189|    backoffLevel: 0,
190|    lastError: null,
191|    status: "active"
192|  };
193|}
194|
195|/**
196| * Apply error state to account
197| * @param {object} account - Account object
198| * @param {number} status - HTTP status code
199| * @param {string} errorText - Error message
200| * @returns {object} Updated account with error state
201| */
202|export function applyErrorState(account, status, errorText) {
203|  if (!account) return account;
204|
205|  const backoffLevel = account.backoffLevel || 0;
206|  const { cooldownMs, newBackoffLevel } = checkFallbackError(status, errorText, backoffLevel);
207|
208|  return {
209|    ...account,
210|    rateLimitedUntil: cooldownMs > 0 ? getUnavailableUntil(cooldownMs) : null,
211|    backoffLevel: newBackoffLevel ?? backoffLevel,
212|    lastError: { status, message: errorText, timestamp: new Date().toISOString() },
213|    status: "error"
214|  };
215|}
216|
```
- **Logic chọn key kế tiếp:** File này CHỦ YẾU định nghĩa logic ĐỂ XÁC ĐỊNH khi nào một lỗi cần fallback, tính toán `cooldown` (theo cấp độ backoff) và `unavailableUntil`. Nó không chứa thuật toán chọn key kế tiếp (round-robin, priority, v.v.) trực tiếp, mà các hàm này được gọi từ lớp cao hơn (ví dụ: `chatCore.js`) để quyết định key nào khả dụng và nên dùng.

## 6. D:/9router/src/sse/handlers/chat.js
```javascript
1|import "open-sse/index.js";
2|
3|import {
4|  getProviderCredentials,
5|  markAccountUnavailable,
6|  clearAccountError,
7|  extractApiKey,
8|  isValidApiKey,
9|} from "../services/auth.js";
10|import { cacheClaudeHeaders } from "open-sse/utils/claudeHeaderCache.js";
11|import { getSettings } from "@/lib/localDb";
12|import { getModelInfo, getComboModels } from "../services/model.js";
13|import { handleChatCore } from "open-sse/handlers/chatCore.js";
14|import { DEFAULT_HEADROOM_URL } from "@/lib/headroom/detect";
15|import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
16|import { handleComboChat, handleFusionChat } from "open-sse/services/combo.js";
17|import { handleBypassRequest } from "open-sse/utils/bypassHandler.js";
18|import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
19|import { detectFormatByEndpoint } from "open-sse/translator/formats.js";
20|import * as log from "../utils/logger.js";
21|import { updateProviderCredentials, checkAndRefreshToken } from "../services/tokenRefresh.js";
22|import { getProjectIdForConnection } from "open-sse/services/projectId.js";
23|
24|/**
25| * Handle chat completion request
26| * Supports: OpenAI, Claude, Gemini, OpenAI Responses API formats
27| * Format detection and translation handled by translator
28| */
29|export async function handleChat(request, clientRawRequest = null) {
30|  let body;
31|  try {
32|    body = await request.json();
33|  } catch {
34|    log.warn("CHAT", "Invalid JSON body");
35|    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
36|  }
37|
38|  // Build clientRawRequest for logging (if not provided)
39|  if (!clientRawRequest) {
40|    const url = new URL(request.url);
41|    clientRawRequest = {
42|      endpoint: url.pathname,
43|      body,
44|      headers: Object.fromEntries(request.headers.entries())
45|    };
46|  }
47|  cacheClaudeHeaders(clientRawRequest.headers);
48|
49|  // Log request endpoint and model
50|  const url = new URL(request.url);
51|  const modelStr = body.model;
52|
53|  // Count messages (support both messages[] and input[] formats)
54|  const msgCount = body.messages?.length || body.input?.length || 0;
55|  const toolCount = body.tools?.length || 0;
56|  const effort = body.reasoning_effort || body.reasoning?.effort || null;
57|  log.request("POST", `${url.pathname} | ${modelStr} | ${msgCount} msgs${toolCount ? ` | ${toolCount} tools` : ""}${effort ? ` | effort=${effort}` : ""}`);
58|
59|  // Log API key (masked)
60|  const authHeader = request.headers.get("Authorization");
61|  const apiKey = extractApiKey(request);
62|  if (authHeader && apiKey) {
63|    const masked = log.maskKey(apiKey);
64|    log.debug("AUTH", `API Key: ${masked}`);
65|  } else {
66|    log.debug("AUTH", "No API key provided (local mode)");
67|  }
68|
69|  // Enforce API key if enabled in settings
70|  const settings = await getSettings();
71|  if (settings.requireApiKey) {
72|    if (!apiKey) {
73|      log.warn("AUTH", "Missing API key (requireApiKey=true)");
74|      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
75|    }
76|    const valid = await isValidApiKey(apiKey);
77|    if (!valid) {
78|      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
79|      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
80|    }
81|  }
82|
83|  if (!modelStr) {
84|    log.warn("CHAT", "Missing model");
85|    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
86|  }
87|
88|  // Bypass naming/warmup requests before combo rotation to avoid wasting rotation slots
89|  const userAgent = request?.headers?.get("user-agent") || "";
90|  const bypassResponse = handleBypassRequest(body, modelStr, userAgent, !!settings.ccFilterNaming);
91|  if (bypassResponse) return bypassResponse.response || bypassResponse;
92|
93|  // Check if model is a combo (has multiple models with fallback)
94|  const comboModels = await getComboModels(modelStr);
95|  if (comboModels) {
96|    // Check for combo-specific strategy first, fallback to global
97|    const comboStrategies = settings.comboStrategies || {};
98|    const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
99|    const comboStrategy = comboSpecificStrategy || settings.comboStrategy || "fallback";
100|
101|    if (comboStrategy === "fusion") {
102|      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
103|      return handleFusionChat({
104|        body,
105|        models: comboModels,
106|        handleSingleModel: (b, m, isPanel) => {
107|          let cleanRawReq = clientRawRequest;
108|          if (isPanel && clientRawRequest) {
109|            const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
110|            cleanRawReq = { ...clientRawRequest, body: cleanBody };
111|          }
112|          return handleSingleModelChat(b, m, cleanRawReq, request, apiKey);
113|        },
114|        log,
115|        comboName: modelStr,
116|        judgeModel: comboStrategies[modelStr]?.judgeModel,
117|        tuning: comboStrategies[modelStr]?.fusionTuning,
118|      });
119|    }
120|
121|    const comboStickyLimit = settings.comboStickyRoundRobinLimit;
122|    log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
123|    return handleComboChat({
124|      body,
125|      models: comboModels,
126|      handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
127|      log,
128|      comboName: modelStr,
129|      comboStrategy,
130|      comboStickyLimit
131|    });
132|  }
133|
134|  // Single model request
135|  return handleSingleModelChat(body, modelStr, clientRawRequest, request, apiKey);
136|}
137|
138|/**
139| * Handle single model chat request
140| */
141|async function handleSingleModelChat(body, modelStr, clientRawRequest = null, request = null, apiKey = null) {
142|  const modelInfo = await getModelInfo(modelStr);
143|
144|  // If provider is null, this might be a combo name - check and handle
145|  if (!modelInfo.provider) {
146|    const comboModels = await getComboModels(modelStr);
147|    if (comboModels) {
148|      const chatSettings = await getSettings();
149|      // Check for combo-specific strategy first, fallback to global
150|      const comboStrategies = chatSettings.comboStrategies || {};
151|      const comboSpecificStrategy = comboStrategies[modelStr]?.fallbackStrategy;
152|      const comboStrategy = comboSpecificStrategy || chatSettings.comboStrategy || "fallback";
153|
154|      if (comboStrategy === "fusion") {
155|        log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: fusion)`);
156|        return handleFusionChat({
157|          body,
158|          models: comboModels,
159|          handleSingleModel: (b, m, isPanel) => {
160|            let cleanRawReq = clientRawRequest;
161|            if (isPanel && clientRawRequest) {
162|              const { tools, tool_choice, ...cleanBody } = clientRawRequest.body || {};
163|              cleanRawReq = { ...clientRawRequest, body: cleanBody };
164|            }
165|            return handleSingleModelChat(b, m, cleanRawReq, request, apiKey);
166|          },
167|          log,
168|          comboName: modelStr,
169|          judgeModel: comboStrategies[modelStr]?.judgeModel,
170|          tuning: comboStrategies[modelStr]?.fusionTuning,
171|        });
172|      }
173|
174|      const comboStickyLimit = chatSettings.comboStickyRoundRobinLimit;
175|      log.info("CHAT", `Combo "${modelStr}" with ${comboModels.length} models (strategy: ${comboStrategy}, sticky: ${comboStickyLimit})`);
176|      return handleComboChat({
177|        body,
178|        models: comboModels,
179|        handleSingleModel: (b, m) => handleSingleModelChat(b, m, clientRawRequest, request, apiKey),
180|        log,
181|        comboName: modelStr,
182|        comboStrategy,
183|        comboStickyLimit
184|      });
185|    }
186|    log.warn("CHAT", "Invalid model format", { model: modelStr });
187|    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
188|  }
189|
190|  const { provider, model } = modelInfo;
191|
192|  // Log model routing (alias → actual model)
193|  if (modelStr !== `${provider}/${model}`) {
194|    log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
195|  } else {
196|    log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);
197|  }
198|
199|  // Extract userAgent from request
200|  const userAgent = request?.headers?.get("user-agent") || "";
201|
202|  // Try with available accounts (fallback on errors)
203|  const excludeConnectionIds = new Set();
204|  let lastError = null;
205|  let lastStatus = null;
206|
207|  while (true) {
208|    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);
209|
210|    // All accounts unavailable
211|    if (!credentials || credentials.allRateLimited) {
212|      if (credentials?.allRateLimited) {
213|        const errorMsg = lastError || credentials.lastError || "Unavailable";
214|        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
215|        log.warn("CHAT", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
216|        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
217|      }
218|      if (excludeConnectionIds.size === 0) {
219|        log.warn("AUTH", `No active credentials for provider: ${provider}`);
220|        return errorResponse(HTTP_STATUS.NOT_FOUND, `No active credentials for provider: ${provider}`);
221|      }
222|      log.warn("CHAT", "No more accounts available", { provider });
223|      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
224|    }
225|
226|    // Log account selection
227|    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);
228|
229|    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);
230|
231|    // Ensure real project ID is available for providers that need it (P0 fix: cold miss)
232|    if ((provider === "antigravity" || provider === "gemini-cli") && !refreshedCredentials.projectId) {
233|      const pid = await getProjectIdForConnection(credentials.connectionId, refreshedCredentials.accessToken);
234|      if (pid) {
235|        refreshedCredentials.projectId = pid;
236|        // Persist to DB in background so subsequent requests have it immediately
237|        updateProviderCredentials(credentials.connectionId, { projectId: pid }).catch(() => { });
238|      }
239|    }
240|
241|    // Use shared chatCore
242|    const chatSettings = await getSettings();
243|    const providerThinking = (chatSettings.providerThinking || {})[provider] || null;
244|    const result = await handleChatCore({
245|      body: { ...body, model: `${provider}/${model}` },
246|      modelInfo: { provider, model },
247|      credentials: refreshedCredentials,
248|      log,
249|      clientRawRequest,
250|      connectionId: credentials.connectionId,
251|      userAgent,
252|      apiKey,
253|      ccFilterNaming: !!chatSettings.ccFilterNaming,
254|      rtkEnabled: !!chatSettings.rtkEnabled,
255|      headroomEnabled: !!chatSettings.headroomEnabled,
256|      headroomUrl: chatSettings.headroomUrl || DEFAULT_HEADROOM_URL,
257|      headroomCompressUserMessages: !!chatSettings.headroomCompressUserMessages,
258|      cavemanEnabled: !!chatSettings.cavemanEnabled,
259|      cavemanLevel: chatSettings.cavemanLevel || "full",
260|      ponytailEnabled: !!chatSettings.ponytailEnabled,
261|      ponytailLevel: chatSettings.ponytailLevel || "full",
262|      providerThinking,
263|      // Detect source format by endpoint + body
264|      sourceFormatOverride: request?.url ? detectFormatByEndpoint(new URL(request.url).pathname, body) : null,
265|      onCredentialsRefreshed: async (newCreds) => {
266|        await updateProviderCredentials(credentials.connectionId, {
267|          ...newCreds,
268|          existingProviderSpecificData: credentials.providerSpecificData,
269|          testStatus: "active"
270|        });
271|      },
272|      onRequestSuccess: async () => {
273|        await clearAccountError(credentials.connectionId, credentials, model);
274|      }
275|    });
276|
277|    if (result.success) return result.response;
278|
279|    // Mark account unavailable (auto-calculates cooldown with exponential backoff, or precise resetsAtMs)
280|    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model, result.resetsAtMs);
281|
282|    if (shouldFallback) {
283|      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${result.status}), trying fallback`);
284|      excludeConnectionIds.add(credentials.connectionId);
285|      lastError = result.error;
286|      lastStatus = result.status;
287|      continue;
288|    }
289|
290|    return result.response;
291|  }
292|}
293|
```
### Đoạn code liên quan từ `chat.js` (hàm `tryProviderConnection` hoặc tương tự)
```javascript

```
- **Key fallback vs. Model fallback:** Không tìm thấy logic fallback key riêng biệt hoặc không thể xác định sự tách biệt rõ ràng giữa key fallback và model fallback.
