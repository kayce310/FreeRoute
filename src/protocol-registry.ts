export type AdapterType = 'openai-compatible' | 'anthropic' | 'gemini' | 'ollama' | 'kiro';
export const PROTOCOL_MAP: Record<string, AdapterType> = {
  // OpenAI-compatible (request + response đều chuẩn OpenAI)
  'openai': 'openai-compatible',
  'groq': 'openai-compatible',
  'openrouter': 'openai-compatible',
  'mistral': 'openai-compatible',
  'deepseek': 'openai-compatible',
  'cerebras': 'openai-compatible',
  'fireworks': 'openai-compatible',
  'together': 'openai-compatible',
  'perplexity': 'openai-compatible',
  'xai': 'openai-compatible',
  'cohere': 'openai-compatible',
  'siliconflow': 'openai-compatible',
  'nebius': 'openai-compatible',
  'cursor': 'openai-compatible',
  'github-copilot': 'openai-compatible',
  'command-code': 'openai-compatible',
  // Cần adapter riêng
  'anthropic': 'anthropic',
  'gemini': 'gemini',
  'antigravity': 'gemini',
  'vertex': 'gemini',
  'gemini-cli': 'gemini',
  'ollama': 'ollama',
  'ollama-cloud': 'ollama',
  'kiro': 'kiro',
};
