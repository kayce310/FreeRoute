import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { CatalogStore } from './catalog.js';
import { ChatService, ProviderInvocationError, NoRouteCandidatesError, type ChatMessage } from './inference.js';
import { getCandidateDiagnostics } from './router.js';
import { estimateTokensFromText } from './utils/token-estimator.js';
import type { SqliteRoutingEventStore } from './storage/sqlite-routing-event-store.js';
import type { SqliteQuotaObservationStore } from './storage/sqlite-quota-observation-store.js';
import type { SqlitePreferenceStore } from './storage/sqlite-preference-store.js';
import type { SqliteCredentialStore } from './storage/sqlite-credential-store.js';
import type { SqliteProviderStore } from './storage/sqlite-provider-store.js';
import type { SqliteComboStore } from './storage/sqlite-combo-store.js';
import type { Preference, ModelRecord } from './contracts.js';
import { dashboardHtml } from './dashboard.js';
import { PROVIDER_PRESETS } from './presets.js';

export interface FreeRouteServerOptions {
  catalog: CatalogStore;
  apiToken?: string; // optional — / and /health are public
  chat?: ChatService;
  events?: SqliteRoutingEventStore;
  quotas?: SqliteQuotaObservationStore;
  preferences?: SqlitePreferenceStore;
  credentials?: SqliteCredentialStore;
  providerStore?: SqliteProviderStore;
  combos?: SqliteComboStore;
  onCredentialChanged?: (providerId: string, credentialId: string) => Promise<void> | void;
  onProviderChanged?: (providerId: string) => Promise<void> | void;
}

