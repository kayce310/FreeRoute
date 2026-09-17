import test from 'node:test';
import assert from 'node:assert/strict';
import { KiroAdapter, parseEventFrame, KIRO_MODELS } from '../src/providers/kiro.js';

test('KiroAdapter discovers real models', async () => {
  const adapter = new KiroAdapter({
    providerId: 'kiro',
    getCredential: () => 'test-key',
  });

  const models = await adapter.discoverModels('test-cred');
  assert.ok(models.length >= 6);
  assert.ok(models.some((m) => m.modelId === 'claude-sonnet-4.5'));
  assert.ok(models.some((m) => m.modelId === 'deepseek-3.2'));
  assert.ok(models.some((m) => m.modelId === 'qwen3-coder-next'));
});

test('KiroAdapter uses API key headers and prioritizes amazonaws for api_key credentials', async () => {
  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};

  const mockFetch: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = (init?.headers as Record<string, string>) || {};

    return new Response(
      'data: {"assistantResponseEvent":{"content":"Hello from Kiro!"}}\n\nevent: messageStopEvent\ndata: {}\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    );
  };

  // Plain API key credential
  const adapter = new KiroAdapter({
    providerId: 'kiro',
    getCredential: () => 'sk-kiro-raw-api-key',
    fetch: mockFetch,
  });

  const response = await adapter.chat({
    credentialId: 'cred-api-key',
    modelId: 'claude-sonnet-4.5',
    request: {
      profile: 'auto:balanced',
      requiredCapabilities: ['chat'],
      messages: [{ role: 'user', content: 'Hi' }],
    },
  });

  assert.equal(response.content, 'Hello from Kiro!');
  assert.ok(capturedUrl.includes('codewhisperer.us-east-1.amazonaws.com'));
  assert.equal(capturedHeaders['Authorization'], 'Bearer sk-kiro-raw-api-key');
  assert.equal(capturedHeaders['tokentype'], 'API_KEY');
  assert.ok(capturedHeaders['Amz-Sdk-Invocation-Id']);
});

test('KiroAdapter uses OAuth bearer header and prioritizes kiro.dev for OAuth credentials', async () => {
  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};

  const mockFetch: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedHeaders = (init?.headers as Record<string, string>) || {};

    return new Response(
      'data: {"assistantResponseEvent":{"content":"Hello from Kiro OAuth!"}}\n\nevent: messageStopEvent\ndata: {}\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
    );
  };

  // OAuth JSON credential (Builder ID)
  const oauthJson = JSON.stringify({
    accessToken: 'kiro-oauth-access-token',
    refreshToken: 'kiro-oauth-refresh-token',
    providerSpecificData: {
      authMethod: 'builder-id',
      region: 'us-east-1',
    },
  });

  const adapter = new KiroAdapter({
    providerId: 'kiro',
    getCredential: () => oauthJson,
    fetch: mockFetch,
  });

  const response = await adapter.chat({
    credentialId: 'cred-oauth',
    modelId: 'claude-sonnet-4.5',
    request: {
      profile: 'auto:balanced',
      requiredCapabilities: ['chat'],
      messages: [{ role: 'user', content: 'Hi' }],
    },
  });

  assert.equal(response.content, 'Hello from Kiro OAuth!');
  assert.ok(capturedUrl.includes('runtime.us-east-1.kiro.dev'));
  assert.equal(capturedHeaders['Authorization'], 'Bearer kiro-oauth-access-token');
  assert.equal(capturedHeaders['tokentype'], undefined);
});

test('parseEventFrame successfully decodes binary EventStream frame', () => {
  // Construct a minimal AWS EventStream binary frame:
  // Prelude: 4 bytes totalLength + 4 bytes headersLength + 4 bytes preludeCRC = 12 bytes
  // Header: 1 byte nameLen + name + 1 byte type (7=string) + 2 bytes valLen + value
  // Payload: JSON string
  // Trailing: 4 bytes message CRC

  const headerName = ':event-type';
  const headerValue = 'assistantResponseEvent';
  const payloadStr = JSON.stringify({ content: 'EventStream test delta' });

  const nameBytes = new TextEncoder().encode(headerName);
  const valBytes = new TextEncoder().encode(headerValue);
  const payloadBytes = new TextEncoder().encode(payloadStr);

  const headersLength = 1 + nameBytes.length + 1 + 2 + valBytes.length;
  const totalLength = 12 + headersLength + payloadBytes.length + 4;

  const buffer = new Uint8Array(totalLength);
  const view = new DataView(buffer.buffer);

  // Prelude
  view.setUint32(0, totalLength, false);
  view.setUint32(4, headersLength, false);
  view.setUint32(8, 0, false); // mock prelude CRC

  // Header
  let offset = 12;
  buffer[offset++] = nameBytes.length;
  buffer.set(nameBytes, offset);
  offset += nameBytes.length;
  buffer[offset++] = 7; // string type
  buffer[offset++] = (valBytes.length >> 8) & 0xff;
  buffer[offset++] = valBytes.length & 0xff;
  buffer.set(valBytes, offset);
  offset += valBytes.length;

  // Payload
  buffer.set(payloadBytes, offset);
  offset += payloadBytes.length;

  // Message CRC
  view.setUint32(offset, 0, false);

  const frame = parseEventFrame(buffer);
  assert.ok(frame);
  assert.equal(frame.headers[':event-type'], 'assistantResponseEvent');
  assert.equal(frame.payload?.content, 'EventStream test delta');
});

test('KiroAdapter classifies 402 quota error with key scope to allow credential failover', async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ reason: 'MONTHLY_REQUEST_COUNT', message: 'Monthly request count exceeded' }),
      { status: 402, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const adapter = new KiroAdapter({
    providerId: 'kiro',
    getCredential: () => 'sk-test',
    fetch: mockFetch,
  });

  await assert.rejects(
    async () => {
      await adapter.chat({
        credentialId: 'account-1',
        modelId: 'claude-sonnet-4.5',
        request: {
          profile: 'auto:balanced',
          requiredCapabilities: ['chat'],
          messages: [{ role: 'user', content: 'Hi' }],
        },
      });
    },
    (err: any) => {
      assert.equal(err.failure.kind, 'quota_exhausted');
      assert.equal(err.failure.scope, 'key');
      assert.equal(err.failure.fallbackAllowed, true);
      return true;
    }
  );
});
