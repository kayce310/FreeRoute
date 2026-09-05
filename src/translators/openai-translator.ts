import { type NormalizedChatRequest } from '../inference.js';

export function translateOpenAIRequest(input: { modelId: string; request: NormalizedChatRequest }): object {
  return {
    model: input.modelId,
    messages: input.request.messages,
    temperature: input.request.temperature,
    ...(input.request.tools?.length ? { tools: input.request.tools } : {}),
    stream: false,
    ...(input.request.responseFormat ? { response_format: input.request.responseFormat } : {}),
  };
}
