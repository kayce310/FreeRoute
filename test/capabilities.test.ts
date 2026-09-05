import assert from 'node:assert/strict';
import test from 'node:test';
import { supportsCapability, capabilitiesFromList, capabilitiesToList, unknownModelCapabilities, getCapabilitySource, } from '../src/capabilities.js';
import type { ModelCapabilities } from '../src/capabilities.js';

test('unknown model only has chat and streaming', () => {
  const caps = unknownModelCapabilities();
  assert.strictEqual(caps.chat, true);
  assert.strictEqual(caps.streaming, true);
  assert.strictEqual(caps.tools, false);
  assert.strictEqual(caps.vision, false);
  assert.strictEqual(caps.structuredOutput, false);
});

test('supportsCapability returns true when all required capabilities present', () => {
  const caps = { chat: true, streaming: true, tools: true, toolChoice: true, vision: true, structuredOutput: true, responses: true, messages: true };
  assert.strictEqual(supportsCapability(caps, ['chat', 'tools']), true);
});

test('supportsCapability returns false when capability missing', () => {
  const caps = { chat: true, streaming: true, tools: false, toolChoice: false, vision: false, structuredOutput: false, responses: false, messages: false };
  assert.strictEqual(supportsCapability(caps, ['tools']), false);
});

test('capabilitiesFromList converts Capability[] to ModelCapabilities', () => {
  const caps = capabilitiesFromList(['chat', 'streaming', 'vision']);
  assert.strictEqual(caps.chat, true);
  assert.strictEqual(caps.vision, true);
  assert.strictEqual(caps.tools, false);
});

test('capabilitiesToList converts back', () => {
  const caps: ModelCapabilities = { chat: true, streaming: true, tools: true, toolChoice: false, vision: false, structuredOutput: false, responses: false, messages: false };
  const list = capabilitiesToList(caps);
  assert.strictEqual(list.includes('chat'), true);
  assert.strictEqual(list.includes('streaming'), true);
  assert.strictEqual(list.includes('tools'), true);
});

test('getCapabilitySource returns live_probe when hasLiveProbe', () => {
  const source = getCapabilitySource(['chat'], ['chat', 'tools'], true);
  assert.strictEqual(source, 'live_probe');
});

test('getCapabilitySource returns catalog when no live probe', () => {
  const source = getCapabilitySource(['chat'], ['chat', 'tools'], false);
  assert.strictEqual(source, 'catalog');
});

test('getCapabilitySource returns adapter when no catalog data', () => {
  const source = getCapabilitySource(['chat'], [], false);
  assert.strictEqual(source, 'adapter');
});
