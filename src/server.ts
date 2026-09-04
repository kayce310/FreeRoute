import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { CatalogStore } from './catalog.js';
import { ChatService, ProviderInvocationError, type ChatMessage } from './inference.js';
import type { SqliteRoutingEventStore } from './storage/sqlite-routing-event-store.js';
import type { SqliteQuotaObservationStore } from './storage/sqlite-quota-observation-store.js';
import type { SqlitePreferenceStore } from './storage/sqlite-preference-store.js';
import type { Preference } from './contracts.js';

export interface FreeRouteServerOptions {
  catalog: CatalogStore;
  apiToken?: string; // optional — / and /health are public
  chat?: ChatService;
  events?: SqliteRoutingEventStore;
  quotas?: SqliteQuotaObservationStore;
  preferences?: SqlitePreferenceStore;
}

export function createFreeRouteServer(options: FreeRouteServerOptions): Server {
  return createServer(async (request, response) => {
    try {
      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/') {
        sendHtml(response, dashboardHtml());
        return;
      }
      if (request.method === 'GET' && path === '/health') {
        sendJson(response, 200, { status: 'ok' });
        return;
      }
      if (!isAuthorized(request, options.apiToken)) {
        sendJson(response, 401, { error: { message: 'invalid API key', type: 'authentication_error' } });
        return;
      }

      if (request.method === 'GET' && path === '/v1/models') {
        const models = await options.catalog.list();
        sendJson(response, 200, {
          object: 'list',
          data: models
            .filter((model) => model.freeTier !== 'retired')
            .map((model) => ({
              id: `${model.providerId}/${model.modelId}`,
              object: 'model',
              created: Math.floor(model.checkedAt.getTime() / 1000),
              owned_by: model.providerId,
              freeroute: {
                capabilities: model.capabilities,
                free_tier: model.freeTier,
              },
            })),
        });
        return;
      }

      if (request.method === 'GET' && path === '/v1/routing-events') {
        if (!options.events) { sendJson(response, 503, { error: { message: 'routing event storage is not configured', type: 'server_error' } }); return; }
        const events = await options.events.list();
        sendJson(response, 200, { object: 'list', data: events.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })) });
        return;
      }

      if (request.method === 'GET' && path === '/v1/quota-observations') {
        if (!options.quotas) { sendJson(response, 503, { error: { message: 'quota observation storage is not configured', type: 'server_error' } }); return; }
        const observations = await options.quotas.list();
        sendJson(response, 200, { object: 'list', data: observations.map((item) => ({ ...item, observedAt: item.observedAt.toISOString(), resetAt: item.resetAt?.toISOString() })) });
        return;
      }

      if (request.method === 'GET' && path === '/v1/provider-health') {
        if (!options.events) { sendJson(response, 503, { error: { message: 'routing event storage is not configured', type: 'server_error' } }); return; }
        const health = summarizeProviderHealth(await options.events.list(10_000));
        sendJson(response, 200, { object: 'list', data: health });
        return;
      }

      if (request.method === 'GET' && path === '/v1/preferences') {
        if (!options.preferences) { sendJson(response, 503, { error: { message: 'preference storage is not configured', type: 'server_error' } }); return; }
        const preferences = await options.preferences.list();
        sendJson(response, 200, { object: 'list', data: preferences.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })) });
        return;
      }

      if (request.method === 'PUT' && path === '/v1/preferences') {
        if (!options.preferences) { sendJson(response, 503, { error: { message: 'preference storage is not configured', type: 'server_error' } }); return; }
        const input = await readPreferenceRequest(request);
        await options.preferences.set(input.providerId, input.modelId, input.preference);
        sendJson(response, 200, { provider_id: input.providerId, model_id: input.modelId, preference: input.preference });
        return;
      }

      if (request.method === 'POST' && path === '/v1/chat/completions') {
        if (!options.chat) {
          sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } });
          return;
        }
        const input = await readChatRequest(request);
        const target = parseRequestedModel(input.model);
        const requestId = crypto.randomUUID();
        response.setHeader('x-freeroute-request-id', requestId);
        if (input.stream) {
          const result = await options.chat.stream({
            profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), true, input.responseFormat, input.hasVision), requestedProviderId: target.providerId,
            requestedModel: target.modelId, messages: input.messages, temperature: input.temperature, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
          });
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
            'x-freeroute-provider': result.decision.candidate.providerId,
            'x-freeroute-model': result.decision.candidate.modelId,
          });
          for await (const event of result.events) {
            response.write(`data: ${JSON.stringify({ id: event.id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1_000), model: `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`, choices: [{ index: 0, delta: event.delta === undefined ? {} : { content: event.delta }, finish_reason: event.finishReason ?? null, ...(event.toolCalls?.length ? { tool_calls: event.toolCalls } : {}) }] })}\n\n`);
          }
          response.end('data: [DONE]\n\n');
          return;
        }
        const result = await options.chat.complete({
          profile: target.profile,
          requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), false, input.responseFormat, input.hasVision),
          requestedProviderId: target.providerId,
          requestedModel: target.modelId,
          messages: input.messages,
          temperature: input.temperature,
          tools: input.tools,
          responseFormat: input.responseFormat,
          traceId: requestId,
        });
        response.setHeader('x-freeroute-provider', result.response.providerId);
        response.setHeader('x-freeroute-model', result.response.modelId);
        response.setHeader('x-freeroute-fallback-count', String(result.fallbackCount));
        sendJson(response, 200, {
          id: result.response.id,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1_000),
          model: `${result.response.providerId}/${result.response.modelId}`,
          choices: [{ index: 0, message: { role: 'assistant', content: result.response.content || null, ...(result.response.toolCalls?.length ? { tool_calls: result.response.toolCalls } : {}) }, finish_reason: result.response.toolCalls?.length ? 'tool_calls' : 'stop' }],
        });
        return;
      }

      if (request.method === 'POST' && path === '/v1/responses') {
        if (!options.chat) { sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } }); return; }
        const input = await readResponsesRequest(request);
        const target = parseRequestedModel(input.model);
        const requestId = crypto.randomUUID();
        response.setHeader('x-freeroute-request-id', requestId);
        if (input.stream) {
          const result = await options.chat.stream({
            profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), true, input.responseFormat), requestedProviderId: target.providerId,
            requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
          });
          const model = `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`;
          const responseId = `resp_${requestId}`;
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
            'x-freeroute-provider': result.decision.candidate.providerId,
            'x-freeroute-model': result.decision.candidate.modelId,
          });
          writeResponseEvent(response, 'response.created', { type: 'response.created', response: { id: responseId, object: 'response', created_at: Math.floor(Date.now() / 1_000), status: 'in_progress', model } });
          let outputIndex = 0;
          for await (const event of result.events) {
            if (event.delta) writeResponseEvent(response, 'response.output_text.delta', { type: 'response.output_text.delta', response_id: responseId, item_id: `msg_${responseId}`, output_index: outputIndex, content_index: 0, delta: event.delta });
            if (event.finishReason) outputIndex += 1;
          }
          writeResponseEvent(response, 'response.completed', { type: 'response.completed', response: { id: responseId, object: 'response', created_at: Math.floor(Date.now() / 1_000), status: 'completed', model } });
          response.end('data: [DONE]\n\n');
          return;
        }
        const result = await options.chat.complete({
          profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), false, input.responseFormat), requestedProviderId: target.providerId,
          requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
        });
        response.setHeader('x-freeroute-provider', result.response.providerId);
        response.setHeader('x-freeroute-model', result.response.modelId);
        response.setHeader('x-freeroute-fallback-count', String(result.fallbackCount));
        sendJson(response, 200, {
          id: result.response.id, object: 'response', created_at: Math.floor(Date.now() / 1_000), status: 'completed',
          model: `${result.response.providerId}/${result.response.modelId}`,
          output: [{ type: 'message', id: `msg_${result.response.id}`, status: 'completed', role: 'assistant', content: [{ type: 'output_text', text: result.response.content, annotations: [] }] }],
          output_text: result.response.content,
        });
        return;
      }

      if (request.method === 'POST' && path === '/v1/messages') {
        if (!options.chat) { sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } }); return; }
        const input = await readAnthropicMessagesRequest(request);
        const target = parseRequestedModel(input.model);
        const requestId = crypto.randomUUID();
        response.setHeader('x-freeroute-request-id', requestId);
        if (input.stream) {
          const result = await options.chat.stream({
            profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), true, input.responseFormat), requestedProviderId: target.providerId,
            requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
          });
          const model = `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`;
          const messageId = `msg_${requestId}`;
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
            'x-freeroute-provider': result.decision.candidate.providerId,
            'x-freeroute-model': result.decision.candidate.modelId,
          });
          writeAnthropicEvent(response, 'message_start', { type: 'message_start', message: { id: messageId, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
          writeAnthropicEvent(response, 'content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
          for await (const event of result.events) {
            if (event.delta) writeAnthropicEvent(response, 'content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: event.delta } });
          }
          writeAnthropicEvent(response, 'content_block_stop', { type: 'content_block_stop', index: 0 });
          writeAnthropicEvent(response, 'message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 0 } });
          writeAnthropicEvent(response, 'message_stop', { type: 'message_stop' });
          response.end();
          return;
        }
        const result = await options.chat.complete({
          profile: target.profile, requiredCapabilities: capabilitiesForProfile(target.profile, !!(input.tools?.length), false, input.responseFormat), requestedProviderId: target.providerId,
          requestedModel: target.modelId, messages: input.messages, tools: input.tools, responseFormat: input.responseFormat, traceId: requestId,
        });
        response.setHeader('x-freeroute-provider', result.response.providerId);
        response.setHeader('x-freeroute-model', result.response.modelId);
        response.setHeader('x-freeroute-fallback-count', String(result.fallbackCount));
        sendJson(response, 200, {
          id: `msg_${result.response.id}`, type: 'message', role: 'assistant', model: `${result.response.providerId}/${result.response.modelId}`,
          content: [{ type: 'text', text: result.response.content }], stop_reason: 'end_turn', stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        });
        return;
      }

      sendJson(response, 404, { error: { message: 'not found', type: 'invalid_request_error' } });
    } catch (error) {
      if (error instanceof Error && error.message === 'no eligible route candidates') {
        sendJson(response, 503, { error: { message: 'no eligible route candidate for the requested capabilities', type: 'server_error' } });
        return;
      }
      if (error instanceof ProviderInvocationError) {
        sendJson(response, error.failure.kind === 'authentication' ? 401 : 502, {
          error: { message: error.message, type: error.failure.kind === 'authentication' ? 'authentication_error' : 'upstream_error' },
        });
        return;
      }
      if (error instanceof InvalidChatRequestError) {
        sendJson(response, 400, { error: { message: error.message, type: 'invalid_request_error' } });
        return;
      }
      sendJson(response, 500, { error: { message: 'internal server error', type: 'server_error' } });
    }
  });
}

