import { CatalogService } from './catalog.js';
import { createCatalogChatService, RouteState } from './inference.js';
import { OpenAICompatibleAdapter } from './providers/openai-compatible.js';
import { GeminiAdapter } from './providers/gemini.js';
import { AnthropicAdapter } from './providers/anthropic.js';
import { createFreeRouteServer } from './server.js';
import { SqliteCatalogStore } from './storage/sqlite-catalog-store.js';
import { SqliteCredentialStore } from './storage/sqlite-credential-store.js';
import { SqliteRoutingEventStore } from './storage/sqlite-routing-event-store.js';
import { SqliteQuotaObservationStore } from './storage/sqlite-quota-observation-store.js';
import { SqlitePreferenceStore } from './storage/sqlite-preference-store.js';
import { createSqliteProviderStore, type ProviderDefinition } from './storage/sqlite-provider-store.js';
import { createSqliteComboStore } from './storage/sqlite-combo-store.js';

export interface OpenRouterRuntimeOptions {
  databasePath: string;
  masterSecret: string;
  apiToken?: string;
  baseUrl?: string;
  groqBaseUrl?: string;
  geminiBaseUrl?: string;
  anthropicBaseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

/** Creates the local OpenRouter runtime without exposing provider credentials. */
export function createOpenRouterRuntime(options: OpenRouterRuntimeOptions) {
  const catalog = new SqliteCatalogStore(options.databasePath);
  const credentials = new SqliteCredentialStore(options.databasePath, options.masterSecret);
  const events = new SqliteRoutingEventStore(options.databasePath);
  const quotas = new SqliteQuotaObservationStore(options.databasePath);
  const preferences = new SqlitePreferenceStore(options.databasePath);
  const providerStore = createSqliteProviderStore(options.databasePath);
  const comboStore = createSqliteComboStore(options.databasePath);

  // Seed default curated combos if none exist
  if (comboStore.list().length === 0) {
    comboStore.put({
      comboId: 'free-coders',
      name: 'Free Coding Agents',
      models: [
        'gemini/gemini-2.5-flash',
        'gemini/gemini-3.6-flash',
        'groq/qwen/qwen3.8-27b',
        'openrouter/google/gemini-2.0-flash-exp:free',
        'openrouter/qwen/qwen-2.5-coder-32b-instruct:free',
      ],
      description: 'Mô hình lập trình và gọi hàm công cụ miễn phí tốc độ cao cho VS Code Copilot, Cursor, Continue.dev.',
    });
    comboStore.put({
      comboId: 'speed-demons',
      name: 'Ultra-Speed Inference',
      models: [
        'cerebras/llama-3.3-70b',
        'groq/llama-3.1-8b-instant',
        'cerebras/llama-3.1-8b',
      ],
      description: 'Tốc độ phản hồi cực nhanh (500-1800 tok/s).',
    });
    comboStore.put({
      comboId: 'smart-chat',
      name: 'Best Free Chat',
      models: [
        'gemini/gemini-2.5-flash',
        'openrouter/google/gemini-2.0-flash-exp:free',
        'groq/llama-3.3-70b-versatile',
      ],
      description: 'Hội thoại thông minh, ngữ cảnh lớn, suy luận mạnh mẽ.',
    });
  }

  const builtIn: import('./inference.js').ChatProviderAdapter[] = [
    new OpenAICompatibleAdapter({
      providerId: 'openrouter',
      baseUrl: options.baseUrl ?? 'https://openrouter.ai/api/v1',
      getCredential: (credentialId) => credentials.get('openrouter', credentialId),
      fetch: options.fetch,
    }),
    new OpenAICompatibleAdapter({
      providerId: 'groq', baseUrl: options.groqBaseUrl ?? 'https://api.groq.com/openai/v1',
      getCredential: (credentialId) => credentials.get('groq', credentialId), fetch: options.fetch,
      classifyModel: () => 'free_unverified',
    }),
    new GeminiAdapter({
      baseUrl: options.geminiBaseUrl,
      getCredential: (credentialId) => credentials.get('gemini', credentialId), fetch: options.fetch,
    }),
    new AnthropicAdapter({
      baseUrl: options.anthropicBaseUrl,
      getCredential: (credentialId) => credentials.get('anthropic', credentialId), fetch: options.fetch,
    }),
  ];

  // Load custom providers from DB
  const createCustomAdapter = (def: ProviderDefinition): import('./inference.js').ChatProviderAdapter & import('./catalog.js').ProviderDiscoveryAdapter => {
      if (def.adapterType === 'gemini') {
        return new GeminiAdapter({ baseUrl: def.baseUrl, getCredential: (id) => credentials.get(def.providerId, id), fetch: options.fetch });
      }
      if (def.adapterType === 'anthropic' as any) {
        return new AnthropicAdapter({ baseUrl: def.baseUrl, getCredential: (id) => credentials.get(def.providerId, id), fetch: options.fetch });
      }
      return new OpenAICompatibleAdapter({
        providerId: def.providerId,
        baseUrl: def.baseUrl,
        getCredential: (id) => credentials.get(def.providerId, id),
        fetch: options.fetch,
        classifyModel: def.classifyAsFree ? () => def.classifyAsFree as import('./contracts.js').FreeTierClass : undefined,
      });
  };

  const custom: Array<import('./inference.js').ChatProviderAdapter & import('./catalog.js').ProviderDiscoveryAdapter> = providerStore.list()
    .filter((def: ProviderDefinition) => def.enabled)
    .map(createCustomAdapter);

  const adapters = [...builtIn, ...custom];
  const chat = createCatalogChatService({ catalog, credentials, adapters, routeState: new RouteState(), onEvent: (event) => events.record(event), onQuota: (observation) => quotas.record(observation), quotaScores: () => quotas.scores(), healthScores: () => events.scores(), preferences: () => preferences.map() });
  const discoveryAdapters = adapters as unknown as import('./catalog.js').ProviderDiscoveryAdapter[];
  const discovery = new CatalogService(catalog, discoveryAdapters);
  const syncProvider = async (providerId: string): Promise<void> => {
    const definition = providerStore.list().find((provider) => provider.providerId === providerId);
    if (!definition || !definition.enabled) {
      chat.removeAdapter(providerId);
      discovery.removeAdapter(providerId);
      await catalog.replaceProvider(providerId, []);
      return;
    }
    const adapter = createCustomAdapter(definition);
    chat.registerAdapter(adapter);
    discovery.registerAdapter(adapter);
    const credentialIds = Object.fromEntries((await credentials.list()).map((credential) => [credential.providerId, credential.credentialId]));
    await discovery.refresh({ [providerId]: credentialIds[providerId] ?? '' });
  };
  const server = createFreeRouteServer({
    catalog,
    apiToken: options.apiToken,
    chat,
    events,
    quotas,
    preferences,
    credentials,
    providerStore,
    combos: comboStore,
    onProviderChanged: syncProvider,
    onCredentialChanged: async () => {
      const credentialIds = Object.fromEntries((await credentials.list()).map((credential) => [credential.providerId, credential.credentialId]));
      void discovery.refresh(credentialIds);
    },
  });

  return {
    server,
    providerStore,
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
      providerStore.close();
      comboStore.close();
    },
  };
}
