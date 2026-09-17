import type { SqliteCredentialStore } from '../storage/sqlite-credential-store.js';
import type { OAuthCredential } from '../storage/credential-types.js';
import {
  shouldRefreshCredentials,
  withRefreshLock,
  refreshProviderCredential,
} from './token-refresh.js';

export interface ResolvedCredential {
  token: string;
  isApiKey: boolean;
  isOAuth: boolean;
  authMethod?: string;
  projectId?: string;
  headers?: Record<string, string>;
  oauth?: OAuthCredential;
}

export class CredentialManager {
  private readonly store: SqliteCredentialStore;
  private readonly fetch: typeof globalThis.fetch;

  constructor(store: SqliteCredentialStore, fetchFn: typeof globalThis.fetch = globalThis.fetch) {
    this.store = store;
    this.fetch = fetchFn;
  }

  /**
   * Retrieves the credential, automatically refreshing OAuth tokens if expired or near expiry.
   */
  async getValidCredential(providerId: string, credentialId: string): Promise<ResolvedCredential | undefined> {
    const parsed = await this.store.getParsed(providerId, credentialId);
    if (!parsed) return undefined;

    // 1. Plain API key
    if (!parsed.isOAuth || !parsed.oauth) {
      const apiKey = parsed.apiKey || parsed.raw;
      return {
        token: apiKey,
        isApiKey: true,
        isOAuth: false,
      };
    }

    let oauthCred = parsed.oauth;
    const authMethod = oauthCred.providerSpecificData?.authMethod ?? parsed.authMethod;

    // Check if Kiro explicit API-key auth mode
    if (providerId.toLowerCase() === 'kiro' && (authMethod === 'api_key' || oauthCred.apiKey)) {
      const apiKey = oauthCred.apiKey || oauthCred.accessToken || parsed.raw;
      return {
        token: apiKey,
        isApiKey: true,
        isOAuth: false,
        authMethod: 'api_key',
        headers: {
          tokentype: 'API_KEY',
        },
        oauth: oauthCred,
      };
    }

    // 2. Check if OAuth token needs refresh
    if (shouldRefreshCredentials(oauthCred)) {
      const lockKey = `${providerId}:${credentialId}`;
      try {
        const refreshed = await withRefreshLock(lockKey, async () => {
          // Re-check after acquiring lock in case another request refreshed it
          const latest = await this.store.getParsed(providerId, credentialId);
          if (latest?.oauth && !shouldRefreshCredentials(latest.oauth)) {
            return null; // already refreshed
          }

          return refreshProviderCredential(providerId, oauthCred, this.fetch);
        });

        if (refreshed) {
          oauthCred = {
            ...oauthCred,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken ?? oauthCred.refreshToken,
            expiresIn: refreshed.expiresIn,
            expiresAt: refreshed.expiresAt,
            idToken: refreshed.idToken ?? oauthCred.idToken,
            copilotToken: refreshed.copilotToken ?? oauthCred.copilotToken,
            copilotTokenExpiresAt: refreshed.copilotTokenExpiresAt ?? oauthCred.copilotTokenExpiresAt,
            lastRefreshAt: new Date().toISOString(),
            providerSpecificData: {
              ...(oauthCred.providerSpecificData || {}),
              ...(refreshed.providerSpecificData || {}),
            },
          };

          // Save updated tokens back to persistent storage
          await this.store.updateSecret(providerId, credentialId, oauthCred);
        }
      } catch (err) {
        console.warn(`[CredentialManager] Token refresh failed for ${providerId}:${credentialId}:`, err);
      }
    }

    // Return the active token
    const token = oauthCred.copilotToken || oauthCred.accessToken || oauthCred.apiKey || parsed.raw;
    return {
      token,
      isApiKey: false,
      isOAuth: true,
      authMethod,
      projectId: oauthCred.projectId,
      oauth: oauthCred,
    };
  }

  /**
   * Manually forces a token refresh for a specific credential.
   */
  async forceRefresh(providerId: string, credentialId: string): Promise<{ success: boolean; error?: string; expiresAt?: string }> {
    const parsed = await this.store.getParsed(providerId, credentialId);
    if (!parsed) return { success: false, error: 'Credential not found' };
    if (!parsed.isOAuth || !parsed.oauth) return { success: false, error: 'Credential is not an OAuth credential' };

    const oauthCred = parsed.oauth;
    const refreshed = await refreshProviderCredential(providerId, oauthCred, this.fetch);
    if (!refreshed) {
      return { success: false, error: 'Upstream refresh endpoint rejected the request' };
    }

    const updatedCred: OAuthCredential = {
      ...oauthCred,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? oauthCred.refreshToken,
      expiresIn: refreshed.expiresIn,
      expiresAt: refreshed.expiresAt,
      idToken: refreshed.idToken ?? oauthCred.idToken,
      copilotToken: refreshed.copilotToken ?? oauthCred.copilotToken,
      copilotTokenExpiresAt: refreshed.copilotTokenExpiresAt ?? oauthCred.copilotTokenExpiresAt,
      lastRefreshAt: new Date().toISOString(),
      providerSpecificData: {
        ...(oauthCred.providerSpecificData || {}),
        ...(refreshed.providerSpecificData || {}),
      },
    };

    await this.store.updateSecret(providerId, credentialId, updatedCred);
    return { success: true, expiresAt: refreshed.expiresAt };
  }
}
