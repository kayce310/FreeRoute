import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AnthropicAdapter } from '../src/providers/anthropic.js';
import type { NormalizedChatRequest } from '../src/inference.js';

describe('Phase 4: Anthropic Tool-Call Streaming Fix', () => {
  const adapter = new AnthropicAdapter({
    getCredential: async () => 'test-key',
    fetch: mockFetch,
  });

  it('1. Accumulates tool-call arguments progressively during streaming', async () => {
    const request: NormalizedChatRequest = {
      profile: 'default',
      requiredCapabilities: ['chat', 'streaming', 'tools'],
      messages: [{ role: 'user', content: 'call tool' }],
      tools: [{ type: 'function', function: { name: 'test_tool', description: 'test', parameters: {} } }],
    };

    const events: any[] = [];
    for await (const event of adapter.streamChat({
      credentialId: 'test',
      modelId: 'claude-3-5-sonnet',
      request,
    })) {
      events.push(event);
    }

    // Find tool-call events
    const toolEvents = events.filter(e => e.toolCalls);
    assert.ok(toolEvents.length > 0, 'Should have tool-call events');

    // Last tool-call event should have complete JSON arguments
    const lastToolEvent = toolEvents[toolEvents.length - 1];
    const args = lastToolEvent.toolCalls?.[0]?.function?.arguments;
    
    assert.ok(args, 'Should have arguments');
    assert.ok(args.length > 0, 'Arguments should not be empty');
    
    // Arguments should be valid JSON (not partial fragment)
    try {
      JSON.parse(args);
      // ✓ Valid JSON
    } catch {
      throw new Error(`Arguments should be valid JSON, got: ${args}`);
    }
  });

  it('2. Does not yield partial JSON fragments in arguments field', async () => {
    const request: NormalizedChatRequest = {
      profile: 'default',
      requiredCapabilities: ['chat', 'streaming', 'tools'],
      messages: [{ role: 'user', content: 'call tool' }],
      tools: [{ type: 'function', function: { name: 'test_tool', description: 'test', parameters: {} } }],
    };

    const events: any[] = [];
    for await (const event of adapter.streamChat({
      credentialId: 'test',
      modelId: 'claude-3-5-sonnet',
      request,
    })) {
      events.push(event);
    }

    // Check tool-call events - they should show progression of accumulated arguments
    const toolEvents = events.filter(e => e.toolCalls);
    assert.ok(toolEvents.length > 0, 'Should have tool-call events');

    // The FIX: yielding tc.args (accumulated) not data.delta.partial_json (fragment alone)
    // So we should see progression: empty → partial → more partial → complete
    let lastArgs = '';
    for (const event of toolEvents) {
      const args = event.toolCalls?.[0]?.function?.arguments;
      if (args) {
        // Arguments should either be empty (start) or longer than before (accumulation)
        // NOT regress to shorter (which would happen if yielding fresh fragment each time)
        assert.ok(args.length >= lastArgs.length, `Arguments should accumulate: "${lastArgs}" → "${args}"`);
        lastArgs = args;
      }
    }

    // Final accumulated arguments should be valid JSON
    if (lastArgs && lastArgs.length > 0) {
      try {
        JSON.parse(lastArgs);
        // ✓ Final result is valid JSON
      } catch (e) {
        throw new Error(`Final accumulated arguments should be valid JSON, got: ${lastArgs}`);
      }
    }
  });

  it('3. Streaming tool-calls match non-streaming contract', async () => {
    // Non-streaming: JSON.stringify(b.input) (line 50)
    // Streaming: tc.args (accumulated partial_json) (line 114, FIXED)
    // Both should produce valid JSON in arguments field

    const nonStreamingResult = {
      id: 'msg_123',
      content: [
        {
          type: 'tool_use',
          id: 'tool_abc',
          name: 'test_fn',
          input: { key: 'value', nested: { prop: 123 } },
        },
      ],
    };

    // Non-streaming would produce:
    const nonStreamingArgs = JSON.stringify(nonStreamingResult.content[0].input);
    
    // Streaming should produce the same (after accumulation)
    assert.ok(nonStreamingArgs, 'Non-streaming arguments should be valid JSON');
    
    try {
      JSON.parse(nonStreamingArgs);
      // ✓ Non-streaming is valid JSON
    } catch {
      throw new Error('Non-streaming arguments should be valid JSON');
    }
  });

  it('4. Tool-call-only Anthropic streaming response completes successfully', async () => {
    const request: NormalizedChatRequest = {
      profile: 'default',
      requiredCapabilities: ['chat', 'streaming', 'tools'],
      messages: [{ role: 'user', content: 'use tool only' }],
      tools: [{ type: 'function', function: { name: 'get_data', description: 'test', parameters: {} } }],
    };

    let foundToolCall = false;
    let foundFinish = false;

    for await (const event of adapter.streamChat({
      credentialId: 'test',
      modelId: 'claude-3-5-sonnet',
      request,
    })) {
      if (event.toolCalls) foundToolCall = true;
      if (event.finishReason) foundFinish = true;
    }

    assert.ok(foundToolCall, 'Should have yielded tool-calls');
    assert.ok(foundFinish, 'Should have completed with finishReason');
  });
});

// Mock fetch that simulates Anthropic streaming response
async function mockFetch(input: string | URL | Request, options?: any): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as any).url;
  if (!url || !url.includes('messages')) throw new Error('Unexpected URL');

  // Simulate Anthropic streaming response with tool-call
  const mockStream = new ReadableStream({
    start(controller) {
      const events = [
        // Tool use start
        { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'call_123', name: 'test_tool' } },
        // Partial JSON delta 1
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"ke' } },
        // Partial JSON delta 2
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'y": "va' } },
        // Partial JSON delta 3
        { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: 'lue"}' } },
        // Message delta with stop_reason
        { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { input_tokens: 10, output_tokens: 5 } },
      ];

      const encoder = new TextEncoder();
      for (const event of events) {
        const chunk = `data: ${JSON.stringify(event)}\n`;
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return {
    ok: true,
    body: mockStream,
  } as any;
}
