/**
 * Built-in external benchmark sources registry.
 * Defines the available data sources and their configurations.
 */
import type { ExternalBenchmarkSource } from './interfaces.js';
import {
  openrouterModelSlugTransformer,
  huggingfaceModelSlugTransformer,
  artificialAnalysisModelSlugTransformer,
  getModelSlugTransformer,
} from './normalizer.js';

/**
 * Fetch OpenRouter model catalog from public API.
 * Returns model pricing, capabilities, and metadata.
 */
async function fetchOpenRouter(): Promise<import('./interfaces.js').RawBenchmarkData> {
  const response = await fetch('https://openrouter.ai/api/v1/models');
  if (!response.ok) {
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
  }
  const data = await response.json() as { data: Array<{ id: string; name?: string; pricing?: Record<string, string>; context_length?: number; top_provider?: { max_tokens?: number } }> };

  return {
    models: data.data.map(model => ({
      rawSlug: model.id,
      name: model.name,
      providerId: 'openrouter',
      metrics: {
        price_per_1m_input_tokens: model.pricing?.['prompt'] ?? null,
        price_per_1m_output_tokens: model.pricing?.['completion'] ?? null,
        context_length: model.context_length?.toString() ?? null,
        top_provider_max_tokens: model.top_provider?.max_tokens?.toString() ?? null,
      },
      sourceUrl: 'https://openrouter.ai/models',
    })),
  };
}

/**
 * Fetch HuggingFace model data for popular LLMs.
 * Returns download counts, likes, and tags.
 */
async function fetchHuggingFace(): Promise<import('./interfaces.js').RawBenchmarkData> {
  // Note: HuggingFace has strict rate limits for anonymous access
  // This implementation fetches a curated list of popular models
  const popularModels = [
    'meta-llama/Meta-Llama-3.1-8B-Instruct',
    'meta-llama/Meta-Llama-3.1-70B-Instruct',
    'mistralai/Mistral-7B-Instruct-v0.2',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'Qwen/Qwen2.5-7B-Instruct',
    'Qwen/Qwen2.5-72B-Instruct',
    'deepseek-ai/DeepSeek-V2.5',
    'google/gemma-2-9b-it',
  ];

  const models = await Promise.all(
    popularModels.map(async (modelId) => {
      try {
        const response = await fetch(`https://huggingface.co/api/models/${encodeURIComponent(modelId)}`);
        if (!response.ok) return null;
        const data = await response.json() as { modelId: string; downloads?: number; likes?: number; tags?: string[] };
        return {
          rawSlug: modelId,
          name: data.modelId,
          providerId: 'huggingface',
          metrics: {
            downloads: data.downloads?.toString() ?? null,
            likes: data.likes?.toString() ?? null,
            tags: (data.tags ?? []).join(','),
          },
          sourceUrl: `https://huggingface.co/${modelId}`,
        };
      } catch {
        return null;
      }
    })
  );

  return {
    models: models.filter((m): m is NonNullable<typeof m> => m !== null),
  };
}

/**
 * Fetch Artificial Analysis model benchmarks.
 * Returns inference speed, price, and quality scores.
 */
async function fetchArtificialAnalysis(): Promise<import('./interfaces.js').RawBenchmarkData> {
  // Artificial Analysis API requires authentication for full access
  // This is a placeholder that would need API key configuration
  throw new Error('Artificial Analysis API requires authentication. Configure API key in source settings.');
}

/**
 * Fetch LMSYS Chatbot Arena rankings.
 * Returns arena rank, win rate, and Elo rating.
 */
async function fetchLmsys(): Promise<import('./interfaces.js').RawBenchmarkData> {
  try {
    const response = await fetch('https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard/raw/main/data/full_cleaned.json');
    if (!response.ok) {
      throw new Error(`LMSYS API error: ${response.status}`);
    }
    const data = await response.json() as Array<{ model: string; arena_score?: number; num_cycles?: number; win_rate?: number }>;

    return {
      models: data.map(item => ({
        rawSlug: item.model,
        name: item.model,
        metrics: {
          arena_score: item.arena_score?.toString() ?? null,
          num_cycles: item.num_cycles?.toString() ?? null,
          win_rate: item.win_rate?.toString() ?? null,
        },
        sourceUrl: 'https://lmsys.org',
      })),
    };
  } catch (error) {
    // LMSYS data might not be available
    return { models: [] };
  }
}

