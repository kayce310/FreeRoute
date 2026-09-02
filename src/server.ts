import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { CatalogStore } from './catalog.js';
import { ChatService, ProviderInvocationError, type ChatMessage } from './inference.js';
import type { SqliteRoutingEventStore } from './storage/sqlite-routing-event-store.js';
import type { SqliteQuotaObservationStore } from './storage/sqlite-quota-observation-store.js';
import type { SqlitePreferenceStore } from './storage/sqlite-preference-store.js';
import type { Preference } from './contracts.js';

export interface FreeRouteServerOptions {
  catalog: CatalogStore;
  apiToken?: string;
  chat?: ChatService;
  events?: SqliteRoutingEventStore;
  quotas?: SqliteQuotaObservationStore;
  preferences?: SqlitePreferenceStore;
}

export function createFreeRouteServer(options: FreeRouteServerOptions): Server {
  return createServer(async (request, response) => {
    try {
      if (!isAuthorized(request, options.apiToken)) {
        sendJson(response, 401, { error: { message: 'invalid API key', type: 'authentication_error' } });
        return;
      }

      const path = new URL(request.url ?? '/', 'http://localhost').pathname;
      if (request.method === 'GET' && path === '/health') {
        sendJson(response, 200, { status: 'ok' });
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
            profile: target.profile, requiredCapabilities: ['chat', 'streaming'], requestedProviderId: target.providerId,
            requestedModel: target.modelId, messages: input.messages, temperature: input.temperature, traceId: requestId,
          });
          response.writeHead(200, {
            'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache', connection: 'keep-alive',
            'x-freeroute-provider': result.decision.candidate.providerId,
            'x-freeroute-model': result.decision.candidate.modelId,
          });
          for await (const event of result.events) {
            response.write(`data: ${JSON.stringify({ id: event.id, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1_000), model: `${result.decision.candidate.providerId}/${result.decision.candidate.modelId}`, choices: [{ index: 0, delta: event.delta === undefined ? {} : { content: event.delta }, finish_reason: event.finishReason ?? null }] })}\n\n`);
          }
          response.end('data: [DONE]\n\n');
          return;
        }
        const result = await options.chat.complete({
          profile: target.profile,
          requiredCapabilities: ['chat'],
          requestedProviderId: target.providerId,
          requestedModel: target.modelId,
          messages: input.messages,
          temperature: input.temperature,
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
          choices: [{ index: 0, message: { role: 'assistant', content: result.response.content }, finish_reason: 'stop' }],
        });
        return;
      }

      if (request.method === 'POST' && path === '/v1/responses') {
        if (!options.chat) { sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } }); return; }
        const input = await readResponsesRequest(request);
        const target = parseRequestedModel(input.model);
        const requestId = crypto.randomUUID();
        response.setHeader('x-freeroute-request-id', requestId);
        const result = await options.chat.complete({
          profile: target.profile, requiredCapabilities: ['chat'], requestedProviderId: target.providerId,
          requestedModel: target.modelId, messages: input.messages, traceId: requestId,
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
        const result = await options.chat.complete({
          profile: target.profile, requiredCapabilities: ['chat'], requestedProviderId: target.providerId,
          requestedModel: target.modelId, messages: input.messages, traceId: requestId,
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

interface OpenAIChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
}

class InvalidChatRequestError extends Error {}

async function readChatRequest(request: IncomingMessage): Promise<OpenAIChatRequest> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; messages?: unknown; temperature?: unknown; stream?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (!Array.isArray(value.messages) || !value.messages.every(isChatMessage)) throw new InvalidChatRequestError('messages must contain role and string content');
  if (value.temperature !== undefined && typeof value.temperature !== 'number') throw new InvalidChatRequestError('temperature must be a number');
  if (value.stream !== undefined && typeof value.stream !== 'boolean') throw new InvalidChatRequestError('stream must be a boolean');
  return { model: value.model, messages: value.messages, temperature: value.temperature, stream: value.stream };
}

async function readResponsesRequest(request: IncomingMessage): Promise<{ model: string; messages: ChatMessage[] }> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; input?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (typeof value.input === 'string') return { model: value.model, messages: [{ role: 'user', content: value.input }] };
  if (Array.isArray(value.input) && value.input.every(isResponsesMessage)) {
    return { model: value.model, messages: value.input.map((message) => ({ role: message.role, content: message.content })) };
  }
  throw new InvalidChatRequestError('input must be a string or messages with role and string content');
}

async function readAnthropicMessagesRequest(request: IncomingMessage): Promise<{ model: string; messages: ChatMessage[] }> {
  const body = await readJsonBody(request);
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; system?: unknown; messages?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (value.system !== undefined && typeof value.system !== 'string') throw new InvalidChatRequestError('system must be a string');
  if (!Array.isArray(value.messages) || !value.messages.every(isAnthropicMessage)) throw new InvalidChatRequestError('messages must contain user or assistant roles and string content');
  const messages: ChatMessage[] = value.system ? [{ role: 'system', content: value.system }] : [];
  messages.push(...value.messages.map((message) => ({ role: message.role, content: message.content })));
  return { model: value.model, messages };
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

function isResponsesMessage(value: unknown): value is ChatMessage {
  return isChatMessage(value);
}

function isAnthropicMessage(value: unknown): value is ChatMessage {
  if (!isChatMessage(value)) return false;
  return value.role === 'user' || value.role === 'assistant';
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as { role?: unknown; content?: unknown };
  return (message.role === 'system' || message.role === 'user' || message.role === 'assistant' || message.role === 'tool')
    && typeof message.content === 'string';
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
