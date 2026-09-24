import type { ChatProviderAdapter, NormalizedChatRequest, NormalizedChatResponse, NormalizedChatStreamEvent, ToolCall } from '../inference.js';
import type { DiscoveredModel, ProviderDiscoveryAdapter } from '../catalog.js';
import type { CredentialSecret } from '../storage/sqlite-credential-store.js';

// ─── Refresh deduplication (local 9router equivalent) ─────────────────────────

const REFRESH_RESULT_TTL_MS = 10_000;
const refreshDedupCache = new Map<string, {
  promise?: Promise<any>;
  result?: any;
  expiresAt?: number;
}>();

/**
 * Refresh deduplication - prevents concurrent refreshes for the same credential.
 * Mirrors 9router's dedupRefresh pattern.
 */
function dedupRefresh<T>(
  provider: string,
  oldToken: string,
  fn: () => Promise<T>,
  log?: { info?: (cat: string, msg: string, meta?: any) => void }
): Promise<T> {
  if (!oldToken) return fn();
  const key = `${provider}:${oldToken}`;
  const hit = refreshDedupCache.get(key);
  if (hit) {
    if (hit.promise) {
      log?.info?.('TOKEN_REFRESH', `Reusing in-flight refresh for ${provider}`);
      return hit.promise;
    }
    if (hit.expiresAt && hit.expiresAt > Date.now()) {
      log?.info?.('TOKEN_REFRESH', `Reusing recent refresh result for ${provider}`);
      return hit.result;
    }
    refreshDedupCache.delete(key);
  }
  const promise = (async () => {
    try {
      const result = await fn();
      refreshDedupCache.set(key, { result, expiresAt: Date.now() + REFRESH_RESULT_TTL_MS });
      return result;
    } catch (err) {
      refreshDedupCache.delete(key);
      throw err;
    }
  })();
  refreshDedupCache.set(key, { promise });
  return promise;
}

/**
 * Error classification - mirrors 9router's isUnrecoverableRefreshError.
 */
function isUnrecoverableRefreshError(result: any): boolean {
  return (
    result &&
    typeof result === 'object' &&
    (result.error === 'unrecoverable_refresh_error' ||
      result.error === 'refresh_token_reused' ||
      result.error === 'invalid_request' ||
      result.error === 'invalid_grant')
  );
}

// ─── Kiro credential types ─────────────────────────────────────────────────────
/**
 * Kiro credential stored as JSON string in the credential store.
 * Backward-compat: if secret is a plain non-JSON string, it is treated as accessToken only.
 */
interface KiroCredential {
  accessToken: string;
  refreshToken?: string | null;
  profileArn?: string | null;
  region?: string;
  authMethod?: 'social' | 'builder_id' | 'idc' | 'api_key' | 'imported' | 'cookie';
  clientId?: string;
  clientSecret?: string;
  expiresAt?: number; // Unix timestamp ms
  providerSpecificData?: Record<string, unknown>;
}

// Default shared profile ARNs (from 9router open-sse/config/kiroConstants.js)
const KIRO_DEFAULT_PROFILE_ARNS = {
  'builder-id': 'arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX',
  social: 'arn:aws:codewhisperer:us-east-1:699475941385:profile/EHGA3GRVQMUK',
};

/** Resolve the shared default profileArn for a given auth method (9router convention). */
function resolveDefaultProfileArn(authMethod: string | undefined): string {
  const isSocial = authMethod === 'social' || authMethod === 'google' || authMethod === 'github';
  return isSocial ? KIRO_DEFAULT_PROFILE_ARNS.social : KIRO_DEFAULT_PROFILE_ARNS['builder-id'];
}

// Kiro API endpoints (from 9router open-sse/providers/registry/kiro.js)
const KIRO_SOCIAL_REFRESH_URL = 'https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken';
const KIRO_RUNTIME_BASE = 'https://runtime.us-east-1.kiro.dev/generateAssistantResponse';
const KIRO_CW_BASE = 'https://codewhisperer.us-east-1.amazonaws.com';
const KIRO_Q_BASE = 'https://q.us-east-1.amazonaws.com';

// ─── Model suffix constants (from 9router open-sse/config/kiroConstants.js) ────
const KIRO_AGENTIC_SUFFIX = '-agentic';
const KIRO_THINKING_SUFFIX = '-thinking';
const KIRO_THINKING_BUDGET_DEFAULT = 16000;

