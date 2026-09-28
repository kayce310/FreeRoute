import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultModelSlugTransformer,
  openrouterModelSlugTransformer,
  huggingfaceModelSlugTransformer,
  artificialAnalysisModelSlugTransformer,
  getModelSlugTransformer,
} from '../../src/benchmarks/external/normalizer.js';

test('defaultModelSlugTransformer: normalizes slugs', () => {
  assert.equal(defaultModelSlugTransformer('test', 'GPT-4o'), 'gpt-4o');
  assert.equal(defaultModelSlugTransformer('test', 'meta-llama/Llama-3.1-8B'), 'meta-llama-llama-3.1-8b');
  assert.equal(defaultModelSlugTransformer('test', 'deepseek-ai/DeepSeek-V2.5'), 'deepseek-ai-deepseek-v2.5');
});

test('openrouterModelSlugTransformer: removes provider prefix', () => {
  assert.equal(openrouterModelSlugTransformer('openrouter', 'openai/gpt-4o'), 'gpt-4o');
  assert.equal(openrouterModelSlugTransformer('openrouter', 'anthropic/claude-3-opus'), 'claude-3-opus');
});

test('huggingfaceModelSlugTransformer: keeps namespace', () => {
  assert.equal(huggingfaceModelSlugTransformer('huggingface', 'meta-llama/Meta-Llama-3.1-8B-Instruct'), 'meta-llama-meta-llama-3.1-8b-instruct');
});

test('artificialAnalysisModelSlugTransformer: strips version dates', () => {
  assert.equal(artificialAnalysisModelSlugTransformer('artificial_analysis', 'gpt-4o-2024-05-13'), 'gpt-4o');
  assert.equal(artificialAnalysisModelSlugTransformer('artificial_analysis', 'claude-3-opus-20240229'), 'claude-3-opus');
});

test('getModelSlugTransformer: returns correct transformer', () => {
  assert.equal(typeof getModelSlugTransformer('openrouter'), 'function');
  assert.equal(typeof getModelSlugTransformer('huggingface'), 'function');
  assert.equal(typeof getModelSlugTransformer('unknown'), 'function'); // Falls back to default
});
