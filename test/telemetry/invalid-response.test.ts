import test from 'node:test';
import assert from 'node:assert';
import { ChatService, InvalidResponseError, type ChatProviderAdapter } from '../../src/inference.js';
import type { NormalizedChatRequest } from '../../src/inference.js';
import type { RouteCandidate } from '../../src/contracts.js';

class MockAdapter implements ChatProviderAdapter {
  providerId = 'mock';
  constructor(private response: any) {}
  async chat(input: any) {
    return this.response;
  }
}

const mockCandidate: RouteCandidate = {
  providerId: 'mock',
  modelId: 'm1',
  credentialId: 'c1',
  preference: 'neutral',
  capabilities: ['chat'],
  freeTier: 'free_verified',
  healthScore: 100,
  latencyScore: 0,
  quotaScore: 0,
  priority: 0,
  checkedAt: new Date()
};

test('InvalidResponseError implementation and telemetry behavior', async (t) => {
  const baseReq: NormalizedChatRequest = {
    profile: 'default',
    requiredCapabilities: [],
    messages: [{ role: 'user', content: 'hi' }]
  };

  await t.test('complete() normal text -> success', async () => {
    let event: any;
    const service = new ChatService({
      candidates: async () => [mockCandidate],
      adapters: new Map([['mock', new MockAdapter({ id: '1', model: 'm1', content: 'hello' })]]),
      onEvent: async (ev) => { event = ev; }
    });
    const res = await service.complete(baseReq);
    assert.strictEqual(res.response.content, 'hello');
    assert.strictEqual(event.outcome, 'success');
  });

  await t.test('complete() empty -> throws InvalidResponseError and emits failure telemetry', async () => {
    let event: any;
    const service = new ChatService({
      candidates: async () => [mockCandidate],
      adapters: new Map([['mock', new MockAdapter({ id: '1', model: 'm1', content: '' })]]),
      onEvent: async (ev) => { event = ev; }
    });
    await assert.rejects(async () => {
      await service.complete(baseReq);
    }, InvalidResponseError);
    assert.strictEqual(event.outcome, 'failure');
    assert.strictEqual(event.failureKind, 'invalid_response');
  });

  await t.test('complete() tool-call-only -> success', async () => {
    let event: any;
    const service = new ChatService({
      candidates: async () => [mockCandidate],
      adapters: new Map([['mock', new MockAdapter({ id: '1', model: 'm1', content: '', toolCalls: [{ id: 't1', type: 'function', function: { name: 'f', arguments: '{}' } }] })]]),
      onEvent: async (ev) => { event = ev; }
    });
    const res = await service.complete(baseReq);
    assert.strictEqual(res.response.toolCalls?.length, 1);
    assert.strictEqual(event.outcome, 'success');
  });
});
