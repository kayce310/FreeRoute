import { createDecipheriv, createHash, scryptSync } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface DetectedCredential {
  source: 'omniroute' | '9router';
  sourceLocation: string;
  providerId: string;
  authType: 'apikey' | 'oauth' | 'cookie' | 'access_token';
  name: string;
  apiKey?: string;
  maskedKey: string;
  isActive: boolean;
  /** Unique id of the underlying connection row (used as a stable selection token). */
  connectionId?: string;
  /** Base URL of the provider's API endpoint, if available (e.g. for custom/self-hosted providers). */
  baseUrl?: string;
  /** Friendly display name for custom provider nodes (e.g. "AIHubMix" instead of a UUID-suffixed id). */
  displayName?: string;
  /**
   * Clean provider id to register inside FreeRoute. For 9Router custom nodes this is a
   * slug derived from the node prefix/name (e.g. "aihubmix"), instead of the raw
   * "openai-compatible-chat-<uuid>" identifier.
   */
  customProviderId?: string;
  /** Provider-specific data preserved from the source (cookies, tokens, baseUrl, etc). */
  providerSpecificData?: Record<string, unknown>;
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

/**
 * Reads OmniRoute's STORAGE_ENCRYPTION_KEY from possible .env locations.
 */
export function findOmniRouteEncryptionKey(): { key: string; envPath: string } | null {
  const envCandidates = [
    path.join(os.homedir(), '.omniroute', '.env'),
    'D:/OmniRoute/.env',
    path.join(process.cwd(), '.omniroute.env'),
  ];

  for (const envPath of envCandidates) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('STORAGE_ENCRYPTION_KEY=')) {
          const raw = trimmed.slice('STORAGE_ENCRYPTION_KEY='.length).trim();
          const clean = raw.replace(/^['"]|['"]$/g, '');
          if (clean.length > 0) {
            return { key: clean, envPath };
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  return null;
}

/**
 * Decrypts OmniRoute's `enc:v1:...` field format using AES-256-GCM.
 */
export function decryptOmniRouteField(ciphertext: string, secret: string): string | null {
  if (!ciphertext) return null;
  if (!ciphertext.startsWith('enc:v1:')) return ciphertext; // Passthrough if plaintext

  const parts = ciphertext.slice('enc:v1:'.length).split(':');
  if (parts.length !== 3) return null;
  const [ivHex, encHex, tagHex] = parts;

  if (!ivHex || !encHex || !tagHex) return null;

  try {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');

    // Primary derivation: static salt
    const staticKey = scryptSync(secret, 'omniroute-field-encryption-v1', 32);
    // Legacy derivation: dynamic salt
    const dynamicSalt = createHash('sha256').update(secret).digest().slice(0, 16);
    const legacyKey = scryptSync(secret, dynamicSalt, 32);

    for (const key of [staticKey, legacyKey]) {
      try {
        const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch {
        // Try next key candidate
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Detects credentials configured inside local OmniRoute installation.
 */
export function detectOmniRouteCredentials(): DetectedCredential[] {
  const detected: DetectedCredential[] = [];
  const encInfo = findOmniRouteEncryptionKey();
  const dbCandidates = [
    path.join(os.homedir(), '.omniroute', 'storage.sqlite'),
    'D:/OmniRoute/data/storage.sqlite',
    'D:/OmniRoute/storage.sqlite',
  ];

  for (const dbPath of dbCandidates) {
    if (!fs.existsSync(dbPath)) continue;
    try {
      const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
      const rows = db.prepare(`
        SELECT id, provider, name, api_key, is_active 
        FROM provider_connections 
        WHERE api_key IS NOT NULL AND TRIM(api_key) != ''
      `).all() as Array<{ id: string; provider: string; name: string | null; api_key: string; is_active: number }>;

      for (const row of rows) {
        let plaintextKey: string | null = null;
        if (row.api_key.startsWith('enc:v1:')) {
          if (encInfo) {
            plaintextKey = decryptOmniRouteField(row.api_key, encInfo.key);
          }
        } else {
          plaintextKey = row.api_key;
        }

        if (plaintextKey && plaintextKey.trim().length > 0) {
          detected.push({
            source: 'omniroute',
            sourceLocation: dbPath,
            providerId: row.provider.toLowerCase(),
            authType: 'apikey',
            name: row.name || `${row.provider} (OmniRoute)`,
            apiKey: plaintextKey.trim(),
            maskedKey: maskKey(plaintextKey.trim()),
            isActive: Boolean(row.is_active),
            connectionId: row.id,
          });
        }
      }
    } catch {
      // Continue to next candidate
    }
  }
  return detected;
}

/**
 * Detects credentials configured inside local 9router installation.
 */
export function detect9RouterCredentials(): DetectedCredential[] {
  const detected: DetectedCredential[] = [];
  const appData = process.env.APPDATA || '';
  const dbCandidates = [
    path.join(appData, '9router', 'db', 'data.sqlite'),
    'D:/9router/data.sqlite',
    path.join(process.cwd(), '9router.sqlite'),
  ];

  for (const dbPath of dbCandidates) {
    if (!fs.existsSync(dbPath)) continue;
    try {
      const db = new DatabaseSync(dbPath, { open: true, readOnly: true });

      // providerNodes holds the human-readable name + canonical baseUrl for custom
      // ("openai-compatible") provider nodes. The connection row's `provider` value is
      // the node id (e.g. "openai-compatible-chat-<uuid>"), so we look up the node to
      // recover the friendly label shown in the 9Router dashboard.
      const nodeMap = new Map<string, { name: string | null; baseUrl?: string; prefix?: string }>();
      try {
        const nodes = db.prepare('SELECT id, name, data FROM providerNodes').all() as Array<{
          id: string;
          name: string | null;
          data: string | null;
        }>;
        for (const node of nodes) {
          let nodeBaseUrl: string | undefined;
          let nodePrefix: string | undefined;
          if (node.data) {
            try {
              const nodeData = JSON.parse(node.data) as {
                baseUrl?: string;
                apiBase?: string;
                endpoint?: string;
                prefix?: string;
              };
              const raw = nodeData.baseUrl || nodeData.apiBase || nodeData.endpoint;
              if (typeof raw === 'string' && raw.trim()) nodeBaseUrl = raw.trim();
              if (typeof nodeData.prefix === 'string' && nodeData.prefix.trim()) {
                nodePrefix = nodeData.prefix.trim().toLowerCase();
              }
            } catch {
              // Ignore node data parse failure
            }
          }
          nodeMap.set(node.id, { name: node.name, baseUrl: nodeBaseUrl, prefix: nodePrefix });
        }
      } catch {
        // providerNodes table may not exist on older 9router versions
      }

      const rows = db.prepare(`
        SELECT id, provider, authType, name, isActive, data 
        FROM providerConnections
      `).all() as Array<{ id: string; provider: string; authType: string; name: string | null; isActive: number; data: string | null }>;

      for (const row of rows) {
        if (!row.data) continue;
        try {
          const parsed = JSON.parse(row.data) as {
            apiKey?: string;
            token?: string;
            accessToken?: string;
            idToken?: string;
            refreshToken?: string;
            cookie?: string;
            providerSpecificData?: Record<string, unknown>;
          };
          
          // Determine auth type from row — preserve oauth/cookie/access_token for proper import
          const authType: DetectedCredential['authType'] = (row.authType === 'cookie' || row.authType === 'access_token' || row.authType === 'oauth')
            ? row.authType
            : 'apikey';
          
          // Extract the appropriate credential based on auth type
          let key: string | undefined;
          if (authType === 'cookie') {
            key = parsed.cookie || (parsed.providerSpecificData as any)?.cookie;
          } else if (authType === 'access_token') {
            key = parsed.accessToken || parsed.token;
          } else {
            key = parsed.apiKey || parsed.token || parsed.accessToken;
          }
          
          if (key && typeof key === 'string' && key.trim().length > 0) {
            const psd = parsed.providerSpecificData;
            
            detected.push({
              source: '9router',
              sourceLocation: dbPath,
              connectionId: row.id,
              providerId: row.provider.toLowerCase(),
              authType,
              name: row.name || `${row.provider} (9router)`,
              apiKey: key.trim(),
              maskedKey: maskKey(key.trim()),
              isActive: Boolean(row.isActive),
              providerSpecificData: psd && Object.keys(psd).length > 0 ? psd : undefined,
            });
          }
        } catch {
          // JSON parse failure
        }
      }
    } catch {
      // Continue to next candidate
    }
  }
  return detected;
}

/**
 * Detects all available credentials across local OmniRoute and 9router instances,
 * deduplicating by providerId + apiKey.
 */
export function detectAllLocalCredentials(): DetectedCredential[] {
  const all = [...detectOmniRouteCredentials(), ...detect9RouterCredentials()];
  const seen = new Set<string>();
  const unique: DetectedCredential[] = [];

  for (const item of all) {
    // Prefer the connection row id so two accounts on the same provider id stay
    // distinct; fall back to provider+key for sources without a row id.
    const keySig = item.connectionId
      ? `${item.source}::${item.connectionId}`
      : `${item.providerId}::${item.apiKey ?? ''}`;
    if (!seen.has(keySig)) {
      seen.add(keySig);
      unique.push(item);
    }
  }

  return unique;
}
