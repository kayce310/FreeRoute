import { registerRequestTranslator } from '../registry.js';
import { sanitizeJsonSchema } from '../../utils/schema-sanitizer.js';
import type { NormalizedChatRequest } from '../../inference.js';

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

function sanitizeGeminiFunctionName(name: string): string {
  if (!name) return '_unknown';
  let sanitized = name.replace(/[^a-zA-Z0-9_.:-]/g, '_');
  if (!/^[a-zA-Z_]/.test(sanitized)) sanitized = '_' + sanitized;
  return sanitized.slice(0, 64);
}

function safeParseJSON(str: unknown): any {
  if (typeof str !== 'string') return str ?? {};
  try {
    return JSON.parse(str);
  } catch {
    return { content: str };
  }
}

import { DEFAULT_THINKING_AG_SIGNATURE } from '../../config/thinking-signatures.js';

export function openaiToGeminiRequest(modelId: string, request: NormalizedChatRequest): object {
  const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n');
  const nonSystemMessages = request.messages.filter((message) => message.role !== 'system');

  // Build mapping from tool_call_id to function name
  const toolCallMap = new Map<string, string>();
  for (const msg of nonSystemMessages as any[]) {
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc.id && tc.function?.name) {
          toolCallMap.set(tc.id, tc.function.name);
        }
      }
    }
  }

  const contents: Array<{ role: 'user' | 'model'; parts: any[] }> = [];

  for (const msg of nonSystemMessages as any[]) {
    const role: 'user' | 'model' = (msg.role === 'assistant') ? 'model' : 'user';
    const parts: any[] = [];

    if (msg.role === 'tool') {
      const funcName = toolCallMap.get(msg.tool_call_id) || msg.name || 'tool';
      parts.push({
        functionResponse: {
          name: sanitizeGeminiFunctionName(funcName),
          response: safeParseJSON(msg.content),
        },
      });
    } else if (msg.role === 'assistant') {
      if (msg.reasoning_content) {
        parts.push({ thought: true, text: msg.reasoning_content });
      }
      if (msg.content) {
        parts.push(...convertContentToGeminiParts(msg.content));
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const tc of msg.tool_calls) {
          if (tc.function?.name) {
            parts.push({
              thoughtSignature: DEFAULT_THINKING_AG_SIGNATURE,
              functionCall: {
                id: tc.id,
                name: sanitizeGeminiFunctionName(tc.function.name),
                args: safeParseJSON(tc.function.arguments),
              },
            });
          }
        }
      }
    } else {
      if (msg.content) {
        parts.push(...convertContentToGeminiParts(msg.content));
      }
    }

    if (parts.length === 0) continue;

    const last = contents[contents.length - 1];
    if (last && last.role === role) {
      last.parts.push(...parts);
    } else {
      contents.push({ role, parts });
    }
  }

  const extra: Record<string, unknown> = {};
  if (request.tools?.length) {
    extra.tools = [{
      functionDeclarations: request.tools.map((tool) => ({
        name: sanitizeGeminiFunctionName(tool.function.name),
        ...(tool.function.description ? { description: tool.function.description } : {}),
        ...(tool.function.parameters ? { parameters: sanitizeJsonSchema(tool.function.parameters) } : {}),
      })),
    }];
  }
  if (request.temperature !== undefined) extra.generationConfig = { temperature: request.temperature };
  return { contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), ...extra };
}

registerRequestTranslator('openai', 'gemini', openaiToGeminiRequest);

