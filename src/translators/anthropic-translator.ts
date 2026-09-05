import { sanitizeJsonSchema } from '../utils/schema-sanitizer.js';
import { type NormalizedChatRequest } from '../inference.js';

export function translateAnthropicRequest(request: NormalizedChatRequest): object {
  const system = request.messages.filter((msg) => msg.role === 'system').map((msg) => msg.content).join('\n');
  const messages = request.messages
    .filter((msg) => msg.role !== 'system')
    .map((msg) => ({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: convertContentToAnthropicBlocks(msg.content),
    }));

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
