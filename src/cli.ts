import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createOpenRouterRuntime } from './app.js';
import { importNineRouterApiKey } from './importers/9router.js';
import { SqliteCredentialStore } from './storage/sqlite-credential-store.js';

const [command, ...args] = process.argv.slice(2);

async function main(): Promise<void> {
  if (process.env.FREEROUTE_ENV_FILE) readEnvFile(process.env.FREEROUTE_ENV_FILE);
  if (command === 'import-9router') await importFromNineRouter(args);
  else if (command === 'serve') await serve();
  else if (command === 'add-key') await addKey(args);
  else if (command === 'list-keys') await listKeys();
  else if (command === 'remove-key') await removeKey(args);
  else if (command === 'status') await status();
  else printUsage();
}

async function credentialStore(): Promise<SqliteCredentialStore> {
  return new SqliteCredentialStore(await localDatabasePath(), requiredEnv('FREEROUTE_MASTER_SECRET'));
}

async function addKey(args: string[]): Promise<void> {
  const [providerId, apiKey] = args;
  if (!providerId || !apiKey) { console.error('usage: freeroute add-key <provider> <api-key>'); process.exitCode = 1; return; }
  const store = await credentialStore();
  try {
    await store.put(providerId, 'default', apiKey);
    console.log(`Added key for provider '${providerId}' (credential: default).`);
  } finally { store.close(); }
}

async function listKeys(): Promise<void> {
  const store = await credentialStore();
  try {
    const creds = await store.list();
    if (!creds.length) { console.log('No credentials stored.'); return; }
    console.log('Stored credentials:');
    for (const cred of creds) {
      console.log(`  ${cred.providerId}/${cred.credentialId}  (added ${cred.createdAt.toISOString()})`);
    }
  } finally { store.close(); }
}

async function removeKey(args: string[]): Promise<void> {
  const [providerId, credentialId = 'default'] = args;
  if (!providerId) { console.error('usage: freeroute remove-key <provider> [credential-id]'); process.exitCode = 1; return; }
  const store = await credentialStore();
  try {
    // Direct SQLite delete since there's no remove method
    const dbPath = await localDatabasePath();
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(dbPath);
    db.prepare('DELETE FROM credentials WHERE provider_id = ? AND credential_id = ?').run(providerId, credentialId);
    db.close();
    console.log(`Removed credential '${providerId}/${credentialId}'.`);
  } finally { store.close(); }
}

async function status(): Promise<void> {
  const store = await credentialStore();
  try {
    const creds = await store.list();
    console.log(`FreeRoute status`);
    console.log(`  Data dir: ${resolve(process.env.FREEROUTE_DATA_DIR ?? 'data')}`);
    console.log(`  Stored providers: ${creds.length > 0 ? creds.map(c => c.providerId).join(', ') : '(none)'}`);
    console.log(`  Supported: openrouter, groq, gemini`);
  } finally { store.close(); }
}

async function importFromNineRouter(args: string[]): Promise<void> {
  const sourceDatabasePath = args[0];
  if (!sourceDatabasePath) throw new Error('usage: freeroute import-9router <9router-database-path> [provider-id]');
  const providerId = args[1] ?? 'openrouter';
  const store = await credentialStore();
  try {
    const result = await importNineRouterApiKey({ sourceDatabasePath: resolve(sourceDatabasePath), providerId, credentials: store });
    console.log(`Imported ${result.providerId} connection ${result.sourceConnectionId} as credential ${result.credentialId}.`);
  } finally { store.close(); }
}

async function serve(): Promise<void> {
  const runtime = createOpenRouterRuntime({
    databasePath: await localDatabasePath(),
    masterSecret: requiredEnv('FREEROUTE_MASTER_SECRET'),
    apiToken: requiredEnv('FREEROUTE_API_TOKEN'),
    baseUrl: process.env.OPENROUTER_BASE_URL,
    groqBaseUrl: process.env.GROQ_BASE_URL,
    geminiBaseUrl: process.env.GEMINI_BASE_URL,
  });
  const port = Number(process.env.FREEROUTE_PORT ?? '8787');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('FREEROUTE_PORT must be a valid TCP port');
  const refreshMinutes = Number(process.env.FREEROUTE_REFRESH_MINUTES ?? '30');
  if (!Number.isFinite(refreshMinutes) || refreshMinutes <= 0) throw new Error('FREEROUTE_REFRESH_MINUTES must be greater than zero');
  await new Promise<void>((resolveListen) => runtime.server.listen(port, '127.0.0.1', resolveListen));
  console.log(`FreeRoute listening on http://127.0.0.1:${port}`);
  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    try {
      const results = await runtime.refreshProviders();
      for (const result of results) {
        if (result.status === 'updated') console.log(`${result.providerId} catalog refreshed (${result.modelCount} models).`);
        else if (result.error !== 'credential not configured') console.error(`${result.providerId} catalog refresh failed: ${result.error}`);
      }
    } finally { refreshing = false; }
  };
  void refresh();
  const refreshTimer = setInterval(() => { void refresh(); }, refreshMinutes * 60_000);
  const shutdown = () => {
    clearInterval(refreshTimer);
    runtime.server.close(() => { runtime.close(); process.exitCode = 0; });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

async function localDatabasePath(): Promise<string> {
  const dataDir = resolve(process.env.FREEROUTE_DATA_DIR ?? 'data');
  await mkdir(dataDir, { recursive: true });
  return resolve(dataDir, 'freeroute.sqlite');
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

/** Reads key=value lines from a .env file, ignoring comments and blank lines. */
function readEnvFile(path: string): void {
  try {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch { /* file not found — skip */ }
}

function printUsage(): void {
  console.log(`FreeRoute CLI
Commands:
  freeroute serve              Start the routing server
  freeroute add-key <provider> <api-key>   Add an API key for a provider
  freeroute list-keys          List stored credentials
  freeroute remove-key <provider> [credential-id]  Remove a credential
  freeroute status             Show server status
  freeroute import-9router <db-path> [provider]  Import from 9Router database`);
  process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
