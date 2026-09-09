import { registerResponseTranslator } from '../registry.js';

export function geminiToOpenaiResponse(chunk: unknown, state?: unknown): unknown | null {
  return chunk;
}

registerResponseTranslator('gemini', 'openai', geminiToOpenaiResponse);
