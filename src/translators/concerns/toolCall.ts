// Ensure tools have valid IDs/formats
import type { NormalizedChatRequest } from '../../inference.js';

const TOOL_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function sanitizeToolId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

export function ensureToolCallIds(body: NormalizedChatRequest) {
  if (!body.tools) return;

  for (const tool of body.tools) {
    if (tool.function.name && !TOOL_ID_PATTERN.test(tool.function.name)) {
      tool.function.name = sanitizeToolId(tool.function.name);
    }
  }
}
