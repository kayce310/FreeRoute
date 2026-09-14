import { registerRequestTranslator } from '../registry.js';
import { sanitizeJsonSchema } from '../../utils/schema-sanitizer.js';
import type { NormalizedChatRequest } from '../../inference.js';

function convertContentToAnthropicBlocks(content: any): any {
  if (!content) return [];
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content.map((part: any) => {
    if (part.type === 'text') return { type: 'text', text: part.text };
    if (part.type === 'image_url') {
      const url = part.image_url.url;
      if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,(.*)$/);
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: match ? match[1] : 'image/jpeg',
            data: match ? match[2] : '',
          },
        };
      }
      return { type: 'text', text: `[image](${url})` };
    }
    return { type: 'text', text: '' };
  });
}

function safeParseJSON(str: unknown): any {
  if (typeof str !== 'string') return str ?? {};
  try {
    return JSON.parse(str);
  } catch {
    return { raw: str };
  }
}

export function openaiToAnthropicRequest(modelId: string, request: NormalizedChatRequest): object {
  const system = request.messages.filter((msg) => msg.role === 'system').map((msg) => msg.content).join('\n');
  const nonSystemMessages = request.messages.filter((msg) => msg.role !== 'system');

  const messages: Array<{ role: 'user' | 'assistant'; content: any[] }> = [];

  for (const msg of nonSystemMessages as any[]) {
    const role: 'user' | 'assistant' = (msg.role === 'assistant') ? 'assistant' : 'user';
    const blocks: any[] = [];

    if (msg.role === 'tool') {
      blocks.push({
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? ''),
      });
    } else if (msg.role === 'assistant') {
      if (msg.reasoning_content) {
        blocks.push({ type: 'thinking', thinking: msg.reasoning_content });
      }
      if (msg.content) {
        blocks.push(...convertContentToAnthropicBlocks(msg.content));
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc.function) {
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input: safeParseJSON(tc.function.arguments),
            });
          }
        }
      }
    } else {
      // User or other
      if (msg.content) {
        blocks.push(...convertContentToAnthropicBlocks(msg.content));
      }
    }

    if (blocks.length === 0) continue;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === role) {
      lastMsg.content.push(...blocks);
    } else {
      messages.push({ role, content: blocks });
    }
  }

  const payload: Record<string, any> = {
    messages,
    ...(system ? { system } : {}),
  };

  if (request.tools?.length) {
    payload.tools = request.tools.map((tool) => ({
      name: tool.function.name,
      ...(tool.function.description ? { description: tool.function.description } : {}),
      input_schema: sanitizeJsonSchema(tool.function.parameters),
    }));
  }

  if (request.temperature !== undefined) payload.temperature = request.temperature;

  return payload;
}

registerRequestTranslator('openai', 'anthropic', openaiToAnthropicRequest);

