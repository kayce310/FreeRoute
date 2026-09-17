import { DatabaseSync } from 'node:sqlite';
import type { SqliteCredentialStore } from '../storage/sqlite-credential-store.js';

interface NineRouterConnectionRow {
  id: string;
  name: string | null;
  authType: string;
  data: string;
}

export interface NineRouterImportResult {
  providerId: string;
  credentialId: string;
  sourceConnectionId: string;
  displayName?: string;
  authType?: string;
}

/**
 * Imports one active connection (API key or OAuth) from a user-owned 9Router database.
 * The plaintext key is handled only in memory and is never returned.
 */
export async function importNineRouterApiKey(options: {
  sourceDatabasePath: string;
  providerId: string;
  credentials: SqliteCredentialStore;
  credentialId?: string;
}): Promise<NineRouterImportResult> {
  const source = new DatabaseSync(options.sourceDatabasePath, { readOnly: true });
  try {
    const row = source.prepare(`
      SELECT id, name, authType, data FROM providerConnections
      WHERE provider = ? AND isActive = 1
      ORDER BY priority ASC, createdAt ASC LIMIT 1
    `).get(options.providerId) as unknown as NineRouterConnectionRow | undefined;
    if (!row) throw new Error(`no active connection found for provider ${options.providerId}`);

    const parsed = JSON.parse(row.data) as Record<string, any>;
    const isOAuth = row.authType === 'oauth' || Boolean(parsed.accessToken || parsed.refreshToken);

    let secretToStore: string;
    if (isOAuth) {
      // Store full JSON to preserve tokens, refresh metadata, client IDs and endpoints
      secretToStore = row.data;
    } else {
      const key = parsed.apiKey || parsed.token || parsed.accessToken;
      if (typeof key !== 'string' || !key.trim()) {
        throw new Error(`connection ${row.id} has no usable API key`);
      }
      secretToStore = key.trim();
    }

    const credentialId = options.credentialId ?? `9router-${row.id}`;
    await options.credentials.put(options.providerId, credentialId, secretToStore, new Date(), {
      name: row.name ?? undefined,
    });

    return {
      providerId: options.providerId,
      credentialId,
      sourceConnectionId: row.id,
      displayName: row.name ?? undefined,
      authType: isOAuth ? 'oauth' : 'api_key',
    };
  } finally {
    source.close();
  }
}
