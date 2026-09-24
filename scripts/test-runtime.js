/**
 * Direct Kiro runtime test with detailed logging
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

async function main() {
  const root = process.cwd();
  const masterSecret = readFileSync(join(root, 'data', '.master_secret'), 'utf8').trim();

  const { SqliteCredentialStore } = await import('../dist/src/storage/sqlite-credential-store.js');
  const store = new SqliteCredentialStore(join(root, 'data', 'freeroute.sqlite'), masterSecret);

  const cred = await store.get('kiro', 'account-3');
  if (!cred || typeof cred !== 'object') {
    console.log('No credential found');
    return;
  }

  console.log('=== Credential ===');
  console.log('accessToken:', (cred.accessToken || '').slice(0, 20) + '...');
  console.log('refreshToken:', (cred.refreshToken || 'NONE').slice(0, 20) + '...');
  const psd = cred.providerSpecificData || {};
  console.log('authMethod:', psd.authMethod);
  console.log('region:', psd.region);
  console.log('clientId:', (psd.clientId || 'NONE').slice(0, 15) + '...');
  console.log('clientSecret present:', !!psd.clientSecret);
  console.log('profileArn:', psd.profileArn || 'NONE');

  // Refresh token
  console.log('\n=== Refreshing ===');
  const res = await fetch('https://oidc.us-east-1.amazonaws.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: psd.clientId,
      clientSecret: psd.clientSecret,
      refreshToken: cred.refreshToken,
      grantType: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15000),
  });

  console.log('Refresh status:', res.status);
  if (!res.ok) {
    const text = await res.text();
    console.log('Refresh error:', text.slice(0, 200));
    return;
  }

  const data = await res.json();
  console.log('New accessToken:', (data.accessToken || '').slice(0, 20) + '...');
  console.log('expiresIn:', data.expiresIn);

  // Update credential
  const updatedSecret = {
    ...cred,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || cred.refreshToken,
    providerSpecificData: {
      ...psd,
      expiresAt: data.expiresIn ? Date.now() + data.expiresIn * 1000 : psd.expiresAt,
    },
  };
  await store.put('kiro', 'account-3', updatedSecret);
  console.log('Credential updated');

  // Now test runtime request
  console.log('\n=== Testing Runtime Request ===');
  const model = 'claude-haiku-4.5';
  const endpoint = 'https://runtime.us-east-1.kiro.dev/generateAssistantResponse';

  const payload = {
    conversationState: {
      chatTriggerType: 'MANUAL',
      conversationId: `kiro-${Date.now()}`,
      currentMessage: {
        userInputMessage: {
          content: 'Say hi',
          modelId: model,
          origin: 'AI_EDITOR',
        },
      },
      history: [],
    },
    profileArn: psd.profileArn || 'arn:aws:codewhisperer:us-east-1:638616132270:profile/AAAACCCCXXXX',
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.accessToken}`,
    'Accept': 'application/vnd.amazon.eventstream',
    'X-Amz-Target': 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
    'User-Agent': 'AWS-SDK-JS/3.0.0 kiro-ide/1.0.0',
    'X-Amz-User-Agent': 'aws-sdk-js/3.0.0 kiro-ide/1.0.0',
    'Amz-Sdk-Request': 'attempt=1; max=3',
    'Amz-Sdk-Invocation-Id': randomUUID(),
  };

  console.log('Request headers:', Object.keys(headers).join(', '));
  console.log('Payload keys:', Object.keys(payload).join(', '));
  console.log('Payload profileArn:', payload.profileArn);

  const runtimeRes = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  });

  console.log('\nRuntime response status:', runtimeRes.status);
  const text = await runtimeRes.text();
  console.log('Response body:', text.slice(0, 500));

  store.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
