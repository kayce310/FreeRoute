import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export interface CredentialMetadata {
  providerId: string;
  credentialId: string;
  name?: string;
  enabled: boolean;
  priority: number;
  testStatus: 'untested' | 'valid' | 'invalid' | 'rate_limited';
  lastTestAt?: Date;
  lastError?: string;
  cooldownUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface CredentialRow {
  provider_id: string;
  credential_id: string;
  encrypted_secret: string;
  name: string | null;
  enabled: number;
  priority: number;
  test_status: CredentialMetadata['testStatus'];
  last_test_at: string | null;
  last_error: string | null;
  cooldown_until: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Structured credential that can hold multiple authentication types.
 * Used internally - serialized to JSON and encrypted before storage.
 */
export interface CredentialSecret {
  /** Simple API key for backward compatibility */
  apiKey?: string;
  /** OAuth/Bearer token */
  accessToken?: string;
  /** Refresh token for OAuth flows */
  refreshToken?: string;
  /** ID token (e.g., for Codex) */
  idToken?: string;
  /** Cookie/session data */
  cookie?: string;
  /** Provider-specific metadata (baseUrl, chatgptAccountId, etc) */
  providerSpecificData?: Record<string, unknown>;
  /** Auth type from source system */
  authType?: 'apikey' | 'oauth' | 'cookie' | 'access_token';
}

/**
 * Stores provider credentials locally using AES-256-GCM. Callers receive only
 * metadata from list(); plaintext is returned only by an explicit get().
 * 
 * The secret can be either a simple string (apiKey) or a structured JSON object
 * containing multiple credential fields. This preserves compatibility with both
 * legacy API-key credentials and imported OAuth/cookie credentials.
 */
export class SqliteCredentialStore {
  private readonly database: DatabaseSync;
  private readonly encryptionKey: Buffer;

  constructor(filename: string, masterSecret: string) {
    if (masterSecret.length < 16) throw new Error('master secret must be at least 16 characters');
    this.database = new DatabaseSync(filename);
    this.encryptionKey = createHash('sha256').update(masterSecret).digest();
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS credentials (
        provider_id TEXT NOT NULL,
        credential_id TEXT NOT NULL,
        encrypted_secret TEXT NOT NULL,
        name TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        test_status TEXT NOT NULL DEFAULT 'untested',
        last_test_at TEXT,
        last_error TEXT,
        cooldown_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider_id, credential_id)
      ) STRICT;
    `);
    for (const statement of [
      "ALTER TABLE credentials ADD COLUMN name TEXT",
      "ALTER TABLE credentials ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE credentials ADD COLUMN priority INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE credentials ADD COLUMN test_status TEXT NOT NULL DEFAULT 'untested'",
      "ALTER TABLE credentials ADD COLUMN last_test_at TEXT",
      "ALTER TABLE credentials ADD COLUMN last_error TEXT",
      "ALTER TABLE credentials ADD COLUMN cooldown_until TEXT",
    ]) {
      try { this.database.exec(statement); } catch {}
    }
  }

  async put(providerId: string, credentialId: string, secret: string | CredentialSecret, now = new Date(), options: { name?: string; enabled?: boolean; priority?: number } = {}): Promise<void> {
    if (!secret) throw new Error('credential secret cannot be empty');
    const timestamp = now.toISOString();
    // Serialize secret: if string, wrap as simple apiKey; if object, serialize directly
    const serialized = typeof secret === 'string' ? JSON.stringify({ apiKey: secret }) : JSON.stringify(secret);
    this.database.prepare(`
      INSERT INTO credentials (provider_id, credential_id, encrypted_secret, name, enabled, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, credential_id) DO UPDATE SET
        encrypted_secret = excluded.encrypted_secret,
        name = COALESCE(excluded.name, credentials.name),
        enabled = excluded.enabled,
        priority = excluded.priority,
        updated_at = excluded.updated_at
    `).run(providerId, credentialId, encrypt(serialized, this.encryptionKey), options.name ?? null, options.enabled === false ? 0 : 1, options.priority ?? 0, timestamp, timestamp);
  }

  async get(providerId: string, credentialId: string): Promise<string | CredentialSecret | undefined> {
    const row = this.database.prepare(`
      SELECT provider_id, credential_id, encrypted_secret, created_at, updated_at
      FROM credentials WHERE provider_id = ? AND credential_id = ?
    `).get(providerId, credentialId) as unknown as CredentialRow | undefined;
    if (!row) return undefined;
    const decrypted = decrypt(row.encrypted_secret, this.encryptionKey);
    try {
      const parsed = JSON.parse(decrypted) as CredentialSecret;
      // If it's a simple apiKey string, return it for backward compatibility
      if (parsed.apiKey && !parsed.accessToken && !parsed.cookie && !parsed.providerSpecificData) {
        return parsed.apiKey;
      }
      return parsed;
    } catch {
      // Not JSON - return as simple string for backward compat
      return decrypted;
    }
  }

  async list(): Promise<CredentialMetadata[]> {
    const rows = this.database.prepare(`
      SELECT provider_id, credential_id, name, enabled, priority, test_status, last_test_at, last_error, cooldown_until, created_at, updated_at FROM credentials
      ORDER BY provider_id, credential_id
    `).all() as unknown as Omit<CredentialRow, 'encrypted_secret'>[];
    return rows.map((row) => ({
      providerId: row.provider_id,
      credentialId: row.credential_id,
      name: row.name ?? undefined,
      enabled: Boolean(row.enabled),
      priority: Number(row.priority),
      testStatus: row.test_status ?? 'untested',
      lastTestAt: row.last_test_at ? new Date(row.last_test_at) : undefined,
      lastError: row.last_error ?? undefined,
      cooldownUntil: row.cooldown_until ? new Date(row.cooldown_until) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  }

  async updateStatus(providerId: string, credentialId: string, update: { testStatus?: CredentialMetadata['testStatus']; lastTestAt?: Date; lastError?: string; cooldownUntil?: Date | null; enabled?: boolean }): Promise<boolean> {
    const result = this.database.prepare(`
      UPDATE credentials SET
        test_status = COALESCE(?, test_status), last_test_at = COALESCE(?, last_test_at),
        last_error = ?, cooldown_until = ?, enabled = COALESCE(?, enabled), updated_at = ?
      WHERE provider_id = ? AND credential_id = ?
    `).run(update.testStatus ?? null, update.lastTestAt?.toISOString() ?? null, update.lastError ?? null, update.cooldownUntil?.toISOString() ?? null, update.enabled === undefined ? null : (update.enabled ? 1 : 0), new Date().toISOString(), providerId, credentialId);
    return Number(result.changes) > 0;
  }

  async delete(providerId: string, credentialId: string): Promise<boolean> {
    const result = this.database.prepare(`
      DELETE FROM credentials WHERE provider_id = ? AND credential_id = ?
    `).run(providerId, credentialId);
    return Number(result.changes) > 0;
  }

  async getAllSecrets(): Promise<Set<string>> {
    const rows = this.database.prepare(`
      SELECT encrypted_secret FROM credentials
    `).all() as unknown as Array<{ encrypted_secret: string }>;
    const secrets = new Set<string>();
    for (const row of rows) {
      try {
        const decrypted = decrypt(row.encrypted_secret, this.encryptionKey);
        // Extract all credential values for deduplication
        let parsed: CredentialSecret | undefined;
        try { parsed = JSON.parse(decrypted) as CredentialSecret; } catch { /* plain string */ }
        const values = [
          parsed?.apiKey,
          parsed?.accessToken,
          parsed?.cookie,
          parsed?.idToken,
        ].filter(Boolean);
        for (const v of values) {
          if (typeof v === 'string' && v.trim()) secrets.add(v.trim());
        }
      } catch {}
    }
    return secrets;
  }

  async countByProvider(): Promise<Record<string, number>> {
    const rows = this.database.prepare(`
      SELECT provider_id, COUNT(*) as count FROM credentials GROUP BY provider_id
    `).all() as unknown as Array<{ provider_id: string; count: number | bigint }>;
    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.provider_id] = Number(row.count);
    }
    return counts;
  }

  async exportAllWithSecrets(): Promise<Array<{ providerId: string; credentialId: string; secret: string; createdAt: string; updatedAt: string }>> {
    const rows = this.database.prepare(`
      SELECT provider_id, credential_id, encrypted_secret, created_at, updated_at
      FROM credentials
      ORDER BY provider_id, credential_id
    `).all() as unknown as CredentialRow[];
    const result: Array<{ providerId: string; credentialId: string; secret: string; createdAt: string; updatedAt: string }> = [];
    for (const row of rows) {
      try {
        const secret = decrypt(row.encrypted_secret, this.encryptionKey);
        if (secret) {
          result.push({
            providerId: row.provider_id,
            credentialId: row.credential_id,
            secret,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          });
        }
      } catch {}
    }
    return result;
  }

  close(): void {
    this.database.close();
  }
}

function encrypt(value: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64url');
}

function decrypt(value: string, key: Buffer): string {
  const packed = Buffer.from(value, 'base64url');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const encrypted = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
