import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SqliteCredentialStore } from '../src/storage/sqlite-credential-store.js';

const masterSecret = 'correct-horse-battery-staple';

test('encrypts credentials at rest and restores them after reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freeroute-credentials-'));
  const databaseFile = join(directory, 'state.sqlite');
  const secret = 'provider-secret-value';
  try {
    const first = new SqliteCredentialStore(databaseFile, masterSecret);
    await first.put('groq', 'personal', secret, new Date('2026-09-03T00:00:00.000Z'));
    assert.deepEqual((await first.list()).map(({ providerId, credentialId }) => [providerId, credentialId]), [['groq', 'personal']]);
    first.close();

    assert.equal((await readFile(databaseFile)).includes(Buffer.from(secret)), false);
    const second = new SqliteCredentialStore(databaseFile, masterSecret);
    assert.equal(await second.get('groq', 'personal'), secret);
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a different master secret cannot decrypt a stored credential', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freeroute-credentials-'));
  const databaseFile = join(directory, 'state.sqlite');
  try {
    const first = new SqliteCredentialStore(databaseFile, masterSecret);
    await first.put('gemini', 'personal', 'secret');
    first.close();

    const second = new SqliteCredentialStore(databaseFile, 'a-different-master-secret');
    await assert.rejects(second.get('gemini', 'personal'));
    second.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('deletes an existing credential and returns true, or false if not found', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freeroute-credentials-'));
  const databaseFile = join(directory, 'state.sqlite');
  try {
    const store = new SqliteCredentialStore(databaseFile, masterSecret);
    await store.put('openrouter', 'default', 'secret-key');
    assert.equal((await store.list()).length, 1);

    const deleted = await store.delete('openrouter', 'default');
    assert.equal(deleted, true);
    assert.equal(await store.get('openrouter', 'default'), undefined);
    assert.equal((await store.list()).length, 0);

    const notFound = await store.delete('openrouter', 'default');
    assert.equal(notFound, false);
    store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('persists credential lifecycle metadata and status updates', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'freeroute-credentials-'));
  const databaseFile = join(directory, 'state.sqlite');
  try {
    const store = new SqliteCredentialStore(databaseFile, masterSecret);
    await store.put('groq', 'secondary', 'secret', new Date(), { name: 'Backup', enabled: false, priority: 7 });
    let [metadata] = await store.list();
    assert.equal(metadata.name, 'Backup');
    assert.equal(metadata.enabled, false);
    assert.equal(metadata.priority, 7);
    assert.equal(metadata.testStatus, 'untested');

    const testedAt = new Date('2026-09-14T00:00:00.000Z');
    const changed = await store.updateStatus('groq', 'secondary', {
      testStatus: 'rate_limited', lastTestAt: testedAt, lastError: '429', cooldownUntil: new Date('2026-09-14T00:01:00.000Z'), enabled: true,
    });
    assert.equal(changed, true);
    [metadata] = await store.list();
    assert.equal(metadata.enabled, true);
    assert.equal(metadata.testStatus, 'rate_limited');
    assert.equal(metadata.lastError, '429');
    assert.equal(metadata.lastTestAt?.toISOString(), testedAt.toISOString());
    assert.equal(metadata.cooldownUntil?.toISOString(), '2026-09-14T00:01:00.000Z');
    store.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