export function createFreeRouteServer(options: FreeRouteServerOptions): Server {
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/') {
        if (request.method === 'HEAD') {
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          response.end();
          return;
        }
        sendHtml(response, dashboardHtml());
        return;
      }
      if ((request.method === 'GET' || request.method === 'HEAD') && path === '/health') {
        if (request.method === 'HEAD') {
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          response.end();
          return;
        }
        sendJson(response, 200, { status: 'ok' });
        return;
      }
      if (request.method === 'GET' && path === '/v1/auth/status') {
        const creds = options.credentials ? await options.credentials.list() : [];
        const keyCounts = options.credentials && typeof options.credentials.countByProvider === 'function'
          ? await options.credentials.countByProvider()
          : {};
        const customProviders = options.providerStore?.list().map((p) => p.providerId) ?? [];
        const supported = ['openrouter', 'groq', 'gemini', ...customProviders];
        sendJson(response, 200, {
          status: 'ok',
          needsSetup: creds.length === 0,
          hasToken: Boolean(options.apiToken),
          configuredProviders: [...new Set(creds.map((c) => c.providerId))],
          configuredCount: new Set(creds.map((c) => c.providerId)).size,
          providerKeyCounts: keyCounts,
          supportedProviders: [...new Set(supported)],
          keyCount: creds.length,
        });
        return;
      }
      if (request.method === 'GET' && path === '/v1/providers/presets') {
        sendJson(response, 200, { object: 'list', data: PROVIDER_PRESETS });
        return;
      }
      if (request.method === 'GET' && path === '/v1/import/sources') {
        const { detectAllLocalCredentials } = await import('./importers/local-detect.js');
        const detected = detectAllLocalCredentials();
        const existingSecrets = options.credentials && typeof options.credentials.getAllSecrets === 'function'
          ? await options.credentials.getAllSecrets()
          : new Set<string>();
        const list = detected.map((d) => ({
          providerId: d.providerId,
          name: d.name,
          source: d.source,
          sourceLocation: d.sourceLocation,
          maskedKey: d.maskedKey,
          isActive: d.isActive,
          alreadyImported: existingSecrets.has(d.apiKey),
        }));
        const newKeysCount = list.filter((item) => !item.alreadyImported).length;
        sendJson(response, 200, {
          object: 'list',
          data: list,
          totalCount: list.length,
          newKeysCount,
        });
        return;
      }
      if (!isAuthorized(request, options.apiToken)) {
        sendJson(response, 401, { error: { message: 'invalid API key', type: 'authentication_error' } });
        return;
      }

      if (request.method === 'GET' && path === '/v1/models') {
        const models = await options.catalog.list();
        sendJson(response, 200, {
          object: 'list',
          data: models
            .filter((model) => model.freeTier !== 'retired')
            .map((model) => ({
              id: `${model.providerId}/${model.modelId}`,
              object: 'model',
              created: Math.floor(model.checkedAt.getTime() / 1000),
              owned_by: model.providerId,
              freeroute: {
                capabilities: model.capabilities,
                free_tier: model.freeTier,
              },
            })),
        });
        return;
      }

      if (request.method === 'GET' && path === '/v1/routing-events') {
        if (!options.events) { sendJson(response, 503, { error: { message: 'routing event storage is not configured', type: 'server_error' } }); return; }
        const events = await options.events.list();
        sendJson(response, 200, { object: 'list', data: events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })) });
        return;
      }

      if (request.method === 'GET' && path === '/v1/stats/tokens') {
        if (!options.events) { sendJson(response, 503, { error: { message: 'routing event storage is not configured', type: 'server_error' } }); return; }
        const stats = await options.events.tokenStats();
        sendJson(response, 200, { object: 'token_stats', ...stats });
        return;
      }

      if (request.method === 'GET' && path === '/v1/quota-observations') {
        if (!options.quotas) { sendJson(response, 503, { error: { message: 'quota observation storage is not configured', type: 'server_error' } }); return; }
        const observations = await options.quotas.list();
        sendJson(response, 200, { object: 'list', data: observations.map((item) => ({ ...item, observedAt: item.observedAt.toISOString(), resetAt: item.resetAt?.toISOString() })) });
        return;
      }

      if (request.method === 'GET' && path === '/v1/provider-health') {
        if (!options.events) { sendJson(response, 503, { error: { message: 'routing event storage is not configured', type: 'server_error' } }); return; }
        const health = summarizeProviderHealth(await options.events.list(10_000));
        sendJson(response, 200, { object: 'list', data: health });
        return;
      }

      if (request.method === 'GET' && path === '/v1/preferences') {
        if (!options.preferences) { sendJson(response, 503, { error: { message: 'preference storage is not configured', type: 'server_error' } }); return; }
        const preferences = await options.preferences.list();
        sendJson(response, 200, { object: 'list', data: preferences.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })) });
        return;
      }

      if (request.method === 'PUT' && path === '/v1/preferences') {
        if (!options.preferences) { sendJson(response, 503, { error: { message: 'preference storage is not configured', type: 'server_error' } }); return; }
        const input = await readPreferenceRequest(request);
        await options.preferences.set(input.providerId, input.modelId, input.preference);
        sendJson(response, 200, { provider_id: input.providerId, model_id: input.modelId, preference: input.preference });
        return;
      }

      if (request.method === 'GET' && path === '/v1/credentials') {
        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
        const creds = await options.credentials.list();
        sendJson(response, 200, {
          object: 'list',
          data: creds.map((c) => ({
            providerId: c.providerId,
            credentialId: c.credentialId,
            createdAt: c.createdAt.toISOString(),
            updatedAt: c.updatedAt.toISOString(),
          })),
        });
        return;
      }

      if (request.method === 'GET' && path === '/v1/credentials/export') {
        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
        const all = typeof options.credentials.exportAllWithSecrets === 'function'
          ? await options.credentials.exportAllWithSecrets()
          : [];
        const dateStr = new Date().toISOString().slice(0, 10);
        response.setHeader('Content-Disposition', `attachment; filename="freeroute-keys-backup-${dateStr}.json"`);
        sendJson(response, 200, {
          app: 'freeroute',
          version: 1,
          exportedAt: new Date().toISOString(),
          count: all.length,
          credentials: all,
        });
        return;
      }

      if (request.method === 'POST' && path === '/v1/credentials/import') {
        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
        const body = await readJsonBody(request) as {
          credentials?: Array<{ providerId?: string; provider_id?: string; credentialId?: string; credential_id?: string; secret?: string; apiKey?: string }>;
        } | Array<{ providerId?: string; provider_id?: string; credentialId?: string; credential_id?: string; secret?: string; apiKey?: string }>;
        
        const items = Array.isArray(body) ? body : (Array.isArray(body?.credentials) ? body.credentials : []);
        if (!items.length) {
          sendJson(response, 400, { error: { message: 'No valid credentials found in import payload', type: 'invalid_request_error' } });
          return;
        }

        const imported: string[] = [];
        for (const item of items) {
          const providerId = (item.providerId ?? item.provider_id)?.trim();
          const credentialId = (item.credentialId ?? item.credential_id)?.trim() || 'default';
          const secret = (item.secret ?? item.apiKey)?.trim();
          if (!providerId || !secret) continue;

          await options.credentials.put(providerId, credentialId, secret);

          // Auto-seed preset models
          const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
          if (preset && preset.seedModels.length > 0) {
            try {
              const existing = await options.catalog.list();
              if (!existing.some((m) => m.providerId === preset.id)) {
                const seedList = preset.seedModels.map((m) => ({
                  providerId: preset.id,
                  modelId: m.modelId,
                  capabilities: m.capabilities,
                  freeTier: m.freeTier,
                  checkedAt: new Date(),
                  priority: m.priority ?? 0,
                }));
                await options.catalog.replaceProvider(preset.id, seedList);
              }
            } catch {}
          }

          if (options.onCredentialChanged) {
            try { await options.onCredentialChanged(providerId, credentialId); } catch {}
          }
          imported.push(`${providerId}/${credentialId}`);
        }

        sendJson(response, 200, {
          status: 'ok',
          count: imported.length,
          imported,
        });
        return;
      }

      if (request.method === 'POST' && path === '/v1/credentials') {
        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
        const body = await readJsonBody(request) as { providerId?: unknown; provider_id?: unknown; credentialId?: unknown; credential_id?: unknown; secret?: unknown; apiKey?: unknown; api_key?: unknown };
        const providerId = (body.providerId ?? body.provider_id) as string | undefined;
        const credentialId = ((body.credentialId ?? body.credential_id) as string | undefined) || 'default';
        const secret = (body.secret ?? body.apiKey ?? body.api_key) as string | undefined;

        if (typeof providerId !== 'string' || !providerId.trim()) {
          sendJson(response, 400, { error: { message: 'providerId is required', type: 'invalid_request_error' } });
          return;
        }
        if (typeof secret !== 'string' || !secret.trim()) {
          sendJson(response, 400, { error: { message: 'secret is required', type: 'invalid_request_error' } });
          return;
        }

        await options.credentials.put(providerId.trim(), credentialId.trim(), secret.trim());

        // Auto-seed known models for this provider if not yet present in catalog
        const preset = PROVIDER_PRESETS.find((p) => p.id === providerId.trim());
        if (preset && preset.seedModels.length > 0) {
          try {
            const existing = await options.catalog.list();
            const hasModels = existing.some((m) => m.providerId === preset.id);
            if (!hasModels) {
              const seedList: ModelRecord[] = preset.seedModels.map((m) => ({
                providerId: preset.id,
                modelId: m.modelId,
                capabilities: m.capabilities,
                freeTier: m.freeTier,
                checkedAt: new Date(),
                priority: m.priority ?? 0,
              }));
              await options.catalog.replaceProvider(preset.id, seedList);
            }
          } catch {
            // Non-fatal if catalog seeding fails
          }
        }

        if (options.onCredentialChanged) {
          try {
            await options.onCredentialChanged(providerId.trim(), credentialId.trim());
          } catch {
            // Background refresh error should not fail the credential saving
          }
        }
        sendJson(response, 200, {
          status: 'ok',
          providerId: providerId.trim(),
          credentialId: credentialId.trim(),
        });
        return;
      }

      if (request.method === 'DELETE' && path === '/v1/credentials') {
        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credential storage is not configured', type: 'server_error' } }); return; }
        const url = new URL(request.url ?? '/', 'http://localhost');
        let providerId = url.searchParams.get('providerId') ?? url.searchParams.get('provider_id');
        let credentialId = url.searchParams.get('credentialId') ?? url.searchParams.get('credential_id') ?? 'default';

        if (!providerId) {
          const body = await readJsonBody(request).catch(() => ({})) as { providerId?: unknown; provider_id?: unknown; credentialId?: unknown; credential_id?: unknown };
          providerId = ((body.providerId ?? body.provider_id) as string | undefined) ?? null;
          credentialId = (((body.credentialId ?? body.credential_id) as string | undefined) || 'default');
        }

        if (!providerId || typeof providerId !== 'string') {
          sendJson(response, 400, { error: { message: 'providerId is required', type: 'invalid_request_error' } });
          return;
        }

        const deleted = await options.credentials.delete(providerId.trim(), credentialId.trim());
        if (options.onCredentialChanged) {
          try {
            await options.onCredentialChanged(providerId.trim(), credentialId.trim());
          } catch {
            // ignore
          }
        }
        sendJson(response, 200, { status: 'ok', deleted, providerId: providerId.trim(), credentialId: credentialId.trim() });
        return;
      }

      if (request.method === 'GET' && path === '/v1/providers/custom') {
        if (!options.providerStore) { sendJson(response, 503, { error: { message: 'provider storage is not configured', type: 'server_error' } }); return; }
        sendJson(response, 200, { object: 'list', data: options.providerStore.list() });
        return;
      }

      if (request.method === 'POST' && path === '/v1/providers/custom') {
        if (!options.providerStore) { sendJson(response, 503, { error: { message: 'provider storage is not configured', type: 'server_error' } }); return; }
        const body = await readJsonBody(request) as { providerId?: string; adapterType?: 'openai-compatible' | 'gemini'; baseUrl?: string; classifyAsFree?: string; enabled?: boolean };
        if (!body.providerId || !body.adapterType || !body.baseUrl) {
          sendJson(response, 400, { error: { message: 'providerId, adapterType, and baseUrl are required', type: 'invalid_request_error' } });
          return;
        }
        options.providerStore.put({
          providerId: body.providerId.trim(),
          adapterType: body.adapterType,
          baseUrl: body.baseUrl.trim(),
          classifyAsFree: body.classifyAsFree,
          enabled: body.enabled ?? true,
        });
        await options.onProviderChanged?.(body.providerId.trim());
        sendJson(response, 200, { status: 'ok', provider: body });
        return;
      }

      if (request.method === 'DELETE' && path === '/v1/providers/custom') {
        if (!options.providerStore) { sendJson(response, 503, { error: { message: 'provider storage is not configured', type: 'server_error' } }); return; }
        const url = new URL(request.url ?? '/', 'http://localhost');
        const providerId = url.searchParams.get('providerId') ?? url.searchParams.get('provider_id');
        if (!providerId) {
          sendJson(response, 400, { error: { message: 'providerId is required', type: 'invalid_request_error' } });
          return;
        }
        options.providerStore.remove(providerId);
        await options.onProviderChanged?.(providerId);
        sendJson(response, 200, { status: 'ok', providerId });
        return;
      }

      if (request.method === 'GET' && path === '/v1/combos') {
        const list = options.combos ? options.combos.list() : [];
        sendJson(response, 200, { object: 'list', data: list });
        return;
      }

      if (request.method === 'POST' && path === '/v1/combos') {
        if (!options.combos) {
          sendJson(response, 503, { error: { message: 'combo storage not configured', type: 'server_error' } });
          return;
        }
        const body = await readJsonBody(request) as { comboId?: string; id?: string; name?: string; models?: string[]; description?: string };
        const comboId = body.comboId ?? body.id;
        if (!comboId || typeof comboId !== 'string' || !comboId.trim()) {
          sendJson(response, 400, { error: { message: 'comboId is required', type: 'invalid_request_error' } });
          return;
        }
        if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
          sendJson(response, 400, { error: { message: 'name is required', type: 'invalid_request_error' } });
          return;
        }
        if (!Array.isArray(body.models) || body.models.length === 0) {
          sendJson(response, 400, { error: { message: 'models must be a non-empty array of model IDs', type: 'invalid_request_error' } });
          return;
        }
        const saved = options.combos.put({
          comboId: comboId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
          name: body.name.trim(),
          models: body.models.map((m) => String(m).trim()),
          description: body.description?.trim(),
        });
        sendJson(response, 200, { status: 'ok', combo: saved });
        return;
      }

      if (request.method === 'GET' && path.startsWith('/v1/combos/')) {
        if (!options.combos) { sendJson(response, 503, { error: { message: 'combo storage not configured', type: 'server_error' } }); return; }
        const comboId = decodeURIComponent(path.slice('/v1/combos/'.length));
        const item = options.combos.get(comboId);
        if (!item) { sendJson(response, 404, { error: { message: `Combo not found: ${comboId}`, type: 'invalid_request_error' } }); return; }
        sendJson(response, 200, item);
        return;
      }

      if (request.method === 'DELETE' && (path === '/v1/combos' || path.startsWith('/v1/combos/'))) {
        if (!options.combos) {
          sendJson(response, 503, { error: { message: 'combo storage not configured', type: 'server_error' } });
          return;
        }
        const url = new URL(request.url ?? '/', 'http://localhost');
        let comboId = path.startsWith('/v1/combos/') ? decodeURIComponent(path.slice('/v1/combos/'.length)) : (url.searchParams.get('comboId') ?? url.searchParams.get('id'));
        if (!comboId) {
          const body = await readJsonBody(request).catch(() => ({})) as { comboId?: unknown; id?: unknown };
          comboId = ((body.comboId ?? body.id) as string | undefined) ?? null;
        }
        if (!comboId || typeof comboId !== 'string') {
          sendJson(response, 400, { error: { message: 'comboId is required', type: 'invalid_request_error' } });
          return;
        }
        const deleted = options.combos.delete(comboId.trim());
        sendJson(response, 200, { status: 'ok', deleted, comboId: comboId.trim() });
        return;
      }

      if (request.method === 'POST' && path === '/v1/import/9router') {
        if (!options.credentials) { sendJson(response, 503, { error: { message: 'credentials store not configured', type: 'server_error' } }); return; }
        const body = await readJsonBody(request) as { sourceDatabasePath?: string; providerId?: string; credentialId?: string };
        if (!body.sourceDatabasePath || !body.providerId) {
          sendJson(response, 400, { error: { message: 'sourceDatabasePath and providerId are required', type: 'invalid_request_error' } });
          return;
        }
        const { importNineRouterApiKey } = await import('./importers/9router.js');
        try {
          const result = await importNineRouterApiKey({
            sourceDatabasePath: body.sourceDatabasePath,
            providerId: body.providerId,
            credentials: options.credentials,
            credentialId: body.credentialId,
          });
          if (options.onCredentialChanged) {
            void options.onCredentialChanged(result.providerId, result.credentialId);
          }
          sendJson(response, 200, { status: 'ok', ...result });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Import failed';
          sendJson(response, 400, { error: { message, type: 'import_error' } });
        }
        return;
      }

      if (request.method === 'POST' && path === '/v1/import/sync') {
        if (!options.credentials) {
          sendJson(response, 503, { error: { message: 'credentials store not configured', type: 'server_error' } });
          return;
        }
        const body = await readJsonBody(request).catch(() => ({})) as {
          providerIds?: string[];
          syncAll?: boolean;
          onlyNew?: boolean;
        };
        const { detectAllLocalCredentials } = await import('./importers/local-detect.js');
        const detected = detectAllLocalCredentials();
        const existingSecrets = options.credentials && typeof options.credentials.getAllSecrets === 'function'
          ? await options.credentials.getAllSecrets()
          : new Set<string>();

        const targets = detected.filter((d) => {
          if (body.syncAll) {
            if (body.onlyNew !== false && existingSecrets.has(d.apiKey)) return false;
            return true;
          }
          if (body.providerIds && Array.isArray(body.providerIds) && body.providerIds.length > 0) {
            return body.providerIds.includes(d.providerId);
          }
          if (body.onlyNew !== false && existingSecrets.has(d.apiKey)) return false;
          return true;
        });

        const imported: Array<{ providerId: string; credentialId: string; source: string; name: string }> = [];
        const usedCreds = new Set<string>();
        for (const target of targets) {
          const rawCredId = (target.name || 'default').toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 30) || 'default';
          let credId = rawCredId;
          let counter = 1;
          while (usedCreds.has(`${target.providerId}:${credId}`)) {
            credId = `${rawCredId}-${counter++}`;
          }
          usedCreds.add(`${target.providerId}:${credId}`);

          await options.credentials.put(target.providerId, credId, target.apiKey);

          // If unknown provider, automatically register custom provider
          const preset = PROVIDER_PRESETS.find((p) => p.id === target.providerId);
          if (options.providerStore && !['openrouter', 'groq', 'gemini'].includes(target.providerId)) {
            const existing = options.providerStore.list().find((p) => p.providerId === target.providerId);
            if (!existing) {
              options.providerStore.put({
                providerId: target.providerId,
                adapterType: preset?.adapterType ?? 'openai-compatible',
                baseUrl: preset?.baseUrl ?? `https://api.${target.providerId}.com/v1`,
                classifyAsFree: (preset?.category === 'free' || preset?.category === 'freemium') ? 'free_verified' : undefined,
                enabled: true,
              });
            }
          }

          // Auto-seed models if present in presets
          if (preset && preset.seedModels.length > 0) {
            try {
              const existing = await options.catalog.list();
              const hasModels = existing.some((m) => m.providerId === preset.id);
              if (!hasModels) {
                const seedList: ModelRecord[] = preset.seedModels.map((m) => ({
                  providerId: preset.id,
                  modelId: m.modelId,
                  capabilities: m.capabilities,
                  freeTier: m.freeTier,
                  checkedAt: new Date(),
                  priority: m.priority ?? 0,
                }));
                await options.catalog.replaceProvider(preset.id, seedList);
              }
            } catch {
              // Ignore seed errors
            }
          }

          if (options.onCredentialChanged) {
            try {
              await options.onCredentialChanged(target.providerId, credId);
            } catch {
              // Ignore refresh errors
            }
          }

          imported.push({ providerId: target.providerId, credentialId: credId, source: target.source, name: target.name });
        }

        sendJson(response, 200, {
          status: 'ok',
          count: imported.length,
          imported,
        });
        return;
      }

      if (request.method === 'POST' && path === '/v1/chat/completions') {
        if (!options.chat) {
          sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } });
          return;
        }
        const input = await readChatRequest(request);
        const target = parseRequestedModel(input.model, options.combos);
        const requestId = crypto.randomUUID();
        response.setHeader('x-freeroute-request-id', requestId);

        if (target.profile === 'combo' && target.comboModels && target.comboModels.length > 0) {
          let lastError: unknown = null;
          let contextOverflowCount = 0;
          const reqCaps = capabilitiesForProfile('named', !!(input.tools?.length), !!input.stream, input.responseFormat, input.hasVision);
          const catalogModels = options.catalog ? await options.catalog.list() : [];
          const attemptedSteps: Array<{ model: string; error: string }> = [];

          for (const cm of target.comboModels) {
            const parsedCm = parseRequestedModel(cm, options.combos);
            const cProv = parsedCm.providerId;
            const cMod = parsedCm.modelId ?? cm;

            // If the request requires tools or vision, check if this combo model supports it
            if (reqCaps.includes('tools') || reqCaps.includes('vision')) {
              const matchedCatalog = catalogModels.filter(m => (!cProv || m.providerId === cProv) && m.modelId === cMod);
              if (matchedCatalog.length > 0) {
                const hasRequired = matchedCatalog.some(m => reqCaps.every(c => m.capabilities.includes(c)));
                if (!hasRequired) {
                  attemptedSteps.push({ model: cm, error: `missing required capability (${reqCaps.filter(c => c === 'tools' || c === 'vision').join(', ')})` });
                  continue;
                }
              }
            }

            try {
              if (input.stream) {
                const result = await options.chat.stream({
                  profile: 'named',
                  requiredCapabilities: reqCaps,
                  requestedProviderId: cProv,
                  requestedModel: cMod,
                  messages: input.messages,
                  temperature: input.temperature,
                  tools: input.tools,
                  responseFormat: input.responseFormat,
                  traceId: requestId,
                });
                const streamStart = Date.now();
                const usageState = { captured: undefined as import('./contracts.js').TokenUsage | undefined, accumulatedText: '' };
                response.writeHead(200, {
                  'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
                  'x-freeroute-provider': result.decision.candidate.providerId,
                  'x-freeroute-model': result.decision.candidate.modelId,
                  'x-freeroute-combo': input.model,
                });
                for await (const event of result.events) {
                  if (event.usage) usageState.captured = event.usage;
                  if (event.delta) usageState.accumulatedText += event.delta;
                  const includeUsage = event.usage ?? usageState.captured;
                  response.write(`data: ${JSON.stringify({ id: event.id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1_000), model: `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`, choices: [{ index: 0, delta: event.delta === undefined ? {} : { content: event.delta }, finish_reason: event.finishReason ?? null, ...(event.toolCalls?.length ? { tool_calls: event.toolCalls } : {}) }], ...(includeUsage ? { usage: { prompt_tokens: includeUsage.promptTokens, completion_tokens: includeUsage.completionTokens, total_tokens: includeUsage.totalTokens } } : {}) })}\n\n`);
                }
                response.end('data: [DONE]\n\n');
                if (options.events) {
                  const finalUsage = usageState.captured ?? { promptTokens: 0, completionTokens: estimateTokensFromText(usageState.accumulatedText), totalTokens: 0 };
                  if (finalUsage.totalTokens === 0) finalUsage.totalTokens = finalUsage.promptTokens + finalUsage.completionTokens;
                  await options.events.record({
                    requestId,
                    occurredAt: new Date(),
                    profile: 'named',
                    providerId: result.decision.candidate.providerId,
                    modelId: result.decision.candidate.modelId,
                    credentialRef: result.decision.candidate.credentialId ? '***' : '',
                    fallbackCount: result.fallbackCount ?? 0,
                    outcome: 'success',
                    latencyMs: Date.now() - streamStart,
                    promptTokens: finalUsage.promptTokens,
                    completionTokens: finalUsage.completionTokens,
                    totalTokens: finalUsage.totalTokens,
                  });
                }
                return;
              } else {
                const result = await options.chat.complete({
                  profile: 'named',
                  requiredCapabilities: reqCaps,
                  requestedProviderId: cProv,
                  requestedModel: cMod,
                  messages: input.messages,
                  temperature: input.temperature,
                  tools: input.tools,
                  responseFormat: input.responseFormat,
                  traceId: requestId,
                });
                const usage = result.response.usage;
                response.setHeader('x-freeroute-provider', result.decision.candidate.providerId);
                response.setHeader('x-freeroute-model', result.decision.candidate.modelId);
                response.setHeader('x-freeroute-combo', input.model);
                if (usage) {
                  response.setHeader('x-freeroute-prompt-tokens', String(usage.promptTokens));
                  response.setHeader('x-freeroute-completion-tokens', String(usage.completionTokens));
                  response.setHeader('x-freeroute-total-tokens', String(usage.totalTokens));
                }
                sendJson(response, 200, {
                  id: result.response.id,
                  object: 'chat.completion',
                  created: Math.floor(Date.now() / 1_000),
                  model: `${result.response.providerId}/${result.response.modelId}`,
                  choices: [{ index: 0, message: { role: 'assistant', content: result.response.content, ...(result.response.toolCalls?.length ? { tool_calls: result.response.toolCalls } : {}) }, finish_reason: result.response.toolCalls?.length ? 'tool_calls' : 'stop' }],
                  usage: usage ? { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.totalTokens } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                });
                if (options.events && usage) {
                  await options.events.record({
                    requestId,
                    occurredAt: new Date(),
                    profile: 'named',
                    providerId: result.decision.candidate.providerId,
                    modelId: result.response.modelId,
                    credentialRef: result.decision.candidate.credentialId ? '***' : '',
                    fallbackCount: result.fallbackCount ?? 0,
                    outcome: 'success',
                    latencyMs: 0,
                    promptTokens: usage.promptTokens,
                    completionTokens: usage.completionTokens,
                    totalTokens: usage.totalTokens,
                  });
                }
                return;
              }
            } catch (err) {
              lastError = err;
              const errMsg = err instanceof Error ? err.message : String(err);
              attemptedSteps.push({ model: cm, error: errMsg });
              if (err instanceof ProviderInvocationError && err.failure.kind === 'context_overflow') {
                contextOverflowCount += 1;
              }
              continue;
            }
          }
          if (contextOverflowCount > 0 && contextOverflowCount === target.comboModels.length) {
            sendJson(response, 400, {
              error: {
                message: 'Ngữ cảnh hội thoại vượt quá giới hạn token của tất cả model trong combo. Vui lòng làm mới phiên chat (clear context / start new session) để tiếp tục. / Context length exceeded limits of all models in this combo. Please clear context or start a new chat session.',
                type: 'context_length_exceeded',
                code: 'context_length_exceeded',
              },
            });
            return;
          }

          const stepsSummary = attemptedSteps.length > 0
            ? attemptedSteps.map(s => `${s.model}: ${s.error}`).join('; ')
            : 'no matching models found in combo';
          sendJson(response, 503, {
            error: {
              message: `Không có model nào trong combo "${input.model}" hoàn thành được yêu cầu (hoặc tất cả upstream đều lỗi/thiếu capability). Chi tiết: [${stepsSummary}]. Vui lòng kiểm tra API key hoặc cấu hình lại combo tại http://127.0.0.1:8787!`,
              type: 'combo_exhausted',
              code: 'no_combo_candidates',
              attempted: attemptedSteps,
            },
          });
          return;
        }

        if (input.stream) {
          const result = await options.chat.stream({
            profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), true, input.responseFormat, input.hasVision), requestedProviderId: target.providerId,
            requestedModel: target.modelId, messages: input.messages, temperature: input.temperature, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
          });
          const streamStart = Date.now();
          const usageState = { captured: undefined as import('./contracts.js').TokenUsage | undefined, accumulatedText: '' };
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
            'x-freeroute-provider': result.decision.candidate.providerId,
            'x-freeroute-model': result.decision.candidate.modelId,
            'x-freeroute-fallback-count': String(result.fallbackCount ?? 0),
          });
          for await (const event of result.events) {
            if (event.usage) usageState.captured = event.usage;
            if (event.delta) usageState.accumulatedText += event.delta;
            const includeUsage = event.usage ?? usageState.captured;
            response.write(`data: ${JSON.stringify({ id: event.id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1_000), model: `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`, choices: [{ index: 0, delta: event.delta === undefined ? {} : { content: event.delta }, finish_reason: event.finishReason ?? null, ...(event.toolCalls?.length ? { tool_calls: event.toolCalls } : {}) }], ...(includeUsage ? { usage: { prompt_tokens: includeUsage.promptTokens, completion_tokens: includeUsage.completionTokens, total_tokens: includeUsage.totalTokens } } : {}) })}\n\n`);
          }
          response.end('data: [DONE]\n\n');
          if (options.events) {
            const finalUsage = usageState.captured ?? { promptTokens: 0, completionTokens: estimateTokensFromText(usageState.accumulatedText), totalTokens: 0 };
            if (finalUsage.totalTokens === 0) finalUsage.totalTokens = finalUsage.promptTokens + finalUsage.completionTokens;
            await options.events.record({
              requestId,
              occurredAt: new Date(),
              profile: target.profile,
              providerId: result.decision.candidate.providerId,
              modelId: result.decision.candidate.modelId,
              credentialRef: result.decision.candidate.credentialId ? '***' : '',
              fallbackCount: result.fallbackCount ?? 0,
              outcome: 'success',
              latencyMs: Date.now() - streamStart,
              promptTokens: finalUsage.promptTokens,
              completionTokens: finalUsage.completionTokens,
              totalTokens: finalUsage.totalTokens,
            });
          }
          return;
        }
        const result = await options.chat.complete({
          profile: target.profile,
          requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), false, input.responseFormat, input.hasVision),
          requestedProviderId: target.providerId,
          requestedModel: target.modelId,
          messages: input.messages,
          temperature: input.temperature,
          tools: input.tools,
          responseFormat: input.responseFormat,
          traceId: requestId,
        });
        const usage = result.response.usage;
        response.setHeader('x-freeroute-provider', result.response.providerId);
        response.setHeader('x-freeroute-model', result.response.modelId);
        response.setHeader('x-freeroute-fallback-count', String(result.fallbackCount));
        if (usage) {
          response.setHeader('x-freeroute-prompt-tokens', String(usage.promptTokens));
          response.setHeader('x-freeroute-completion-tokens', String(usage.completionTokens));
          response.setHeader('x-freeroute-total-tokens', String(usage.totalTokens));
        }
        sendJson(response, 200, {
          id: result.response.id,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1_000),
          model: `${result.response.providerId}/${result.response.modelId}`,
          choices: [{ index: 0, message: { role: 'assistant', content: result.response.content || null, ...(result.response.toolCalls?.length ? { tool_calls: result.response.toolCalls } : {}) }, finish_reason: result.response.toolCalls?.length ? 'tool_calls' : 'stop' }],
          usage: usage ? { prompt_tokens: usage.promptTokens, completion_tokens: usage.completionTokens, total_tokens: usage.totalTokens } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
        if (options.events && usage) {
          await options.events.record({
            requestId,
            occurredAt: new Date(),
            profile: target.profile,
            providerId: result.decision.candidate.providerId,
            modelId: result.response.modelId,
            credentialRef: result.decision.candidate.credentialId ? '***' : '',
            fallbackCount: result.fallbackCount ?? 0,
            outcome: 'success',
            latencyMs: 0,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
          });
        }
        return;
      }

      if (request.method === 'POST' && path === '/v1/responses') {
        if (!options.chat) { sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } }); return; }
        const input = await readResponsesRequest(request);
        const target = parseRequestedModel(input.model);
        const requestId = crypto.randomUUID();
        response.setHeader('x-freeroute-request-id', requestId);
        if (input.stream) {
          const result = await options.chat.stream({
            profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), true, input.responseFormat), requestedProviderId: target.providerId,
            requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
          });
          const model = `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`;
          const responseId = `resp_${requestId}`;
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
            'x-freeroute-provider': result.decision.candidate.providerId,
            'x-freeroute-model': result.decision.candidate.modelId,
          });
          writeResponseEvent(response, 'response.created', { type: 'response.created', response: { id: responseId, object: 'response', created_at: Math.floor(Date.now() / 1_000), status: 'in_progress', model } });
          let outputIndex = 0;
          for await (const event of result.events) {
            if (event.delta) writeResponseEvent(response, 'response.output_text.delta', { type: 'response.output_text.delta', response_id: responseId, item_id: `msg_${responseId}`, output_index: outputIndex, content_index: 0, delta: event.delta });
            if (event.finishReason) outputIndex += 1;
          }
          writeResponseEvent(response, 'response.completed', { type: 'response.completed', response: { id: responseId, object: 'response', created_at: Math.floor(Date.now() / 1_000), status: 'completed', model } });
          response.end('data: [DONE]\n\n');
          return;
        }
        const result = await options.chat.complete({
          profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), false, input.responseFormat), requestedProviderId: target.providerId,
          requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
        });
        response.setHeader('x-freeroute-provider', result.response.providerId);
        response.setHeader('x-freeroute-model', result.response.modelId);
        response.setHeader('x-freeroute-fallback-count', String(result.fallbackCount));
        sendJson(response, 200, {
          id: result.response.id, object: 'response', created_at: Math.floor(Date.now() / 1_000), status: 'completed',
          model: `${result.response.providerId}/${result.response.modelId}`,
          output: [{ type: 'message', id: `msg_${result.response.id}`, status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: result.response.content, annotations: [] }] }],
          output_text: result.response.content,
        });
        return;
      }

      if (request.method === 'POST' && path === '/v1/messages') {
        if (!options.chat) { sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } }); return; }
        const input = await readAnthropicMessagesRequest(request);
        const target = parseRequestedModel(input.model);
        const requestId = crypto.randomUUID();
        response.setHeader('x-freeroute-request-id', requestId);
        if (input.stream) {
          const result = await options.chat.stream({
            profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), true, input.responseFormat), requestedProviderId: target.providerId,
            requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
          });
          const model = `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`;
          const messageId = `msg_${requestId}`;
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
            'x-freeroute-provider': result.decision.candidate.providerId,
            'x-freeroute-model': result.decision.candidate.modelId,
          });
          writeAnthropicEvent(response, 'message_start', { type: 'message_start', message: { id: messageId, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
          writeAnthropicEvent(response, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
          for await (const event of result.events) {
            if (event.delta) writeAnthropicEvent(response, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: event.delta } });
          }
          writeAnthropicEvent(response, 'content_block_stop', { type: 'content_block_stop', index: 0 });
          writeAnthropicEvent(response, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } });
          writeAnthropicEvent(response, 'message_stop', { type: 'message_stop' });
          response.end();
          return;
        }
        const result = await options.chat.complete({
          profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), false, input.responseFormat), requestedProviderId: target.providerId,
          requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
        });
        response.setHeader('x-freeroute-provider', result.response.providerId);
        response.setHeader('x-freeroute-model', result.response.modelId);
        response.setHeader('x-freeroute-fallback-count', String(result.fallbackCount));
        sendJson(response, 200, {
          id: `msg_${result.response.id}`, type: 'message', role: 'assistant', model: `${result.response.providerId}/${result.response.modelId}`,
          content: [{ type: 'text', text: result.response.content }], stop_reason: 'end_turn', stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        });
        return;
      }

      sendJson(response, 404, { error: { message: 'not found', type: 'invalid_request_error' } });
    } catch (error) {
      if (response.headersSent) {
        try { response.end(); } catch {}
        return;
      }
      if (error instanceof Error && error.message.includes('Ngữ cảnh hội thoại vượt quá giới hạn token')) {
        sendJson(response, 400, {
          error: {
            message: error.message,
            type: 'context_length_exceeded',
            code: 'context_length_exceeded',
          },
        });
        return;
      }
      if (error instanceof NoRouteCandidatesError) {
        const diagnostics = getCandidateDiagnostics(error.request, error.candidates);
        sendJson(response, 503, {
          error: {
            message: 'Chưa có API key nào khả dụng cho profile/model này (hoặc tất cả upstream đều lỗi). Vui lòng truy cập http://127.0.0.1:8787 để kiểm tra hoặc thêm key! / No active route candidates available. Please open http://127.0.0.1:8787 to configure credentials.',
            type: 'no_route_candidates',
            code: 'no_candidates',
            diagnostics: diagnostics.length ? diagnostics.slice(0, 20) : undefined,
          },
        });
        return;
      }
      if (error instanceof Error && error.message === 'no eligible route candidates') {
        sendJson(response, 503, {
          error: {
            message: 'Chưa có API key nào khả dụng cho profile/model này (hoặc tất cả upstream đều lỗi). Vui lòng truy cập http://127.0.0.1:8787 để kiểm tra hoặc thêm key! / No active route candidates available. Please open http://127.0.0.1:8787 to configure credentials.',
            type: 'no_route_candidates',
            code: 'no_candidates',
          },
        });
        return;
      }
      if (error instanceof ProviderInvocationError) {
        response.setHeader('x-freeroute-failure-kind', error.failure.kind);
        if (error.failure.kind === 'context_overflow') {
          sendJson(response, 400, {
            error: {
              message: error.message,
              type: 'context_length_exceeded',
              code: 'context_length_exceeded',
            },
          });
          return;
        }
        sendJson(response, error.failure.kind === 'authentication' ? 401 : 502, {
          error: {
            message: `Tất cả nhà cung cấp dự phòng đều thất bại: ${error.message} / All upstream fallback routes failed: ${error.message}`,
            type: error.failure.kind === 'authentication' ? 'authentication_error' : 'upstream_error',
            code: 'upstream_failed',
          },
        });
        return;
      }
      if (error instanceof InvalidChatRequestError) {
        sendJson(response, 400, { error: { message: error.message, type: 'invalid_request_error' } });
        return;
      }
      console.error('SERVER CHAT ERROR:', error);
      sendJson(response, 500, {
        error: {
          message: error instanceof Error ? error.message : 'internal server error',
          type: 'server_error',
        },
      });
    }
  });
}

