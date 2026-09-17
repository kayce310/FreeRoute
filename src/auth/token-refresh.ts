import type { OAuthCredential } from '../storage/credential-types.js';

export const DEFAULT_REFRESH_LEAD_MS = 5 * 60 * 1000; // 5 minutes

const refreshLocks = new Map<string, Promise<unknown>>();

/**
 * Deduplicates in-flight refresh calls for the same credential.
 */
export function withRefreshLock<T>(key: string, refreshFn: () => Promise<T>): Promise<T> {
  const existing = refreshLocks.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const pending = Promise.resolve()
    .then(refreshFn)
    .finally(() => {
      refreshLocks.delete(key);
    });

  refreshLocks.set(key, pending);
  return pending;
}

/**
 * Determines whether the credential token should be refreshed based on its expiration.
 */
export function shouldRefreshCredentials(
  cred: OAuthCredential | undefined,
  leadMs = DEFAULT_REFRESH_LEAD_MS,
  nowMs = Date.now()
): boolean {
  if (!cred) return false;
  if (!cred.refreshToken) return false;

  if (cred.expiresAt) {
    const expiresAtMs = new Date(cred.expiresAt).getTime();
    if (Number.isFinite(expiresAtMs) && expiresAtMs - nowMs < leadMs) {
      return true;
    }
  }

  // If copilot token is tracked separately
  if (cred.copilotTokenExpiresAt) {
    const copilotExpiresAtMs = new Date(cred.copilotTokenExpiresAt).getTime();
    if (Number.isFinite(copilotExpiresAtMs) && copilotExpiresAtMs - nowMs < leadMs) {
      return true;
    }
  }

  return false;
}

export interface RefreshedTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: string;
  idToken?: string;
  copilotToken?: string;
  copilotTokenExpiresAt?: string;
  providerSpecificData?: Record<string, unknown>;
}

/**
 * Refreshes Kiro AI credentials (supports AWS Builder ID, IDC, and Social/Desktop auth).
 */
export async function refreshKiroToken(
  cred: OAuthCredential,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<RefreshedTokenResult | null> {
  const refreshToken = cred.refreshToken;
  if (!refreshToken) return null;

  const authData = cred.providerSpecificData || {};
  const clientId = authData.clientId as string | undefined;
  const clientSecret = authData.clientSecret as string | undefined;
  const region = (authData.region as string | undefined) || 'us-east-1';

  // 1. AWS SSO OIDC Flow (Builder ID / IAM Identity Center)
  if (clientId && clientSecret) {
    const isIDC = authData.authMethod === 'idc';
    const endpoint = isIDC && region
      ? `https://oidc.${region}.amazonaws.com/token`
      : 'https://oidc.us-east-1.amazonaws.com/token';

    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          clientId,
          clientSecret,
          refreshToken,
          grantType: 'refresh_token',
        }),
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        accessToken?: string;
        refreshToken?: string;
        expiresIn?: number;
        profileArn?: string;
      };

      if (!data.accessToken) return null;

      const now = Date.now();
      const expiresIn = data.expiresIn || 3600;
      const expiresAt = new Date(now + expiresIn * 1000).toISOString();

      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken || refreshToken,
        expiresIn,
        expiresAt,
        providerSpecificData: data.profileArn
          ? { ...authData, profileArn: data.profileArn }
          : authData,
      };
    } catch {
      return null;
    }
  }

  // 2. Kiro Social / Desktop Auth Service (Google, GitHub, Imported Token)
  try {
    const response = await fetchFn('https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'kiro-cli/1.0.0',
      },
      body: JSON.stringify({
        refreshToken,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
      profileArn?: string;
    };

    if (!data.accessToken) return null;

    const now = Date.now();
    const expiresIn = data.expiresIn || 3600;
    const expiresAt = new Date(now + expiresIn * 1000).toISOString();

    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken || refreshToken,
      expiresIn,
      expiresAt,
      providerSpecificData: data.profileArn
        ? { ...authData, profileArn: data.profileArn }
        : authData,
    };
  } catch {
    return null;
  }
}

/**
 * Refreshes Google Cloud / Antigravity OAuth tokens.
 */
export async function refreshGoogleToken(
  cred: OAuthCredential,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<RefreshedTokenResult | null> {
  const refreshToken = cred.refreshToken;
  if (!refreshToken) return null;

  const authData = cred.providerSpecificData || {};
  const clientId = authData.clientId as string | undefined;
  const clientSecret = authData.clientSecret as string | undefined;

  // If no explicit clientId/clientSecret, standard Google OAuth client params or public client
  const params: Record<string, string> = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  };
  if (clientId) params.client_id = clientId;
  if (clientSecret) params.client_secret = clientSecret;

  try {
    const response = await fetchFn('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams(params).toString(),
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      id_token?: string;
    };

    if (!data.access_token) return null;

    const now = Date.now();
    const expiresIn = data.expires_in || 3600;
    const expiresAt = new Date(now + expiresIn * 1000).toISOString();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      idToken: data.id_token,
      expiresIn,
      expiresAt,
      providerSpecificData: authData,
    };
  } catch {
    return null;
  }
}

/**
 * Exchanges GitHub OAuth token for short-lived Copilot internal token (30m).
 */
export async function refreshCopilotToken(
  cred: OAuthCredential,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<RefreshedTokenResult | null> {
  const token = cred.refreshToken || cred.accessToken;
  if (!token) return null;

  try {
    const response = await fetchFn('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/json',
        'User-Agent': 'GitHubCopilot/1.250.0',
        'Editor-Version': 'vscode/1.96.0',
      },
    });

    if (!response.ok) return null;

    const data = await response.json() as {
      token?: string;
      expires_at?: number | string;
    };

    if (!data.token) return null;

    let expiresAt: string;
    if (typeof data.expires_at === 'number') {
      expiresAt = new Date(data.expires_at * 1000).toISOString();
    } else if (data.expires_at) {
      expiresAt = new Date(data.expires_at).toISOString();
    } else {
      expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    }

    return {
      accessToken: cred.accessToken || token,
      refreshToken: token,
      copilotToken: data.token,
      copilotTokenExpiresAt: expiresAt,
      expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Dispatches refresh to the appropriate provider handler.
 */
export async function refreshProviderCredential(
  providerId: string,
  cred: OAuthCredential,
  fetchFn: typeof globalThis.fetch = globalThis.fetch
): Promise<RefreshedTokenResult | null> {
  const normalizedProvider = providerId.toLowerCase();

  if (normalizedProvider === 'kiro') {
    return refreshKiroToken(cred, fetchFn);
  }

  if (normalizedProvider === 'antigravity' || normalizedProvider === 'gemini-cli') {
    return refreshGoogleToken(cred, fetchFn);
  }

  if (normalizedProvider === 'github' || normalizedProvider === 'copilot') {
    return refreshCopilotToken(cred, fetchFn);
  }

  return null;
}
