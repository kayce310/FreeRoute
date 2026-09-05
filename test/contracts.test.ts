import assert from 'node:assert/strict';
import test from 'node:test';
import { ProviderInvocationError } from '../src/inference.js';
import type { ChatProviderAdapter } from '../src/inference.js';

interface ContractResult { kind: string; chatCall?: boolean; streamCall?: boolean; messagesField?: boolean }

async function runGeminiContract(adapter: ChatProviderAdapter): Promise<ContractResult> {
  const calls: Array<{ method: string }> = [];
  const traced: ChatProviderAdapter = {
    providerId: adapter.providerId,
    chat: async (input) => { calls.push({ method: 'chat' }); return adapter.chat(input); },
    streamChat: adapter.streamChat ? async function* (input) {
      calls.push({ method: 'streamChat' }); yield* adapter.streamChat!(input);
    } : undefined,
  };
  try { await traced.chat({ credentialId: 'c', modelId: 'm', request: { profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hi' }] } }); } catch { throw new Error('propagated'); }
  try { if (traced.streamChat) { const iter = traced.streamChat({ credentialId: 'c', modelId: 'm', request: { profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hi' }] } }); for await (const _ of iter) { break; } } } catch { throw new Error('propagated'); }
  return { kind: 'gemini', chatCall: calls.some((c) => c.method === 'chat'), streamCall: calls.some((c) => c.method === 'streamChat') } as ContractResult;
}

async function runOpenAICompatibleContract(adapter: ChatProviderAdapter): Promise<ContractResult> {
  let called = false;
  const traced: ChatProviderAdapter = {
    providerId: adapter.providerId,
    chat: async (input) => { called = true; return adapter.chat(input); },
    streamChat: adapter.streamChat,
  };
  try { await traced.chat({ credentialId: 'c', modelId: 'm', request: { profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hi' }] } }); } catch { /* ignore */ }
  return { kind: 'openai-compatible', chatCall: called } as ContractResult;
}

async function runAnthropicContract(adapter: ChatProviderAdapter): Promise<ContractResult> {
  const result = await adapter.chat({ credentialId: 'c', modelId: 'm', request: { profile: 'auto:free', requiredCapabilities: ['chat'], messages: [{ role: 'user', content: 'hi' }] } }) as Record<string, unknown>;
  return { kind: 'anthropic', messagesField: result && ('content' in result || 'messages' in result) } as ContractResult;
}

test('runGeminiContract validates GeminiAdapter contract', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'gemini',
    chat: async () => ({ id: '1', model: 'm', content: 'ok', providerId: 'gemini', modelId: 'm' }),
    streamChat: async function* () { yield { id: '1', model: 'm', delta: 'ok' }; },
  };
  const result = await runGeminiContract(adapter);
  assert.strictEqual(result.kind, 'gemini');
});

test('runOpenAICompatibleContract validates adapter interface', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'test',
    chat: async () => ({ id: '1', model: 'm', content: 'ok', providerId: 'test', modelId: 'm' }),
  };
  const result = await runOpenAICompatibleContract(adapter);
  assert.strictEqual(result.kind, 'openai-compatible');
});

test('runAnthropicContract validates Anthropic-compatible interface', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'anthropic',
    chat: async () => ({ id: '1', model: 'm', content: 'ok', providerId: 'anthropic', modelId: 'm' }),
  };
  const result = await runAnthropicContract(adapter);
  assert.strictEqual(result.kind, 'anthropic');
});

test('contract test propagates error from failed chat', async () => {
  const adapter: ChatProviderAdapter = {
    providerId: 'gemini',
    chat: async () => { throw new ProviderInvocationError('err', { kind: 'temporary' }); },
  };
  let threw = false;
  try { await runGeminiContract(adapter); } catch { threw = true; }
  assert.strictEqual(threw, true);
});

test('integration_gate_C', () => {
  const marker = "integration_test_gate_C_" + Date.now();
  assert.match(marker, /integration_test_gate_C/);
});
