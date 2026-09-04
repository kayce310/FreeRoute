import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createOpenRouterRuntime } from './app.js';
import { importNineRouterApiKey } from './importers/9router.js';
import { SqliteCredentialStore } from './storage/sqlite-credential-store.js';
import { createSqliteProviderStore } from './storage/sqlite-provider-store.js';

const [command, ...args] = process.argv.slice(2);

async function main(): Promise<void> {
  if (process.env.FREEROUTE_ENV_FILE) readEnvFile(process.env.FREEROUTE_ENV_FILE);
  if (command === 'import-9router') await importFromNineRouter(args);
  else if (command === 'serve') await serve();
  else if (command === 'add-key') await addKey(args);
  else if (command === 'list-keys') await listKeys();
  else if (command === 'remove-key') await removeKey(args);
  else if (command === 'status') await status();
  else if (command === 'backup') await backup(args);
  else if (command === 'restore') await restore(args);
  else if (command === 'refresh') await refreshCatalog();
  else if (command === 'key-validate') await keyValidate(args);
  else if (command === 'provider-add') await providerAdd(args);
  else if (command === 'provider-list') await providerList();
  else if (command === 'provider-remove') await providerRemove(args);
  else printUsage();
}

async function getOrCreateMasterSecret(): Promise<string> {
  if (process.env.FREEROUTE_MASTER_SECRET) {
    return process.env.FREEROUTE_MASTER_SECRET;
  }
  const dataDir = resolve(process.env.FREEROUTE_DATA_DIR ?? 'data');
  await mkdir(dataDir, { recursive: true });
  const secretFile = resolve(dataDir, '.master_secret');
  try {
    const existing = (await readFile(secretFile, 'utf8')).trim();
    if (existing.length >= 16) {
      process.env.FREEROUTE_MASTER_SECRET = existing;
      return existing;
    }
  } catch {
    // Generate new secret
  }
  const { randomBytes } = await import('node:crypto');
  const generated = randomBytes(32).toString('hex');
  await writeFile(secretFile, generated, 'utf8');
  process.env.FREEROUTE_MASTER_SECRET = generated;
  console.log(`Initialized local master secret at ${secretFile}`);
  return generated;
}

async function credentialStore(): Promise<SqliteCredentialStore> {
  return new SqliteCredentialStore(await localDatabasePath(), await getOrCreateMasterSecret());
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
    const removed = await store.delete(providerId, credentialId);
    if (removed) {
      console.log(`Removed credential '${providerId}/${credentialId}'.`);
    } else {
      console.log(`No credential found for '${providerId}/${credentialId}'.`);
    }
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

async function backup(args: string[]): Promise<void> {
  const outputPath = args[0];
  if (!outputPath) { console.error('usage: freeroute backup <output-file>'); process.exitCode = 1; return; }
  const dbPath = await localDatabasePath();
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath);
  const models = db.prepare('SELECT * FROM catalog_models').all();
  const prefs = db.prepare('SELECT * FROM model_preferences').all();
  const events = db.prepare('SELECT * FROM routing_events').all();
  const quotas = db.prepare('SELECT * FROM quota_observations').all();
  db.close();
  const backup = { version: 1, createdAt: new Date().toISOString(), catalog_models: models, preferences: prefs, routing_events: events, quota_observations: quotas };
  await writeFile(outputPath, JSON.stringify(backup, null, 2));
  console.log(`Backup written to '${outputPath}' (${(models as unknown[]).length} models, ${(prefs as unknown[]).length} prefs).`);
}

async function restore(args: string[]): Promise<void> {
  const inputPath = args[0];
  if (!inputPath) { console.error('usage: freeroute restore <input-file>'); process.exitCode = 1; return; }
  const dbPath = await localDatabasePath();
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath);
  try {
    const content = await readFile(inputPath, 'utf8');
    const backup = JSON.parse(content) as { version?: number; catalog_models?: Record<string, unknown>[]; preferences?: Record<string, unknown>[] };
    if (!backup.version) throw new Error('invalid backup file');
    let modelsRestored = 0, prefsRestored = 0;
    for (const m of (backup.catalog_models ?? [])) {
      const row = m as { provider_id: string; model_id: string; capabilities_json: string; free_tier: string; checked_at: string; expires_at: string | null; priority: number };
      db.prepare('INSERT OR REPLACE INTO catalog_models (provider_id, model_id, capabilities_json, free_tier, checked_at, expires_at, priority) VALUES (?, ?, ?, ?, ?, ?, ?)').run(row.provider_id, row.model_id, row.capabilities_json, row.free_tier, row.checked_at, row.expires_at, row.priority);
      modelsRestored++;
    }
    for (const p of (backup.preferences ?? [])) {
      const row = p as { provider_id: string; model_id: string; preference: string; updated_at: string };
      db.prepare('INSERT OR REPLACE INTO model_preferences (provider_id, model_id, preference, updated_at) VALUES (?, ?, ?, ?)').run(row.provider_id, row.model_id, row.preference, row.updated_at);
      prefsRestored++;
    }
    db.close();
    console.log(`Restored ${modelsRestored} models and ${prefsRestored} preferences from '${inputPath}'.`);
  } catch (error) {
    db.close();
    throw error;
  }
}