export interface OpenAIChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  tools?: import('./inference.js').ToolDefinition[];
  responseFormat?: { type: 'json_object' };
  hasVision?: boolean;
}

class InvalidChatRequestError extends Error {}

function capabilitiesForProfile(profile: string, hasTools: boolean, streaming = false, responseFormat?: { type: 'json_object' }, hasVision = false): import('./contracts.js').Capability[] {
  const caps: import('./contracts.js').Capability[] = ['chat'];
  if (streaming) caps.push('streaming');
  if (hasTools || profile === 'auto:code') caps.push('tools');
  if (responseFormat) caps.push('structured-output');
  if (hasVision) caps.push('vision');
  return caps;
}

async function readChatRequest(request: IncomingMessage): Promise<OpenAIChatRequest> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; messages?: unknown; temperature?: unknown; stream?: unknown; tools?: unknown; response_format?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (!Array.isArray(value.messages) || !value.messages.every(isChatMessage)) throw new InvalidChatRequestError('messages must contain role and valid content');
  if (value.temperature !== undefined && typeof value.temperature !== 'number') throw new InvalidChatRequestError('temperature must be a number');
  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(isToolDefinition))) throw new InvalidChatRequestError('tools must be OpenAI function definitions');
  if (value.response_format !== undefined && (typeof value.response_format !== 'object' || !value.response_format || (value.response_format as { type?: unknown }).type !== 'json_object')) throw new InvalidChatRequestError('response_format must be { type: "json_object" }');
  const hasVision = (value.messages as unknown[]).some(msg => {
    if (!msg || typeof msg !== 'object') return false;
    const m = msg as { content?: unknown };
    return Array.isArray(m.content);
  });
  return { model: value.model, messages: value.messages, temperature: value.temperature, stream: value.stream, tools: value.tools, responseFormat: value.response_format as { type: 'json_object' } | undefined, hasVision };
}

