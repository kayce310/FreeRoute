# PHASE0_8_RAW.md

## PHẦN A — FreeRoute Analysis
### 1. Grep Results for FreeRoute patterns
#### Pattern: 'credentialStore.get'
0 matches

#### Pattern: 'credentialStore.list'
0 matches

#### Pattern: 'comboStore.get'
D:/FreeRoute/src\server.ts:1309: } else if (comboStore.get(trimmed)) {
D:/FreeRoute/src\server.ts:1320: const subCombo = comboStore.get(subComboId);
D:/FreeRoute/src\server.ts:1343: const combo = comboStore.get(trimmed);

#### Pattern: '/v1/chat/completions'
D:/FreeRoute/src\dashboard.ts:3874: const res = await fetch('/v1/chat/completions', {
D:/FreeRoute/src\server.ts:562: if (request.method === 'POST' && path === '/v1/chat/completions') {

#### Pattern: '/v1/messages'

#### Pattern: 'createServer'
D:/FreeRoute/src\server.ts:1: import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
D:/FreeRoute/src\server.ts:31: return createServer(async (request, response) => {

#### Pattern: 'chooseRoute'
D:/FreeRoute/src\router.ts:39: export function chooseRoute(request: RouteRequest, candidates: RouteCandidate[], now = new Date()): RouteDecision | undefined {
D:/FreeRoute/src\inference.ts:3: import { applyFailureCooldown, chooseRoute } from './router.js';
D:/FreeRoute/src\inference.ts:187: const decision = chooseRoute(request, candidates, this.now());
D:/FreeRoute/src\inference.ts:271: const decision = chooseRoute(request, candidates, this.now());

## File: D:/FreeRoute/src/server.ts
```typescript
1|import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
2|import type { CatalogStore } from './catalog.js';
3|import { ChatService, ProviderInvocationError, NoRouteCandidatesError, type ChatMessage } from './inference.js';
4|import { getCandidateDiagnostics } from './router.js';
5|import { estimateTokensFromText } from './utils/token-estimator.js';
6|import type { SqliteRoutingEventStore } from './storage/sqlite-routing-event-store.js';
7|import type { SqliteQuotaObservationStore } from './storage/sqlite-quota-observation-store.js';
8|import type { SqlitePreferenceStore } from './storage/sqlite-preference-store.js';
9|import type { SqliteCredentialStore } from './storage/sqlite-credential-store.js';
10|import type { SqliteProviderStore } from './storage/sqlite-provider-store.js';
11|import type { SqliteComboStore } from './storage/sqlite-combo-store.js';
12|import type { Preference, ModelRecord } from './contracts.js';
13|import { dashboardHtml } from './dashboard.js';
14|import { PROVIDER_PRESETS } from './presets.js';
15|
16|export interface FreeRouteServerOptions {
17|  catalog: CatalogStore;
18|  apiToken?: string; // optional — / and /health are public
19|  chat?: ChatService;
20|  events?: SqliteRoutingEventStore;
21|  quotas?: SqliteQuotaObservationStore;
22|  preferences?: SqlitePreferenceStore;
23|  credentials?: SqliteCredentialStore;
24|  providerStore?: SqliteProviderStore;
25|  combos?: SqliteComboStore;
26|  onCredentialChanged?: (providerId: string, credentialId: string) => Promise<void> | void;
27|  onProviderChanged?: (providerId: string) => Promise<void> | void;
28|}
29|
30|export function createFreeRouteServer(options: FreeRouteServerOptions): Server {
31|  return createServer(async (request, response) => {
32|    try {
33|      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
34|      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/') {
35|        if (request.method === 'HEAD') {
36|          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
37|          response.end();
38|          return;
39|        }
40|        sendHtml(response, dashboardHtml());
41|        return;
42|      }
43|      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/health') {
44|        if (request.method === 'HEAD') {
45|          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
46|          response.end();
47|          return;
48|        }
49|        sendJson(response, 200, { status: 'ok' });
50|        return;
51|      }
52|      if (request.method === 'GET' && path === '/v1/auth/status') {
53|        const creds = options.credentials ? await options.credentials.list() : [];
54|        const keyCounts = options.credentials && typeof options.credentials.countByProvider === 'function'
55|          ? await options.credentials.countByProvider()
56|          : {};
57|        const customProviders = options.providerStore?.list().map((p) => p.providerId) ?? [];
58|        const supported = ['openrouter', 'groq', 'gemini', ...customProviders];
59|        sendJson(response, 200, {
60|          status: 'ok',
61|          needsSetup: creds.length === 0,
62|          hasToken: Boolean(options.apiToken),
63|          configuredProviders: [...new Set(creds.map((c) => c.providerId))],
64|          configuredCount: new Set(creds.map((c) => c.providerId)).size,
65|          providerKeyCounts: keyCounts,
66|          supportedProviders: [...new Set(supported)],
67|          keyCount: creds.length,
68|        });
69|        return;
70|      }
71|      if (request.method === 'GET' && path === '/v1/providers/presets') {
72|        sendJson(response, 200, { object: 'list', data: PROVIDER_PRESETS });
73|        return;
74|      }
75|      if (request.method === 'GET' && path === '/v1/import/sources') {
76|        const { detectAllLocalCredentials } = await import('./importers/local-detect.js');
77|        const detected = detectAllLocalCredentials();
78|        const existingSecrets = options.credentials && typeof options.credentials.getAllSecrets === 'function'
79|          ? await options.credentials.getAllSecrets()
80|          : new Set<string>();
81|        const list = detected.map((d) => ({
82|          providerId: d.providerId,
83|          name: d.name,
84|          source: d.source,
85|          sourceLocation: d.sourceLocation,
86|          maskedKey: d.maskedKey,
87|          isActive: d.isActive,
88|          alreadyImported: existingSecrets.has(d.apiKey),
89|        }));
90|        const newKeysCount = list.filter((item) => !item.alreadyImported).length;
91|        sendJson(response, 200, {
92|          object: 'list',
93|          data: list,
94|          totalCount: list.length,
95|          newKeysCount,
96|        });
97|        return;
98|      }
99|      if (!isAuthorized(request, options.apiToken)) {
100|        sendJson(response, 401, { error: { message: 'invalid API key', type: 'authentication_error' } });
101|        return;
102|      }
103|
104|      if (request.method === 'GET' && path === '/v1/models') {
105|        const models = await options.catalog.list();
106|        sendJson(response, 200, {
107|          object: 'list',
108|          data: models
109|            .filter((model) => model.freeTier !== 'retired')
110|            .map((model) => ({
111|              id: `${model.providerId}/${model.modelId}`,
112|              object: 'model',
113|              created: Math.floor(model.checkedAt.getTime() / 1000),
114|              owned_by: model.providerId,
115|              freeroute: {
116|                capabilities: model.capabilities,
117|                free_tier: model.freeTier,
118|              },
119|            })),
120|        });
121|        return;
122|      }
123|
124|      if (request.method === 'GET' && path === '/v1/routing-events') {
125|        if (!options.events) { sendJson(response, 503, { error: { message: 'routing event storage is not configured', type: 'server_error' } }); return; }
126|        const events = await options.events.list();
127|        sendJson(response, 200, { object: 'list', data: events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })) });
128|        return;
129|      }
130|
131|      if (request.method === 'GET' && path === '/v1/stats/tokens') {
132|        if (!options.events) { sendJson(response, 503, { error: { message: 'routing event storage is not configured', type: 'server_error' } }); return; }
133|        const stats = await options.events.tokenStats();
134|        sendJson(response, 200, { object: 'token_stats', ...stats });
135|        return;
136|      }
137|
138|      if (request.method === 'GET' && path === '/v1/quota-observations') {
139|        if (!options.quotas) { sendJson(response, 503, { error: { message: 'quota observation storage is not configured', type: 'server_error' } }); return; }
140|        const observations = await options.quotas.list();
141|        sendJson(response, 200, { object: 'list', data: observations.map((item) => ({ ...item, observedAt: item.observedAt.toISOString(), resetAt: item.resetAt?.toISOString() })) });
142|        return;
143|      }
144|
145|      if (request.method === 'GET' && path === '/v1/provider-health') {
146|        if (!options.events) { sendJson(response, 503, { error: { message: 'routing event storage is not configured', type: 'server_error' } }); return; }
147|        const health = summarizeProviderHealth(await options.events.list(10_000));
148|        sendJson(response, 200, { object: 'list', data: health });
149|        return;
150|      }
151|
152|      if (request.method === 'GET' && path === '/v1/preferences') {
153|        if (!options.preferences) { sendJson(response, 503, { error: { message: 'preference storage is not configured', type: 'server_error' } }); return; }
154|        const preferences = await options.preferences.list();
155|        sendJson(response, 200, { object: 'list', data: preferences.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })) });
156|        return;
157|      }
158|
159|      if (request.method === 'PUT' && path === '/v1/preferences') {
160|        if (!options.preferences) { sendJson(response, 503, { error: { message: 'preference storage is not configured', type: 'server_error' } }); return; }
161|        const input = await readPreferenceRequest(request);
162|        await options.preferences.set(input.providerId, input.modelId, input.preference);
163|        sendJson(response, 200, { provider_id: input.providerId, model_id: input.modelId, preference: input.preference });
164|        return;
165|      }
166|
167|      if (request.method === 'GET' && path === '/v1/credentials') {
168|        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
169|        const creds = await options.credentials.list();
170|        sendJson(response, 200, {
171|          object: 'list',
172|          data: creds.map((c) => ({
173|            providerId: c.providerId,
174|            credentialId: c.credentialId,
175|            createdAt: c.createdAt.toISOString(),
176|            updatedAt: c.updatedAt.toISOString(),
177|          })),
178|        });
179|        return;
180|      }
181|
182|      if (request.method === 'GET' && path === '/v1/credentials/export') {
183|        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
184|        const all = typeof options.credentials.exportAllWithSecrets === 'function'
185|          ? await options.credentials.exportAllWithSecrets()
186|          : [];
187|        const dateStr = new Date().toISOString().slice(0, 10);
188|        response.setHeader('Content-Disposition', `attachment; filename="freeroute-keys-backup-${dateStr}.json"`);
189|        sendJson(response, 200, {
190|          app: 'freeroute',
191|          version: 1,
192|          exportedAt: new Date().toISOString(),
193|          count: all.length,
194|          credentials: all,
195|        });
196|        return;
197|      }
198|
199|      if (request.method === 'POST' && path === '/v1/credentials/import') {
200|        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
201|        const body = await readJsonBody(request) as {
202|          credentials?: Array<{ providerId?: string; provider_id?: string; credentialId?: string; credential_id?: string; secret?: string; apiKey?: string }>;
203|        } | Array<{ providerId?: string; provider_id?: string; credentialId?: string; credential_id?: string; secret?: string; apiKey?: string }>;
204|        
205|        const items = Array.isArray(body) ? body : (Array.isArray(body?.credentials) ? body.credentials : []);
206|        if (!items.length) {
207|          sendJson(response, 400, { error: { message: 'No valid credentials found in import payload', type: 'invalid_request_error' } });
208|          return;
209|        }
210|
211|        const imported: string[] = [];
212|        for (const item of items) {
213|          const providerId = (item.providerId ?? item.provider_id)?.trim();
214|          const credentialId = (item.credentialId ?? item.credential_id)?.trim() || 'default';
215|          const secret = (item.secret ?? item.apiKey)?.trim();
216|          if (!providerId || !secret) continue;
217|
218|          await options.credentials.put(providerId, credentialId, secret);
219|
220|          // Auto-seed preset models
221|          const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
222|          if (preset && preset.seedModels.length > 0) {
223|            try {
224|              const existing = await options.catalog.list();
225|              if (!existing.some((m) => m.providerId === preset.id)) {
226|                const seedList = preset.seedModels.map((m) => ({
227|                  providerId: preset.id,
228|                  modelId: m.modelId,
229|                  capabilities: m.capabilities,
230|                  freeTier: m.freeTier,
231|                  checkedAt: new Date(),
232|                  priority: m.priority ?? 0,
233|                }));
234|                await options.catalog.replaceProvider(preset.id, seedList);
235|              }
236|            } catch {}
237|          }
238|
239|          if (options.onCredentialChanged) {
240|            try { await options.onCredentialChanged(providerId, credentialId); } catch {}
241|          }
242|          imported.push(`${providerId}/${credentialId}`);
243|        }
244|
245|        sendJson(response, 200, {
246|          status: 'ok',
247|          count: imported.length,
248|          imported,
249|        });
250|        return;
251|      }
252|
253|      if (request.method === 'POST' && path === '/v1/credentials') {
254|        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
255|        const body = await readJsonBody(request) as { providerId?: unknown; provider_id?: unknown; credentialId?: unknown; credential_id?: unknown; secret?: unknown; apiKey?: unknown; api_key?: unknown };
256|        const providerId = (body.providerId ?? body.provider_id) as string | undefined;
257|        const credentialId = ((body.credentialId ?? body.credential_id) as string | undefined) || 'default';
258|        const secret = (body.secret ?? body.apiKey ?? body.api_key) as string | undefined;
259|
260|        if (typeof providerId !== 'string' || !providerId.trim()) {
261|          sendJson(response, 400, { error: { message: 'providerId is required', type: 'invalid_request_error' } });
262|          return;
263|        }
264|        if (typeof secret !== 'string' || !secret.trim()) {
265|          sendJson(response, 400, { error: { message: 'secret is required', type: 'invalid_request_error' } });
266|          return;
267|        }
268|
269|        await options.credentials.put(providerId.trim(), credentialId.trim(), secret.trim());
270|
271|        // Auto-seed known models for this provider if not yet present in catalog
272|        const preset = PROVIDER_PRESETS.find((p) => p.id === providerId.trim());
273|        if (preset && preset.seedModels.length > 0) {
274|          try {
275|            const existing = await options.catalog.list();
276|            const hasModels = existing.some((m) => m.providerId === preset.id);
277|            if (!hasModels) {
278|              const seedList: ModelRecord[] = preset.seedModels.map((m) => ({
279|                providerId: preset.id,
280|                modelId: m.modelId,
281|                capabilities: m.capabilities,
282|                freeTier: m.freeTier,
283|                checkedAt: new Date(),
284|                priority: m.priority ?? 0,
285|              }));
286|              await options.catalog.replaceProvider(preset.id, seedList);
287|            }
288|          } catch {
289|            // Non-fatal if catalog seeding fails
290|          }
291|        }
292|
293|        if (options.onCredentialChanged) {
294|          try {
295|            await options.onCredentialChanged(providerId.trim(), credentialId.trim());
296|          } catch {
297|            // Background refresh error should not fail the credential saving
298|          }
299|        }
300|        sendJson(response, 200, {
301|          status: 'ok',
302|          providerId: providerId.trim(),
303|          credentialId: credentialId.trim(),
304|        });
305|        return;
306|      }
307|
308|      if (request.method === 'DELETE' && path === '/v1/credentials') {
309|        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
310|        const url = new URL(request.url ?? '/', 'http://localhost');
311|        let providerId = url.searchParams.get('providerId') ?? url.searchParams.get('provider_id');
312|        let credentialId = url.searchParams.get('credentialId') ?? url.searchParams.get('credential_id') ?? 'default';
313|
314|        if (!providerId) {
315|          const body = await readJsonBody(request).catch(() => ({})) as { providerId?: unknown; provider_id?: unknown; credentialId?: unknown; credential_id?: unknown };
316|          providerId = ((body.providerId ?? body.provider_id) as string | undefined) ?? null;
317|          credentialId = (((body.credentialId ?? body.credential_id) as string | undefined) || 'default');
318|        }
319|
320|        if (!providerId || typeof providerId !== 'string') {
321|          sendJson(response, 400, { error: { message: 'providerId is required', type: 'invalid_request_error' } });
322|          return;
323|        }
324|
325|        const deleted = await options.credentials.delete(providerId.trim(), credentialId.trim());
326|        if (options.onCredentialChanged) {
327|          try {
328|            await options.onCredentialChanged(providerId.trim(), credentialId.trim());
329|          } catch {
330|            // ignore
331|          }
332|        }
333|        sendJson(response, 200, { status: 'ok', deleted, providerId: providerId.trim(), credentialId: credentialId.trim() });
334|        return;
335|      }
336|
337|      if (request.method === 'GET' && path === '/v1/providers/custom') {
338|        if (!options.providerStore) { sendJson(response, 503, { error: { message: 'provider storage is not configured', type: 'server_error' } }); return; }
339|        sendJson(response, 200, { object: 'list', data: options.providerStore.list() });
340|        return;
341|      }
342|
343|      if (request.method === 'POST' && path === '/v1/providers/custom') {
344|        if (!options.providerStore) { sendJson(response, 503, { error: { message: 'provider storage is not configured', type: 'server_error' } }); return; }
345|        const body = await readJsonBody(request) as { providerId?: string; adapterType?: 'openai-compatible' | 'gemini'; baseUrl?: string; classifyAsFree?: string; enabled?: boolean };
346|        if (!body.providerId || !body.adapterType || !body.baseUrl) {
347|          sendJson(response, 400, { error: { message: 'providerId, adapterType, and baseUrl are required', type: 'invalid_request_error' } });
348|          return;
349|        }
350|        options.providerStore.put({
351|          providerId: body.providerId.trim(),
352|          adapterType: body.adapterType,
353|          baseUrl: body.baseUrl.trim(),
354|          classifyAsFree: body.classifyAsFree,
355|          enabled: body.enabled ?? true,
356|        });
357|        await options.onProviderChanged?.(body.providerId.trim());
358|        sendJson(response, 200, { status: 'ok', provider: body });
359|        return;
360|      }
361|
362|      if (request.method === 'DELETE' && path === '/v1/providers/custom') {
363|        if (!options.providerStore) { sendJson(response, 503, { error: { message: 'provider storage is not configured', type: 'server_error' } }); return; }
364|        const url = new URL(request.url ?? '/', 'http://localhost');
365|        const providerId = url.searchParams.get('providerId') ?? url.searchParams.get('provider_id');
366|        if (!providerId) {
367|          sendJson(response, 400, { error: { message: 'providerId is required', type: 'invalid_request_error' } });
368|          return;
369|        }
370|        options.providerStore.remove(providerId);
371|        await options.onProviderChanged?.(providerId);
372|        sendJson(response, 200, { status: 'ok', providerId });
373|        return;
374|      }
375|
376|      if (request.method === 'GET' && path === '/v1/combos') {
377|        const list = options.combos ? options.combos.list() : [];
378|        sendJson(response, 200, { object: 'list', data: list });
379|        return;
380|      }
381|
382|      if (request.method === 'POST' && path === '/v1/combos') {
383|        if (!options.combos) {
384|          sendJson(response, 503, { error: { message: 'combo storage not configured', type: 'server_error' } });
385|          return;
386|        }
387|        const body = await readJsonBody(request) as { comboId?: string; id?: string; name?: string; models?: string[]; description?: string };
388|        const comboId = body.comboId ?? body.id;
389|        if (!comboId || typeof comboId !== 'string' || !comboId.trim()) {
390|          sendJson(response, 400, { error: { message: 'comboId is required', type: 'invalid_request_error' } });
391|          return;
392|        }
393|        if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
394|          sendJson(response, 400, { error: { message: 'name is required', type: 'invalid_request_error' } });
395|          return;
396|        }
397|        if (!Array.isArray(body.models) || body.models.length === 0) {
398|          sendJson(response, 400, { error: { message: 'models must be a non-empty array of model IDs', type: 'invalid_request_error' } });
399|          return;
400|        }
401|        const saved = options.combos.put({
402|          comboId: comboId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
403|          name: body.name.trim(),
404|          models: body.models.map((m) => String(m).trim()),
405|          description: body.description?.trim(),
406|        });
407|        sendJson(response, 200, { status: 'ok', combo: saved });
408|        return;
409|      }
410|
411|      if (request.method === 'GET' && path.startsWith('/v1/combos/')) {
412|        if (!options.combos) { sendJson(response, 503, { error: { message: 'combo storage not configured', type: 'server_error' } }); return; }
413|        const comboId = decodeURIComponent(path.slice('/v1/combos/'.length));
414|        const item = options.combos.get(comboId);
415|        if (!item) { sendJson(response, 404, { error: { message: `Combo not found: ${comboId}`, type: 'invalid_request_error' } }); return; }
416|        sendJson(response, 200, item);
417|        return;
418|      }
419|
420|      if (request.method === 'DELETE' && (path === '/v1/combos' || path.startsWith('/v1/combos/'))) {
421|        if (!options.combos) {
422|          sendJson(response, 503, { error: { message: 'combo storage not configured', type: 'server_error' } });
423|          return;
424|        }
425|        const url = new URL(request.url ?? '/', 'http://localhost');
426|        let comboId = path.startsWith('/v1/combos/') ? decodeURIComponent(path.slice('/v1/combos/'.length)) : (url.searchParams.get('comboId') ?? url.searchParams.get('id'));
427|        if (!comboId) {
428|          const body = await readJsonBody(request).catch(() => ({})) as { comboId?: unknown; id?: unknown };
429|          comboId = ((body.comboId ?? body.id) as string | undefined) ?? null;
430|        }
431|        if (!comboId || typeof comboId !== 'string') {
432|          sendJson(response, 400, { error: { message: 'comboId is required', type: 'invalid_request_error' } });
433|          return;
434|        }
435|        const deleted = options.combos.delete(comboId.trim());
436|        sendJson(response, 200, { status: 'ok', deleted, comboId: comboId.trim() });
437|        return;
438|      }
439|
440|      if (request.method === 'POST' && path === '/v1/import/9router') {
441|        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credentials store not configured', type: 'server_error' } }); return; }
442|        const body = await readJsonBody(request) as { sourceDatabasePath?: string; providerId?: string; credentialId?: string };
443|        if (!body.sourceDatabasePath || !body.providerId) {
444|          sendJson(response, 400, { error: { message: 'sourceDatabasePath and providerId are required', type: 'invalid_request_error' } });
445|          return;
446|        }
447|        const { importNineRouterApiKey } = await import('./importers/9router.js');
448|        try {
449|          const result = await importNineRouterApiKey({
450|            sourceDatabasePath: body.sourceDatabasePath,
451|            providerId: body.providerId,
452|            credentials: options.credentials,
453|            credentialId: body.credentialId,
454|          });
455|          if (options.onCredentialChanged) {
456|            void options.onCredentialChanged(result.providerId, result.credentialId);
457|          }
458|          sendJson(response, 200, { status: 'ok', ...result });
459|        } catch (err: unknown) {
460|          const message = err instanceof Error ? err.message : 'Import failed';
461|          sendJson(response, 400, { error: { message, type: 'import_error' } });
462|        }
463|        return;
464|      }
465|
466|      if (request.method === 'POST' && path === '/v1/import/sync') {
467|        if (!options.credentials) {
468|          sendJson(response, 503, { error: { message: 'credentials store not configured', type: 'server_error' } });
469|          return;
470|        }
471|        const body = await readJsonBody(request).catch(() => ({})) as {
472|          providerIds?: string[];
473|          syncAll?: boolean;
474|          onlyNew?: boolean;
475|        };
476|        const { detectAllLocalCredentials } = await import('./importers/local-detect.js');
477|        const detected = detectAllLocalCredentials();
478|        const existingSecrets = options.credentials && typeof options.credentials.getAllSecrets === 'function'
479|          ? await options.credentials.getAllSecrets()
480|          : new Set<string>();
481|
482|        const targets = detected.filter((d) => {
483|          if (body.syncAll) {
484|            if (body.onlyNew !== false && existingSecrets.has(d.apiKey)) return false;
485|            return true;
486|          }
487|          if (body.providerIds && Array.isArray(body.providerIds) && body.providerIds.length > 0) {
488|            return body.providerIds.includes(d.providerId);
489|          }
490|          if (body.onlyNew !== false && existingSecrets.has(d.apiKey)) return false;
491|          return true;
492|        });
493|
494|        const imported: Array<{ providerId: string; credentialId: string; source: string; name: string }> = [];
495|        const usedCreds = new Set<string>();
496|        for (const target of targets) {
497|          const rawCredId = (target.name || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 30) || 'default';
498|          let credId = rawCredId;
499|          let counter = 1;
500|          while (usedCreds.has(`${target.providerId}:${credId}`)) {
501|            credId = `${rawCredId}-${counter++}`;
502|          }
503|          usedCreds.add(`${target.providerId}:${credId}`);
504|
505|          await options.credentials.put(target.providerId, credId, target.apiKey);
506|
507|          // If unknown provider, automatically register custom provider
508|          const preset = PROVIDER_PRESETS.find((p) => p.id === target.providerId);
509|          if (options.providerStore && !['openrouter', 'groq', 'gemini'].includes(target.providerId)) {
510|            const existing = options.providerStore.list().find((p) => p.providerId === target.providerId);
511|            if (!existing) {
512|              options.providerStore.put({
513|                providerId: target.providerId,
514|                adapterType: preset?.adapterType ?? 'openai-compatible',
515|                baseUrl: preset?.baseUrl ?? `https://api.${target.providerId}.com/v1`,
516|                classifyAsFree: (preset?.category === 'free' || preset?.category === 'freemium') ? 'free_verified' : undefined,
517|                enabled: true,
518|              });
519|            }
520|          }
521|
522|          // Auto-seed models if present in presets
523|          if (preset && preset.seedModels.length > 0) {
524|            try {
525|              const existing = await options.catalog.list();
526|              const hasModels = existing.some((m) => m.providerId === preset.id);
527|              if (!hasModels) {
528|                const seedList: ModelRecord[] = preset.seedModels.map((m) => ({
529|                  providerId: preset.id,
530|                  modelId: m.modelId,
531|                  capabilities: m.capabilities,
532|                  freeTier: m.freeTier,
533|                  checkedAt: new Date(),
534|                  priority: m.priority ?? 0,
535|                }));
536|                await options.catalog.replaceProvider(preset.id, seedList);
537|              }
538|            } catch {
539|              // Ignore seed errors
540|            }
541|          }
542|
543|          if (options.onCredentialChanged) {
544|            try {
545|              await options.onCredentialChanged(target.providerId, credId);
546|            } catch {
547|              // Ignore refresh errors
548|            }
549|          }
550|
551|          imported.push({ providerId: target.providerId, credentialId: credId, source: target.source, name: target.name });
552|        }
553|
554|        sendJson(response, 200, {
555|          status: 'ok',
556|          count: imported.length,
557|          imported,
558|        });
559|        return;
560|      }
561|
562|      if (request.method === 'POST' && path === '/v1/chat/completions') {
563|        if (!options.chat) {
564|          sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } });
565|          return;
566|        }
567|        const input = await readChatRequest(request);
568|        const target = parseRequestedModel(input.model, options.combos);
569|        const requestId = crypto.randomUUID();
570|        response.setHeader('x-freeroute-request-id', requestId);
571|
572|        if (target.profile === 'combo' && target.comboModels && target.comboModels.length > 0) {
573|          let lastError: unknown = null;
574|          let contextOverflowCount = 0;
575|          const reqCaps = capabilitiesForProfile('named', !!(input.tools?.length), !!input.stream, input.responseFormat, input.hasVision);
576|          const catalogModels = options.catalog ? await options.catalog.list() : [];
577|          const attemptedSteps: Array<{ model: string; error: string }> = [];
578|
579|          for (const cm of target.comboModels) {
580|            const parsedCm = parseRequestedModel(cm, options.combos);
581|            const cProv = parsedCm.providerId;
582|            const cMod = parsedCm.modelId ?? cm;
583|
584|            // If the request requires tools or vision, check if this combo model supports it
585|            if (reqCaps.includes('tools') || reqCaps.includes('vision')) {
586|              const matchedCatalog = catalogModels.filter(m => (!cProv || m.providerId === cProv) && m.modelId === cMod);
587|              if (matchedCatalog.length > 0) {
588|                const hasRequired = matchedCatalog.some(m => reqCaps.every(c => m.capabilities.includes(c)));
589|                if (!hasRequired) {
590|                  attemptedSteps.push({ model: cm, error: `missing required capability (${reqCaps.filter(c => c === 'tools' || c === 'vision').join(', ')})` });
591|                  continue;
592|                }
593|              }
594|            }
595|
596|            try {
597|              if (input.stream) {
598|                const result = await options.chat.stream({
599|                  profile: 'named',
600|                  requiredCapabilities: reqCaps,
601|                  requestedProviderId: cProv,
602|                  requestedModel: cMod,
603|                  messages: input.messages,
604|                  temperature: input.temperature,
605|                  tools: input.tools,
606|                  responseFormat: input.responseFormat,
607|                  traceId: requestId,
608|                });
609|                const streamStart = Date.now();
610|                const usageState = { captured: undefined as import('./contracts.js').TokenUsage | undefined, accumulatedText: '' };
611|                response.writeHead(200, {
612|                  'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
613|                  'x-freeroute-provider': result.decision.candidate.providerId,
614|                  'x-freeroute-model': result.decision.candidate.modelId,
615|                  'x-freeroute-combo': input.model,
616|                });
617|                for await (const event of result.events) {
618|                  if (event.usage) usageState.captured = event.usage;
619|                  if (event.delta) usageState.accumulatedText += event.delta;
620|                  const includeUsage = event.usage ?? usageState.captured;
621|                  response.write(`data: ${JSON.stringify({ id: event.id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1_000), model: `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`, choices: [{ index: 0, delta: event.delta === undefined ? {} : { content: event.delta }, finish_reason: event.finishReason ?? null, ...(event.toolCalls?.length ? { tool_calls: event.toolCalls } : {}) }], ...(includeUsage ? { usage: { prompt_tokens: includeUsage.promptTokens, completion_tokens: includeUsage.completionTokens, total_tokens: includeUsage.totalTokens } } : {}) })}\n\n`);
622|                }
623|                response.end('data: [DONE]\n\n');
624|                if (options.events) {
625|                  const finalUsage = usageState.captured ?? { promptTokens: 0, completionTokens: estimateTokensFromText(usageState.accumulatedText), totalTokens: 0 };
626|                  if (finalUsage.totalTokens === 0) finalUsage.totalTokens = finalUsage.promptTokens + finalUsage.completionTokens;
627|                  await options.events.record({
628|                    requestId,
629|                    occurredAt: new Date(),
630|                    profile: 'named',
631|                    providerId: result.decision.candidate.providerId,
632|                    modelId: result.decision.candidate.modelId,
633|                    credentialRef: result.decision.candidate.credentialId ? '***' : '',
634|                    fallbackCount: result.fallbackCount ?? 0,
635|                    outcome: 'success',
636|                    latencyMs: Date.now() - streamStart,
637|                    promptTokens: finalUsage.promptTokens,
638|                    completionTokens: finalUsage.completionTokens,
639|                    totalTokens: finalUsage.totalTokens,
640|                  });
641|                }
642|                return;
643|              } else {
644|                const result = await options.chat.complete({
645|                  profile: 'named',
646|                  requiredCapabilities: reqCaps,
647|                  requestedProviderId: cProv,
648|                  requestedModel: cMod,
649|                  messages: input.messages,
650|                  temperature: input.temperature,
651|                  tools: input.tools,
652|                  responseFormat: input.responseFormat,
653|                  traceId: requestId,
654|                });
655|                const usage = result.response.usage;
656|                response.setHeader('x-freeroute-provider', result.decision.candidate.providerId);
657|                response.setHeader('x-freeroute-model', result.decision.candidate.modelId);
658|                response.setHeader('x-freeroute-combo', input.model);
659|                if (usage) {
660|                  response.setHeader('x-freeroute-prompt-tokens', String(usage.promptTokens));
661|                  response.setHeader('x-freeroute-completion-tokens', String(usage.completionTokens));
662|                  response.setHeader('x-freeroute-total-tokens', String(usage.totalTokens));
663|                }
664|                sendJson(response, 200, {
665|                  id: result.response.id,
666|                  object: 'chat.completion',
667|                  created: Math.floor(Date.now() / 1_000),
668|                  model: `${result.response.providerId}/${result.response.modelId}`,
669|                  choices: [{ index: 0, message: { role: 'assistant', content: result.response.content, ...(result.response.toolCalls?.length ? { tool_calls: result.response.toolCalls } : {}) }, finish_reason: result.response.toolCalls?.length ? 'tool_calls' : 'stop' }],
670|                  usage: usage ? { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.totalTokens } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
671|                });
672|                if (options.events && usage) {
673|                  await options.events.record({
674|                    requestId,
675|                    occurredAt: new Date(),
676|                    profile: 'named',
677|                    providerId: result.decision.candidate.providerId,
678|                    modelId: result.response.modelId,
679|                    credentialRef: result.decision.candidate.credentialId ? '***' : '',
680|                    fallbackCount: result.fallbackCount ?? 0,
681|                    outcome: 'success',
682|                    latencyMs: 0,
683|                    promptTokens: usage.promptTokens,
684|                    completionTokens: usage.completionTokens,
685|                    totalTokens: usage.totalTokens,
686|                  });
687|                }
688|                return;
689|              }
690|            } catch (err) {
691|              lastError = err;
692|              const errMsg = err instanceof Error ? err.message : String(err);
693|              attemptedSteps.push({ model: cm, error: errMsg });
694|              if (err instanceof ProviderInvocationError && err.failure.kind === 'context_overflow') {
695|                contextOverflowCount += 1;
696|              }
697|              // Record failure event for this combo model attempt (use unique requestId to avoid overwrite by success)
698|              if (options.events) {
699|                const failureKind = err instanceof ProviderInvocationError ? err.failure.kind : 'temporary';
700|                await options.events.record({
701|                  requestId: `${requestId}-fail-${attemptedSteps.length}`,
702|                  occurredAt: new Date(),
703|                  profile: 'named',
704|                  providerId: cProv || 'unknown',
705|                  modelId: cMod || cm,
706|                  credentialRef: '',
707|                  fallbackCount: attemptedSteps.length - 1,
708|                  outcome: 'failure',
709|                  failureKind,
710|                  latencyMs: 0,
711|                  promptTokens: 0,
712|                  completionTokens: 0,
713|                  totalTokens: 0,
714|                });
715|              }
716|              continue;
717|            }
718|          }
719|          if (contextOverflowCount > 0 && contextOverflowCount === target.comboModels.length) {
720|            const errMsg = 'Ngữ cảnh hội thoại vượt quá giới hạn token của tất cả model trong combo. Vui lòng làm mới phiên chat (clear context / start new session) để tiếp tục. / Context length exceeded limits of all models in this combo. Please clear context or start a new chat session.';
721|            if (options.events) {
722|              const lastAttempt = attemptedSteps[attemptedSteps.length - 1];
723|              const lastProvider = lastAttempt ? lastAttempt.model.split('/')[0] || 'unknown' : 'unknown';
724|              const lastModel = lastAttempt ? lastAttempt.model : 'unknown';
725|              await options.events.record({
726|                requestId: `${requestId}-exhausted`,
727|                occurredAt: new Date(),
728|                profile: 'combo',
729|                providerId: lastProvider,
730|                modelId: lastModel,
731|                credentialRef: '',
732|                fallbackCount: attemptedSteps.length,
733|                outcome: 'failure',
734|                failureKind: 'context_overflow',
735|                latencyMs: 0,
736|                promptTokens: 0,
737|                completionTokens: 0,
738|                totalTokens: 0,
739|              });
740|            }
741|            sendJson(response, 200, {
742|              id: `chatcmpl-${requestId}`,
743|              object: 'chat.completion',
744|              created: Math.floor(Date.now() / 1_000),
745|              model: input.model,
746|              choices: [{
747|                index: 0,
748|                message: { role: 'assistant', content: `[FreeRoute] ${errMsg}` },
749|                finish_reason: 'stop',
750|              }],
751|              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
752|            });
753|            return;
754|          }
755|
756|          const stepsSummary = attemptedSteps.length > 0
757|            ? attemptedSteps.map(s => `${s.model}: ${s.error}`).join('; ')
758|            : 'no matching models found in combo';
759|          // Record failure event for combo exhaustion (use unique requestId to avoid overwrite)
760|          if (options.events) {
761|            const lastAttempt = attemptedSteps[attemptedSteps.length - 1];
762|            const lastProvider = lastAttempt ? lastAttempt.model.split('/')[0] || 'unknown' : 'unknown';
763|            const lastModel = lastAttempt ? lastAttempt.model : 'unknown';
764|            await options.events.record({
765|              requestId: `${requestId}-exhausted`,
766|              occurredAt: new Date(),
767|              profile: 'combo',
768|              providerId: lastProvider,
769|              modelId: lastModel,
770|              credentialRef: '',
771|              fallbackCount: attemptedSteps.length,
772|              outcome: 'failure',
773|              failureKind: 'temporary',
774|              latencyMs: 0,
775|              promptTokens: 0,
776|              completionTokens: 0,
777|              totalTokens: 0,
778|            });
779|          }
780|          const errMsg = `Không có model nào trong combo "${input.model}" hoàn thành được yêu cầu (hoặc tất cả upstream đều lỗi/thiếu capability). Chi tiết: [${stepsSummary}]. Vui lòng kiểm tra API key hoặc cấu hình lại combo tại http://127.0.0.1:8787!`;
781|          sendJson(response, 200, {
782|            id: `chatcmpl-${requestId}`,
783|            object: 'chat.completion',
784|            created: Math.floor(Date.now() / 1_000),
785|            model: input.model,
786|            choices: [{
787|              index: 0,
788|              message: { role: 'assistant', content: `[FreeRoute] ${errMsg}` },
789|              finish_reason: 'stop',
790|            }],
791|            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
792|          });
793|          return;
794|        }
795|
796|        if (input.stream) {
797|          const result = await options.chat.stream({
798|            profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), true, input.responseFormat, input.hasVision), requestedProviderId: target.providerId,
799|            requestedModel: target.modelId, messages: input.messages, temperature: input.temperature, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
800|          });
801|          const streamStart = Date.now();
802|          const usageState = { captured: undefined as import('./contracts.js').TokenUsage | undefined, accumulatedText: '' };
803|          response.writeHead(200, {
804|            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
805|            'x-freeroute-provider': result.decision.candidate.providerId,
806|            'x-freeroute-model': result.decision.candidate.modelId,
807|            'x-freeroute-fallback-count': String(result.fallbackCount ?? 0),
808|          });
809|          for await (const event of result.events) {
810|            if (event.usage) usageState.captured = event.usage;
811|            if (event.delta) usageState.accumulatedText += event.delta;
812|            const includeUsage = event.usage ?? usageState.captured;
813|            response.write(`data: ${JSON.stringify({ id: event.id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1_000), model: `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`, choices: [{ index: 0, delta: event.delta === undefined ? {} : { content: event.delta }, finish_reason: event.finishReason ?? null, ...(event.toolCalls?.length ? { tool_calls: event.toolCalls } : {}) }], ...(includeUsage ? { usage: { prompt_tokens: includeUsage.promptTokens, completion_tokens: includeUsage.completionTokens, total_tokens: includeUsage.totalTokens } } : {}) })}\n\n`);
814|          }
815|          response.end('data: [DONE]\n\n');
816|          if (options.events) {
817|            const finalUsage = usageState.captured ?? { promptTokens: 0, completionTokens: estimateTokensFromText(usageState.accumulatedText), totalTokens: 0 };
818|            if (finalUsage.totalTokens === 0) finalUsage.totalTokens = finalUsage.promptTokens + finalUsage.completionTokens;
819|            await options.events.record({
820|              requestId,
821|              occurredAt: new Date(),
822|              profile: target.profile,
823|              providerId: result.decision.candidate.providerId,
824|              modelId: result.decision.candidate.modelId,
825|              credentialRef: result.decision.candidate.credentialId ? '***' : '',
826|              fallbackCount: result.fallbackCount ?? 0,
827|              outcome: 'success',
828|              latencyMs: Date.now() - streamStart,
829|              promptTokens: finalUsage.promptTokens,
830|              completionTokens: finalUsage.completionTokens,
831|              totalTokens: finalUsage.totalTokens,
832|            });
833|          }
834|          return;
835|        }
836|        const result = await options.chat.complete({
837|          profile: target.profile,
838|          requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), false, input.responseFormat, input.hasVision),
839|          requestedProviderId: target.providerId,
840|          requestedModel: target.modelId,
841|          messages: input.messages,
842|          temperature: input.temperature,
843|          tools: input.tools,
844|          responseFormat: input.responseFormat,
845|          traceId: requestId,
846|        });
847|        const usage = result.response.usage;
848|        response.setHeader('x-freeroute-provider', result.response.providerId);
849|        response.setHeader('x-freeroute-model', result.response.modelId);
850|        response.setHeader('x-freeroute-fallback-count', String(result.fallbackCount));
851|        if (usage) {
852|          response.setHeader('x-freeroute-prompt-tokens', String(usage.promptTokens));
853|          response.setHeader('x-freeroute-completion-tokens', String(usage.completionTokens));
854|          response.setHeader('x-freeroute-total-tokens', String(usage.totalTokens));
855|        }
856|        sendJson(response, 200, {
857|          id: result.response.id,
858|          object: 'chat.completion',
859|          created: Math.floor(Date.now() / 1_000),
860|          model: `${result.response.providerId}/${result.response.modelId}`,
861|          choices: [{ index: 0, message: { role: 'assistant', content: result.response.content || null, ...(result.response.toolCalls?.length ? { tool_calls: result.response.toolCalls } : {}) }, finish_reason: result.response.toolCalls?.length ? 'tool_calls' : 'stop' }],
862|          usage: usage ? { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.totalTokens } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
863|        });
864|        if (options.events && usage) {
865|          await options.events.record({
866|            requestId,
867|            occurredAt: new Date(),
868|            profile: target.profile,
869|            providerId: result.decision.candidate.providerId,
870|            modelId: result.response.modelId,
871|            credentialRef: result.decision.candidate.credentialId ? '***' : '',
872|            fallbackCount: result.fallbackCount ?? 0,
873|            outcome: 'success',
874|            latencyMs: 0,
875|            promptTokens: usage.promptTokens,
876|            completionTokens: usage.completionTokens,
877|            totalTokens: usage.totalTokens,
878|          });
879|        }
880|        return;
881|      }
882|
883|      if (request.method === 'POST' && path === '/v1/responses') {
884|        if (!options.chat) { sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } }); return; }
885|        const input = await readResponsesRequest(request);
886|        const target = parseRequestedModel(input.model);
887|        const requestId = crypto.randomUUID();
888|        response.setHeader('x-freeroute-request-id', requestId);
889|        if (input.stream) {
890|          const result = await options.chat.stream({
891|            profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), true, input.responseFormat), requestedProviderId: target.providerId,
892|            requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
893|          });
894|          const model = `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`;
895|          const responseId = `resp_${requestId}`;
896|          response.writeHead(200, {
897|            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
898|            'x-freeroute-provider': result.decision.candidate.providerId,
899|            'x-freeroute-model': result.decision.candidate.modelId,
900|          });
901|          writeResponseEvent(response, 'response.created', { type: 'response.created', response: { id: responseId, object: 'response', created_at: Math.floor(Date.now() / 1_000), status: 'in_progress', model } });
902|          let outputIndex = 0;
903|          for await (const event of result.events) {
904|            if (event.delta) writeResponseEvent(response, 'response.output_text.delta', { type: 'response.output_text.delta', response_id: responseId, item_id: `msg_${responseId}`, output_index: outputIndex, content_index: 0, delta: event.delta });
905|            if (event.finishReason) outputIndex += 1;
906|          }
907|          writeResponseEvent(response, 'response.completed', { type: 'response.completed', response: { id: responseId, object: 'response', created_at: Math.floor(Date.now() / 1_000), status: 'completed', model } });
908|          response.end('data: [DONE]\n\n');
909|          // Record event for streaming /v1/responses success
910|          if (options.events) {
911|            await options.events.record({
912|              requestId,
913|              occurredAt: new Date(),
914|              profile: target.profile,
915|              providerId: result.decision.candidate.providerId,
916|              modelId: result.decision.candidate.modelId,
917|              credentialRef: result.decision.candidate.credentialId ? '***' : '',
918|              fallbackCount: result.fallbackCount ?? 0,
919|              outcome: 'success',
920|              latencyMs: 0,
921|              promptTokens: 0,
922|              completionTokens: 0,
923|              totalTokens: 0,
924|            });
925|          }
926|          return;
927|        }
928|        const result = await options.chat.complete({
929|          profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), false, input.responseFormat), requestedProviderId: target.providerId,
930|          requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
931|        });
932|        response.setHeader('x-freeroute-provider', result.response.providerId);
933|        response.setHeader('x-freeroute-model', result.response.modelId);
934|        response.setHeader('x-freeroute-fallback-count', String(result.fallbackCount));
935|        sendJson(response, 200, {
936|          id: result.response.id, object: 'response', created_at: Math.floor(Date.now() / 1_000), status: 'completed',
937|          model: `${result.response.providerId}/${result.response.modelId}`,
938|          output: [{ type: 'message', id: `msg_${result.response.id}`, status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: result.response.content, annotations: [] }] }],
939|          output_text: result.response.content,
940|        });
941|        // Record event for non-streaming /v1/responses success
942|        if (options.events) {
943|          await options.events.record({
944|            requestId,
945|            occurredAt: new Date(),
946|            profile: target.profile,
947|            providerId: result.response.providerId,
948|            modelId: result.response.modelId,
949|            credentialRef: result.decision?.candidate?.credentialId ? '***' : '',
950|            fallbackCount: result.fallbackCount ?? 0,
951|            outcome: 'success',
952|            latencyMs: 0,
953|            promptTokens: 0,
954|            completionTokens: 0,
955|            totalTokens: 0,
956|          });
957|        }
958|        return;
959|      }
960|
961|      if (request.method === 'POST' && path === '/v1/messages') {
962|        if (!options.chat) { sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } }); return; }
963|        const input = await readAnthropicMessagesRequest(request);
964|        const target = parseRequestedModel(input.model);
965|        const requestId = crypto.randomUUID();
966|        response.setHeader('x-freeroute-request-id', requestId);
967|        if (input.stream) {
968|          const result = await options.chat.stream({
969|            profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), true, input.responseFormat), requestedProviderId: target.providerId,
970|            requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
971|          });
972|          const model = `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`;
973|          const messageId = `msg_${requestId}`;
974|          response.writeHead(200, {
975|            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
976|            'x-freeroute-provider': result.decision.candidate.providerId,
977|            'x-freeroute-model': result.decision.candidate.modelId,
978|          });
979|          writeAnthropicEvent(response, 'message_start', { type: 'message_start', message: { id: messageId, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
980|          writeAnthropicEvent(response, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
981|          for await (const event of result.events) {
982|            if (event.delta) writeAnthropicEvent(response, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: event.delta } });
983|          }
984|          writeAnthropicEvent(response, 'content_block_stop', { type: 'content_block_stop', index: 0 });
985|          writeAnthropicEvent(response, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } });
986|          writeAnthropicEvent(response, 'message_stop', { type: 'message_stop' });
987|          response.end();
988|          // Record event for streaming /v1/messages success
989|          if (options.events) {
990|            await options.events.record({
991|              requestId,
992|              occurredAt: new Date(),
993|              profile: target.profile,
994|              providerId: result.decision.candidate.providerId,
995|              modelId: result.decision.candidate.modelId,
996|              credentialRef: result.decision.candidate.credentialId ? '***' : '',
997|              fallbackCount: result.fallbackCount ?? 0,
998|              outcome: 'success',
999|              latencyMs: 0,
1000|              promptTokens: 0,
1001|              completionTokens: 0,
1002|              totalTokens: 0,
1003|            });
1004|          }
1005|          return;
1006|        }
1007|        const result = await options.chat.complete({
1008|          profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), false, input.responseFormat), requestedProviderId: target.providerId,
1009|          requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
1010|        });
1011|        response.setHeader('x-freeroute-provider', result.response.providerId);
1012|        response.setHeader('x-freeroute-model', result.response.modelId);
1013|        response.setHeader('x-freeroute-fallback-count', String(result.fallbackCount));
1014|        sendJson(response, 200, {
1015|          id: `msg_${result.response.id}`, type: 'message', role: 'assistant', model: `${result.response.providerId}/${result.response.modelId}`,
1016|          content: [{ type: 'text', text: result.response.content }], stop_reason: 'end_turn', stop_sequence: null,
1017|          usage: { input_tokens: 0, output_tokens: 0 },
1018|        });
1019|        // Record event for non-streaming /v1/messages success
1020|        if (options.events) {
1021|          await options.events.record({
1022|            requestId,
1023|            occurredAt: new Date(),
1024|            profile: target.profile,
1025|            providerId: result.response.providerId,
1026|            modelId: result.response.modelId,
1027|            credentialRef: result.decision?.candidate?.credentialId ? '***' : '',
1028|            fallbackCount: result.fallbackCount ?? 0,
1029|            outcome: 'success',
1030|            latencyMs: 0,
1031|            promptTokens: 0,
1032|            completionTokens: 0,
1033|            totalTokens: 0,
1034|          });
1035|        }
1036|        return;
1037|      }
1038|
1039|      sendJson(response, 404, { error: { message: 'not found', type: 'invalid_request_error' } });
1040|    } catch (error) {
1041|      if (response.headersSent) {
1042|        try { response.end(); } catch {}
1043|        return;
1044|      }
1045|      if (error instanceof Error && error.message.includes('Ngữ cảnh hội thoại vượt quá giới hạn token')) {
1046|        sendJson(response, 400, {
1047|          error: {
1048|            message: error.message,
1049|            type: 'context_length_exceeded',
1050|            code: 'context_length_exceeded',
1051|          },
1052|        });
1053|        return;
1054|      }
1055|      if (error instanceof NoRouteCandidatesError) {
1056|        const diagnostics = getCandidateDiagnostics(error.request, error.candidates);
1057|        sendJson(response, 503, {
1058|          error: {
1059|            message: 'Chưa có API key nào khả dụng cho profile/model này (hoặc tất cả upstream đều lỗi). Vui lòng truy cập http://127.0.0.1:8787 để kiểm tra hoặc thêm key! / No active route candidates available. Please open http://127.0.0.1:8787 to configure credentials.',
1060|            type: 'no_route_candidates',
1061|            code: 'no_candidates',
1062|            diagnostics: diagnostics.length ? diagnostics.slice(0, 20) : undefined,
1063|          },
1064|        });
1065|        return;
1066|      }
1067|      if (error instanceof Error && error.message === 'no eligible route candidates') {
1068|        sendJson(response, 503, {
1069|          error: {
1070|            message: 'Chưa có API key nào khả dụng cho profile/model này (hoặc tất cả upstream đều lỗi). Vui lòng truy cập http://127.0.0.1:8787 để kiểm tra hoặc thêm key! / No active route candidates available. Please open http://127.0.0.1:8787 to configure credentials.',
1071|            type: 'no_route_candidates',
1072|            code: 'no_candidates',
1073|          },
1074|        });
1075|        return;
1076|      }
1077|      if (error instanceof ProviderInvocationError) {
1078|        response.setHeader('x-freeroute-failure-kind', error.failure.kind);
1079|        if (error.failure.kind === 'context_overflow') {
1080|          sendJson(response, 400, {
1081|            error: {
1082|              message: error.message,
1083|              type: 'context_length_exceeded',
1084|              code: 'context_length_exceeded',
1085|            },
1086|          });
1087|          return;
1088|        }
1089|        sendJson(response, error.failure.kind === 'authentication' ? 401 : 502, {
1090|          error: {
1091|            message: `Tất cả nhà cung cấp dự phòng đều thất bại: ${error.message} / All upstream fallback routes failed: ${error.message}`,
1092|            type: error.failure.kind === 'authentication' ? 'authentication_error' : 'upstream_error',
1093|            code: 'upstream_failed',
1094|          },
1095|        });
1096|        return;
1097|      }
1098|      if (error instanceof InvalidChatRequestError) {
1099|        sendJson(response, 400, { error: { message: error.message, type: 'invalid_request_error' } });
1100|        return;
1101|      }
1102|      console.error('SERVER CHAT ERROR:', error);
1103|      sendJson(response, 500, {
1104|        error: {
1105|          message: error instanceof Error ? error.message : 'internal server error',
1106|          type: 'server_error',
1107|        },
1108|      });
1109|    }
1110|  });
1111|}
1112|
1113|export interface OpenAIChatRequest {
1114|  model: string;
1115|  messages: ChatMessage[];
1116|  temperature?: number;
1117|  stream?: boolean;
1118|  tools?: import('./inference.js').ToolDefinition[];
1119|  responseFormat?: { type: 'json_object' };
1120|  hasVision?: boolean;
1121|}
1122|
1123|class InvalidChatRequestError extends Error {}
1124|
1125|function capabilitiesForProfile(profile: string, hasTools: boolean, streaming = false, responseFormat?: { type: 'json_object' }, hasVision = false): import('./contracts.js').Capability[] {
1126|  const caps: import('./contracts.js').Capability[] = ['chat'];
1127|  if (streaming) caps.push('streaming');
1128|  if (hasTools || profile === 'auto:code') caps.push('tools');
1129|  if (responseFormat) caps.push('structured-output');
1130|  if (hasVision) caps.push('vision');
1131|  return caps;
1132|}
1133|
1134|async function readChatRequest(request: IncomingMessage): Promise<OpenAIChatRequest> {
1135|  const body = await readJsonBody(request);
1136|  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
1137|  const value = body as { model?: unknown; messages?: unknown; temperature?: unknown; stream?: unknown; tools?: unknown; response_format?: unknown };
1138|  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
1139|  if (!Array.isArray(value.messages) || !value.messages.every(isChatMessage)) throw new InvalidChatRequestError('messages must contain role and valid content');
1140|  if (value.temperature !== undefined && typeof value.temperature !== 'number') throw new InvalidChatRequestError('temperature must be a number');
1141|  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
1142|  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(isToolDefinition))) throw new InvalidChatRequestError('tools must be OpenAI function definitions');
1143|  if (value.response_format !== undefined && (typeof value.response_format !== 'object' || !value.response_format || (value.response_format as { type?: unknown }).type !== 'json_object')) throw new InvalidChatRequestError('response_format must be { type: "json_object" }');
1144|  const hasVision = (value.messages as unknown[]).some(msg => {
1145|    if (!msg || typeof msg !== 'object') return false;
1146|    const m = msg as { content?: unknown };
1147|    return Array.isArray(m.content);
1148|  });
1149|  return { model: value.model, messages: value.messages, temperature: value.temperature, stream: value.stream, tools: value.tools, responseFormat: value.response_format as { type: 'json_object' } | undefined, hasVision };
1150|}
1151|
1152|async function readResponsesRequest(request: IncomingMessage): Promise<{ model: string; messages: ChatMessage[]; stream?: boolean; tools?: import('./inference.js').ToolDefinition[]; responseFormat?: { type: 'json_object' } }> {
1153|  const body = await readJsonBody(request);
1154|  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
1155|  const value = body as { model?: unknown; input?: unknown; stream?: unknown; tools?: unknown; response_format?: unknown };
1156|  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
1157|  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
1158|  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(isToolDefinition))) throw new InvalidChatRequestError('tools must be OpenAI function definitions');
1159|  if (value.response_format !== undefined && (typeof value.response_format !== 'object' || !value.response_format || (value.response_format as { type?: unknown }).type !== 'json_object')) throw new InvalidChatRequestError('response_format must be { type: "json_object" }');
1160|  if (typeof value.input === 'string') return { model: value.model, messages: [{ role: 'user', content: value.input }], stream: value.stream, tools: value.tools, responseFormat: value.response_format as { type: 'json_object' } | undefined };
1161|  if (Array.isArray(value.input) && value.input.every(isResponsesMessage)) {
1162|    return {
1163|      model: value.model,
1164|      messages: value.input.map((message) => {
1165|        if (isChatMessage(message)) return message;
1166|        const m = message as { role: ChatMessage['role']; content: unknown };
1167|        return { role: m.role, content: extractResponsesText(m.content) };
1168|      }),
1169|      stream: value.stream,
1170|      tools: value.tools,
1171|      responseFormat: value.response_format as { type: 'json_object' } | undefined,
1172|    };
1173|  }
1174|  throw new InvalidChatRequestError('input must be a string or messages with role and string content');
1175|}
1176|
1177|async function readAnthropicMessagesRequest(request: IncomingMessage): Promise<{ model: string; messages: ChatMessage[]; stream?: boolean; tools?: import('./inference.js').ToolDefinition[]; responseFormat?: { type: 'json_object' } }> {
1178|  const body = await readJsonBody(request);
1179|  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
1180|  const value = body as { model?: unknown; system?: unknown; messages?: unknown; stream?: unknown; tools?: unknown; response_format?: unknown };
1181|  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
1182|  if (value.system !== undefined && typeof value.system !== 'string') throw new InvalidChatRequestError('system must be a string');
1183|  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
1184|  if (!Array.isArray(value.messages) || !value.messages.every(isAnthropicMessage)) throw new InvalidChatRequestError('messages must contain user or assistant roles and string content');
1185|  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(isAnthropicToolDefinition))) throw new InvalidChatRequestError('tools must be Anthropic tool definitions');
1186|  if (value.response_format !== undefined && (typeof value.response_format !== 'object' || !value.response_format || (value.response_format as { type?: unknown }).type !== 'json_object')) throw new InvalidChatRequestError('response_format must be { type: "json_object" }');
1187|  const messages: ChatMessage[] = value.system ? [{ role: 'system', content: value.system }] : [];
1188|  messages.push(...value.messages.map((message) => ({ role: message.role, content: message.content })));
1189|  return { model: value.model, messages, stream: value.stream, tools: value.tools ? value.tools.map(toOpenAITool) : undefined, responseFormat: value.response_format as { type: 'json_object' } | undefined };
1190|}
1191|
1192|function isAnthropicToolDefinition(value: unknown): boolean {
1193|  if (!value || typeof value !== 'object') return false;
1194|  const tool = value as { name?: unknown };
1195|  return typeof tool.name === 'string' && tool.name.length > 0;
1196|}
1197|
1198|function toOpenAITool(value: unknown): import('./inference.js').ToolDefinition {
1199|  const tool = value as { name: string; description?: unknown; input_schema?: unknown };
1200|  return {
1201|    type: 'function',
1202|    function: {
1203|      name: tool.name,
1204|      ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
1205|      ...(tool.input_schema !== undefined ? { parameters: tool.input_schema } : {}),
1206|    },
1207|  };
1208|}
1209|
1210|async function readPreferenceRequest(request: IncomingMessage): Promise<{ providerId: string; modelId: string; preference: Preference }> {
1211|  const body = await readJsonBody(request);
1212|  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
1213|  const value = body as { provider_id?: unknown; model_id?: unknown; preference?: unknown };
1214|  if (typeof value.provider_id !== 'string' || !value.provider_id || typeof value.model_id !== 'string' || !value.model_id) throw new InvalidChatRequestError('provider_id and model_id are required');
1215|  if (value.preference !== 'prefer' && value.preference !== 'neutral' && value.preference !== 'limit' && value.preference !== 'block') throw new InvalidChatRequestError('preference must be prefer, neutral, limit, or block');
1216|  return { providerId: value.provider_id, modelId: value.model_id, preference: value.preference };
1217|}
1218|
1219|async function readJsonBody(request: IncomingMessage): Promise<unknown> {
1220|  const chunks: Buffer[] = [];
1221|  let length = 0;
1222|  for await (const chunk of request) {
1223|    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
1224|    length += value.length;
1225|    if (length > 1_000_000) throw new InvalidChatRequestError('request body exceeds 1 MB');
1226|    chunks.push(value);
1227|  }
1228|  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InvalidChatRequestError('request body must be valid JSON'); }
1229|}
1230|
1231|function isResponsesMessage(value: unknown): boolean {
1232|  return isChatMessage(value) || isResponsesArrayMessage(value);
1233|}
1234|
1235|function isResponsesArrayMessage(value: unknown): boolean {
1236|  if (!value || typeof value !== 'object') return false;
1237|  const message = value as { role?: unknown; content?: unknown };
1238|  if (message.role !== 'user' && message.role !== 'system' && message.role !== 'assistant' && message.role !== 'tool') return false;
1239|  return Array.isArray(message.content) && message.content.every((part) => isResponsesContentPart(part));
1240|}
1241|
1242|function isResponsesContentPart(value: unknown): boolean {
1243|  if (!value || typeof value !== 'object') return false;
1244|  const part = value as { type?: unknown; text?: unknown };
1245|  return part.type === 'input_text' || part.type === 'output_text' || part.type === 'text'
1246|    ? typeof part.text === 'string'
1247|    : true; // ponytail: future part types (image, audio) pass through; downstream provider rejects if unsupported
1248|}
1249|
1250|function extractResponsesText(content: unknown): string {
1251|  if (typeof content === 'string') return content;
1252|  if (Array.isArray(content)) {
1253|    return content.map((part) => {
1254|      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
1255|        return (part as { text: string }).text;
1256|      }
1257|      return '';
1258|    }).join('');
1259|  }
1260|  return '';
1261|}
1262|
1263|function isAnthropicMessage(value: unknown): value is ChatMessage {
1264|  if (!isChatMessage(value)) return false;
1265|  if (value.role !== 'user' && value.role !== 'assistant') return false;
1266|  // ponytail: vision content parts not yet supported for Anthropic Messages API
1267|  return typeof value.content === 'string';
1268|}
1269|
1270|function isChatMessage(value: unknown): value is ChatMessage {
1271|  if (!value || typeof value !== 'object') return false;
1272|  const message = value as { role?: unknown; content?: unknown; tool_calls?: unknown; tool_call_id?: unknown };
1273|  if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant' && message.role !== 'tool') return false;
1274|  // Assistant messages with tool_calls may have content === null (OpenAI spec)
1275|  if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.content === null) return true;
1276|  // Tool result messages
1277|  if (message.role === 'tool') return typeof message.tool_call_id === 'string' && (typeof message.content === 'string' || message.content === null);
1278|  if (typeof message.content === 'string') return true;
1279|  if (Array.isArray(message.content)) {
1280|    return message.content.every(part => {
1281|      if (!part || typeof part !== 'object') return false;
1282|      if (part.type === 'text') return typeof (part as { text?: unknown }).text === 'string';
1283|      if (part.type === 'image_url') return typeof (part as { image_url?: unknown }).image_url === 'object';
1284|      return false;
1285|    });
1286|  }
1287|  return false;
1288|}
1289|
1290|function isToolDefinition(value: unknown): value is import('./inference.js').ToolDefinition {
1291|  if (!value || typeof value !== 'object') return false;
1292|  const tool = value as { type?: unknown; function?: { name?: unknown } };
1293|  return tool.type === 'function' && typeof tool.function?.name === 'string' && tool.function.name.length > 0;
1294|}
1295|
1296|export function expandComboModels(
1297|  models: string[],
1298|  comboStore?: import('./storage/sqlite-combo-store.js').SqliteComboStore,
1299|  visited = new Set<string>()
1300|): string[] {
1301|  const result: string[] = [];
1302|  if (!comboStore) return models;
1303|
1304|  for (const m of models) {
1305|    const trimmed = m.trim();
1306|    let subComboId: string | null = null;
1307|    if (trimmed.startsWith('combo:')) {
1308|      subComboId = trimmed.slice('combo:'.length).trim();
1309|    } else if (comboStore.get(trimmed)) {
1310|      subComboId = trimmed;
1311|    }
1312|
1313|    if (subComboId) {
1314|      if (visited.has(subComboId)) {
1315|        // Cycle detected: skip to prevent infinite recursion
1316|        continue;
1317|      }
1318|      const nextVisited = new Set(visited);
1319|      nextVisited.add(subComboId);
1320|      const subCombo = comboStore.get(subComboId);
1321|      if (subCombo && subCombo.models && subCombo.models.length > 0) {
1322|        const expanded = expandComboModels(subCombo.models, comboStore, nextVisited);
1323|        result.push(...expanded);
1324|      }
1325|    } else {
1326|      result.push(trimmed);
1327|    }
1328|  }
1329|  return result;
1330|}
1331|
1332|export function parseRequestedModel(model: string, comboStore?: import('./storage/sqlite-combo-store.js').SqliteComboStore): { profile: string; providerId?: string; modelId?: string; comboModels?: string[] } {
1333|  const trimmed = model.trim();
1334|  if (trimmed.startsWith('auto:')) return { profile: trimmed };
1335|  if (trimmed.startsWith('combo:')) {
1336|    const cId = trimmed.slice('combo:'.length).trim();
1337|    const combo = comboStore?.get(cId);
1338|    if (combo && combo.models.length > 0) {
1339|      return { profile: 'combo', comboModels: expandComboModels(combo.models, comboStore, new Set([cId])) };
1340|    }
1341|  }
1342|  if (comboStore) {
1343|    const combo = comboStore.get(trimmed);
1344|    if (combo && combo.models.length > 0) {
1345|      return { profile: 'combo', comboModels: expandComboModels(combo.models, comboStore, new Set([trimmed])) };
1346|    }
1347|  }
1348|
1349|  // Handle provider aliases where models start with known short prefixes
1350|  if (trimmed.startsWith('ag/')) {
1351|    return { profile: 'named', providerId: 'antigravity', modelId: trimmed };
1352|  }
1353|  if (trimmed.startsWith('cl/')) {
1354|    return { profile: 'named', providerId: 'cline', modelId: trimmed };
1355|  }
1356|  if (trimmed.startsWith('kr/')) {
1357|    return { profile: 'named', providerId: 'kiro', modelId: trimmed };
1358|  }
1359|
1360|  const separator = trimmed.indexOf('/');
1361|  if (separator > 0 && separator < trimmed.length - 1) {
1362|    return { profile: 'named', providerId: trimmed.slice(0, separator), modelId: trimmed.slice(separator + 1) };
1363|  }
1364|  return { profile: 'named', modelId: trimmed };
1365|}
1366|
1367|function isAuthorized(request: IncomingMessage, expectedToken: string | undefined): boolean {
1368|  if (!expectedToken) return true;
1369|  return request.headers.authorization === `Bearer ${expectedToken}`;
1370|}
1371|
1372|function sendJson(response: ServerResponse, status: number, body: unknown): void {
1373|  if (response.headersSent) {
1374|    try { response.end(); } catch {}
1375|    return;
1376|  }
1377|  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
1378|  response.end(JSON.stringify(body));
1379|}
1380|
1381|function sendHtml(response: ServerResponse, body: string): void {
1382|  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
1383|  response.end(body);
1384|}
1385|
1386|function writeResponseEvent(response: ServerResponse, event: string, body: unknown): void {
1387|  response.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
1388|}
1389|
1390|function writeAnthropicEvent(response: ServerResponse, event: string, body: unknown): void {
1391|  response.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
1392|}
1393|
1394|
1395|
1396|function summarizeProviderHealth(events: Array<{ providerId: string; outcome: 'success' | 'failure'; latencyMs?: number }>): Array<{ providerId: string; requestCount: number; successRate: number; latencyP50Ms?: number; latencyP95Ms?: number }> {
1397|  const totals = new Map<string, { requestCount: number; successes: number; latencies: number[] }>();
1398|  for (const event of events) {
1399|    const total = totals.get(event.providerId) ?? { requestCount: 0, successes: 0, latencies: [] };
1400|    total.requestCount += 1;
1401|    if (event.outcome === 'success') total.successes += 1;
1402|    if (event.latencyMs !== undefined) total.latencies.push(event.latencyMs);
1403|    totals.set(event.providerId, total);
1404|  }
1405|  return [...totals].map(([providerId, total]) => ({ providerId, requestCount: total.requestCount, successRate: total.successes / total.requestCount, ...(total.latencies.length ? { latencyP50Ms: percentile(total.latencies, 0.5), latencyP95Ms: percentile(total.latencies, 0.95) } : {}) }))
1406|    .sort((left, right) => right.successRate - left.successRate || right.requestCount - left.requestCount || left.providerId.localeCompare(right.providerId));
1407|}
1408|
1409|function percentile(values: number[], ratio: number): number {
1410|  const sorted = [...values].sort((left, right) => left - right);
1411|  return sorted[Math.ceil(sorted.length * ratio) - 1]!;
1412|}
1413|
```
### 3. Code processing 'combo:xxx' request from D:/FreeRoute/src/router.ts
```typescript

