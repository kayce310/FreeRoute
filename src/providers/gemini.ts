function toGeminiRequest(request: NormalizedChatRequest): object {
  const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\\n');
  const contents = request.messages.filter((message) => message.role !== 'system').map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }]
  }));
  const extra = {};
  if (request.tools) extra.tools = request.tools;
  if (request.temperature !== undefined) extra.generationConfig = { temperature: request.temperature };
  return { contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), ...extra };
}