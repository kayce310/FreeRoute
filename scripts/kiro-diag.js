/**
 * Kiro diagnostic harness v2 - detailed refresh logging
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function redactToken(tok) {
  if (!tok || typeof tok !== 'string') return '<none>';
  return tok.slice(0, 12) + '...' + tok.slice(-8);
}

async function main() {
  const apiToken = process.argv[2];
  if (!apiToken) {
    console.error('Usage: node scripts/kiro-diag.js <api-token>');
    process.exit(1);
  }

  const originalFetch = globalThis.fetch;
  const captured = [];

  // Override fetch to intercept and log
  globalThis.fetch = async function (input, init) {
    const reqUrl = typeof input === 'string' ? input : input.url;
    const isKiro = reqUrl.includes('kiro') || reqUrl.includes('codewhisperer') || reqUrl.includes('oidc');

    if (isKiro) {
      const headers = init?.headers || {};
      const hdrObj = typeof headers === 'string' ? {} :
        headers instanceof Headers ? Object.fromEntries(headers.entries()) : headers;
      const authHdr = hdrObj['Authorization'] || '';
      const tokenFp = authHdr.startsWith('Bearer ') ? redactToken(authHdr.slice(7)) : '<none>';

      console.log(`\n[FETCH] ${init?.method || 'GET'} ${reqUrl}`);
      console.log(`  Token: ${tokenFp}`);
      if (init?.body) {
        try {
          const body = JSON.parse(init.body);
          console.log(`  Body keys: ${Object.keys(body).join(', ')}`);
        } catch {}
      }

      captured.push({ url: reqUrl, tokenFp, method: init?.method || 'GET' });
    }

    const response = await originalFetch.call(this, input, init);

    if (isKiro) {
      console.log(`  Response: ${response.status} ${response.statusText}`);
      if (!response.ok) {
        const text = await response.text();
        console.log(`  Error: ${text.slice(0, 200)}`);
      }
    }

    return response;
  };

  console.log('=== Kiro Diagnostic v2 ===\n');

  // Import runtime directly
  const { createOpenRouterRuntime } = await import('../dist/src/app.js');
  const masterSecret = readFileSync(join(ROOT, 'data', '.master_secret'), 'utf8').trim();

  const runtime = createOpenRouterRuntime({
    databasePath: join(ROOT, 'data', 'freeroute.sqlite'),
    masterSecret,
  });

  console.log('Testing catalog refresh...\n');
  const results = await runtime.refreshProviders();

  for (const r of results) {
    if (r.providerId === 'kiro') {
      console.log(`\n[KIRO CATALOG] ${r.status} (${r.modelCount ?? 0} models)`);
      if (r.error) console.log(`  Error: ${r.error}`);
    }
  }

  console.log('\n\nTesting inference...\n');
  try {
    const response = await fetch('http://localhost:8787/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        model: 'kr/claude-haiku-4.5',
        messages: [{ role: 'user', content: 'Say hi' }],
        max_tokens: 10,
      }),
    });

    const text = await response.text();
    console.log(`\n[INFERENCE] HTTP ${response.status}: ${text.slice(0, 300)}`);
  } catch (err) {
    console.log(`\n[INFERENCE] Failed: ${err.message}`);
  }

  runtime.close();
}

main().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
