import { DatabaseSync } from 'node:sqlite';
import type { SqliteCredentialStore } from '../storage/sqlite-credential-store.js';

interface NineRouterConnectionRow {
  id: string;
  name: string | null;
  data: string;
}

export interface NineRouterImportResult {
  providerId: string;
  credentialId: string;
  sourceConnectionId: string;
  displayName?: string;
}

/**
 * Imports one active API-key connection from a user-owned 9Router database.
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
      SELECT id, name, data FROM providerConnections
      WHERE provider = ? AND isActive = 1 AND authType = 'apikey'
      ORDER BY priority ASC, createdAt ASC LIMIT 1
    `).get(options.providerId) as unknown as NineRouterConnectionRow | undefined;
    if (!row) throw new Error(`no active API-key connection found for provider ${options.providerId}`);

    const parsed = JSON.parse(row.data) as { apiKey?: unknown };
    if (typeof parsed.apiKey !== 'string' || !parsed.apiKey.trim()) {
      throw new Error(`connection ${row.id} has no usable API key`);
    }

    const credentialId = options.credentialId ?? `9router-${row.id}`;
    await options.credentials.put(options.providerId, credentialId, parsed.apiKey.trim());
    return {
      providerId: options.providerId,
      credentialId,
      sourceConnectionId: row.id,
      displayName: row.name ?? undefined,
    };
  } finally {
    source.close();
  }
}
