import fs from 'node:fs';
import { SqliteCredentialStore } from '../src/storage/sqlite-credential-store.js';
import { DEFAULT_THINKING_AG_SIGNATURE } from '../src/config/thinking-signatures.js';

const secretMaster = fs.readFileSync('data/.master_secret', 'utf8').trim();
const store = new SqliteCredentialStore('data/freeroute.sqlite', secretMaster);
const creds = (await store.list()).filter(c => c.providerId === 'gemini' && c.enabled);
console.log(`Found ${creds.length} gemini credentials:`, creds.map(c => c.credentialId));

const body = {
  contents: [
    {
      role: 'user',
      parts: [{ text: 'Tra cứu tin tức về bão số 3' }]
    },
    {
      role: 'model',
      parts: [
        {
          thoughtSignature: DEFAULT_THINKING_AG_SIGNATURE,
          functionCall: {
            name: 'default_api_fetch_webpage',
            args: { url: 'https://nchmf.gov.vn' }
          }
        }
      ]
    },
    {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'default_api_fetch_webpage',
            response: { result: 'Tin bão số 3: Bão đang di chuyển vào vùng biển Quảng Ninh - Hải Phòng với sức gió cấp 12.' }
          }
        },
        { text: 'Tóm tắt ngắn gọn tình hình bão trên' }
      ]
    }
  ],
  tools: [
    {
      functionDeclarations: [
        {
          name: 'default_api_fetch_webpage',
          description: 'Fetch content from a webpage',
          parameters: {
            type: 'OBJECT',
            properties: { url: { type: 'STRING' } },
            required: ['url']
          }
        }
      ]
    }
  ]
};

for (const cred of creds) {
  const secret = await store.get('gemini', cred.credentialId);
  const apiKey = typeof secret === 'string' ? secret : secret?.apiKey || secret?.api_key || secret?.token;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  console.log(`Cred: ${cred.credentialId} Status: ${res.status}`);
  const text = await res.text();
  if (res.status === 200) {
    console.log(`SUCCESS with ${cred.credentialId}! Response snippet:`, text.slice(0, 300));
    break;
  } else {
    console.log(`Failed snippet for ${cred.credentialId}:`, text.slice(0, 200));
  }
}
