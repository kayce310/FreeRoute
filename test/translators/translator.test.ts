import test from 'node:test';
import assert from 'node:assert';
import { translateGeminiRequest } from '../../src/translators/gemini-translator.js';
import { translateOpenAIRequest } from '../../src/translators/openai-translator.js';
import type { NormalizedChatRequest } from '../../src/inference.js';

test('GeminiTranslator: translates NormalizedChatRequest and sanitizes nested schemas recursively', () => {
  const req: NormalizedChatRequest = {
    profile: 'default',
    requiredCapabilities: [],
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' }
    ],
    temperature: 0.7,
    tools: [
      {
        type: 'function',
        function: {
          name: 'test_func',
          description: 'A test function',
          parameters: {
            type: 'object',
            properties: {
              foo: {
                type: 'string',
                $schema: 'http://json-schema.org/draft-07/schema#',
                additionalProperties: false
              },
              nested: {
                type: 'object',
                properties: {
                  bar: {
                    type: 'integer',
                    exclusiveMinimum: 0
                  }
                }
              }
            },
            required: ['foo']
          }
        }
      }
    ]
  };

  const result: any = translateGeminiRequest(req);
  assert.strictEqual(result.contents.length, 1);
  assert.strictEqual(result.contents[0].role, 'user');
  assert.strictEqual(result.contents[0].parts[0].text, 'Hello');
  assert.strictEqual(result.systemInstruction.parts[0].text, 'You are a helpful assistant.');
  assert.strictEqual(result.generationConfig.temperature, 0.7);

  const funcDecl = result.tools[0].functionDeclarations[0];
  assert.strictEqual(funcDecl.name, 'test_func');
  
  // Check recursive sanitization: $schema, additionalProperties, exclusiveMinimum should be removed
  const fooProp = funcDecl.parameters.properties.foo;
  assert.strictEqual(fooProp.type, 'string');
  assert.strictEqual(fooProp.$schema, undefined);
  assert.strictEqual(fooProp.additionalProperties, undefined);

  const barProp = funcDecl.parameters.properties.nested.properties.bar;
  assert.strictEqual(barProp.type, 'integer');
  assert.strictEqual(barProp.exclusiveMinimum, undefined);
});

test('OpenAITranslator: keeps traditional openai-compatible schema', () => {
  const req: NormalizedChatRequest = {
    profile: 'default',
    requiredCapabilities: [],
    messages: [{ role: 'user', content: 'Hi' }],
  };
  const result: any = translateOpenAIRequest({ modelId: 'gpt-4o', request: req });
  assert.strictEqual(result.model, 'gpt-4o');
  assert.strictEqual(result.messages.length, 1);
  assert.strictEqual(result.stream, false);
});

test('openaiToAnthropicRequest: converts tool calls, tool results, and merges consecutive user messages', async () => {
  const { openaiToAnthropicRequest } = await import('../../src/translators/request/openai-to-anthropic.js');
  const req: NormalizedChatRequest = {
    profile: 'default',
    requiredCapabilities: [],
    messages: [
      { role: 'user', content: 'What is the weather in Hanoi?' },
      {
        role: 'assistant',
        content: 'Checking weather...',
        tool_calls: [
          {
            id: 'call_hanoi_1',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Hanoi"}' },
          },
        ],
      } as any,
      {
        role: 'tool',
        tool_call_id: 'call_hanoi_1',
        content: '{"temp": 32, "unit": "C"}',
      } as any,
    ],
  };

  const payload: any = openaiToAnthropicRequest('claude-3-5-sonnet', req);
  assert.strictEqual(payload.messages.length, 3);
  assert.strictEqual(payload.messages[0].role, 'user');
  assert.strictEqual(payload.messages[1].role, 'assistant');
  // Check tool_use block
  const toolUse = payload.messages[1].content.find((b: any) => b.type === 'tool_use');
  assert.ok(toolUse);
  assert.strictEqual(toolUse.id, 'call_hanoi_1');
  assert.strictEqual(toolUse.name, 'get_weather');
  assert.deepStrictEqual(toolUse.input, { city: 'Hanoi' });

  // Check tool_result block in user role
  assert.strictEqual(payload.messages[2].role, 'user');
  const toolResult = payload.messages[2].content.find((b: any) => b.type === 'tool_result');
  assert.ok(toolResult);
  assert.strictEqual(toolResult.tool_use_id, 'call_hanoi_1');
  assert.strictEqual(toolResult.content, '{"temp": 32, "unit": "C"}');
});

