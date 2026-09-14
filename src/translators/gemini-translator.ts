import { openaiToGeminiRequest } from './request/openai-to-gemini.js';
import type { NormalizedChatRequest } from '../inference.js';

export function translateGeminiRequest(request: NormalizedChatRequest): object {
  return openaiToGeminiRequest('gemini', request);
}

