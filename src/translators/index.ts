import type { NormalizedChatRequest } from '../inference.js';
import { requestRegistry, responseRegistry, type TranslatorFormat } from './registry.js';
import { ensureToolCallIds } from './concerns/toolCall.js';

export * from './registry.js';

export function translateRequest(sourceFormat: TranslatorFormat, targetFormat: TranslatorFormat, modelId: string | undefined, request: NormalizedChatRequest): object {
  ensureToolCallIds(request);
  if (sourceFormat === targetFormat) return request;
  const id = modelId ?? 'unknown';

  const directKey = `${sourceFormat}:${targetFormat}`;
  const directFn = requestRegistry.get(directKey);
  if (directFn) return directFn(id, request);

  let result: any = request;
  if (sourceFormat !== 'openai') {
    const toOpenAI = requestRegistry.get(`${sourceFormat}:openai`);
    if (toOpenAI) result = toOpenAI(id, request);
  }

  if (targetFormat !== 'openai') {
    const fromOpenAI = requestRegistry.get(`openai:${targetFormat}`);
    if (fromOpenAI) result = fromOpenAI(id, result);
  }

  return result;
}

export function translateResponse(targetFormat: TranslatorFormat, sourceFormat: TranslatorFormat, chunk: unknown, state?: unknown): unknown[] {
  if (sourceFormat === targetFormat) return [chunk];

  const directKey = `${targetFormat}:${sourceFormat}`;
  const directFn = responseRegistry.get(directKey);
  if (directFn) {
    const result = directFn(chunk, state);
    return result ? (Array.isArray(result) ? result : [result]) : [];
  }

  let results: unknown[] = [chunk];
  if (targetFormat !== 'openai') {
    const toOpenAI = responseRegistry.get(`${targetFormat}:openai`);
    if (toOpenAI) {
      const converted = toOpenAI(chunk, state);
      results = converted ? (Array.isArray(converted) ? converted : [converted]) : [];
    }
  }

  if (sourceFormat !== 'openai' && results.length > 0) {
    const fromOpenAI = responseRegistry.get(`openai:${sourceFormat}`);
    if (fromOpenAI) {
      const finalResults: unknown[] = [];
      for (const r of results) {
        const converted = fromOpenAI(r, state);
        if (converted) finalResults.push(...(Array.isArray(converted) ? converted : [converted]));
      }
      results = finalResults;
    }
  }

  return results;
}

import './request/openai-to-gemini.js';
import './response/gemini-to-openai.js';
import './request/openai-to-anthropic.js';
import './response/anthropic-to-openai.js';