test('openaiToGeminiRequest: converts tool calls and functionResponse', async () => {
  const { openaiToGeminiRequest } = await import('../../src/translators/request/openai-to-gemini.js');
  const req: NormalizedChatRequest = {
    profile: 'default',
    requiredCapabilities: [],
    messages: [
      { role: 'user', content: 'What is the weather in Hanoi?' },
      {
        role: 'assistant',
        content: 'Checking...',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: { name: 'get_weather', arguments: '{"city":"Hanoi"}' },
          },
        ],
      } as any,
      {
        role: 'tool',
        tool_call_id: 'call_123',
        content: '{"temp": 32}',
      } as any,
    ],
  };

  const payload: any = openaiToGeminiRequest('gemini-2.0-flash', req);
  assert.strictEqual(payload.contents.length, 3);
  assert.strictEqual(payload.contents[0].role, 'user');
  assert.strictEqual(payload.contents[1].role, 'model');

  // Check functionCall in model
  const funcCall = payload.contents[1].parts.find((p: any) => p.functionCall);
  assert.ok(funcCall);
  assert.strictEqual(funcCall.functionCall.name, 'get_weather');
  assert.deepStrictEqual(funcCall.functionCall.args, { city: 'Hanoi' });

  // Check functionResponse in user
  assert.strictEqual(payload.contents[2].role, 'user');
  const funcResp = payload.contents[2].parts.find((p: any) => p.functionResponse);
  assert.ok(funcResp);
  assert.strictEqual(funcResp.functionResponse.name, 'get_weather');
  assert.deepStrictEqual(funcResp.functionResponse.response, { temp: 32 });
});

test('request translators preserve reasoning and merge consecutive same-role messages', async () => {
  const { openaiToAnthropicRequest } = await import('../../src/translators/request/openai-to-anthropic.js');
  const { openaiToGeminiRequest } = await import('../../src/translators/request/openai-to-gemini.js');
  const req: NormalizedChatRequest = {
    profile: 'default',
    requiredCapabilities: [],
    messages: [
      { role: 'user', content: 'first' },
      { role: 'user', content: 'second' },
      { role: 'assistant', content: '', reasoning_content: 'step-by-step reasoning' } as any,
      { role: 'assistant', content: 'final answer' },
    ],
  };

  const anthropic: any = openaiToAnthropicRequest('claude', req);
  assert.strictEqual(anthropic.messages.length, 2);
  assert.deepStrictEqual(anthropic.messages[0].content.map((block: any) => block.text), ['first', 'second']);
  assert.strictEqual(anthropic.messages[1].content[0].type, 'thinking');
  assert.strictEqual(anthropic.messages[1].content[0].thinking, 'step-by-step reasoning');
  assert.strictEqual(anthropic.messages[1].content[1].text, 'final answer');

  const gemini: any = openaiToGeminiRequest('gemini', req);
  assert.strictEqual(gemini.contents.length, 2);
  assert.deepStrictEqual(gemini.contents[0].parts.map((part: any) => part.text), ['first', 'second']);
  assert.deepStrictEqual(gemini.contents[1].parts[0], { thought: true, text: 'step-by-step reasoning' });
  assert.strictEqual(gemini.contents[1].parts[1].text, 'final answer');
});

test('Gemini translator sanitizes invalid function names and preserves malformed arguments', async () => {
  const { openaiToGeminiRequest } = await import('../../src/translators/request/openai-to-gemini.js');
  const longName = `9 invalid name ${'x'.repeat(100)}`;
  const req: NormalizedChatRequest = {
    profile: 'default',
    requiredCapabilities: [],
    messages: [{
      role: 'assistant',
      content: null,
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: longName, arguments: '{not-json' } }],
    } as any],
  };
  const payload: any = openaiToGeminiRequest('gemini', req);
  const call = payload.contents[0].parts[0].functionCall;
  assert.match(call.name, /^_[a-zA-Z0-9_.:-]+$/);
  assert.ok(call.name.length <= 64);
  assert.deepStrictEqual(call.args, { content: '{not-json' });
});

