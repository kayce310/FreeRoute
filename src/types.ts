export type ChatProviderAdapter = {
  chat(request: ChatRequest, credentialId: string): Promise<ChatResponse>;
  streamChat(request: ChatRequest, credentialId: string): AsyncGenerator<StreamChunk>;
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: any[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
};

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContent[];
};

export type ChatContent = {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
};

export type ChatResponse = {
  content: string;
  reasoning?: string;
  tool_calls?: any[];
  finish_reason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type StreamChunk =
  | { type: 'text'; content: string }
  | { type: 'reasoning'; content: string }
  | { type: 'tool_call'; index: number; id: string; name: string; arguments: string }
  | { type: 'finish'; finishReason: string }
  | { type: 'usage'; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } };
