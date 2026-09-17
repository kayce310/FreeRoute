export interface ProviderSpecificAuthData {
  authMethod?: 'builder-id' | 'idc' | 'social' | 'api_key' | string;
  profileArn?: string;
  clientId?: string;
  clientSecret?: string;
  region?: string;
  startUrl?: string;
  lastRefreshAt?: string;
  [key: string]: unknown;
}

export interface OAuthCredential {
  type?: 'oauth';
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: string; // ISO-8601 timestamp
  expiresIn?: number; // seconds
  lastRefreshAt?: string;
  apiKey?: string;
  projectId?: string;
  scope?: string;
  copilotToken?: string;
  copilotTokenExpiresAt?: string;
  providerSpecificData?: ProviderSpecificAuthData;
}

export interface ParsedCredential {
  isOAuth: boolean;
  authMethod?: string;
  apiKey?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  oauth?: OAuthCredential;
  raw: string;
}

/**
 * Parses raw stored secret string into either a structured OAuthCredential
 * or a standard API key.
 */
export function parseStoredCredential(secret: string): ParsedCredential {
  const trimmed = secret.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as OAuthCredential & Record<string, unknown>;
      const hasOAuthField = Boolean(
        parsed.accessToken ||
        parsed.refreshToken ||
        parsed.type === 'oauth' ||
        parsed.providerSpecificData?.authMethod ||
        parsed.copilotToken
      );

      if (hasOAuthField) {
        const authMethod = parsed.providerSpecificData?.authMethod ?? (parsed.type === 'oauth' ? 'oauth' : undefined);
        return {
          isOAuth: true,
          authMethod,
          apiKey: parsed.apiKey,
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          expiresAt: parsed.expiresAt,
          oauth: parsed,
          raw: trimmed,
        };
      }

      if (parsed.apiKey && typeof parsed.apiKey === 'string') {
        return {
          isOAuth: false,
          apiKey: parsed.apiKey,
          raw: trimmed,
        };
      }
    } catch {
      // Fallback to plain string if JSON parse fails
    }
  }

  return {
    isOAuth: false,
    apiKey: trimmed,
    raw: trimmed,
  };
}

/**
 * Formats a credential to be stored in the database.
 * If passed an object, returns serialized JSON.
 */
export function formatCredentialForStorage(credential: string | OAuthCredential): string {
  if (typeof credential === 'string') {
    return credential.trim();
  }
  return JSON.stringify(credential);
}