/** Agentic chunked-write system prompt (from 9router). */
const KIRO_AGENTIC_SYSTEM_PROMPT = `
# CRITICAL: CHUNKED WRITE PROTOCOL (MANDATORY)

You MUST follow these rules for ALL file operations. Violation causes server timeouts and task failure.

## ABSOLUTE LIMITS
- **MAXIMUM 350 LINES** per single write/edit operation - NO EXCEPTIONS
- **RECOMMENDED 300 LINES** or less for optimal performance
- **NEVER** write entire files in one operation if >300 lines

## MANDATORY CHUNKED WRITE STRATEGY

### For NEW FILES (>300 lines total):
1. FIRST: Write initial chunk (first 250-300 lines) using write_to_file/fsWrite
2. THEN: Append remaining content in 250-300 line chunks using file append operations
3. REPEAT: Continue appending until complete

### For EDITING EXISTING FILES:
1. Use surgical edits (apply_diff/targeted edits) - change ONLY what's needed
2. NEVER rewrite entire files - use incremental modifications
3. Split large refactors into multiple small, focused edits

### For LARGE CODE GENERATION:
1. Generate in logical sections (imports, types, functions separately)
2. Write each section as a separate operation
3. Use append operations for subsequent sections

## EXAMPLES OF CORRECT BEHAVIOR

CORRECT: Writing a 600-line file
- Operation 1: Write lines 1-300 (initial file creation)
- Operation 2: Append lines 301-600

CORRECT: Editing multiple functions
- Operation 1: Edit function A
- Operation 2: Edit function B
- Operation 3: Edit function C

WRONG: Writing 500 lines in single operation -> TIMEOUT
WRONG: Rewriting entire file to change 5 lines -> TIMEOUT
WRONG: Generating massive code blocks without chunking -> TIMEOUT

REMEMBER: When in doubt, write LESS per operation. Multiple small operations > one large operation.
`.trim();

// ─── Model resolution helpers ──────────────────────────────────────────────────

function isAgenticModel(model: string): boolean {
  return typeof model === 'string' && model.endsWith(KIRO_AGENTIC_SUFFIX);
}

function stripAgenticSuffix(model: string): string {
  return isAgenticModel(model) ? model.slice(0, -KIRO_AGENTIC_SUFFIX.length) : model;
}

function isThinkingModel(model: string): boolean {
  return typeof model === 'string' && model.endsWith(KIRO_THINKING_SUFFIX);
}

function stripThinkingSuffix(model: string): string {
  return isThinkingModel(model) ? model.slice(0, -KIRO_THINKING_SUFFIX.length) : model;
}

/** Resolve a 9router model id to the real upstream Kiro model id plus flags. */
function resolveKiroModel(model: string) {
  let upstream = model;
  let agentic = false;
  let thinking = false;
  if (isAgenticModel(upstream)) {
    agentic = true;
    upstream = stripAgenticSuffix(upstream);
  }
  if (isThinkingModel(upstream)) {
    thinking = true;
    upstream = stripThinkingSuffix(upstream);
  }
  return { upstream, agentic, thinking };
}

/**
 * Build the magic system-prompt prefix that turns Kiro reasoning on.
 * Same shape as CLIProxyAPIPlus / 9router buildThinkingSystemPrefix().
 */
function buildThinkingSystemPrefix(budget = KIRO_THINKING_BUDGET_DEFAULT): string {
  const safeBudget = Math.max(1, Math.min(32000, Number(budget) || KIRO_THINKING_BUDGET_DEFAULT));
  return `<thinking_mode>enabled</thinking_mode>\n<max_thinking_length>${safeBudget}</max_thinking_length>`;
}

/**
 * Detect whether a request body or headers implies thinking/reasoning.
 * Mirrors resolveKiroThinkingBudget from 9router kiroConstants.js.
 */
function resolveThinkingBudget(body: NormalizedChatRequest, headers?: Record<string, string>, model?: string): number | null {
  // Check for explicit thinking configuration
  const req = body as any;
  if (req.thinking) {
    if (req.thinking.enabled === false || req.thinking.budget_tokens === 0) return null;
    const budget = req.thinking.budget_tokens;
    if (typeof budget === 'number' && budget > 0) return budget;
    return KIRO_THINKING_BUDGET_DEFAULT;
  }
  if (req.reasoning_effort) {
    const effort = req.reasoning_effort;
    if (effort === 'none' || effort === 'off') return null;
    return effort === 'high' ? 16000 : KIRO_THINKING_BUDGET_DEFAULT;
  }
  // Check Anthropic-Beta header for interleaved-thinking
  if (headers) {
    const beta = Object.entries(headers).find(([k]) => k.toLowerCase() === 'anthropic-beta');
    if (beta && typeof beta[1] === 'string' && beta[1].toLowerCase().includes('interleaved-thinking')) {
      return KIRO_THINKING_BUDGET_DEFAULT;
    }
  }
  // Check for <thinking_mode> tag in messages
  const messages = Array.isArray(req.messages) ? req.messages : [];
  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role !== 'system' && msg.role !== 'user') continue;
    const content = msg.content;
    if (typeof content === 'string' && content.includes('<thinking_mode>enabled</thinking_mode>')) return KIRO_THINKING_BUDGET_DEFAULT;
    if (Array.isArray(content)) {
      for (const part of content) {
        const text = (part as any)?.text;
        if (typeof text === 'string' && text.includes('<thinking_mode>enabled</thinking_mode>')) return KIRO_THINKING_BUDGET_DEFAULT;
      }
    }
  }
  if (typeof req.system === 'string' && req.system.includes('<thinking_mode>enabled</thinking_mode>')) return KIRO_THINKING_BUDGET_DEFAULT;
  if (typeof model === 'string' && model) {
    const m = model.toLowerCase();
    if (m.includes('thinking') || m.includes('-reason')) return KIRO_THINKING_BUDGET_DEFAULT;
  }
  return null;
}

// ─── Credential helpers ─────────────────────────────────────────────────────────

