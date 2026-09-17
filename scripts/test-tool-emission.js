const start = Date.now();
console.log('Testing tool generation (model calls tool) via FreeRoute...');

const payload = {
  model: 'thunghiem',
  messages: [
    { role: 'user', content: 'Thời tiết hôm nay ở Hà Nội thế nào? Hãy dùng công cụ tra cứu thời tiết.' }
  ],
  tools: [{
    type: 'function',
    function: {
      name: 'get_current_weather',
      description: 'Lấy thông tin thời tiết hiện tại của một thành phố',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'Tên thành phố, ví dụ: Hanoi' }
        },
        required: ['location']
      }
    }
  }],
  stream: true
};

async function run() {
  const res = await fetch('http://127.0.0.1:8787/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  console.log('Status:', res.status, 'Time to headers:', Date.now() - start, 'ms');
  console.log('Provider used:', res.headers.get('x-freeroute-provider'), 'Model:', res.headers.get('x-freeroute-model'));

  if (!res.ok) {
    const err = await res.text();
    console.error('FAILED response:', res.status, err);
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let chunks = [];
  let toolCalls = [];
  let content = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const str = decoder.decode(value);
    for (const line of str.split('\n')) {
      if (line.startsWith('data:') && line.slice(5).trim() !== '[DONE]') {
        try {
          const json = JSON.parse(line.slice(5).trim());
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) content += delta.content;
          if (delta?.tool_calls) {
            toolCalls.push(...delta.tool_calls);
          }
        } catch {}
      }
    }
  }

  console.log('\n--- SUCCESS! ---');
  console.log('Content:', content);
  console.log('Tool calls received:', JSON.stringify(toolCalls, null, 2));
}

run().catch(console.error);
