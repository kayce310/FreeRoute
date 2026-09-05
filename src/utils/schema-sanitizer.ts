/**
 * Standard JSON Schema fields supported by most strict providers (like Gemini).
 * Any field not in this list or not starting with a standard prefix will be stripped.
 */
const SUPPORTED_SCHEMA_KEYS = new Set([
  'type',
  'properties',
  'items',
  'required',
  'description',
  'enum',
  'format',
  'minimum',
  'maximum',
  'minLength',
  'maxLength',
  'pattern',
  'maxItems',
  'minItems',
  'uniqueItems',
  'multipleOf',
  'nullable',
]);

/**
 * Recursively sanitizes a JSON Schema object to only include fields 
 * supported by strict upstream providers.
 * 
 * @param schema The input JSON Schema object (from VS Code, etc.)
 * @returns A new object containing only whitelisted fields.
 */
export function sanitizeJsonSchema(schema: any): any {
  if (schema === null || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeJsonSchema(item));
  }

  const sanitized: any = {};
  
  for (const key of Object.keys(schema)) {
    const value = schema[key];

    // Whitelist check
    if (SUPPORTED_SCHEMA_KEYS.has(key)) {
      if (key === 'properties' && typeof value === 'object' && value !== null) {
        const sanitizedProps: any = {};
        for (const propKey of Object.keys(value)) {
          sanitizedProps[propKey] = sanitizeJsonSchema(value[propKey]);
        }
        sanitized[key] = sanitizedProps;
      } else if (key === 'items' && typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeJsonSchema(value);
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle other nested objects like 'additionalProperties' if they were whitelisted
        // but currently we only whitelist standard structural keys.
        sanitized[key] = sanitizeJsonSchema(value);
      } else {
        sanitized[key] = value;
      }
    }
    // Fields not in whitelist (like $schema, $comment, enumDescriptions, additionalProperties: boolean) are ignored.
  }

  return sanitized;
}
