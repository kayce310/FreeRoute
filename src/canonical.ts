import type { ChatContent, ChatMessage, ToolCall, ToolDefinition, NormalizedChatRequest } from './inference.js';

export interface CanonicalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

export interface CanonicalTool {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface CanonicalStreamEvent {
  id: string;
  text?: string;
  reasoning?: string;
  toolCallDelta?: ToolCallDelta;
  finishReason?: string | null;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

export interface ToolCallDelta {
  index: number;
  id: string;
  name?: string;
  argumentFragment: string;
}

export interface CanonicalRequest {
  model: string;
  messages: CanonicalMessage[];
  tools?: CanonicalTool[];
  stream: boolean;
  responseFormat?: { type: 'json_object' };
  temperature?: number;
  hasVision: boolean;
}

export function createCanonicalRequest(request: NormalizedChatRequest): CanonicalRequest {
  return {
    model: request.requestedModel ?? '',
    messages: request.messages.map(normalizeMessage),
    tools: request.tools?.map(normalizeTool),
    stream: false,
    responseFormat: request.responseFormat,
    temperature: request.temperature,
    hasVision: request.messages.some(hasVisionContent),
  };
}

function normalizeMessage(message: ChatMessage): CanonicalMessage {
  const content = typeof message.content === 'string' ? message.content : '';
  if (typeof message.content === 'string') {
    return { role: message.role, content };
  }
  const parts = message.content ?? [];
  const textParts = parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');
  return { role: message.role, content: textParts };
}

function normalizeTool(tool: ToolDefinition): CanonicalTool {
  return {
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  };
}

function hasVisionContent(message: ChatMessage): boolean {
  if (typeof message.content !== 'string' && message.content !== null && message.content.length > 0 && message.content.some((part) => part.type === 'image_url')) {
    return true;
  }
  return false;
}

export function assembleToolCalls(events: CanonicalStreamEvent[]): ToolCall[] {
  const fragments = new Map<number, { id: string; name?: string; argumentFragment: string }>();
  for (const event of events) {
    if (!event.toolCallDelta) continue;
    const { index, id, name, argumentFragment } = event.toolCallDelta;
    const existing = fragments.get(index) ?? { id, name: '', argumentFragment: '' };
    if (name) existing.name = name;
    existing.argumentFragment += argumentFragment;
    fragments.set(index, existing);
  }
  return [...fragments.entries()].sort((a, b) => a[0] - b[0]).map(([, fragment]) => ({
    id: fragment.id,
    type: 'function' as const,
    function: {
      name: fragment.name ?? '',
      arguments: fragment.argumentFragment,
    },
  }));
}