```
### 4. Code calling `credentialStore.get()` before provider call
0 matches

## PHẦN B — 9router Grep Results
### 5. Grep for `getProviderCredentials` (D:/9router/open-sse/)
0 matches
### 6. Grep for `handleComboChat` (D:/9router/open-sse/)
D:/9router/open-sse\services\compact.js:34: export async function handleComboChat({ body, models, handleSingleModel, log }) {
D:/9router/open-sse\services\combo.js:229: export async function handleComboChat({ body, models, handleSingleModel, log, comboName, comboStrategy, comboStickyLimit = 1, autoSwitch = true }) {

## 7. Verbatim 9router Functions
### Function: `getProviderCredentials` from D:/9router/open-sse/services/auth.js
```javascript
ERROR: getProviderCredentials not found in D:/9router/open-sse/services/auth.js
```
### Function: `handleComboChat` from D:/9router/open-sse/services/combo.js
```javascript
229| 229|export async function handleComboChat({ body, models, handleSingleModel, log, comboName, comboStrategy, comboStickyLimit = 1, autoSwitch = true }) {
230| 230|  // Apply rotation strategy if enabled
231| 231|  let rotatedModels = getRotatedModels(models, comboName, comboStrategy, comboStickyLimit);
232| 232|
233| 233|  // Auto-switch: float models that satisfy the request's required capabilities to the front.
234| 234|  if (autoSwitch) {
235| 235|    const required = detectRequiredCapabilities(body);
236| 236|    if (required.size > 0) {
237| 237|      const reordered = reorderByCapabilities(rotatedModels, required);
238| 238|      if (reordered[0] !== rotatedModels[0]) {
239| 239|        log.info("COMBO", `auto-switch for [${[...required].join(",")}] → ${reordered[0]}`);
240| 240|      }
241| 241|      rotatedModels = reordered;
242| 242|    }
243| 243|  }
244| 244|  
245| 245|  let lastError = null;
246| 246|  let earliestRetryAfter = null;
247| 247|  let lastStatus = null;
248| 248|
249| 249|  for (let i = 0; i < rotatedModels.length; i++) {
250| 250|    const modelStr = rotatedModels[i];
251| 251|    log.info("COMBO", `Trying model ${i + 1}/${rotatedModels.length}: ${modelStr}`);
252| 252|
253| 253|    try {
254| 254|      const result = await handleSingleModel(body, modelStr);
255| 255|      
256| 256|      // Success (2xx) - return response
257| 257|      if (result.ok) {
258| 258|        log.info("COMBO", `Model ${modelStr} succeeded`);
259| 259|        return result;
260| 260|      }
261| 261|
262| 262|      // Extract error info from response
263| 263|      let errorText = result.statusText || "";
264| 264|      let retryAfter = null;
265| 265|      try {
266| 266|        const errorBody = await result.clone().json();
267| 267|        errorText = errorBody?.error?.message || errorBody?.error || errorBody?.message || errorText;
268| 268|        retryAfter = errorBody?.retryAfter || null;
269| 269|      } catch {
270| 270|        // Ignore JSON parse errors
271| 271|      }
272| 272|
273| 273|      // Track earliest retryAfter across all combo models
274| 274|      if (retryAfter && (!earliestRetryAfter || new Date(retryAfter) < new Date(earliestRetryAfter))) {
275| 275|        earliestRetryAfter = retryAfter;
276| 276|      }
277| 277|
278| 278|      // Normalize error text to string (Worker-safe)
279| 279|      if (typeof errorText !== "string") {
280| 280|        try { errorText = JSON.stringify(errorText); } catch { errorText = String(errorText); }
281| 281|      }
282| 282|
283| 283|      // Check if should fallback to next model
284| 284|      const { shouldFallback, cooldownMs } = checkFallbackError(result.status, errorText);
285| 285|
286| 286|      if (!shouldFallback) {
287| 287|        log.warn("COMBO", `Model ${modelStr} failed (no fallback)`, { status: result.status });
288| 288|        return result;
289| 289|      }
290| 290|
291| 291|      // For transient errors (503/502/504), wait for cooldown before falling through
292| 292|      // so a briefly-overloaded provider gets a chance to recover rather than being
293| 293|      // skipped immediately (fixes: combo falls through on transient 503)
294| 294|      if (cooldownMs && cooldownMs > 0 && cooldownMs <= 5000 &&
295| 295|          (result.status === 503 || result.status === 502 || result.status === 504)) {
296| 296|        log.info("COMBO", `Model ${modelStr} transient ${result.status}, waiting ${cooldownMs}ms before next`);
297| 297|        await new Promise(r => setTimeout(r, cooldownMs));
298| 298|      }
299| 299|
300| 300|      // Fallback to next model
301| 301|      lastError = errorText || String(result.status);
302| 302|      if (!lastStatus) lastStatus = result.status;
303| 303|      log.warn("COMBO", `Model ${modelStr} failed, trying next`, { status: result.status });
304| 304|    } catch (error) {
305| 305|      // Catch unexpected exceptions to ensure fallback continues
306| 306|      lastError = error.message || String(error);
307| 307|      if (!lastStatus) lastStatus = 500;
308| 308|      log.warn("COMBO", `Model ${modelStr} threw error, trying next`, { error: lastError });
309| 309|    }
310| 310|  }
311| 311|
312| 312|  // All models failed
313| 313|  // Use 503 (Service Unavailable) rather than 406 (Not Acceptable) — 406 implies
314| 314|  // the request itself is invalid, but here the providers are simply unavailable
315| 315|  // or have no active credentials. 503 is more accurate and retryable by clients.
316| 316|  const allDisabled = lastError && lastError.toLowerCase().includes("no credentials");
317| 317|  const status = allDisabled ? 503 : (lastStatus || 503);
318| 318|  const msg = lastError || "All combo models unavailable";
319| 319|
320| 320|  if (earliestRetryAfter) {
321| 321|    const retryHuman = formatRetryAfter(earliestRetryAfter);
322| 322|    log.warn("COMBO", `All models failed | ${msg} (${retryHuman})`);
323| 323|    return unavailableResponse(status, msg, earliestRetryAfter, retryHuman);
324| 324|  }
325| 325|
326| 326|  log.warn("COMBO", `All models failed | ${msg}`);
327| 327|  return new Response(
328| 328|    JSON.stringify({ error: { message: msg } }),
329| 329|    { status, headers: { "Content-Type": "application/json" } }
330| 330|  );
331| 331|}
```
