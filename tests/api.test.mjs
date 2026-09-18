import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.ts';
function setup() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_entries.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/0002_optional_details.sql', import.meta.url), 'utf8'));
  const env = { DB: { prepare(query) { return { bind(...args) { const s = sql.prepare(query); return {
    async first() { return s.get(...args) || null; },
    async all() { return { results: s.all(...args) }; },
    async run() { const result = s.run(...args); return { meta: { changes: result.changes } }; }
  }; } }; } }, WRITES: { async limit() { return { success: true }; } }, ASSETS: { fetch() { return new Response('asset'); } } };
  return { sql, env, async call(path, body, extra = {}) {
    return worker.fetch(new Request('https://directory.example' + path, body === undefined ? extra : {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body)
    }), env);
  } };
}
const entry = { handle: 'test_person', length: 6, girth: 5, unit: 'in', passphrase: 'test secret 123', removalCode: 'a'.repeat(64), adult: true, own: true };
test('create, list, duplicate and server-authorized retraction', async () => {
  const { call, sql } = setup();
  const created = await call('/api/entries', entry);
  assert.equal(created.status, 201);
  const { removalCode } = await created.json();
  assert.match(removalCode, /^[a-f0-9]{64}$/);
  const list = await (await call('/api/entries')).json();
  assert.equal(list.entries.length, 1);
  assert.equal(list.entries[0].handle, entry.handle);
  assert.equal(JSON.stringify(list).includes('verifier'), false);
  assert.equal(JSON.stringify(list).includes('salt'), false);
  assert.equal((await call('/api/entries', { ...entry, handle: 'TEST_PERSON' })).status, 409);
  assert.equal((await call('/api/retract', { ...entry, passphrase: '0'.repeat(64) })).status, 403);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM entries').get().n, 1);
  assert.equal((await call('/api/retract', { ...entry, passphrase: removalCode })).status, 200);
  assert.equal((await (await call('/api/entries')).json()).entries.length, 0);
});
test('validation, cross-origin, method and rate limit boundaries', async () => {
  const { call, env } = setup();
  for (const override of [{ adult: false }, { own: false }, { length: '6' }, { girth: 100 }, { handle: '<script>' }, { unit: 'ft' }])
    assert.equal((await call('/api/entries', { ...entry, ...override })).status, 400);
  assert.equal((await call('/api/entries', entry, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/entries', undefined, { method: 'DELETE' })).status, 404);
  assert.equal((await call('/api/entries?offset=-1')).status, 400);
  assert.equal((await call('/api/entries', { ...entry, unit: 'cm', length: 24.1, girth: 17.8 })).status, 201);
  env.WRITES.limit = async () => ({ success: false });
  assert.equal((await call('/api/retract', entry)).status, 429);
});
test('paged results, search and secret separation', async () => {
  const { sql, call } = setup();
  const insert = sql.prepare('INSERT INTO entries (id, handle, length, girth, unit, createdAt, salt, verifier) VALUES (?, ?, 6, 5, ?, ?, ?, ?)');
  for (let i = 0; i < 102; i++) insert.run(String(i), `person${i}`, 'in', new Date(i * 1000).toISOString(), 'salt', 'private');
  const first = await (await call('/api/entries')).json();
  const second = await (await call('/api/entries?offset=100')).json();
  assert.equal(first.entries.length, 100); assert.equal(first.more, true);
  assert.equal(second.entries.length, 2); assert.equal(second.more, false);
  assert.equal(new Set([...first.entries, ...second.entries].map(r => r.id)).size, 102);
  assert.equal((await (await call('/api/entries?q=PERSON101')).json()).entries.length, 1);
});

test('user-selected maximums enforced in both units', async () => {
  const { call } = setup();
  for (const override of [{length: 9.6}, {girth: 7.1}, {unit: 'cm', length: 24.2}, {unit: 'cm', girth: 17.9}])
    assert.equal((await call('/api/entries', {...entry, ...override})).status, 400);
  assert.equal((await call('/api/entries', {...entry, length: 9.5, girth: 7})).status, 201);
});

test('optional details persist, missing values remain null, invalid input rejected', async () => {
  const { call } = setup();
  for (const override of [{circumcision: 'unknown'}, {circumcision: []}, {flaccidLength: ''}, {flaccidLength: 0}, {flaccidGirth: 7.1}, {unit: 'cm', flaccidLength: 24.2}])
    assert.equal((await call('/api/entries', {...entry, ...override})).status, 400);
  assert.equal((await call('/api/entries', {...entry, circumcision: 'partial', flaccidLength: 3.2})).status, 201);
  const row = (await (await call('/api/entries')).json()).entries[0];
  assert.equal(row.circumcision, 'partial'); assert.equal(row.flaccidLength, 3.2); assert.equal(row.flaccidGirth, null);
  assert.equal((await call('/api/entries', {...entry, handle: 'blank_details'})).status, 201);
  const blank = (await (await call('/api/entries?q=blank_details')).json()).entries[0];
  assert.equal(blank.circumcision, null); assert.equal(blank.flaccidLength, null); assert.equal(blank.flaccidGirth, null);
});
test('additive migration preserves existing entries and removal credentials', () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/0001_entries.sql', import.meta.url), 'utf8'));
  sql.prepare('INSERT INTO entries VALUES (?, ?, 6, 5, ?, ?, ?, ?)').run('old-id', 'legacy', 'in', '2026-09-18', 'old-salt', 'old-verifier');
  sql.exec(readFileSync(new URL('../migrations/0002_optional_details.sql', import.meta.url), 'utf8'));
  const row = sql.prepare('SELECT * FROM entries').get();
  assert.equal(row.handle, 'legacy'); assert.equal(row.verifier, 'old-verifier');
  assert.equal(row.circumcision, null); assert.equal(row.flaccidLength, null); assert.equal(row.flaccidGirth, null);
});