export interface OpenAIChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  tools?: import('./inference.js').ToolDefinition[];
  responseFormat?: { type: 'json_object' };
  hasVision?: boolean;
}

class InvalidChatRequestError extends Error {}

function capabilitiesForProfile(profile: string, hasTools: boolean, streaming = false, responseFormat?: { type: 'json_object' }, hasVision = false): import('./contracts.js').Capability[] {
  const caps: import('./contracts.js').Capability[] = ['chat'];
  if (streaming) caps.push('streaming');
  if (hasTools || profile === 'auto:code') caps.push('tools');
  if (responseFormat) caps.push('structured-output');
  if (hasVision) caps.push('vision');
  return caps;
}

async function readChatRequest(request: IncomingMessage): Promise<OpenAIChatRequest> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; messages?: unknown; temperature?: unknown; stream?: unknown; tools?: unknown; response_format?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (!Array.isArray(value.messages) || !value.messages.every(isChatMessage)) throw new InvalidChatRequestError('messages must contain role and valid content');
  if (value.temperature !== undefined && typeof value.temperature !== 'number') throw new InvalidChatRequestError('temperature must be a number');
  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(isToolDefinition))) throw new InvalidChatRequestError('tools must be OpenAI function definitions');
  if (value.response_format !== undefined && (typeof value.response_format !== 'object' || !value.response_format || (value.response_format as { type?: unknown }).type !== 'json_object')) throw new InvalidChatRequestError('response_format must be { type: "json_object" }');
  const hasVision = (value.messages as unknown[]).some(msg => {
    if (!msg || typeof msg !== 'object') return false;
    const m = msg as { content?: unknown };
    return Array.isArray(m.content);
  });
  return { model: value.model, messages: value.messages, temperature: value.temperature, stream: value.stream, tools: value.tools, responseFormat: value.response_format as { type: 'json_object' } | undefined, hasVision };
}