/** Parse credential secret: JSON or plain accessToken string. Also merges with CredentialSecret providerSpecificData. */
export function parseCredential(secret: string | CredentialSecret, psd?: Record<string, unknown>): KiroCredential {
  if (typeof secret === 'object' && secret !== null) {
    const accessToken = secret.accessToken ?? secret.apiKey;
    if (!accessToken) throw new Error('Kiro: no accessToken or apiKey in credential');
    const mergedPsD: Record<string, unknown> = { ...secret.providerSpecificData, ...psd };
    return {
      accessToken,
      refreshToken: secret.refreshToken ?? null,
      profileArn: (mergedPsD.profileArn as string | undefined) ?? (secret as any).profileArn ?? null,
      region: (mergedPsD.region as string | undefined) ?? (secret as any).region,
      authMethod: secret.authType === 'cookie' ? 'cookie' :
        ((mergedPsD.authMethod as KiroCredential['authMethod']) ?? (secret as any).authMethod),
      clientId: (mergedPsD.clientId as string | undefined) ?? (secret as any).clientId,
      clientSecret: (mergedPsD.clientSecret as string | undefined) ?? (secret as any).clientSecret,
      expiresAt: (mergedPsD.expiresAt as number | undefined) ?? (secret as any).expiresAt,
    };
  }
  try {
    const parsed = JSON.parse(secret);
    if (typeof parsed === 'object' && parsed !== null && typeof parsed.accessToken === 'string') {
      return parsed as KiroCredential;
    }
  } catch { /* not JSON */ }
  return { accessToken: secret };
}

/** Refresh a Kiro token using refreshToken. Returns updated KiroCredential. */
async function refreshKiroToken(
  cred: KiroCredential,
  fetcher: typeof globalThis.fetch,
): Promise<KiroCredential> {
  if (!cred.refreshToken) throw new Error('Kiro: no refreshToken available');

  // Builder ID / IDC: use AWS SSO OIDC token endpoint
  if (cred.clientId && cred.clientSecret) {
    const region = cred.region ?? 'us-east-1';
    const endpoint = `https://oidc.${region}.amazonaws.com/token`;
    const res = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
        refreshToken: cred.refreshToken,
        grantType: 'refresh_token',
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Kiro SSO OIDC refresh failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { accessToken?: string; refreshToken?: string; expiresIn?: number; profileArn?: string };
    return {
      ...cred,
      accessToken: data.accessToken ?? cred.accessToken,
      refreshToken: data.refreshToken ?? cred.refreshToken,
      profileArn: data.profileArn ?? cred.profileArn,
      expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : cred.expiresAt,
    };
  }

  // Social (Google/GitHub) refresh
  const res = await fetcher(KIRO_SOCIAL_REFRESH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: cred.refreshToken }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Kiro social refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { accessToken?: string; refreshToken?: string; profileArn?: string; expiresIn?: number };
  return {
    ...cred,
    accessToken: data.accessToken ?? cred.accessToken,
    refreshToken: data.refreshToken ?? cred.refreshToken,
    profileArn: data.profileArn ?? cred.profileArn,
    expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : cred.expiresAt,
  };
}

