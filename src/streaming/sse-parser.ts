/**
 * Parses SSE payloads into typed events. Handles both newline-terminated
 * and non-newline-terminated chunks, plus incomplete final lines.
 */
export function parseSSE(buffer: string): Array<{ data: string; lineNumber: number }> {
  const events: Array<{ data: string; lineNumber: number }> = [];
  const lines = buffer.split(/\r?\n/);
  const pending = lines.pop() ?? '';

  let lineNumber = 0;
  for (const line of lines) {
    lineNumber++;
    const data = line.startsWith('data:') ? line.slice(5).trim() : '';
    if (data) {
      events.push({ data, lineNumber });
    }
  }

  if (pending.startsWith('data:')) {
    lineNumber++;
    const data = pending.slice(5).trim();
    if (data) {
      events.push({ data, lineNumber });
    }
  }

  return events;
}

export function splitSSE(buffer: string): { completeLines: string[]; pending: string } {
  const lines = buffer.split(/\r?\n/);
  const pending = lines.pop() ?? '';
  return { completeLines: lines, pending };
}

export function formatSSE(data: string): string {
  return `data: ${data}\n\n`;
}