async function readResponsesRequest(request: IncomingMessage): Promise<{ model: string; messages: ChatMessage[]; stream?: boolean; tools?: import('./inference.js').ToolDefinition[]; responseFormat?: { type: 'json_object' } }> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; input?: unknown; stream?: unknown; tools?: unknown; response_format?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(isToolDefinition))) throw new InvalidChatRequestError('tools must be OpenAI function definitions');
  if (value.response_format !== undefined && (typeof value.response_format !== 'object' || !value.response_format || (value.response_format as { type?: unknown }).type !== 'json_object')) throw new InvalidChatRequestError('response_format must be { type: "json_object" }');
  if (typeof value.input === 'string') return { model: value.model, messages: [{ role: 'user', content: value.input }], stream: value.stream, tools: value.tools, responseFormat: value.response_format as { type: 'json_object' } | undefined };
  if (Array.isArray(value.input) && value.input.every(isResponsesMessage)) {
    return {
      model: value.model,
      messages: value.input.map((message) => {
        if (isChatMessage(message)) return message;
        const m = message as { role: ChatMessage['role']; content: unknown };
        return { role: m.role, content: extractResponsesText(m.content) };
      }),
      stream: value.stream,
      tools: value.tools,
      responseFormat: value.response_format as { type: 'json_object' } | undefined,
    };
  }
  throw new InvalidChatRequestError('input must be a string or messages with role and string content');
}

