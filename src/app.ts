import { CatalogService } from './catalog.js';
import { createCatalogChatService, RouteState } from './inference.js';
import { OpenAICompatibleAdapter } from './providers/openai-compatible.js';
import { GeminiAdapter } from './providers/gemini.js';
import { AnthropicAdapter } from './providers/anthropic.js';
import { OllamaAdapter } from './providers/ollama.js';
import { KiroAdapter } from './providers/kiro.js';
import { PROVIDER_PRESETS } from './presets.js';
import { createFreeRouteServer } from './server.js';
import { SqliteCatalogStore } from './storage/sqlite-catalog-store.js';
import { SqliteCredentialStore } from './storage/sqlite-credential-store.js';
import { SqliteRoutingEventStore } from './storage/sqlite-routing-event-store.js';
import { SqliteQuotaObservationStore } from './storage/sqlite-quota-observation-store.js';
import { SqlitePreferenceStore } from './storage/sqlite-preference-store.js';
import { createSqliteProviderStore, type ProviderDefinition } from './storage/sqlite-provider-store.js';
import { createSqliteComboStore } from './storage/sqlite-combo-store.js';
import { ExternalBenchmarkStorage } from './benchmarks/external/storage.js';
import { RefreshCoordinator } from './benchmarks/external/refresh-coordinator.js';
import { BUILTIN_EXTERNAL_SOURCES } from './benchmarks/external/sources.js';
import { resolve as pathResolve } from 'node:path';

export interface OpenRouterRuntimeOptions {
  databasePath: string;
  masterSecret: string;
  apiToken?: string;
  baseUrl?: string;
  groqBaseUrl?: string;
  geminiBaseUrl?: string;
  anthropicBaseUrl?: string;
  fetch?: typeof globalThis.fetch;
  /** Optional: custom data directory for benchmark storage (defaults to same dir as databasePath) */
  benchmarkDataDir?: string;
}

/** Public type of the runtime object returned by createOpenRouterRuntime */
export type OpenRouterRuntime = ReturnType<typeof createOpenRouterRuntime>;

