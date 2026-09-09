// Registry for translators (hub-and-spoke)
import type { NormalizedChatRequest } from '../inference.js';

export type TranslatorFormat = 'openai' | 'anthropic' | 'gemini' | 'ollama' | 'kiro';

export interface RequestTranslator {
  (modelId: string, request: NormalizedChatRequest): object;
}

export interface ResponseTranslator {
  (chunk: unknown, state: unknown): unknown | unknown[] | null;
}

export const requestRegistry = new Map<string, RequestTranslator>();
export const responseRegistry = new Map<string, ResponseTranslator>();

export function registerRequestTranslator(from: TranslatorFormat, to: TranslatorFormat, fn: RequestTranslator): void {
  requestRegistry.set(`${from}:${to}`, fn);
}

export function registerResponseTranslator(from: TranslatorFormat, to: TranslatorFormat, fn: ResponseTranslator): void {
  responseRegistry.set(`${from}:${to}`, fn);
}
