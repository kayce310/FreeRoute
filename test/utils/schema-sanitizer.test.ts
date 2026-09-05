import assert from 'node:assert';
import { test } from 'node:test';
import { sanitizeJsonSchema } from '../../src/utils/schema-sanitizer.js';

test('sanitizeJsonSchema - basic field filtering', () => {
  const input = {
    type: 'object',
    $schema: 'http://json-schema.org/draft-07/schema#',
    $comment: 'This is a comment',
    properties: {
      name: { type: 'string', description: 'User name', enumDescriptions: ['A', 'B'] },
      age: { type: 'number', minimum: 0, exclusiveMinimum: -1 }
    },
    required: ['name'],
    additionalProperties: false
  };

  const expected = {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'User name' },
      age: { type: 'number', minimum: 0 }
    },
    required: ['name']
  };

  const result = sanitizeJsonSchema(input);
  assert.deepStrictEqual(result, expected);
});

test('sanitizeJsonSchema - nested and array objects', () => {
  const input = {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: { type: 'string', pattern: '^[a-z]+$' },
          minItems: 1
        }
      }
    }
  };

  const result = sanitizeJsonSchema(input);
  // Should remain unchanged as all fields are standard
  assert.deepStrictEqual(result, input);
});

test('sanitizeJsonSchema - removes propertyNames and unknown extensions', () => {
  const input = {
    type: 'object',
    propertyNames: { pattern: '^[a-z]+$' },
    properties: {
      data: { type: 'object', additionalProperties: { type: 'string' } }
    }
  };

  const result = sanitizeJsonSchema(input);
  assert.strictEqual(result.propertyNames, undefined);
  // additionalProperties is NOT in our current whitelist, so it should be removed
  assert.deepStrictEqual(result.properties.data, { type: 'object' });
});