/** Creates the local OpenRouter runtime without exposing provider credentials. */
export function createOpenRouterRuntime(options: OpenRouterRuntimeOptions) {
  const catalog = new SqliteCatalogStore(options.databasePath);
  const providerStore = createSqliteProviderStore(options.databasePath);
  const credentials = new SqliteCredentialStore(options.databasePath, options.masterSecret);
  const events = new SqliteRoutingEventStore(options.databasePath);
  const quotas = new SqliteQuotaObservationStore(options.databasePath);
  const preferences = new SqlitePreferenceStore(options.databasePath);
  const comboStore = createSqliteComboStore(options.databasePath);

  // Phase 5: Initialize ExternalBenchmarkStorage with graceful fallback
  // If the benchmark DB fails (disk full, permission denied), core routing still works.
  const benchmarkDataDir = options.benchmarkDataDir ?? pathResolve(options.databasePath, '..');
  let externalBenchmarks: ExternalBenchmarkStorage | undefined;
  let benchmarkCoordinator: RefreshCoordinator | undefined;
  try {
    externalBenchmarks = new ExternalBenchmarkStorage(benchmarkDataDir);
    benchmarkCoordinator = new RefreshCoordinator(externalBenchmarks);
    console.log(`[Storage] Initialized external benchmark storage at ${benchmarkDataDir}/benchmark-external.sqlite`);
  } catch (err) {
    console.warn(`[BenchmarkStorage] Failed to initialize external benchmark storage: ${(err as Error).message}. Benchmark features will be unavailable.`);
    externalBenchmarks = undefined;
    benchmarkCoordinator = undefined;
  }

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
      getCredential: (credentialId) => credentials.get('groq', credentialId).then(c => typeof c === 'string' ? c : c?.apiKey ?? c?.accessToken), fetch: options.fetch,
      classifyModel: () => 'free_unverified',
    }),
    new GeminiAdapter({
      baseUrl: options.geminiBaseUrl,
      getCredential: (credentialId) => credentials.get('gemini', credentialId).then(c => typeof c === 'string' ? c : c?.apiKey ?? c?.accessToken), fetch: options.fetch,
    }),
    new AnthropicAdapter({
      baseUrl: options.anthropicBaseUrl,
      getCredential: (credentialId) => credentials.get('anthropic', credentialId).then(c => typeof c === 'string' ? c : c?.apiKey ?? c?.accessToken), fetch: options.fetch,
    }),
    new KiroAdapter({
      providerId: 'kiro',
      getCredential: (credentialId) => credentials.get('kiro', credentialId),
      setCredential: (credentialId, secret) => credentials.put('kiro', credentialId, secret),
      fetch: options.fetch,
    }),
  ];

  // Ensure built-in provider DB records have correct baseUrl from presets
  // This prevents stale/custom DB records from overriding built-in adapter endpoints
  const builtInProviderIds = new Set(['openrouter', 'groq', 'gemini', 'anthropic', 'kiro']);
  for (const providerId of builtInProviderIds) {
    const preset = PROVIDER_PRESETS.find((p: { id: string }) => p.id === providerId);
    if (preset && preset.baseUrl && providerStore) {
      const existing = providerStore.list().find((p: { providerId: string }) => p.providerId === providerId);
      if (existing && existing.baseUrl !== preset.baseUrl) {
        providerStore.put({ ...existing, baseUrl: preset.baseUrl });
      }
    }
  }

  // Load custom providers from DB
    const createCustomAdapter = (def: ProviderDefinition): import('./inference.js').ChatProviderAdapter & import('./catalog.js').ProviderDiscoveryAdapter => {
      if (def.adapterType === 'gemini') {
        return new GeminiAdapter({ baseUrl: def.baseUrl, getCredential: (id) => credentials.get(def.providerId, id).then(c => typeof c === 'string' ? c : c?.apiKey ?? c?.accessToken), fetch: options.fetch });
      }
      if (def.adapterType === 'anthropic') {
        return new AnthropicAdapter({ baseUrl: def.baseUrl, getCredential: (id) => credentials.get(def.providerId, id).then(c => typeof c === 'string' ? c : c?.apiKey ?? c?.accessToken), fetch: options.fetch });
      }
      if (def.adapterType === 'ollama') {
        return new OllamaAdapter({ providerId: def.providerId, baseUrl: def.baseUrl, getCredential: (id) => credentials.get(def.providerId, id).then(c => typeof c === 'string' ? c : c?.apiKey ?? c?.accessToken), fetch: options.fetch });
      }
      if (def.adapterType === 'kiro') {
        return new KiroAdapter({ providerId: def.providerId, baseUrl: def.baseUrl, getCredential: (id) => credentials.get(def.providerId, id), fetch: options.fetch });
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
    externalBenchmarks,
    benchmarkCoordinator,
    onProviderChanged: syncProvider,
    onProviderRefresh: async (providerId, credentialId) => {
      const selected = credentialId ?? (await credentials.list()).find((credential) => credential.providerId === providerId)?.credentialId ?? '';
      const results = await discovery.refresh({ [providerId]: selected });
      const result = results.find((r) => r.providerId === providerId);
      return result ?? { providerId, status: 'failed', error: 'provider not found' };
    },
    onCredentialChanged: async () => {
      const credentialIds = Object.fromEntries((await credentials.list()).map((credential) => [credential.providerId, credential.credentialId]));
      void discovery.refresh(credentialIds);
    },
  });

  return {
    server,
    providerStore,
    /** Access to ExternalBenchmarkStorage for tests and CLI refresh */
    externalBenchmarks,
    /** Access to RefreshCoordinator for tests and HTTP trigger */
    benchmarkCoordinator,
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
    /**
     * Trigger a benchmark refresh (CLI and HTTP endpoint use this).
     * Uses RefreshCoordinator to deduplicate concurrent calls.
     * Returns RefreshResult or throws if coordinator is unavailable.
     */
    async refreshBenchmarks(scope: import('./benchmarks/external/interfaces.js').RefreshScope = 'openrouter') {
      if (!benchmarkCoordinator || !externalBenchmarks) {
        throw new Error('Benchmark storage is not available');
      }
      return benchmarkCoordinator.forceRefresh(scope, BUILTIN_EXTERNAL_SOURCES);
    },
    close(): void {
      benchmarkCoordinator?.close();
      externalBenchmarks?.close();
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
