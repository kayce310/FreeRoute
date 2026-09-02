import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createOpenRouterRuntime } from './app.js';
import { importNineRouterApiKey } from './importers/9router.js';
import { SqliteCredentialStore } from './storage/sqlite-credential-store.js';

const [command, ...args] = process.argv.slice(2);

if (command === 'import-9router') await importFromNineRouter(args);
else if (command === 'serve') await serve();
else printUsage();

async function importFromNineRouter(args: string[]): Promise<void> {
  const sourceDatabasePath = args[0];
  if (!sourceDatabasePath) throw new Error('usage: import-9router <9router-database-path> [provider-id]');
  const providerId = args[1] ?? 'openrouter';
  const databasePath = await localDatabasePath();
  const credentials = new SqliteCredentialStore(databasePath, requiredEnv('FREEROUTE_MASTER_SECRET'));
  try {
    const result = await importNineRouterApiKey({ sourceDatabasePath: resolve(sourceDatabasePath), providerId, credentials });
    console.log(`Imported ${result.providerId} connection ${result.sourceConnectionId} as credential ${result.credentialId}.`);
  } finally {
    credentials.close();
  }
}

async function serve(): Promise<void> {
  const runtime = createOpenRouterRuntime({
    databasePath: await localDatabasePath(),
    masterSecret: requiredEnv('FREEROUTE_MASTER_SECRET'),
    apiToken: requiredEnv('FREEROUTE_API_TOKEN'),
    baseUrl: process.env.OPENROUTER_BASE_URL,
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
      const result = await runtime.refreshOpenRouter();
      if (result.status === 'updated') console.log(`OpenRouter catalog refreshed (${result.modelCount} models).`);
      else console.error(`OpenRouter catalog refresh failed: ${result.error}`);
    } finally {
      refreshing = false;
    }
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

function printUsage(): void {
  console.log('Usage: freeroute <serve|import-9router>');
  process.exitCode = 1;
}
