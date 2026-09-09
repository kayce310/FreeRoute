import { registerResponseTranslator } from '../registry.js';

export function anthropicToOpenaiResponse(chunk: unknown, state?: unknown): unknown | null {
  return chunk;
}

registerResponseTranslator('anthropic', 'openai', anthropicToOpenaiResponse);
