import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CloudSync } from '../js/cloudSync.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function fakeStore(data) {
  return {
    keyFor: 'save:user-u1',
    data: { profile: { name: 'A' }, ...data },
    onChange: null,
    imports: 0,
    toJSON() { return JSON.parse(JSON.stringify(this.data)); },
    import(raw) { this.imports += 1; this.data = { ...raw }; },
  };
}

/** A fake server holding one versioned save, with the real 409 rule. */
function fakeServer(initial = null, version = null) {
  const server = { save: initial, updatedAt: version, n: 0, puts: [], gate: null };
  const auth = {
    isAccount: true,
    async loadCloudSave() { return { ok: true, save: server.save, updatedAt: server.updatedAt }; },
    async pushCloudSave(save, base) {
      if (server.gate) await server.gate;
      server.puts.push(save);
      if ((server.updatedAt ?? null) !== (base ?? null)) return { ok: false, conflict: true };
      server.n += 1;
      server.save = save;
      server.updatedAt = `v${server.n}`;
      return { ok: true, updatedAt: server.updatedAt };
    },
  };
  return { server, auth };
}

test('a 409 always imports the cloud copy, even when another tab updated the shared base', async () => {
  const { server, auth } = fakeServer({ wallet: 100, profile: { name: 'A' } }, 'v0');
  server.n = 0;
  const storage = memoryStorage();

  const storeA = fakeStore({ wallet: 100 });
  const storeB = fakeStore({ wallet: 100 });
  const tabA = new CloudSync({ auth, getStore: () => storeA, storage });
  const tabB = new CloudSync({ auth, getStore: () => storeB, storage });
  for (const [tab, store] of [[tabA, storeA], [tabB, storeB]]) {
    tab.apply(store, await auth.loadCloudSave());
    tab.synced = true;
  }

  // Tab A wins a race and syncs: the shared base marker becomes v1.
  storeA.data.wallet = 900;
  await tabA.push();
  assert.equal(server.updatedAt, 'v1');

  // Tab B, still holding the old data, makes an unrelated change.
  storeB.data.wallet = 120;
  await tabB.push();

  assert.equal(server.save.wallet, 900, "tab A's progress must survive");
  assert.equal(storeB.data.wallet, 900, 'tab B adopts the cloud copy');
  assert.equal(tabB.version, 'v1');
});

test('flush waits for an in-flight push and the change queued behind it', async () => {
  const { server, auth } = fakeServer(null, null);
  const store = fakeStore({ wallet: 1 });
  const sync = new CloudSync({ auth, getStore: () => store, storage: memoryStorage(), delayMs: 10_000 });
  sync.synced = true;

  let release;
  server.gate = new Promise((r) => { release = r; });
  const first = sync.push();          // upload #1 is in flight
  store.data.wallet = 2;
  sync.schedule();                    // the next change is only debounced
  assert.ok(sync.pending);

  const flushed = sync.flush();       // logout
  release();
  server.gate = null;
  await flushed;
  await first;

  assert.equal(server.save.wallet, 2, 'the last change reached the server');
  assert.equal(sync.pending, false);
});

test('flush with a push in flight and nothing pending waits for that push', async () => {
  const { server, auth } = fakeServer(null, null);
  const store = fakeStore({ wallet: 7 });
  const sync = new CloudSync({ auth, getStore: () => store, storage: memoryStorage() });
  sync.synced = true;
  let release;
  server.gate = new Promise((r) => { release = r; });
  sync.push();
  let done = false;
  const flushed = sync.flush().then(() => { done = true; });
  await Promise.resolve();
  assert.equal(done, false);
  release();
  await flushed;
  assert.equal(server.save.wallet, 7);
  assert.equal(server.puts.length, 1, 'no redundant upload');
});

test('nothing is pushed before a successful cloud read', async () => {
  const { server, auth } = fakeServer(null, null);
  const store = fakeStore({ wallet: 3 });
  const sync = new CloudSync({ auth, getStore: () => store, storage: memoryStorage() });
  await sync.push();
  assert.equal(server.puts.length, 0);
});

test('a switched account drops the in-flight result', async () => {
  const { server, auth } = fakeServer(null, null);
  let store = fakeStore({ wallet: 3 });
  const storage = memoryStorage();
  const sync = new CloudSync({ auth, getStore: () => store, storage });
  sync.synced = true;
  let release;
  server.gate = new Promise((r) => { release = r; });
  const p = sync.push();
  const old = store;
  store = fakeStore({ wallet: 0 });
  release();
  await p;
  assert.equal(sync.version, null, 'the new store did not inherit the old version');
  assert.equal(storage.getItem(old.keyFor + ':cloud-base'), null);
});