async function readResponsesRequest(request: IncomingMessage): Promise<{ model: string; messages: ChatMessage[]; stream?: boolean; tools?: import('./inference.js').ToolDefinition[]; responseFormat?: { type: 'json_object' } }> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; input?: unknown; stream?: unknown; tools?: unknown; response_format?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(isToolDefinition))) throw new InvalidChatRequestError('tools must be OpenAI function definitions');
  if (value.response_format !== undefined && (typeof value.response_format !== 'object' || !value.response_format || (value.response_format as { type?: unknown }).type !== 'json_object')) throw new InvalidChatRequestError('response_format must be { type: "json_object" }');
  if (typeof value.input === 'string') return { model: value.model, messages: [{ role: 'user', content: value.input }], stream: value.stream, tools: value.tools, responseFormat: value.response_format as { type: 'json_object' } | undefined };
  if (Array.isArray(value.input) && value.input.every(isResponsesMessage)) {
    return {
      model: value.model,
      messages: value.input.map((message) => {
        if (isChatMessage(message)) return message;
        const m = message as { role: ChatMessage['role']; content: unknown };
        return { role: m.role, content: extractResponsesText(m.content) };
      }),
      stream: value.stream,
      tools: value.tools,
      responseFormat: value.response_format as { type: 'json_object' } | undefined,
    };
  }
  throw new InvalidChatRequestError('input must be a string or messages with role and string content');
}

