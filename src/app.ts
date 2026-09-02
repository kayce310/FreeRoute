import { CatalogService } from './catalog.js';
import { createCatalogChatService, RouteState } from './inference.js';
import { OpenAICompatibleAdapter } from './providers/openai-compatible.js';
import { GeminiAdapter } from './providers/gemini.js';
import { createFreeRouteServer } from './server.js';
import { SqliteCatalogStore } from './storage/sqlite-catalog-store.js';
import { SqliteCredentialStore } from './storage/sqlite-credential-store.js';
import { SqliteRoutingEventStore } from './storage/sqlite-routing-event-store.js';
import { SqliteQuotaObservationStore } from './storage/sqlite-quota-observation-store.js';
import { SqlitePreferenceStore } from './storage/sqlite-preference-store.js';

export interface OpenRouterRuntimeOptions {
  databasePath: string;
  masterSecret: string;
  apiToken: string;
  baseUrl?: string;
  groqBaseUrl?: string;
  geminiBaseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

/** Creates the local OpenRouter runtime without exposing provider credentials. */
export function createOpenRouterRuntime(options: OpenRouterRuntimeOptions) {
  const catalog = new SqliteCatalogStore(options.databasePath);
  const credentials = new SqliteCredentialStore(options.databasePath, options.masterSecret);
  const events = new SqliteRoutingEventStore(options.databasePath);
  const quotas = new SqliteQuotaObservationStore(options.databasePath);
  const preferences = new SqlitePreferenceStore(options.databasePath);
  const openRouter = new OpenAICompatibleAdapter({
    providerId: 'openrouter',
    baseUrl: options.baseUrl ?? 'https://openrouter.ai/api/v1',
    getCredential: (credentialId) => credentials.get('openrouter', credentialId),
    fetch: options.fetch,
  });
  const groq = new OpenAICompatibleAdapter({
    providerId: 'groq', baseUrl: options.groqBaseUrl ?? 'https://api.groq.com/openai/v1',
    getCredential: (credentialId) => credentials.get('groq', credentialId), fetch: options.fetch,
    classifyModel: () => 'free_unverified',
  });
  const gemini = new GeminiAdapter({
    baseUrl: options.geminiBaseUrl,
    getCredential: (credentialId) => credentials.get('gemini', credentialId), fetch: options.fetch,
  });
  const adapters = [openRouter, groq, gemini];
  const chat = createCatalogChatService({ catalog, credentials, adapters, routeState: new RouteState(), onEvent: (event) => events.record(event), onQuota: (observation) => quotas.record(observation), quotaScores: () => quotas.scores(), healthScores: () => events.scores(), preferences: () => preferences.map() });
  const server = createFreeRouteServer({ catalog, apiToken: options.apiToken, chat, events, quotas, preferences });
  const discovery = new CatalogService(catalog, adapters);

  return {
    server,
    /** Refresh is safe to run after the server starts because cached catalog data remains available. */
    async refreshOpenRouter(): Promise<{ status: 'updated' | 'failed'; modelCount?: number; error?: string }> {
      const credential = (await credentials.list()).find((item) => item.providerId === 'openrouter');
      const [result] = await discovery.refresh({ openrouter: credential?.credentialId ?? '' });
      return result!;
    },
    async refreshProviders() {
      const credentialIds = Object.fromEntries((await credentials.list()).map((credential) => [credential.providerId, credential.credentialId]));
      return discovery.refresh(credentialIds);
    },
    close(): void {
      catalog.close();
      credentials.close();
      events.close();
      quotas.close();
      preferences.close();
    },
  };
}