async function refreshCatalog(): Promise<void> {
  const runtime = createOpenRouterRuntime({ databasePath: await localDatabasePath(), masterSecret: await getOrCreateMasterSecret(), apiToken: process.env.FREEROUTE_API_TOKEN, baseUrl: process.env.OPENROUTER_BASE_URL, groqBaseUrl: process.env.GROQ_BASE_URL, geminiBaseUrl: process.env.GEMINI_BASE_URL });
  try {
    const results = await runtime.refreshProviders();
    for (const result of results) {
      if (result.status === 'updated') console.log(`${result.providerId}: ${result.modelCount} models`);
      else console.error(`${result.providerId}: ${result.error ?? 'no credential'}`);
    }
  } finally { runtime.close(); }
}

async function keyValidate(args: string[]): Promise<void> {
  const [providerId, credentialId = 'default'] = args;
  if (!providerId) { console.error('usage: freeroute key-validate <provider> [credential-id]'); process.exitCode = 1; return; }
  const store = await credentialStore();
  try {
    const secret = await store.get(providerId, credentialId);
    if (!secret) { console.error(`No credential found for '${providerId}/${credentialId}'.`); process.exitCode = 1; return; }
    const runtime = createOpenRouterRuntime({ databasePath: await localDatabasePath(), masterSecret: await getOrCreateMasterSecret(), apiToken: process.env.FREEROUTE_API_TOKEN, baseUrl: process.env.OPENROUTER_BASE_URL, groqBaseUrl: process.env.GROQ_BASE_URL, geminiBaseUrl: process.env.GEMINI_BASE_URL });
    try {
      const results = await runtime.refreshProviders();
      const result = results.find(r => r.providerId === providerId);
      if (!result) { console.error(`Provider '${providerId}' is not configured.`); process.exitCode = 1; return; }
      if (result.status === 'updated') console.log(`Key for '${providerId}/${credentialId}' is VALID — ${result.modelCount} models accessible.`);
      else { console.error(`Key for '${providerId}/${credentialId}' validation failed: ${result.error}`); process.exitCode = 1; }
    } finally { runtime.close(); }
  } finally { store.close(); }
}

async function serve(): Promise<void> {
  const runtime = createOpenRouterRuntime({
    databasePath: await localDatabasePath(),
    masterSecret: await getOrCreateMasterSecret(),
    apiToken: process.env.FREEROUTE_API_TOKEN,
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

function localDatabasePathSync(): string {
  const dataDir = process.env.FREEROUTE_DATA_DIR ?? 'data';
  return `${dataDir}/freeroute.sqlite`;
}

async function providerAdd(args: string[]): Promise<void> {
  const [providerId, adapterType, baseUrl, classifyAsFree] = args;
  if (!providerId || !adapterType || !baseUrl) { console.error('usage: freeroute provider-add <provider-id> <openai-compatible|gemini> <base-url> [free_verified|free_unverified]'); process.exitCode = 1; return; }
  if (adapterType !== 'openai-compatible' && adapterType !== 'gemini') { console.error('adapter-type must be openai-compatible or gemini'); process.exitCode = 1; return; }
  const store = createSqliteProviderStore(localDatabasePathSync());
  try {
    store.put({ providerId, adapterType: adapterType as 'openai-compatible' | 'gemini', baseUrl, enabled: true, classifyAsFree });
    console.log(`Added provider '${providerId}' (${adapterType}) at ${baseUrl}.`);
  } finally { store.close(); }
}

async function providerList(): Promise<void> {
  const store = createSqliteProviderStore(localDatabasePathSync());
  try {
    const defs = store.list();
    if (!defs.length) { console.log('No custom providers.'); return; }
    console.log('Custom providers:');
    for (const def of defs) { console.log(`  ${def.providerId}  ${def.adapterType}  ${def.baseUrl}  [${def.enabled ? 'enabled' : 'disabled'}]${def.classifyAsFree ? `  tier:${def.classifyAsFree}` : ''}`); }
  } finally { store.close(); }
}

async function providerRemove(args: string[]): Promise<void> {
  const [providerId] = args;
  if (!providerId) { console.error('usage: freeroute provider-remove <provider-id>'); process.exitCode = 1; return; }
  const store = createSqliteProviderStore(localDatabasePathSync());
  try { store.remove(providerId); console.log(`Removed provider '${providerId}'.`); } finally { store.close(); }
}

function printUsage(): void {
  console.log(`FreeRoute CLI
Commands:
  freeroute serve              Start the routing server
  freeroute add-key <provider> <api-key>   Add an API key for a provider
  freeroute list-keys          List stored credentials
  freeroute remove-key <provider> [credential-id]  Remove a credential
  freeroute status             Show server status
  freeroute import-9router <db-path> [provider]  Import from 9Router database
  freeroute backup <file>     Backup catalog, preferences and events
  freeroute restore <file>    Restore from backup
  freeroute refresh           Force-refresh model catalog from providers
  freeroute key-validate <provider> [credential-id]  Validate a stored API key
  freeroute provider-add <id> <openai-compatible|gemini> <url> [tier]  Add custom provider
  freeroute provider-list     List custom providers
  freeroute provider-remove <id>  Remove a custom provider`);
  process.exitCode = 1;
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