async function readAnthropicMessagesRequest(request: IncomingMessage): Promise<{ model: string; messages: ChatMessage[]; stream?: boolean; tools?: import('./inference.js').ToolDefinition[]; responseFormat?: { type: 'json_object' } }> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; system?: unknown; messages?: unknown; stream?: unknown; tools?: unknown; response_format?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (value.system !== undefined && typeof value.system !== 'string') throw new InvalidChatRequestError('system must be a string');
  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
  if (!Array.isArray(value.messages) || !value.messages.every(isAnthropicMessage)) throw new InvalidChatRequestError('messages must contain user or assistant roles and string content');
  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(isAnthropicToolDefinition))) throw new InvalidChatRequestError('tools must be Anthropic tool definitions');
  if (value.response_format !== undefined && (typeof value.response_format !== 'object' || !value.response_format || (value.response_format as { type?: unknown }).type !== 'json_object')) throw new InvalidChatRequestError('response_format must be { type: "json_object" }');
  const messages: ChatMessage[] = value.system ? [{ role: 'system', content: value.system }] : [];
  messages.push(...value.messages.map((message) => ({ role: message.role, content: message.content })));
  return { model: value.model, messages, stream: value.stream, tools: value.tools ? value.tools.map(toOpenAITool) : undefined, responseFormat: value.response_format as { type: 'json_object' } | undefined };
}

function isAnthropicToolDefinition(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const tool = value as { name?: unknown };
  return typeof tool.name === 'string' && tool.name.length > 0;
}

function toOpenAITool(value: unknown): import('./inference.js').ToolDefinition {
  const tool = value as { name: string; description?: unknown; input_schema?: unknown };
  return {
    type: 'function',
    function: {
      name: tool.name,
      ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
      ...(tool.input_schema !== undefined ? { parameters: tool.input_schema } : {}),
    },
  };
}