async function readAnthropicMessagesRequest(request: IncomingMessage): Promise<{ model: string; messages: ChatMessage[]; stream?: boolean; tools?: import('./inference.js').ToolDefinition[]; responseFormat?: { type: 'json_object' } }> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; system?: unknown; messages?: unknown; stream?: unknown; tools?: unknown; response_format?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (value.system !== undefined && typeof value.system !== 'string') throw new InvalidChatRequestError('system must be a string');
  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
  if (!Array.isArray(value.messages) || !value.messages.every(isAnthropicMessage)) throw new InvalidChatRequestError('messages must contain user or assistant roles and string content');
  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(isAnthropicToolDefinition))) throw new InvalidChatRequestError('tools must be Anthropic tool definitions');
  if (value.response_format !== undefined && (typeof value.response_format !== 'object' || !value.response_format || (value.response_format as { type?: unknown }).type !== 'json_object')) throw new InvalidChatRequestError('response_format must be { type: "json_object" }');
  const messages: ChatMessage[] = value.system ? [{ role: 'system', content: value.system }] : [];
  messages.push(...value.messages.map((message) => ({ role: message.role, content: message.content })));
  return { model: value.model, messages, stream: value.stream, tools: value.tools ? value.tools.map(toOpenAITool) : undefined, responseFormat: value.response_format as { type: 'json_object' } | undefined };
}