/** Resolve profileArn via ListAvailableProfiles if not already cached (9router pattern). */
async function resolveProfileArn(
  accessToken: string,
  region: string,
  fetcher: typeof globalThis.fetch,
): Promise<string | null> {
  try {
    const res = await fetcher(KIRO_CW_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.0',
        'x-amz-target': 'AmazonCodeWhispererService.ListAvailableProfiles',
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
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

// ─── AWS EventStream parser (from 9router open-sse/executors/kiro.js) ──────────

interface EventFrame {
  headers: Record<string, string>;
  payload: any;
}

function parseEventFrame(data: Uint8Array): EventFrame | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    const totalLength = view.getUint32(0, false);
    if (totalLength < 16 || totalLength > data.length) return null;

    const headersLength = view.getUint32(4, false);
    const headers: Record<string, string> = {};
    let offset = 12;
    const headerEnd = 12 + headersLength;

    while (offset < headerEnd && offset < data.length) {
      const nameLen = data[offset];
      offset++;
      if (offset + nameLen > data.length) break;
      const name = new TextDecoder().decode(data.slice(offset, offset + nameLen));
      offset += nameLen;
      const headerType = data[offset];
      offset++;
      if (headerType === 7) {
        const valueLen = (data[offset] << 8) | data[offset + 1];
        offset += 2;
        if (offset + valueLen > data.length) break;
        const value = new TextDecoder().decode(data.slice(offset, offset + valueLen));
        offset += valueLen;
        headers[name] = value;
      } else {
        break;
      }
    }

    const payloadStart = 12 + headersLength;
    const payloadEnd = data.length - 4;
    let payload = null;
    if (payloadEnd > payloadStart) {
      const payloadStr = new TextDecoder().decode(data.slice(payloadStart, payloadEnd));
      if (!payloadStr || !payloadStr.trim()) {
        return { headers, payload: null };
      }
      try {
        payload = JSON.parse(payloadStr);
      } catch {
        payload = { raw: payloadStr };
      }
    }
    return { headers, payload };
  } catch {
    return null;
  }
}

// ─── Provider adapter ───────────────────────────────────────────────────────────

export class KiroAdapter implements ChatProviderAdapter, ProviderDiscoveryAdapter {
  readonly providerId: string;
  private readonly baseUrl: string;
  private readonly getCredential: (id: string) => Promise<string | CredentialSecret | undefined>;
  private readonly setCredential?: (id: string, secret: CredentialSecret) => Promise<void>;
  private readonly fetch: typeof globalThis.fetch;
  /** In-memory cache: credentialId → refreshed credential (avoids repeated refresh per request) */
  private readonly tokenCache = new Map<string, { cred: KiroCredential; updatedAt: number }>();

  constructor(options: {
    providerId: string;
    baseUrl?: string;
    getCredential: (id: string) => Promise<string | CredentialSecret | undefined>;
    setCredential?: (id: string, secret: CredentialSecret) => Promise<void>;
    fetch?: typeof globalThis.fetch;
  }) {
    this.providerId = options.providerId;
    this.baseUrl = (options.baseUrl ?? KIRO_RUNTIME_BASE).replace(/\/$/, '');
    this.getCredential = options.getCredential;
    this.setCredential = options.setCredential;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  /** Resolve and optionally refresh the credential for a given credentialId */
    private async resolveCred(credentialId: string): Promise<KiroCredential> {
      const secret = await this.getCredential(credentialId);
      if (!secret) throw new Error('Kiro: no credential for id ' + credentialId);
      let cred = parseCredential(secret);

      const cached = this.tokenCache.get(credentialId);
      if (cached && Date.now() - cached.updatedAt < 5 * 60 * 1000) {
        cred = cached.cred;
      }

      // Proactive refresh: only refresh if token is near expiry.
      // Uses per-credential dedup lock to prevent concurrent refreshes.
      if (cred.refreshToken) {
        try {
          const refreshed = await this.refreshWithDedup(credentialId, cred);
          if (refreshed !== cred) {
            const fingerprintBefore = cred.accessToken.slice(0, 8) + '...';
            const fingerprintAfter = refreshed.accessToken.slice(0, 8) + '...';
            console.log(`[Kiro] ${credentialId}: refresh ${fingerprintBefore} -> ${fingerprintAfter} expiresAt=${refreshed.expiresAt}`);
            cred = refreshed;
            this.tokenCache.set(credentialId, { cred, updatedAt: Date.now() });
            if (this.setCredential) {
              await this.setCredential(credentialId, this.toCredentialSecret(cred));
            }
          }
        } catch (err) {
                  console.warn(`[Kiro] ${credentialId}: refresh failed: ${err instanceof Error ? err.message : String(err)}`);
                }
              }

              // Resolve profileArn if missing (api_key auth: leave empty; OAuth/social: use default)
              if (!cred.profileArn) {
                if (cred.authMethod === 'api_key') {
                  cred = { ...cred, profileArn: '' };
                } else {
                  const region = cred.region ?? 'us-east-1';
                  let resolvedArn: string | null = null;
                  try {
                    resolvedArn = await resolveProfileArn(cred.accessToken, region, this.fetch);
                  } catch (err) {
                    console.warn(`[Kiro] ${credentialId}: profileArn resolution failed: ${err instanceof Error ? err.message : String(err)}`);
                  }
                  if (resolvedArn) {
                    cred = { ...cred, profileArn: resolvedArn };
                    if (this.setCredential) {
                      await this.setCredential(credentialId, this.toCredentialSecret(cred)).catch(() => {});
                    }
                  } else {
                    cred = { ...cred, profileArn: resolveDefaultProfileArn(cred.authMethod) };
                  }
                  this.tokenCache.set(credentialId, { cred, updatedAt: Date.now() });
                }
              }

              return cred;
            }

    /** Refresh credential with per-credential dedup and error handling */
    private async refreshWithDedup(credentialId: string, cred: KiroCredential): Promise<KiroCredential> {
      const nowMs = Date.now();

      // Check if we should refresh (same logic as 9router)
            const expiresAtMs = cred.expiresAt;
            const leadMs = 5 * 60 * 1000; // 5 minutes (same as TOKEN_EXPIRY_BUFFER_MS)
            // If no expiresAt, we should refresh proactively (matches 9router behavior for imported creds)
            if (expiresAtMs !== undefined && expiresAtMs !== null && expiresAtMs - nowMs < leadMs) {
              // Token is near expiry, refresh needed
            } else if (expiresAtMs === undefined || expiresAtMs === null) {
              // No expiresAt - refresh proactively
            } else {
              return cred;
            }

            // Acquire refresh lock for this credential
                        return this.acquireRefreshLock(credentialId, cred.refreshToken ?? undefined, async () => {
                          // Re-parse to ensure we have latest credential data
                          const freshSecret = await this.getCredential(credentialId);
                          if (!freshSecret) throw new Error('Kiro: no credential for id ' + credentialId);
                          const freshCred = parseCredential(freshSecret);

                          // If the credential still doesn't need refresh, return it
                          if (!freshCred.refreshToken) {
                            return freshCred;
                          }
                          const freshExpiresAtMs = freshCred.expiresAt;
                          const freshLeadMs = 5 * 60 * 1000;
                          if (freshExpiresAtMs !== undefined && freshExpiresAtMs !== null && freshExpiresAtMs - nowMs >= freshLeadMs) {
                            return freshCred;
                          } else if (freshExpiresAtMs === undefined || freshExpiresAtMs === null) {
                            // No expiresAt - refresh proactively
                          } else {
                            return freshCred;
                          }

                          // Perform refresh using the exact same logic as 9router
                          const refreshResult = await this.refreshKiroTokenInternal(freshCred);

                          // Persist refreshed credential back to storage
                          if (this.setCredential) {
                            await this.setCredential(credentialId, this.toCredentialSecret(refreshResult));
              }
              return refreshResult;
            });
          }

          /** Acquire refresh lock for a credential with dedup */
                              private async acquireRefreshLock(credentialId: string, refreshToken: string | undefined, fn: () => Promise<KiroCredential>): Promise<KiroCredential> {
                                // Use the existing dedupRefresh mechanism from 9router - key by refresh token
                                return dedupRefresh(`kiro:${credentialId}`, refreshToken ?? credentialId, fn, undefined);
                              }

    private async refreshKiroTokenInternal(cred: KiroCredential): Promise<KiroCredential> {
        const authMethod = cred.authMethod;
        const clientId = cred.clientId;
        const clientSecret = cred.clientSecret;

        if (clientId && clientSecret) {
        const region = cred.region ?? 'us-east-1';
        const endpoint = `https://oidc.${region}.amazonaws.com/token`;
        const res = await this.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId: clientId,
            clientSecret: clientSecret,
            refreshToken: cred.refreshToken,
            grantType: 'refresh_token',
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          const errText = await res.text();
          const err = new Error(`Kiro SSO OIDC refresh failed: ${res.status} ${errText}`);
          if (errText.includes('slow_down') || errText.includes('SlowDown')) {
            throw err;
          }
          if (errText.includes('invalid_grant') || errText.includes('Invalid refresh token')) {
            throw err;
          }
          throw err;
        }
        const data = await res.json() as { accessToken?: string; refreshToken?: string; expiresIn?: number; profileArn?: string };
        return {
          ...cred,
          accessToken: data.accessToken ?? cred.accessToken,
          refreshToken: data.refreshToken ?? cred.refreshToken,
          profileArn: data.profileArn ?? cred.profileArn,
          expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : cred.expiresAt,
        };
      }

      const res = await this.fetch(KIRO_SOCIAL_REFRESH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: cred.refreshToken }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const errText = await res.text();
        const err = new Error(`Kiro social refresh failed: ${res.status} ${errText}`);
        if (errText.includes('slow_down') || errText.includes('SlowDown')) {
          throw err;
        }
        if (errText.includes('invalid_grant') || errText.includes('Invalid refresh token')) {
          throw err;
        }
        throw err;
      }
      const data = await res.json() as { accessToken?: string; refreshToken?: string; profileArn?: string; expiresIn?: number };
      return {
        ...cred,
        accessToken: data.accessToken ?? cred.accessToken,
        refreshToken: data.refreshToken ?? cred.refreshToken,
        profileArn: data.profileArn ?? cred.profileArn,
        expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : cred.expiresAt,
      };
    }

  private toCredentialSecret(cred: KiroCredential): CredentialSecret {
    return {
      accessToken: cred.accessToken,
      refreshToken: cred.refreshToken ?? undefined,
      providerSpecificData: {
        ...(cred.profileArn ? { profileArn: cred.profileArn } : {}),
        ...(cred.region ? { region: cred.region } : {}),
        ...(cred.authMethod ? { authMethod: cred.authMethod } : {}),
        ...(cred.clientId ? { clientId: cred.clientId } : {}),
        ...(cred.clientSecret ? { clientSecret: cred.clientSecret } : {}),
        ...(cred.expiresAt ? { expiresAt: cred.expiresAt } : {}),
      },
    };
  }

  async discoverModels(credentialId: string): Promise<DiscoveredModel[]> {
    try {
      const cred = await this.resolveCred(credentialId);
      const profileArn = cred.profileArn ?? '';
      const region = cred.region ?? 'us-east-1';
      const params = new URLSearchParams();
      params.set('origin', 'AI_EDITOR');
      if (profileArn) params.set('profileArn', profileArn);
      const endpoint = `https://q.${region}.amazonaws.com/ListAvailableModels?${params.toString()}`;

      const res = await this.fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cred.accessToken}`,
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json() as { models?: Array<{ modelId?: string; modelName?: string }> };
        const models = (data.models ?? []).filter((m) => m.modelId !== undefined);
        if (models.length > 0) {
          return models.map((m) => ({
            modelId: `kr/${m.modelId}`,
            capabilities: ['chat', 'streaming', 'tools'] as const,
            freeTier: 'free_verified' as const,
            priority: 90,
          }));
        }
      }
    } catch { /* fall through to static */ }

    return [
      { modelId: 'kr/claude-sonnet-4.5', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 95 },
      { modelId: 'kr/claude-haiku-4.5', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 92 },
      { modelId: 'kr/deepseek-3.2', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 90 },
      { modelId: 'kr/qwen3-coder-next', capabilities: ['chat', 'streaming', 'tools'], freeTier: 'free_verified', priority: 88 },
      { modelId: 'kr/glm-5', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 82 },
      { modelId: 'kr/MiniMax-M2.5', capabilities: ['chat', 'streaming'], freeTier: 'free_verified', priority: 80 },
    ];
  }

  async chat(input: {
    credentialId: string;
    modelId: string;
    request: NormalizedChatRequest;
  }): Promise<Omit<NormalizedChatResponse, 'providerId' | 'modelId'>> {
    const chunks: NormalizedChatStreamEvent[] = [];
    for await (const chunk of this.streamChat(input)) chunks.push(chunk);

    let content = '';
    let thought = '';
    const toolCalls: ToolCall[] = [];
    let finishReason = 'stop';

    for (const chunk of chunks) {
      if (chunk.delta) content += chunk.delta;
      if (chunk.thought) thought += chunk.thought;
      if (chunk.toolCalls) toolCalls.push(...chunk.toolCalls);
      if (chunk.finishReason) finishReason = chunk.finishReason;
    }

    const lastWithUsage = [...chunks].reverse().find((c) => c.usage);
    return {
      id: `kiro-${Date.now()}`,
      model: input.modelId,
      content,
      thought: thought || undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      usage: lastWithUsage?.usage,
    };
  }

  async *streamChat(input: {
    credentialId: string;
    modelId: string;
    request: NormalizedChatRequest;
  }): AsyncIterable<NormalizedChatStreamEvent> {
    const cred = await this.resolveCred(input.credentialId);
    const id = `chatcmpl-${Date.now()}`;
    const model = input.modelId.includes('/') ? input.modelId.split('/').pop()! : input.modelId;
    const payload = this.buildPayload(model, input.request, cred);

    const endpoint = this.baseUrl;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cred.accessToken}`,
      'Accept': 'application/vnd.amazon.eventstream',
      'X-Amz-Target': 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
      'User-Agent': 'AWS-SDK-JS/3.0.0 kiro-ide/1.0.0',
      'X-Amz-User-Agent': 'aws-sdk-js/3.0.0 kiro-ide/1.0.0',
      'Amz-Sdk-Request': 'attempt=1; max=3',
      'Amz-Sdk-Invocation-Id': crypto.randomUUID(),
    };

    // API-key auth requires a tokentype header so the gateway treats the token
    // as a long-lived API key rather than an OIDC/social access token.
    // Mirrors 9router open-sse/executors/kiro.js buildHeaders().
    if (cred.authMethod === 'api_key') {
      headers['tokentype'] = 'API_KEY';
    }

    const res = await this.fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        if (cred.refreshToken) {
          this.tokenCache.delete(input.credentialId);
        }
        throw new Error(`Kiro auth error ${res.status}: ${errText}`);
      }
      throw new Error(`Kiro ${res.status}: ${errText}`);
    }

    if (!res.body) {
      yield { id, model: input.modelId, delta: '', finishReason: 'stop' };
      return;
    }

    yield* this.transformEventStreamToSSE(res.body, input.modelId, id);
  }

  // ─── AWS EventStream → SSE transform (port of 9router transformEventStreamToSSE) ──

  private async *transformEventStreamToSSE(
    body: ReadableStream<Uint8Array>,
    model: string,
    responseId: string,
  ): AsyncGenerator<NormalizedChatStreamEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = new Uint8Array(0);
    let chunkIndex = 0;
    const created = Math.floor(Date.now() / 1000);
    const state = {
      endDetected: false,
      finishEmitted: false,
      hasToolCalls: false,
      hasReasoningContent: false,
      reasoningChunkCount: 0,
      toolCallIndex: 0,
      seenToolIds: new Map<string, number>(),
      totalContentLength: 0,
      contextUsagePercentage: 0,
      usage: null as { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null,
      hasMeteringEvent: false,
      hasContextUsage: false,
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Append to buffer
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        // Parse events from buffer
        while (buffer.length >= 16) {
          const view = new DataView(buffer.buffer, buffer.byteOffset);
          const totalLength = view.getUint32(0, false);

          if (totalLength < 16 || totalLength > buffer.length) break;

          const eventData = buffer.slice(0, totalLength);
          buffer = buffer.slice(totalLength);

          const event = parseEventFrame(eventData);
          if (!event) continue;

          const eventType = event.headers[':event-type'] || '';

          // Track total content length for token estimation
          if (!state.totalContentLength) state.totalContentLength = 0;
          if (!state.contextUsagePercentage) state.contextUsagePercentage = 0;

          // Handle assistantResponseEvent
          if (eventType === 'assistantResponseEvent' && event.payload?.content) {
            const content = event.payload.content;
            state.totalContentLength += content.length;

            const isFirst = chunkIndex === 0;
            chunkIndex++;
            yield {
              id: responseId,
              model,
              delta: isFirst ? content : '',
              ...(isFirst ? { _firstContent: content } : {}),
            };
          }

          // Handle reasoningContentEvent
          if (eventType === 'reasoningContentEvent') {
            const reasoning = event.payload?.reasoningContentEvent || event.payload || {};
            const reasoningText = typeof reasoning === 'string'
              ? reasoning
              : (reasoning.text || reasoning.content || '');
            if (reasoningText) {
              state.hasReasoningContent = true;
              state.totalContentLength += reasoningText.length;

              const isFirst = state.reasoningChunkCount === 0 && chunkIndex === 0;
              chunkIndex++;
              state.reasoningChunkCount++;
              yield {
                id: responseId,
                model,
                thought: isFirst ? reasoningText : reasoningText,
                ...(isFirst ? { _firstContent: '' } : {}),
              };
            }
          }

          // Handle codeEvent
          if (eventType === 'codeEvent' && event.payload?.content) {
            chunkIndex++;
            yield {
              id: responseId,
              model,
              delta: event.payload.content,
            };
          }

          // Handle toolUseEvent
          if (eventType === 'toolUseEvent' && event.payload) {
            state.hasToolCalls = true;
            const toolUses = Array.isArray(event.payload) ? event.payload : [event.payload];

            for (const singleToolUse of toolUses) {
              const toolCallId = singleToolUse.toolUseId || `call_${Date.now()}`;
              const toolName = singleToolUse.name || '';
              const toolInput = singleToolUse.input;

              let toolIndex;
              const isNewTool = !state.seenToolIds.has(toolCallId);

              if (isNewTool) {
                toolIndex = state.toolCallIndex++;
                state.seenToolIds.set(toolCallId, toolIndex);

                yield {
                  id: responseId,
                  model,
                  toolCalls: [{
                    id: toolCallId,
                    type: 'function',
                    function: { name: toolName, arguments: '' },
                  }],
                };
              } else {
                toolIndex = state.seenToolIds.get(toolCallId);
              }

              if (toolInput !== undefined) {
                let argumentsStr;
                if (typeof toolInput === 'string') {
                  argumentsStr = toolInput;
                } else if (typeof toolInput === 'object') {
                  argumentsStr = JSON.stringify(toolInput);
                } else {
                  continue;
                }

                yield {
                  id: responseId,
                  model,
                  toolCalls: [{
                    id: toolCallId,
                    type: 'function',
                    function: { name: toolName, arguments: argumentsStr },
                  }],
                };
              }
            }
          }

          // Handle messageStopEvent
          if (eventType === 'messageStopEvent') {
            state.finishEmitted = true;
            yield {
              id: responseId,
              model,
              finishReason: state.hasToolCalls ? 'tool_calls' : 'stop',
            };
          }

          // Handle contextUsageEvent
          if (eventType === 'contextUsageEvent' && event.payload?.contextUsagePercentage) {
            state.contextUsagePercentage = event.payload.contextUsagePercentage;
            state.hasContextUsage = true;
          }

          // Handle meteringEvent
          if (eventType === 'meteringEvent') {
            state.hasMeteringEvent = true;
          }

          // Handle metricsEvent for token usage
          if (eventType === 'metricsEvent') {
            const metrics = event.payload?.metricsEvent || event.payload;
            if (metrics && typeof metrics === 'object') {
              const inputTokens = (metrics as any).inputTokens || 0;
              const outputTokens = (metrics as any).outputTokens || 0;
              if (inputTokens > 0 || outputTokens > 0) {
                state.usage = {
                  prompt_tokens: inputTokens,
                  completion_tokens: outputTokens,
                  total_tokens: inputTokens + outputTokens,
                };
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Emit final finish chunk if not already sent
    if (!state.finishEmitted) {
      // Estimate tokens if not available from events
      if (!state.usage) {
        const estimatedOutputTokens = state.totalContentLength > 0
          ? Math.max(1, Math.floor(state.totalContentLength / 4))
          : 0;
        const estimatedInputTokens = state.contextUsagePercentage > 0
          ? Math.floor(state.contextUsagePercentage * 200000 / 100)
          : 0;
        state.usage = {
          prompt_tokens: estimatedInputTokens,
          completion_tokens: estimatedOutputTokens,
          total_tokens: estimatedInputTokens + estimatedOutputTokens,
        };
      }

      yield {
        id: responseId,
        model,
        finishReason: state.hasToolCalls ? 'tool_calls' : 'stop',
        ...(state.usage ? { usage: {
          promptTokens: state.usage.prompt_tokens,
          completionTokens: state.usage.completion_tokens,
          totalTokens: state.usage.total_tokens,
        }} : {}),
      };
    }
  }

  private buildPayload(model: string, request: NormalizedChatRequest, cred: KiroCredential): Record<string, unknown> {
    const messages = request.messages || [];
    const tools = request.tools || [];
    const temperature = request.temperature;
    const topP = (request as any).top_p;
    const maxTokens = (request as any).maxTokens || 32000;

    const { upstream: upstreamModel, agentic, thinking } = resolveKiroModel(model);
    const thinkingBudget = resolveThinkingBudget(request, undefined, model);

    // Build history + currentMessage (mirrors 9router convertMessages)
    const history: Array<any> = [];
    let currentMessage: any = null;

    let pendingUserContent: string[] = [];
    let pendingAssistantContent: string[] = [];
    let currentRole: string | null = null;
    let toolsInjected = false;

    const flushPending = () => {
      if (currentRole === 'user') {
        const content = pendingUserContent.join('\n\n').trim() || 'continue';
        const userMsg: any = { userInputMessage: { content, modelId: '' } };
        if (pendingUserContent.length === 0) userMsg.userInputMessage.content = 'continue';
        if (tools.length > 0 && !toolsInjected) {
          userMsg.userInputMessage.userInputMessageContext = {
            tools: tools.map((t: any) => ({
              toolSpecification: {
                name: t.function?.name ?? t.name,
                description: t.function?.description ?? t.description ?? '',
                inputSchema: { json: t.function?.parameters ?? t.parameters ?? {} },
              },
            })),
          };
          toolsInjected = true;
        }
        history.push(userMsg);
        currentMessage = userMsg;
        pendingUserContent = [];
      } else if (currentRole === 'assistant') {
        const content = pendingAssistantContent.join('\n\n').trim() || '...';
        history.push({ assistantResponseMessage: { content } });
        pendingAssistantContent = [];
      }
    };

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      let role = msg.role;

      // Normalize: system/tool → user
      if (role === 'system' || role === 'tool') role = 'user';

      if (role !== currentRole && currentRole !== null) flushPending();
      currentRole = role;

      if (role === 'user') {
        let content = '';
        if (typeof msg.content === 'string') {
          content = msg.content;
        } else if (Array.isArray(msg.content)) {
          const textParts = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text);
          content = textParts.join('\n');
        }
        if (content) pendingUserContent.push(content);
      } else if (role === 'assistant') {
        let textContent = '';
        if (typeof msg.content === 'string') {
          textContent = msg.content.trim();
        } else if (Array.isArray(msg.content)) {
          textContent = msg.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n').trim();
        }
        if (textContent) pendingAssistantContent.push(textContent);
      }
    }

    if (currentRole !== null) flushPending();

    // Pop last userInputMessage as currentMessage
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].userInputMessage) {
        currentMessage = history.splice(i, 1)[0];
        break;
      }
    }

    if (!currentMessage) {
      currentMessage = { userInputMessage: { content: '', modelId: upstreamModel } };
    }

    // Set modelId on all history items
    history.forEach((item: any) => {
      if (item.userInputMessage && !item.userInputMessage.modelId) {
        item.userInputMessage.modelId = upstreamModel;
      }
    });

    // Merge consecutive user messages
    const mergedHistory: any[] = [];
    for (const item of history) {
      if (item.userInputMessage && mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].userInputMessage) {
        const prev = mergedHistory[mergedHistory.length - 1];
        prev.userInputMessage.content += '\n\n' + item.userInputMessage.content;
        if (item.userInputMessage.userInputMessageContext?.toolResults) {
          if (!prev.userInputMessage.userInputMessageContext) {
            prev.userInputMessage.userInputMessageContext = {};
          }
          prev.userInputMessage.userInputMessageContext.toolResults = [
            ...(prev.userInputMessage.userInputMessageContext.toolResults || []),
            ...item.userInputMessage.userInputMessageContext.toolResults,
          ];
        }
      } else {
        mergedHistory.push(item);
      }
    }

    // ProfileArn placement: top-level payload (per 9router openai-to-kiro.js)
    const authMethod = cred.authMethod;
    const profileArn = authMethod === 'api_key'
      ? (cred.profileArn || '')
      : (cred.profileArn || resolveDefaultProfileArn(authMethod));

    // Build final content with prefix (thinking_mode, timestamp, agentic prompt)
    let finalContent = currentMessage?.userInputMessage?.content || '';

    // Prepend system text if present
    const req = request as any;
    if (req.system) {
      const systemText = typeof req.system === 'string'
        ? req.system
        : (Array.isArray(req.system)
            ? req.system.map((s: any) => s.text || '').join('\n')
            : '');
      if (systemText) finalContent = `${systemText}\n\n${finalContent}`;
    }

    const timestamp = new Date().toISOString();
    const prefixParts: string[] = [];
    if (thinkingBudget !== null) {
      prefixParts.push(buildThinkingSystemPrefix(thinkingBudget));
    }
    prefixParts.push(`[Context: Current time is ${timestamp}]`);
    if (agentic) {
      prefixParts.push(KIRO_AGENTIC_SYSTEM_PROMPT);
    }
    finalContent = `${prefixParts.join('\n\n')}\n\n${finalContent}`;

    const payload: Record<string, unknown> = {
      conversationState: {
        chatTriggerType: 'MANUAL',
        conversationId: `kiro-${Date.now()}`,
        currentMessage: {
          userInputMessage: {
            content: finalContent,
            modelId: upstreamModel,
            origin: 'AI_EDITOR',
          },
        },
        history: mergedHistory,
      },
    };

    if (profileArn) payload.profileArn = profileArn;

    if (maxTokens || temperature !== undefined || topP !== undefined) {
      const inferenceConfig: Record<string, unknown> = {};
      if (maxTokens) inferenceConfig.maxTokens = maxTokens;
      if (temperature !== undefined) inferenceConfig.temperature = temperature;
      if (topP !== undefined) inferenceConfig.topP = topP;
      payload.inferenceConfig = inferenceConfig;
    }

    // Tag payload so the executor can route the upstream model id correctly.
    Object.defineProperty(payload, '_kiroUpstreamModel', {
      value: upstreamModel,
      enumerable: false,
    });

    return payload;
  }
}
