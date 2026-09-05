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
