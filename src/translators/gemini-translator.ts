import { sanitizeJsonSchema } from '../utils/schema-sanitizer.js';
import { type NormalizedChatRequest } from '../inference.js';

export function translateGeminiRequest(request: NormalizedChatRequest): object {
  const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
  const contents = request.messages.filter((message) => message.role !== 'system').map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: convertContentToGeminiParts(message.content),
  }));
  const extra: Record<string, unknown> = {};
  if (request.tools?.length) {
    extra.tools = [{
      functionDeclarations: request.tools.map((tool) => ({
        name: tool.function.name,
        ...(tool.function.description ? { description: tool.function.description } : {}),
        ...(tool.function.parameters ? { parameters: sanitizeJsonSchema(tool.function.parameters) } : {}),
      })),
    }];
  }
  if (request.temperature !== undefined) extra.generationConfig = { temperature: request.temperature };
  return { contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), ...extra };
}

function convertContentToGeminiParts(content: any): any {
  if (!content) return [];
  if (typeof content === 'string') return [{ text: content }];
  return content.map((part: any) => {
    if (part.type === 'text') return { text: part.text };
    if (part.type === 'image_url') {
      const url = part.image_url.url;
      if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,/);
        return { inlineData: { mimeType: match ? match[1] : 'image/jpeg', data: url.replace(/^data:[^;]+;base64,/, '') } };
      }
      return { text: `[image](${url})` };
    }
    return { text: '' };
  });
}
