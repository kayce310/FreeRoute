import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { CatalogStore } from './catalog.js';

export interface FreeRouteServerOptions {
  catalog: CatalogStore;
  apiToken?: string;
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

      sendJson(response, 404, { error: { message: 'not found', type: 'invalid_request_error' } });
    } catch {
      sendJson(response, 500, { error: { message: 'internal server error', type: 'server_error' } });
    }
  });
}

function isAuthorized(request: IncomingMessage, expectedToken: string | undefined): boolean {
  if (!expectedToken) return true;
  return request.headers.authorization === `Bearer ${expectedToken}`;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
