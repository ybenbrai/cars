import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { AuthService } from '../js/auth.js';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

function signedIn() {
  const auth = new AuthService();
  auth.user = { id: 'u_1', username: 'alice' };
  auth.mode = 'account';
  auth.available = true;
  return auth;
}

function respond(status, body) {
  globalThis.fetch = async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('loadCloudSave distinguishes "no save yet" from a failed request', async () => {
  const auth = signedIn();

  respond(200, { save: null, updatedAt: null });
  assert.deepEqual(await auth.loadCloudSave(), { ok: true, save: null, updatedAt: null });

  respond(200, { save: { wallet: 5 }, updatedAt: 'v1' });
  assert.deepEqual(await auth.loadCloudSave(), { ok: true, save: { wallet: 5 }, updatedAt: 'v1' });

  respond(500, { error: 'Server error. Try again.' });
  assert.deepEqual(await auth.loadCloudSave(), { ok: false });

  globalThis.fetch = async () => { throw new TypeError('network down'); };
  assert.deepEqual(await auth.loadCloudSave(), { ok: false });
});

test('loadCloudSave never reports success for guests', async () => {
  const auth = new AuthService();
  assert.deepEqual(await auth.loadCloudSave(), { ok: false });
});

test('pushCloudSave sends its base version and reports conflicts', async () => {
  const auth = signedIn();
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ ok: true, updatedAt: 'v2' }), {
      status: 200, headers: { 'content-type': 'application/json' },
    });
  };
  assert.deepEqual(await auth.pushCloudSave({ wallet: 1 }, 'v1'), { ok: true, updatedAt: 'v2' });
  assert.deepEqual(sent, { save: { wallet: 1 }, baseUpdatedAt: 'v1' });

  respond(409, { error: 'changed', updatedAt: 'v3' });
  assert.deepEqual(await auth.pushCloudSave({ wallet: 1 }, 'v1'), { ok: false, conflict: true });

  respond(500, { error: 'boom' });
  assert.deepEqual(await auth.pushCloudSave({ wallet: 1 }, 'v1'), { ok: false, conflict: false });
});
