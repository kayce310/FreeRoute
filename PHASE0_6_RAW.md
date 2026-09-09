## 1. File: D:/FreeRoute/src/router.ts
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

## 2. File: D:/FreeRoute/src/storage/sqlite-credential-store.ts
```typescript
1|import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
2|import { DatabaseSync } from 'node:sqlite';
3|
4|export interface CredentialMetadata {
5|  providerId: string;
6|  credentialId: string;
7|  createdAt: Date;
8|  updatedAt: Date;
9|}
10|
11|interface CredentialRow {
12|  provider_id: string;
13|  credential_id: string;
14|  encrypted_secret: string;
15|  created_at: string;
16|  updated_at: string;
17|}
18|
19|/**
20| * Stores provider credentials locally using AES-256-GCM. Callers receive only
21| * metadata from list(); plaintext is returned only by an explicit get().
22| */
23|export class SqliteCredentialStore {
24|  private readonly database: DatabaseSync;
25|  private readonly encryptionKey: Buffer;
26|
27|  constructor(filename: string, masterSecret: string) {
28|    if (masterSecret.length < 16) throw new Error('master secret must be at least 16 characters');
29|    this.database = new DatabaseSync(filename);
30|    this.encryptionKey = createHash('sha256').update(masterSecret).digest();
31|    this.database.exec(`
32|      CREATE TABLE IF NOT EXISTS credentials (
33|        provider_id TEXT NOT NULL,
34|        credential_id TEXT NOT NULL,
35|        encrypted_secret TEXT NOT NULL,
36|        created_at TEXT NOT NULL,
37|        updated_at TEXT NOT NULL,
38|        PRIMARY KEY (provider_id, credential_id)
39|      ) STRICT;
40|    `);
41|  }
42|
43|  async put(providerId: string, credentialId: string, secret: string, now = new Date()): Promise<void> {
44|    if (!secret) throw new Error('credential secret cannot be empty');
45|    const timestamp = now.toISOString();
46|    this.database.prepare(`
47|      INSERT INTO credentials (provider_id, credential_id, encrypted_secret, created_at, updated_at)
48|      VALUES (?, ?, ?, ?, ?)
49|      ON CONFLICT(provider_id, credential_id) DO UPDATE SET
50|        encrypted_secret = excluded.encrypted_secret,
51|        updated_at = excluded.updated_at
52|    `).run(providerId, credentialId, encrypt(secret, this.encryptionKey), timestamp, timestamp);
53|  }
54|
55|  async get(providerId: string, credentialId: string): Promise<string | undefined> {
56|    const row = this.database.prepare(`
57|      SELECT provider_id, credential_id, encrypted_secret, created_at, updated_at
58|      FROM credentials WHERE provider_id = ? AND credential_id = ?
59|    `).get(providerId, credentialId) as unknown as CredentialRow | undefined;
60|    return row ? decrypt(row.encrypted_secret, this.encryptionKey) : undefined;
61|  }
62|
63|  async list(): Promise<CredentialMetadata[]> {
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
75|
76|  async delete(providerId: string, credentialId: string): Promise<boolean> {
77|    const result = this.database.prepare(`
78|      DELETE FROM credentials WHERE provider_id = ? AND credential_id = ?
79|    `).run(providerId, credentialId);
80|    return Number(result.changes) > 0;
81|  }
82|
83|  async getAllSecrets(): Promise<Set<string>> {
84|    const rows = this.database.prepare(`
85|      SELECT encrypted_secret FROM credentials
86|    `).all() as unknown as Array<{ encrypted_secret: string }>;
87|    const secrets = new Set<string>();
88|    for (const row of rows) {
89|      try {
90|        const sec = decrypt(row.encrypted_secret, this.encryptionKey);
91|        if (sec) secrets.add(sec);
92|      } catch {}
93|    }
94|    return secrets;
95|  }
96|
97|  async countByProvider(): Promise<Record<string, number>> {
98|    const rows = this.database.prepare(`
99|      SELECT provider_id, COUNT(*) as count FROM credentials GROUP BY provider_id
100|    `).all() as unknown as Array<{ provider_id: string; count: number | bigint }>;
101|    const counts: Record<string, number> = {};
102|    for (const row of rows) {
103|      counts[row.provider_id] = Number(row.count);
104|    }
105|    return counts;
106|  }
107|
108|  async exportAllWithSecrets(): Promise<Array<{ providerId: string; credentialId: string; secret: string; createdAt: string; updatedAt: string }>> {
109|    const rows = this.database.prepare(`
110|      SELECT provider_id, credential_id, encrypted_secret, created_at, updated_at
111|      FROM credentials
112|      ORDER BY provider_id, credential_id
113|    `).all() as unknown as CredentialRow[];
114|    const result: Array<{ providerId: string; credentialId: string; secret: string; createdAt: string; updatedAt: string }> = [];
115|    for (const row of rows) {
116|      try {
117|        const secret = decrypt(row.encrypted_secret, this.encryptionKey);
118|        if (secret) {
119|          result.push({
120|            providerId: row.provider_id,
121|            credentialId: row.credential_id,
122|            secret,
123|            createdAt: row.created_at,
124|            updatedAt: row.updated_at,
125|          });
126|        }
127|      } catch {}
128|    }
129|    return result;
130|  }
131|
132|  close(): void {
133|    this.database.close();
134|  }
135|}
136|
137|function encrypt(value: string, key: Buffer): string {
138|  const iv = randomBytes(12);
139|  const cipher = createCipheriv('aes-256-gcm', key, iv);
140|  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
141|  const tag = cipher.getAuthTag();
142|  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
143|}
144|
145|function decrypt(value: string, key: Buffer): string {
146|  const packed = Buffer.from(value, 'base64url');
147|  const iv = packed.subarray(0, 12);
148|  const tag = packed.subarray(12, 28);
149|  const encrypted = packed.subarray(28);
150|  const decipher = createDecipheriv('aes-256-gcm', key, iv);
151|  decipher.setAuthTag(tag);
152|  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
153|}
154|
```

## 3. Function: `getProviderCredentials` from D:/9router/open-sse/services/auth.js
KHÔNG TÌM THẤY hàm `getProviderCredentials` với signature `export async function getProviderCredentials(provider, excludeConnectionIds = []) {` trong file.

## 4. Function: `handleComboChat` from D:/9router/open-sse/services/combo.js
KHÔNG TÌM THẤY hàm `handleComboChat` với signature `export async function handleComboChat(chatOpts, combo, context) {` trong file.