/**
 * Registry of all built-in external benchmark sources.
 */
export const BUILTIN_EXTERNAL_SOURCES: ExternalBenchmarkSource[] = [
  {
    sourceId: 'openrouter',
    name: 'OpenRouter Model Catalog',
    description: 'Model pricing, capabilities, and metadata from OpenRouter',
    url: 'https://openrouter.ai/api/v1/models',
    ttlMs: 6 * 60 * 60 * 1000, // 6 hours (PROPOSED DEFAULT)
    maxAgeMs: 24 * 60 * 60 * 1000, // 24 hours (PROPOSED DEFAULT)
    rateLimit: {
      requestsPerMinute: 60,
      strategy: 'token_bucket',
    },
    transforms: {
      modelSlugTransformer: openrouterModelSlugTransformer,
      metricTransformers: {
        price_per_1m_input_tokens: (v) => v?.toString() ?? '',
        price_per_1m_output_tokens: (v) => v?.toString() ?? '',
        context_length: (v) => v?.toString() ?? '',
        top_provider_max_tokens: (v) => v?.toString() ?? '',
      },
    },
    enabled: true,
    fetch: fetchOpenRouter,
  },
  {
    sourceId: 'huggingface',
    name: 'HuggingFace Hub',
    description: 'Model downloads, likes, and tags from HuggingFace',
    url: 'https://huggingface.co/api/models',
    ttlMs: 12 * 60 * 60 * 1000, // 12 hours (PROPOSED DEFAULT)
    maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days (PROPOSED DEFAULT)
    rateLimit: {
      requestsPerMinute: 16, // ~1000/hour anonymous limit
      strategy: 'sliding_window',
    },
    transforms: {
      modelSlugTransformer: huggingfaceModelSlugTransformer,
      metricTransformers: {
        downloads: (v) => v?.toString() ?? '',
        likes: (v) => v?.toString() ?? '',
        tags: (v) => typeof v === 'string' ? v : '',
      },
    },
    enabled: true,
    fetch: fetchHuggingFace,
  },
  {
    sourceId: 'artificial_analysis',
    name: 'Artificial Analysis',
    description: 'Model inference speed, price, and quality benchmarks',
    url: 'https://artificialanalysis.ai/api/models',
    ttlMs: 24 * 60 * 60 * 1000, // 24 hours (PROPOSED DEFAULT)
    maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days (PROPOSED DEFAULT)
    rateLimit: {
      requestsPerMinute: 60,
      strategy: 'token_bucket',
    },
    transforms: {
      modelSlugTransformer: artificialAnalysisModelSlugTransformer,
      metricTransformers: {},
    },
    enabled: false, // Disabled by default due to authentication requirement
    fetch: fetchArtificialAnalysis,
  },
  {
    sourceId: 'lmsys',
    name: 'LMSYS Chatbot Arena',
    description: 'Community benchmark rankings from LMSYS Chatbot Arena',
    url: 'https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard',
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days (PROPOSED DEFAULT)
    maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days (PROPOSED DEFAULT)
    rateLimit: {
      requestsPerMinute: 10,
      strategy: 'exponential_backoff',
    },
    transforms: {
      modelSlugTransformer: getModelSlugTransformer('lmsys'),
      metricTransformers: {
        arena_score: (v) => v?.toString() ?? '',
        num_cycles: (v) => v?.toString() ?? '',
        win_rate: (v) => v?.toString() ?? '',
      },
    },
    enabled: true,
    fetch: fetchLmsys,
  },
];

/**
 * Get source configuration by ID
 */
export function getExternalSource(sourceId: string): ExternalBenchmarkSource | undefined {
  return BUILTIN_EXTERNAL_SOURCES.find(s => s.sourceId === sourceId);
}

/**
 * Get all enabled sources
 */
export function getEnabledSources(): ExternalBenchmarkSource[] {
  return BUILTIN_EXTERNAL_SOURCES.filter(s => s.enabled);
}
