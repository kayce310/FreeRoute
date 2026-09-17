const start = Date.now();
console.log('Testing tool-calling history request to combo:thunghiem...');

const payload = {
  model: 'thunghiem',
  messages: [
    { role: 'user', content: 'Tra cứu tin tức về bão số 3' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call_12345',
        type: 'function',
        function: {
          name: 'default_api:fetch_webpage',
          arguments: JSON.stringify({ url: 'https://nchmf.gov.vn' })
        }
      }]
    },
    {
      role: 'tool',
      tool_call_id: 'call_12345',
      content: 'Tin bão số 3: Bão đang di chuyển vào vùng biển Quảng Ninh - Hải Phòng với sức gió cấp 12.'
    },
    { role: 'user', content: 'Tóm tắt ngắn gọn tình hình bão trên' }
  ],
  tools: [{
    type: 'function',
    function: {
      name: 'default_api:fetch_webpage',
      description: 'Fetch content from a webpage',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
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
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const str = decoder.decode(value);
    for (const line of str.split('\n')) {
      if (line.startsWith('data:') && line.slice(5).trim() !== '[DONE]') {
        try {
          const json = JSON.parse(line.slice(5).trim());
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) text += delta;
        } catch {}
      }
    }
    if (text.length > 200) break;
  }
  console.log('\n--- SUCCESS! Got response (' + text.length + ' chars) in ' + (Date.now() - start) + 'ms ---');
  console.log(text.slice(0, 300));
}

run().catch(console.error);
