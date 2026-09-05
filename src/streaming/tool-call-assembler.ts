import type { ToolCall } from '../inference.js';

export interface ToolCallFragment {
  index: number;
  id: string;
  name?: string;
  argumentFragment: string;
}

/**
 * Reassembles fragmented tool-call SSE chunks into complete ToolCall objects.
 * Groups by index, concatenates argument fragments, sorts by index.
 */
export function assembleToolCalls(fragments: ToolCallFragment[]): ToolCall[] {
  const groups = new Map<number, { id: string; name?: string; args: string }>();

  for (const fragment of fragments) {
    const existing = groups.get(fragment.index) ?? { id: fragment.id, name: '', args: '' };
    if (fragment.name) existing.name = fragment.name;
    existing.args += fragment.argumentFragment;
    groups.set(fragment.index, existing);
  }

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, group]) => ({
      id: group.id,
      type: 'function' as const,
      function: {
        name: group.name ?? '',
        arguments: group.args,
      },
    }));
}

/**
 * Extracts tool-call deltas from a stream event. Returns undefined if none.
 */
export function extractToolCallDelta(
  id: string | undefined,
  delta: { name?: string; arguments?: string } | undefined,
  index: number,
): ToolCallFragment | undefined {
  if (!delta?.arguments) return undefined;
  return { index, id: id ?? '', name: delta.name, argumentFragment: delta.arguments };
}
