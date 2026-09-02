import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { CatalogStore } from './catalog.js';
import { ChatService, ProviderInvocationError, type ChatMessage } from './inference.js';

export interface FreeRouteServerOptions {
  catalog: CatalogStore;
  apiToken?: string;
  chat?: ChatService;
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

      if (request.method === 'POST' && path === '/v1/chat/completions') {
        if (!options.chat) {
          sendJson(response, 503, { error: { message: 'chat routing is not configured', type: 'server_error' } });
          return;
        }
        const input = await readChatRequest(request);
        const target = parseRequestedModel(input.model);
        const result = await options.chat.complete({
          profile: target.profile,
          requiredCapabilities: ['chat'],
          requestedProviderId: target.providerId,
          requestedModel: target.modelId,
          messages: input.messages,
          temperature: input.temperature,
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
}

class InvalidChatRequestError extends Error {}

async function readChatRequest(request: IncomingMessage): Promise<OpenAIChatRequest> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += value.length;
    if (length > 1_000_000) throw new InvalidChatRequestError('request body exceeds 1 MB');
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new InvalidChatRequestError('request body must be valid JSON'); }
  if (!body || typeof body !== 'object') throw new InvalidChatRequestError('request body must be an object');
  const value = body as { model?: unknown; messages?: unknown; temperature?: unknown };
  if (typeof value.model !== 'string' || !value.model) throw new InvalidChatRequestError('model is required');
  if (!Array.isArray(value.messages) || !value.messages.every(isChatMessage)) throw new InvalidChatRequestError('messages must contain role and string content');
  if (value.temperature !== undefined && typeof value.temperature !== 'number') throw new InvalidChatRequestError('temperature must be a number');
  return { model: value.model, messages: value.messages, temperature: value.temperature };
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
