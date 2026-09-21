import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const KIRO_AUTH_SERVICE = 'https://prod.us-east-1.auth.desktop.kiro.dev';
const KIRO_CW_BASE = 'https://codewhisperer.us-east-1.amazonaws.com';

export interface KiroDetectedToken {
  refreshToken: string;
  source: string;
  clientId?: string;
  clientSecret?: string;
}

export interface KiroImportResult {
  accessToken: string;
  refreshToken: string | null;
  profileArn: string | null;
  region: string;
  authMethod: string;
  expiresAt: number | undefined;
  /** Serialized JSON string ready to store in credential store */
  secret: string;
}

/**
 * Scan ~/.aws/sso/cache/ for a Kiro refresh token.
 * Returns detected token info or null if not found.
 */
export async function detectKiroTokenFromAwsCache(): Promise<KiroDetectedToken | null> {
  const cachePath = join(homedir(), '.aws', 'sso', 'cache');
  let files: string[];
  try {
    files = await readdir(cachePath);
  } catch {
    return null;
  }

  // Priority: kiro-auth-token.json first, then any JSON file
  const candidates = [
    'kiro-auth-token.json',
    ...files.filter((f) => f.endsWith('.json') && f !== 'kiro-auth-token.json'),
  ];

  for (const file of candidates) {
    if (!files.includes(file)) continue;
    try {
      const content = await readFile(join(cachePath, file), 'utf-8');
      const data = JSON.parse(content);
      if (typeof data.refreshToken === 'string' && data.refreshToken.startsWith('aorAAAAAG')) {
        return {
          refreshToken: data.refreshToken,
          source: file,
          clientId: data.clientId,
          clientSecret: data.clientSecret,
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Refresh a Kiro token using social auth (Google/GitHub) refresh endpoint.
 */
async function refreshSocial(refreshToken: string, fetcher = globalThis.fetch) {
  const res = await fetcher(`${KIRO_AUTH_SERVICE}/refreshToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Kiro social refresh failed: ${res.status} ${await res.text()}`);
  return await res.json() as { accessToken?: string; refreshToken?: string; profileArn?: string; expiresIn?: number };
}

/**
 * Refresh using AWS SSO OIDC (Builder ID / IDC).
 */
async function refreshSsoOidc(refreshToken: string, clientId: string, clientSecret: string, region = 'us-east-1', fetcher = globalThis.fetch) {
  const res = await fetcher(`https://oidc.${region}.amazonaws.com/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret, refreshToken, grantType: 'refresh_token' }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Kiro SSO OIDC refresh failed: ${res.status} ${await res.text()}`);
  return await res.json() as { accessToken?: string; refreshToken?: string; expiresIn?: number };
}

/**
 * Resolve profileArn from accessToken via ListAvailableProfiles.
 */
async function resolveProfileArn(accessToken: string, region = 'us-east-1', fetcher = globalThis.fetch): Promise<string | null> {
  try {
    const endpoint = `https://codewhisperer.${region}.amazonaws.com`;
    const res = await fetcher(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'x-amz-target': 'AmazonCodeWhispererService.ListAvailableProfiles',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ maxResults: 10 }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json() as { profiles?: Array<{ arn?: string; profileArn?: string }> };
    const profiles = data.profiles ?? [];
    const arnOf = (p: { arn?: string; profileArn?: string }) => p.arn ?? p.profileArn ?? null;
    const match = profiles.find((p) => arnOf(p)?.split(':')[3] === region) ?? profiles[0];
    return match ? arnOf(match) : null;
  } catch {
    return null;
  }
}

/**
 * Import from a refresh token (format: aorAAAAAG...).
 * Tries social refresh first; falls back to SSO OIDC if clientId/clientSecret provided.
 */
export async function importFromRefreshToken(
  refreshToken: string,
  options: { clientId?: string; clientSecret?: string; region?: string; fetcher?: typeof globalThis.fetch } = {},
): Promise<KiroImportResult> {
  if (!refreshToken.startsWith('aorAAAAAG')) {
    throw new Error('Invalid Kiro refresh token format. Must start with "aorAAAAAG".');
  }

  const fetcher = options.fetcher ?? globalThis.fetch;
  const region = options.region ?? 'us-east-1';
  let accessToken: string;
  let newRefreshToken = refreshToken;
  let profileArn: string | null = null;
  let expiresAt: number | undefined;
  let authMethod = 'imported';

  // Try SSO OIDC first if credentials available
  if (options.clientId && options.clientSecret) {
    try {
      const data = await refreshSsoOidc(refreshToken, options.clientId, options.clientSecret, region, fetcher);
      if (!data.accessToken) throw new Error('No accessToken in response');
      accessToken = data.accessToken;
      newRefreshToken = data.refreshToken ?? refreshToken;
      expiresAt = data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined;
      authMethod = 'builder_id';
    } catch (err) {
      // Fall through to social refresh
      const data = await refreshSocial(refreshToken, fetcher);
      if (!data.accessToken) throw new Error('Kiro refresh returned no accessToken');
      accessToken = data.accessToken;
      newRefreshToken = data.refreshToken ?? refreshToken;
      profileArn = data.profileArn ?? null;
      expiresAt = data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined;
    }
  } else {
    // Social refresh (Google/GitHub)
    const data = await refreshSocial(refreshToken, fetcher);
    if (!data.accessToken) throw new Error('Kiro refresh returned no accessToken');
    accessToken = data.accessToken;
    newRefreshToken = data.refreshToken ?? refreshToken;
    profileArn = data.profileArn ?? null;
    expiresAt = data.expiresIn ? Date.now() + data.expiresIn * 1000 : undefined;
    authMethod = 'social';
  }

  // Resolve profileArn if still missing
  if (!profileArn) {
    profileArn = await resolveProfileArn(accessToken, region, fetcher);
  }

  const credential = {
    accessToken,
    refreshToken: newRefreshToken,
    profileArn,
    region,
    authMethod,
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    expiresAt,
  };

  return {
    ...credential,
    secret: JSON.stringify(credential),
  };
}

/**
 * Import from an API key (long-lived bearer token, no refresh).
 * Validates by calling ListAvailableProfiles.
 */
export async function importFromApiKey(
  apiKey: string,
  options: { region?: string; fetcher?: typeof globalThis.fetch } = {},
): Promise<KiroImportResult> {
  if (!apiKey || !apiKey.trim()) throw new Error('API key is required');
  const fetcher = options.fetcher ?? globalThis.fetch;
  const region = options.region ?? 'us-east-1';
  const trimmed = apiKey.trim();

  const profileArn = await resolveProfileArn(trimmed, region, fetcher);
  if (profileArn === null) {
    // Try to validate: if it returns null but didn't throw, we couldn't list profiles
    // Still allow import — profileArn will be resolved on first use
  }

  const credential = {
    accessToken: trimmed,
    refreshToken: null,
    profileArn,
    region,
    authMethod: 'api_key',
    // API keys are long-lived: set 1 year expiry as placeholder
    expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
  };

  return {
    ...credential,
    secret: JSON.stringify(credential),
  };
}

/**
 * Auto-import from local AWS SSO cache.
 * Detects and refreshes the token automatically.
 */
export async function autoImportFromAwsCache(fetcher = globalThis.fetch): Promise<KiroImportResult | null> {
  const detected = await detectKiroTokenFromAwsCache();
  if (!detected) return null;
  try {
    return await importFromRefreshToken(detected.refreshToken, {
      clientId: detected.clientId,
      clientSecret: detected.clientSecret,
      fetcher,
    });
  } catch {
    return null;
  }
}
