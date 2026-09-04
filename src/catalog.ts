import type { Capability, FreeTierClass, ModelRecord } from './contracts.js';
import { PROVIDER_PRESETS } from './presets.js';

export interface DiscoveredModel {
  modelId: string;
  capabilities: Capability[];
  freeTier: FreeTierClass;
  expiresAt?: Date;
  priority?: number;
}

export interface ProviderDiscoveryAdapter {
  providerId: string;
  discoverModels(credentialId: string): Promise<DiscoveredModel[]>;
}

export interface CatalogStore {
  list(): Promise<ModelRecord[]>;
  replaceProvider(providerId: string, models: ModelRecord[]): Promise<void>;
}

export interface DiscoveryResult {
  providerId: string;
  status: 'updated' | 'failed';
  modelCount?: number;
  error?: string;
}

/**
 * Minimal store used by the core and its tests. A SQLite-backed implementation
 * will satisfy this same contract in the storage milestone.
 */
export class InMemoryCatalogStore implements CatalogStore {
  private models = new Map<string, ModelRecord>();

  constructor(seed: ModelRecord[] = []) {
    for (const model of seed) this.models.set(keyFor(model), model);
  }

  async list(): Promise<ModelRecord[]> {
    return [...this.models.values()];
  }

  async replaceProvider(providerId: string, models: ModelRecord[]): Promise<void> {
    for (const [key, model] of this.models) {
      if (model.providerId === providerId) this.models.delete(key);
    }
    for (const model of models) this.models.set(keyFor(model), model);
  }
}

export class CatalogService {
  constructor(private readonly store: CatalogStore, private readonly adapters: ProviderDiscoveryAdapter[]) {}

  /** Returns cached data immediately. Call refresh in the background after boot. */
  async loadCached(): Promise<ModelRecord[]> {
    return this.store.list();
  }

  /**
   * Refreshes all adapters concurrently. A failed adapter leaves that
   * provider's last good records untouched, preserving a usable startup cache.
   */
  async refresh(credentials: Record<string, string>, checkedAt = new Date()): Promise<DiscoveryResult[]> {
    return Promise.all(this.adapters.map(async (adapter): Promise<DiscoveryResult> => {
      const credentialId = credentials[adapter.providerId];
      if (!credentialId) return { providerId: adapter.providerId, status: 'failed', error: 'credential not configured' };

      try {
        const discovered = await adapter.discoverModels(credentialId);
        const preset = PROVIDER_PRESETS.find((p) => p.id === adapter.providerId);
        const models = discovered.map((model): ModelRecord => {
          const presetModel = preset?.seedModels.find((sm) => sm.modelId === model.modelId);
          return {
            providerId: adapter.providerId,
            modelId: model.modelId,
            capabilities: model.capabilities,
            freeTier: (model.freeTier === 'free_unverified' && presetModel?.freeTier) ? presetModel.freeTier : model.freeTier,
            checkedAt,
            expiresAt: model.expiresAt,
            priority: model.priority ?? presetModel?.priority ?? 0,
          };
        });
        await this.store.replaceProvider(adapter.providerId, models);
        return { providerId: adapter.providerId, status: 'updated', modelCount: models.length };
      } catch (error) {
        return {
          providerId: adapter.providerId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'unknown discovery error',
        };
      }
    }));
  }
}

function keyFor(model: Pick<ModelRecord, 'providerId' | 'modelId'>): string {
  return `${model.providerId}:${model.modelId}`;
}