function isAnthropicToolDefinition(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const tool = value as { name?: unknown };
  return typeof tool.name === 'string' && tool.name.length > 0;
}

function toOpenAITool(value: unknown): import('./inference.js').ToolDefinition {
  const tool = value as { name: string; description?: unknown; input_schema?: unknown };
  return {
    type: 'function',
    function: {
      name: tool.name,
      ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
      ...(tool.input_schema !== undefined ? { parameters: tool.input_schema } : {}),
    },
  };
}

async function readPreferenceRequest(request: IncomingMessage): Promise<{ providerId: string; modelId: string; preference: Preference }> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { provider_id?: unknown; model_id?: unknown; preference?: unknown };
  if (typeof value.provider_id !== 'string' || !value.provider_id || typeof value.model_id !== 'string' || !value.model_id) throw new InvalidChatRequestError('provider_id and model_id are required');
  if (value.preference !== 'prefer' && value.preference !== 'neutral' && value.preference !== 'limit' && value.preference !== 'block') throw new InvalidChatRequestError('preference must be prefer, neutral, limit, or block');
  return { providerId: value.provider_id, modelId: value.model_id, preference: value.preference };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += value.length;
    if (length > 1_000_000) throw new InvalidChatRequestError('request body exceeds 1 MB');
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InvalidChatRequestError('request body must be valid JSON'); }
}

