import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export interface CredentialMetadata {
  providerId: string;
  credentialId: string;
  createdAt: Date;
  updatedAt: Date;
}

interface CredentialRow {
  provider_id: string;
  credential_id: string;
  encrypted_secret: string;
  created_at: string;
  updated_at: string;
}

/**
 * Stores provider credentials locally using AES-256-GCM. Callers receive only
 * metadata from list(); plaintext is returned only by an explicit get().
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
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (provider_id, credential_id)
      ) STRICT;
    `);
  }

  async put(providerId: string, credentialId: string, secret: string, now = new Date()): Promise<void> {
    if (!secret) throw new Error('credential secret cannot be empty');
    const timestamp = now.toISOString();
    this.database.prepare(`
      INSERT INTO credentials (provider_id, credential_id, encrypted_secret, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(provider_id, credential_id) DO UPDATE SET
        encrypted_secret = excluded.encrypted_secret,
        updated_at = excluded.updated_at
    `).run(providerId, credentialId, encrypt(secret, this.encryptionKey), timestamp, timestamp);
  }

  async get(providerId: string, credentialId: string): Promise<string | undefined> {
    const row = this.database.prepare(`
      SELECT provider_id, credential_id, encrypted_secret, created_at, updated_at
      FROM credentials WHERE provider_id = ? AND credential_id = ?
    `).get(providerId, credentialId) as unknown as CredentialRow | undefined;
    return row ? decrypt(row.encrypted_secret, this.encryptionKey) : undefined;
  }

  async list(): Promise<CredentialMetadata[]> {
    const rows = this.database.prepare(`
      SELECT provider_id, credential_id, created_at, updated_at FROM credentials
      ORDER BY provider_id, credential_id
    `).all() as unknown as Omit<CredentialRow, 'encrypted_secret'>[];
    return rows.map((row) => ({
      providerId: row.provider_id,
      credentialId: row.credential_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
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
        const sec = decrypt(row.encrypted_secret, this.encryptionKey);
        if (sec) secrets.add(sec);
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
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