async function readPreferenceRequest(request: IncomingMessage): Promise<{ providerId: string; modelId: string; preference: Preference }> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { provider_id?: unknown; model_id?: unknown; preference?: unknown };
  if (typeof value.provider_id !== 'string' || !value.provider_id || typeof value.model_id !== 'string' || !value.model_id) throw new InvalidChatRequestError('provider_id and model_id are required');
  if (value.preference !== 'prefer' && value.preference !== 'neutral' && value.preference !== 'limit' && value.preference !== 'block') throw new InvalidChatRequestError('preference must be prefer, neutral, limit, or block');
  return { providerId: value.provider_id, modelId: value.model_id, preference: value.preference };
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += value.length;
    if (length > 1_000_000) throw new InvalidChatRequestError('request body exceeds 1 MB');
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InvalidChatRequestError('request body must be valid JSON'); }
}

function isResponsesMessage(value: unknown): boolean {
  return isChatMessage(value) || isResponsesArrayMessage(value);
}

function isResponsesArrayMessage(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const message = value as { role?: unknown; content?: unknown };
  if (message.role !== 'user' && message.role !== 'system' && message.role !== 'assistant' && message.role !== 'tool') return false;
  return Array.isArray(message.content) && message.content.every((part) => isResponsesContentPart(part));
}

function isResponsesContentPart(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const part = value as { type?: unknown; text?: unknown };
  return part.type === 'input_text' || part.type === 'output_text' || part.type === 'text'
    ? typeof part.text === 'string'
    : true; // ponytail: future part types (image, audio) pass through; downstream provider rejects if unsupported
}

function extractResponsesText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    }).join('');
  }
  return '';
}

function isAnthropicMessage(value: unknown): value is ChatMessage {
  if (!isChatMessage(value)) return false;
  if (value.role !== 'user' && value.role !== 'assistant') return false;
  // ponytail: vision content parts not yet supported for Anthropic Messages API
  return typeof value.content === 'string';
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as { role?: unknown; content?: unknown };
  if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant' && message.role !== 'tool') return false;
  if (typeof message.content === 'string') return true;
  if (Array.isArray(message.content)) {
    return message.content.every(part => {
      if (!part || typeof part !== 'object') return false;
      if (part.type === 'text') return typeof (part as { text?: unknown }).text === 'string';
      if (part.type === 'image_url') return typeof (part as { image_url?: unknown }).image_url === 'object';
      return false;
    });
  }
  return false;
}

function isToolDefinition(value: unknown): value is import('./inference.js').ToolDefinition {
  if (!value || typeof value !== 'object') return false;
  const tool = value as { type?: unknown; function?: { name?: unknown } };
  return tool.type === 'function' && typeof tool.function?.name === 'string' && tool.function.name.length > 0;
}

function parseRequestedModel(model: string): { profile: string; providerId?: string; modelId?: string } {
  if (model.startsWith('auto:')) return { profile: model };
  const separator = model.indexOf('/');
  if (separator > 0 && separator < model.length - 1) {
    return { profile: 'named', providerId: model.slice(0, separator), modelId: model.slice(separator + 1) };
  }
  return { profile: 'named', modelId: model };
}

function isAuthorized(request: IncomingMessage, expectedToken: string | undefined): boolean {
  if (!expectedToken) return true;
  return request.headers.authorization === `Bearer ${expectedToken}`;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(body);
}

function writeResponseEvent(response: ServerResponse, event: string, body: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
}