function isResponsesMessage(value: unknown): boolean {
  return isChatMessage(value) || isResponsesArrayMessage(value);
}

function isResponsesArrayMessage(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const message = value as { role?: unknown; content?: unknown };
  if (message.role !== 'user' && message.role !== 'system' && message.role !== 'assistant' && message.role !== 'tool') return false;
  return Array.isArray(message.content) && message.content.every((part) => isResponsesContentPart(part));
}

function isResponsesContentPart(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const part = value as { type?: unknown; text?: unknown };
  return part.type === 'input_text' || part.type === 'output_text' || part.type === 'text'
    ? typeof part.text === 'string'
    : true; // ponytail: future part types (image, audio) pass through; downstream provider rejects if unsupported
}

function extractResponsesText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    }).join('');
  }
  return '';
}

function isAnthropicMessage(value: unknown): value is ChatMessage {
  if (!isChatMessage(value)) return false;
  if (value.role !== 'user' && value.role !== 'assistant') return false;
  // ponytail: vision content parts not yet supported for Anthropic Messages API
  return typeof value.content === 'string';
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as { role?: unknown; content?: unknown; tool_calls?: unknown; tool_call_id?: unknown };
  if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant' && message.role !== 'tool') return false;
  // Assistant messages with tool_calls may have content === null (OpenAI spec)
  if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.content === null) return true;
  // Tool result messages
  if (message.role === 'tool') return typeof message.tool_call_id === 'string' && (typeof message.content === 'string' || message.content === null);
  if (typeof message.content === 'string') return true;
  if (Array.isArray(message.content)) {
    return message.content.every(part => {
      if (!part || typeof part !== 'object') return false;
      if (part.type === 'text') return typeof (part as { text?: unknown }).text === 'string';
      if (part.type === 'image_url') return typeof (part as { image_url?: unknown }).image_url === 'object';
      return false;
    });
  }
  return false;
}

