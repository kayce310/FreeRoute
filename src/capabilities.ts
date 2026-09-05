import type { Capability } from './contracts.js';

export type CapabilitySource = 'adapter' | 'catalog' | 'live_probe';

export interface ModelCapabilities {
  chat: boolean;
  streaming: boolean;
  tools: boolean;
  toolChoice: boolean;
  vision: boolean;
  structuredOutput: boolean;
  responses: boolean;
  messages: boolean;
}

export interface CapabilityMetadata {
  capabilities: ModelCapabilities;
  source: CapabilitySource;
  capabilityVerifiedAt?: Date;
}

/**
 * Checks if a model supports a required capability.
 */
export function supportsCapability(capabilities: ModelCapabilities, required: Capability[]): boolean {
  return required.every((cap) => capabilities[cap as keyof ModelCapabilities]);
}

/**
 * Converts Capability[] to ModelCapabilities. Unknown capabilities default to false.
 */
export function capabilitiesFromList(list: Capability[]): ModelCapabilities {
  return {
    chat: list.includes('chat'),
    streaming: list.includes('streaming'),
    tools: list.includes('tools'),
    toolChoice: list.includes('toolChoice') ?? false,
    vision: list.includes('vision'),
    structuredOutput: list.includes('structured-output'),
    responses: list.includes('responses'),
    messages: list.includes('messages'),
  };
}

/**
 * Converts ModelCapabilities back to Capability[] for compatibility with existing contracts.
 */
export function capabilitiesToList(capabilities: ModelCapabilities): Capability[] {
  const list: Capability[] = [];
  if (capabilities.chat) list.push('chat');
  if (capabilities.streaming) list.push('streaming');
  if (capabilities.tools) list.push('tools');
  if (capabilities.toolChoice) list.push('toolChoice');
  if (capabilities.vision) list.push('vision');
  if (capabilities.structuredOutput) list.push('structured-output');
  if (capabilities.responses) list.push('responses');
  if (capabilities.messages) list.push('messages');
  return list;
}

/**
 * Returns the capability source for a model based on whether it came from
 * adapter discovery, catalog preset, or live probe.
 */
export function getCapabilitySource(
  adapterCapabilities: Capability[],
  catalogCapabilities: Capability[],
  hasLiveProbe: boolean,
): CapabilitySource {
  if (hasLiveProbe && catalogCapabilities.length > 0) return 'live_probe';
  if (catalogCapabilities.length > 0) return 'catalog';
  return 'adapter';
}

/**
 * Unknown models get conservative capabilities: only chat + streaming.
 */
export function unknownModelCapabilities(): ModelCapabilities {
  return {
    chat: true,
    streaming: true,
    tools: false,
    toolChoice: false,
    vision: false,
    structuredOutput: false,
    responses: false,
    messages: false,
  };
}
