import { AnthropicAdapter } from '../../src/providers/anthropic.js';
import { ProviderInvocationError } from '../../src/inference.js';
import assert from 'node:assert';
import { describe, it, mock } from 'node:test';

describe('AnthropicAdapter', () => {
  const getCredential = mock.fn(async () => 'sk-test');
  const fetchMock = mock.fn(async () => ({
    ok: true,
    json: async () => ({
      id: 'msg_1',
      model: 'claude-3-5-sonnet-latest',
      content: [{ type: 'text', text: 'Hello' }],
      usage: { input_tokens: 10, output_tokens: 5 }
    })
  }));
  const adapter = new AnthropicAdapter({ getCredential, fetch: fetchMock as any });

  it('maps request fields correctly', async () => {
    await adapter.chat({
      credentialId: 'cred',
      modelId: 'claude-3-5-sonnet-latest',
      request: {
        profile: 'test',
        requiredCapabilities: [],
        messages: [{ role: 'system', content: 'You are a bot' }, { role: 'user', content: 'Hi' }],
        tools: [{ type: 'function', function: { name: 'f1', parameters: {} } }],
        temperature: 0.7
      }
    });

    const calls = fetchMock.mock.calls;
    const body = JSON.parse((calls[0].arguments as any[])[1].body);
    assert.strictEqual(body.system, 'You are a bot');
    assert.strictEqual(body.temperature, 0.7);
    assert.ok(body.tools);
  });

  it('handles multiple error codes', async () => {
    const codes = [400, 401, 403, 404, 429, 500, 529];
    for (const status of codes) {
      fetchMock.mock.mockImplementationOnce(async () => ({
        ok: false,
        status,
        text: async () => 'err',
        json: async () => ({ id: 'e', model: 'e', content: [], usage: { input_tokens: 0, output_tokens: 0 } })
      }));
      await assert.rejects(adapter.chat({
        credentialId: 'cred',
        modelId: 'claude-3-5-sonnet-latest',
        request: { profile: 'test', requiredCapabilities: [], messages: [] }
      }) as any);
    }
  });
});
