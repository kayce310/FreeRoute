/**
 * Full end-to-end test: 3 turns with tool-call round trip
 * Simulates Copilot-style multi-turn conversation with tool usage
 */
const start = Date.now();
const BASE = 'http://127.0.0.1:8787/v1/chat/completions';

async function callChat(messages, tools, model = 'thunghiem') {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, stream: true })
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const provider = res.headers.get('x-freeroute-provider');
  const modelUsed = res.headers.get('x-freeroute-model');
  
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let content = '';
  let toolCalls = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const str = dec.decode(value);
    for (const line of str.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) content += delta.content;
        if (delta?.tool_calls) toolCalls.push(...delta.tool_calls);
      } catch {}
    }
  }
  return { provider, model: modelUsed, content, toolCalls };
}

const tools = [{
  type: 'function',
  function: {
    name: 'default_api:fetch_webpage',
    description: 'Fetch content from a URL',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'URL to fetch' } },
      required: ['url']
    }
  }
}];

console.log('=== Full tool-call round-trip test ===\n');

// Turn 1: User asks, model calls tool
console.log('Turn 1: User asks about Avengers 5...');
const turn1Messages = [
  { role: 'user', content: 'Thông tin về Avengers 5' }
];
const turn1 = await callChat(turn1Messages, tools);
console.log(`  Provider: ${turn1.provider}/${turn1.model}`);
console.log(`  Content: "${turn1.content.slice(0, 80)}"`);
console.log(`  Tool calls: ${turn1.toolCalls.length}`);
if (turn1.toolCalls.length > 0) {
  console.log(`  Tool called: ${turn1.toolCalls[0]?.function?.name} args: ${turn1.toolCalls[0]?.function?.arguments}`);
}

// Turn 2: Model has tool call, simulate tool result, ask for summary
if (turn1.toolCalls.length > 0) {
  console.log('\nTurn 2: Sending tool result back...');
  const tc = turn1.toolCalls[0];
  const turn2Messages = [
    ...turn1Messages,
    {
      role: 'assistant',
      content: turn1.content || null,
      tool_calls: [{
        id: tc.id || 'call_test123',
        type: 'function',
        function: { name: tc.function.name, arguments: tc.function.arguments }
      }]
    },
    {
      role: 'tool',
      tool_call_id: tc.id || 'call_test123',
      content: JSON.stringify({
        title: 'Avengers: Doomsday (2026)',
        description: 'Avengers: Doomsday sẽ ra mắt tháng 5/2026, do Anthony và Joe Russo đạo diễn. Robert Downey Jr. quay trở lại vai Doctor Doom.',
        cast: ['Robert Downey Jr.', 'Chris Evans', 'Scarlett Johansson']
      })
    }
  ];
  
  const turn2 = await callChat(turn2Messages, tools);
  console.log(`  Provider: ${turn2.provider}/${turn2.model}`);
  console.log(`  Response: ${turn2.content.slice(0, 200)}`);
  
  if (turn2.content.length > 20) {
    console.log('\n✅ SUCCESS: Full tool-call round-trip works correctly!');
  } else {
    console.log('\n⚠️ WARNING: Got short/empty response after tool result');
  }
} else {
  // Model may have answered directly
  if (turn1.content.length > 30) {
    console.log('\n✅ SUCCESS: Model answered directly (no tool call needed)');
    console.log(`  Answer: ${turn1.content.slice(0, 200)}`);
  } else {
    console.log('\n⚠️ WARNING: No tool calls and no content');
  }
}

console.log(`\nTotal time: ${Date.now() - start}ms`);
