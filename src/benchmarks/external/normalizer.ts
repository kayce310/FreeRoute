/**
 * Model permaslug normalizer.
 * Converts external source model naming conventions to a consistent permaslug format.
 */
import type { ModelSlugTransformer } from './interfaces.js';

/**
 * Default model slug normalization:
 * - Lowercase
 * - Replace non-alphanumeric chars (except -, _, .) with hyphens
 * - Collapse multiple hyphens
 * - Trim hyphens from edges
 */
export function defaultModelSlugTransformer(_source: string, rawSlug: string): string {
  return rawSlug
    .toLowerCase()
    .replace(/[^a-z0-9\-_.]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * OpenRouter-specific normalization: "openai/gpt-4o" -> "openai-gpt-4o"
 */
export function openrouterModelSlugTransformer(_source: string, rawSlug: string): string {
  // Remove provider prefix if present
  const withoutPrefix = rawSlug.replace(/^[a-z0-9-]+\//i, '');
  return defaultModelSlugTransformer('openrouter', withoutPrefix);
}

/**
 * HuggingFace-specific normalization: "meta-llama/Llama-3.1-8B" -> "meta-llama-llama-3.1-8b"
 */
export function huggingfaceModelSlugTransformer(_source: string, rawSlug: string): string {
  // Keep namespace/model format but lowercase and clean
  return defaultModelSlugTransformer('huggingface', rawSlug);
}

/**
 * Artificial Analysis normalization: "gpt-4o-2024-05-13" -> "gpt-4o"
 * Strips version dates and suffixes
 */
export function artificialAnalysisModelSlugTransformer(_source: string, rawSlug: string): string {
  // Remove date suffixes like -2024-05-13 or -20240229
  let cleaned = rawSlug.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  cleaned = cleaned.replace(/-\d{8}$/, '');
  // Remove tier suffixes like -preview, -agent, -high, -medium, -low
  cleaned = cleaned.replace(/-(preview|agent|high|medium|low|turbo|beta)$/i, '');
  return defaultModelSlugTransformer('artificial_analysis', cleaned);
}

/**
 * LMSYS Arena normalization
 */
export function lmsysModelSlugTransformer(_source: string, rawSlug: string): string {
  // LMSYS uses simple model names
  return defaultModelSlugTransformer('lmsys', rawSlug);
}

/** Registry of model slug transformers by source */
export const MODEL_SLUG_TRANSFORMERS: Record<string, ModelSlugTransformer> = {
  openrouter: openrouterModelSlugTransformer,
  huggingface: huggingfaceModelSlugTransformer,
  artificial_analysis: artificialAnalysisModelSlugTransformer,
  lmsys: lmsysModelSlugTransformer,
};

/**
 * Get the appropriate transformer for a source
 */
export function getModelSlugTransformer(sourceId: string): ModelSlugTransformer {
  return MODEL_SLUG_TRANSFORMERS[sourceId] || defaultModelSlugTransformer;
}
