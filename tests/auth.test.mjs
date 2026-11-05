import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createStaticServer } from '../server.mjs';

let root;
let server;
let base;

before(async () => {
  // Isolated web root whose account data lives in the default <root>/.data.
  root = await mkdtemp(join(tmpdir(), 'sd-auth-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>t</title>');
  await mkdir(join(root, '.git'));
  await writeFile(join(root, '.git', 'config'), '[core]');
  server = createStaticServer({ root });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((ok) => server.close(ok));
  await rm(root, { recursive: true, force: true });
});

async function register(username) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password: 'correct-horse-1' }),
  });
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { res, cookie, body: await res.json() };
}

test('account data and dot-files are never served statically', async () => {
  const { res, body } = await register('alice');
  assert.equal(res.status, 201);
  for (const path of [
    '/.data/users.json',
    `/.data/saves/${body.user.id}.json`,
    '/.git/config',
    '/%2Edata/users.json',
  ]) {
    const leak = await fetch(base + path);
    assert.equal(leak.status, 403, path);
    assert.doesNotMatch(await leak.text(), /passwordHash/);
  }
});

test('a malformed unrelated cookie does not break the API', async () => {
  const res = await fetch(`${base}/api/auth/session`, { headers: { cookie: 'other=%zz' } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { user: null });
});

test('the session cookie still works next to a malformed cookie', async () => {
  const { cookie } = await register('bobby');
  const res = await fetch(`${base}/api/auth/session`, { headers: { cookie: `junk=%E0%A4%A; ${cookie}` } });
  assert.equal((await res.json()).user.username, 'bobby');
});

test('a corrupt cloud save is reported as an error, not as "no save"', async () => {
  const { cookie, body } = await register('carol');
  const empty = await fetch(`${base}/api/save`, { headers: { cookie } });
  assert.deepEqual(await empty.json(), { save: null, updatedAt: null });

  const put = await fetch(`${base}/api/save`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ save: { wallet: 123 } }),
  });
  assert.equal(put.status, 200);
  const ok = await fetch(`${base}/api/save`, { headers: { cookie } });
  assert.equal((await ok.json()).save.wallet, 123);

  await writeFile(join(root, '.data', 'saves', `${body.user.id}.json`), '{not json');
  const broken = await fetch(`${base}/api/save`, { headers: { cookie } });
  assert.equal(broken.status, 500);
});

test('stale writes are rejected with 409 when a base version is sent', async () => {
  const { cookie } = await register('dave1');
  const put = (save, extra = {}) => fetch(`${base}/api/save`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ save, ...extra }),
  });

  // First write against "no cloud save yet".
  const first = await put({ wallet: 1 }, { baseUpdatedAt: null });
  assert.equal(first.status, 200);
  const v1 = (await first.json()).updatedAt;
  assert.ok(v1);

  // Device A writes on top of v1.
  await new Promise((r) => setTimeout(r, 5));
  const second = await put({ wallet: 2 }, { baseUpdatedAt: v1 });
  assert.equal(second.status, 200);
  const v2 = (await second.json()).updatedAt;

  // Device B still thinks the cloud is at v1 (or empty): refused.
  for (const stale of [v1, null]) {
    const res = await put({ wallet: 99 }, { baseUpdatedAt: stale });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).updatedAt, v2);
  }
  const now = await (await fetch(`${base}/api/save`, { headers: { cookie } })).json();
  assert.deepEqual(now, { save: { wallet: 2 }, updatedAt: v2 });

  // Older clients that send no base version keep last-writer-wins.
  assert.equal((await put({ wallet: 3 })).status, 200);
});
