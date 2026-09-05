import test from 'node:test';
import assert from 'node:assert';
import { ChatService, InvalidResponseError, type ChatProviderAdapter } from '../../src/inference.js';
import type { NormalizedChatRequest } from '../../src/inference.js';

class MockAdapter implements ChatProviderAdapter {
  providerId = 'mock';
  constructor(private response: any, private error?: any) {}
  async chat(input: any) {
    if (this.error) throw this.error;
    return this.response;
  }
}

test('Telemetry: Investigate 0ms latency and success/failure classification', async (t) => {
  let emittedEvent: any;
  const options: any = {
    candidates: async () => [{ providerId: 'mock', modelId: 'm1', credentialId: 'c1', preference: 'neutral', capabilities: ['chat'] }],
    adapters: new Map([['mock', new MockAdapter({})]]),
    onEvent: async (event: any) => { emittedEvent = event; }
  };

  await t.test('1. complete() with empty content + no toolCalls', async () => {
    emittedEvent = undefined;
    const service = new ChatService({ ...options, adapters: new Map([['mock', new MockAdapter({ id: '1', model: 'm1', content: '' })]]) });
    await assert.rejects(async () => {
      await service.complete({ profile: 'default', requiredCapabilities: [], messages: [{ role: 'user', content: 'hi' }] });
    }, InvalidResponseError);
    assert.strictEqual(emittedEvent?.outcome, 'failure');
  });

  await t.test('2. complete() with tool-call-only response', async () => {
    emittedEvent = undefined;
    const service = new ChatService({ ...options, adapters: new Map([['mock', new MockAdapter({ id: '1', model: 'm1', content: '', toolCalls: [{ id: 'tc1', type: 'function', function: { name: 'f1', arguments: '{}' } }] })]]) });
    await service.complete({ profile: 'default', requiredCapabilities: [], messages: [{ role: 'user', content: 'hi' }] });
    assert.strictEqual(emittedEvent?.outcome, 'success');
  });

  await t.test('3. complete() with empty content + usage but no toolCalls', async () => {
    emittedEvent = undefined;
    const service = new ChatService({ ...options, adapters: new Map([['mock', new MockAdapter({ id: '1', model: 'm1', content: '', usage: { promptTokens: 1, completionTokens: 0, totalTokens: 1 } })]]) });
    await assert.rejects(async () => {
      await service.complete({ profile: 'default', requiredCapabilities: [], messages: [{ role: 'user', content: 'hi' }] });
    }, InvalidResponseError);
    assert.strictEqual(emittedEvent?.outcome, 'failure');
  });
});