function isToolDefinition(value: unknown): value is import('./inference.js').ToolDefinition {
  if (!value || typeof value !== 'object') return false;
  const tool = value as { type?: unknown; function?: { name?: unknown } };
  return tool.type === 'function' && typeof tool.function?.name === 'string' && tool.function.name.length > 0;
}

export function expandComboModels(
  models: string[],
  comboStore?: import('./storage/sqlite-combo-store.js').SqliteComboStore,
  visited = new Set<string>()
): string[] {
  const result: string[] = [];
  if (!comboStore) return models;

  for (const m of models) {
    const trimmed = m.trim();
    let subComboId: string | null = null;
    if (trimmed.startsWith('combo:')) {
      subComboId = trimmed.slice('combo:'.length).trim();
    } else if (comboStore.get(trimmed)) {
      subComboId = trimmed;
    }

    if (subComboId) {
      if (visited.has(subComboId)) {
        // Cycle detected: skip to prevent infinite recursion
        continue;
      }
      const nextVisited = new Set(visited);
      nextVisited.add(subComboId);
      const subCombo = comboStore.get(subComboId);
      if (subCombo && subCombo.models && subCombo.models.length > 0) {
        const expanded = expandComboModels(subCombo.models, comboStore, nextVisited);
        result.push(...expanded);
      }
    } else {
      result.push(trimmed);
    }
  }
  return result;
}

export function parseRequestedModel(model: string, comboStore?: import('./storage/sqlite-combo-store.js').SqliteComboStore): { profile: string; providerId?: string; modelId?: string; comboModels?: string[] } {
  const trimmed = model.trim();
  if (trimmed.startsWith('auto:')) return { profile: trimmed };
  if (trimmed.startsWith('combo:')) {
    const cId = trimmed.slice('combo:'.length).trim();
    const combo = comboStore?.get(cId);
    if (combo && combo.models.length > 0) {
      return { profile: 'combo', comboModels: expandComboModels(combo.models, comboStore, new Set([cId])) };
    }
  }
  if (comboStore) {
    const combo = comboStore.get(trimmed);
    if (combo && combo.models.length > 0) {
      return { profile: 'combo', comboModels: expandComboModels(combo.models, comboStore, new Set([trimmed])) };
    }
  }

  // Handle provider aliases where models start with known short prefixes
  if (trimmed.startsWith('ag/')) {
    return { profile: 'named', providerId: 'antigravity', modelId: trimmed };
  }
  if (trimmed.startsWith('cl/')) {
    return { profile: 'named', providerId: 'cline', modelId: trimmed };
  }
  if (trimmed.startsWith('kr/')) {
    return { profile: 'named', providerId: 'kiro', modelId: trimmed };
  }

  const separator = trimmed.indexOf('/');
  if (separator > 0 && separator < trimmed.length - 1) {
    return { profile: 'named', providerId: trimmed.slice(0, separator), modelId: trimmed.slice(separator + 1) };
  }
  return { profile: 'named', modelId: trimmed };
}

function isAuthorized(request: IncomingMessage, expectedToken: string | undefined): boolean {
  if (!expectedToken) return true;
  return request.headers.authorization === `Bearer ${expectedToken}`;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent) {
    try { response.end(); } catch {}
    return;
  }
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body);
}

function writeResponseEvent(response: ServerResponse, event: string, body: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
}

function writeAnthropicEvent(response: ServerResponse, event: string, body: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
}



function summarizeProviderHealth(events: Array<{ providerId: string; outcome: 'success' | 'failure'; latencyMs?: number }>): Array<{ providerId: string; requestCount: number; successRate: number; latencyP50Ms?: number; latencyP95Ms?: number }> {
  const totals = new Map<string, { requestCount: number; successes: number; latencies: number[] }>();
  for (const event of events) {
    const total = totals.get(event.providerId) ?? { requestCount: 0, successes: 0, latencies: [] };
    total.requestCount += 1;
    if (event.outcome === 'success') total.successes += 1;
    if (event.latencyMs !== undefined) total.latencies.push(event.latencyMs);
    totals.set(event.providerId, total);
  }
  return [...totals].map(([providerId, total]) => ({ providerId, requestCount: total.requestCount, successRate: total.successes / total.requestCount, ...(total.latencies.length ? { latencyP50Ms: percentile(total.latencies, 0.5), latencyP95Ms: percentile(total.latencies, 0.95) } : {}) }))
    .sort((left, right) => right.successRate - left.successRate || right.requestCount - left.requestCount || left.providerId.localeCompare(right.providerId));
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * ratio) - 1]!;
}