function writeAnthropicEvent(response: ServerResponse, event: string, body: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(body)}\n\n`);
}

function dashboardHtml(): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FreeRoute</title><style>body{font:14px system-ui;max-width:1100px;margin:32px auto;padding:0 16px}input,button,select{padding:7px;margin:3px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border-bottom:1px solid #ddd;padding:7px;text-align:left}.muted{color:#666}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:24px}</style><h1>FreeRoute</h1><p class="muted">Local catalog and redacted route history. Prompts and provider secrets are never shown.</p><label>Local API token <input id="token" type="password" autocomplete="off"><button onclick="load()">Load</button></label><p id="status"></p><div class="grid"><section><h2>Provider health</h2><table><thead><tr><th>Provider</th><th>Success</th><th>Recent requests</th></tr></thead><tbody id="health"></tbody></table></section><section><h2>Quota observations</h2><table><thead><tr><th>Route</th><th>Requests</th><th>Tokens</th><th>Reset</th></tr></thead><tbody id="quota"></tbody></table></section></div><h2>Models</h2><table><thead><tr><th>Model</th><th>Tier</th><th>Capabilities</th><th>Preference</th></tr></thead><tbody id="models"></tbody></table><h2>Recent routing</h2><table><thead><tr><th>Time</th><th>Route</th><th>Outcome</th><th>Fallbacks</th></tr></thead><tbody id="events"></tbody></table><script>const e=s=>document.querySelector(s),cell=(r,v)=>{let d=document.createElement('td');d.textContent=String(v??'');r.append(d);return d},row=(id,vs)=>{let r=document.createElement('tr');vs.forEach(v=>cell(r,v));e(id).append(r);return r};function token(){return e('#token').value}async function api(p,o={}){let r=await fetch(p,{...o,headers:{...o.headers,authorization:'Bearer '+token()}});if(!r.ok){let b=await r.json().catch(()=>({}));throw Error(b.error?.message||r.statusText)}return r.json()}function preference(model,items){return items.find(x=>x.providerId===model.owned_by&&x.modelId===model.id.slice(model.owned_by.length+1))?.preference||'neutral'}async function setPreference(select,provider,model){try{select.disabled=true;await api('/v1/preferences',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({provider_id:provider,model_id:model,preference:select.value})});e('#status').textContent='Preference saved.'}catch(x){e('#status').textContent='Error: '+x.message}finally{select.disabled=false}}async function load(){try{e('#status').textContent='Loading…';let[m,h,q,p,ph]=await Promise.all([api('/v1/models'),api('/v1/routing-events'),api('/v1/quota-observations'),api('/v1/preferences'),api('/v1/provider-health')]);e('#models').replaceChildren();e('#events').replaceChildren();e('#quota').replaceChildren();e('#health').replaceChildren();m.data.forEach(x=>{let r=row('#models',[x.id,x.freeroute.free_tier,x.freeroute.capabilities.join(', ')]),s=document.createElement('select');['prefer','neutral','limit','block'].forEach(v=>{let o=document.createElement('option');o.value=o.textContent=v;o.selected=v===preference(x,p.data);s.append(o)});s.onchange=()=>setPreference(s,x.owned_by,x.id.slice(x.owned_by.length+1));cell(r,'').append(s)});h.data.forEach(x=>row('#events',[new Date(x.occurredAt).toLocaleString(),x.providerId+'/'+x.modelId,x.outcome,x.fallbackCount]));q.data.forEach(x=>row('#quota',[x.providerId+'/'+x.modelId,x.remainingRequests??'unknown',x.remainingTokens??'unknown',x.resetAt?new Date(x.resetAt).toLocaleString():'unknown']));ph.data.forEach(x=>row('#health',[x.providerId,(x.successRate*100).toFixed(0)+'%',x.requestCount]));e('#status').textContent='Loaded.'}catch(x){e('#status').textContent='Error: '+x.message}}</script>`;
}

function summarizeProviderHealth(events: Array<{ providerId: string; outcome: 'success' | 'failure'; latencyMs?: number }>): Array<{ providerId: string; requestCount: number; successRate: number; latencyP50Ms?: number; latencyP95Ms?: number }> {
  const totals = new Map<string, { requestCount: number; successes: number; latencies: number[] }>();
  for (const event of events) {
    const total = totals.get(event.providerId) ?? { requestCount: 0, successes: 0, latencies: [] };
    total.requestCount += 1;
    if (event.outcome === 'success') total.successes += 1;
    if (event.latencyMs !== undefined) total.latencies.push(event.latencyMs);
    totals.set(event.providerId, total);
  }
  return [...totals].map(([providerId, total]) => ({ providerId, requestCount: total.requestCount, successRate: total.successes / total.requestCount, ...(total.latencies.length ? { latencyP50Ms: percentile(total.latencies, 0.5), latencyP95Ms: percentile(total.latencies, 0.95) } : {}) }))
    .sort((left, right) => right.successRate - left.successRate || right.requestCount - left.requestCount || left.providerId.localeCompare(right.providerId));
}

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * ratio) - 1]!;
}
