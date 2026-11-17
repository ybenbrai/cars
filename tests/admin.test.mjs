import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Admin, summarize } from '../worker/admin.js';

const json = (status, payload) => ({ status, payload });

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  const clone = (value) => value === undefined ? undefined : structuredClone(value);
  return {
    map,
    async get(key) { return clone(map.get(key)); },
    async put(key, value) {
      if (typeof key === 'string') map.set(key, clone(value));
      else for (const [k, v] of Object.entries(key)) map.set(k, clone(v));
    },
    async delete(keys) {
      for (const key of Array.isArray(keys) ? keys : [keys]) map.delete(key);
    },
    async list({ prefix = '', limit = 512 } = {}) {
      const entries = [...map.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .slice(0, limit);
      return { size: entries.length, keys: entries.map(([key]) => key), [Symbol.iterator]: () => entries[Symbol.iterator]() };
    },
  };
}

function makeAdmin(storage) {
  return new Admin({
    storage,
    env: { ADMIN_TOKEN: 'test-admin-token-1234567890' },
    lobby: { players: new Map(), rooms: new Map() },
    rateLimited: () => false,
  });
}

const user = {
  id: 'u_abc123def456',
  username: 'Ada',
  email: 'ada@example.com',
  createdAt: '2026-01-01T00:00:00.000Z',
};

test('admin grant updates the wallet, earned-credit stats, summary and audit log', async () => {
  const id = user.id;
  const storage = memoryStorage({
    [`user:${id}`]: { ...user },
    [`save:${id}`]: {
      save: {
        profile: { name: 'Ada' },
        wallet: 1000,
        ownedCars: ['starter'],
        stats: { races: 2, creditsEarned: 500 },
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  });
  const admin = makeAdmin(storage);

  const res = await admin.userAction(user, 'grant', { amount: 250 }, json);
  assert.equal(res.status, 200);
  assert.deepEqual(res.payload, { ok: true, queued: false, wallet: 1250 });

  const stored = await storage.get(`save:${id}`);
  assert.equal(stored.save.wallet, 1250);
  assert.equal(stored.save.stats.creditsEarned, 750);
  assert.deepEqual(await storage.get(`summary:${id}`), summarize(stored.save, stored.updatedAt));
  assert.equal((await storage.get('audit'))[0].action, 'user.grant');
});

test('admin grant clamps negative balances at zero and records the removal', async () => {
  const id = user.id;
  const storage = memoryStorage({
    [`user:${id}`]: { ...user },
    [`save:${id}`]: { save: { wallet: 100, stats: {} }, updatedAt: 'old' },
  });
  const admin = makeAdmin(storage);

  const res = await admin.userAction(user, 'grant', { amount: -500 }, json);
  assert.equal(res.status, 200);
  assert.equal(res.payload.wallet, 0);
  assert.equal((await storage.get(`save:${id}`)).save.stats.creditsEarned, undefined);
  assert.equal((await storage.get('audit'))[0].amount, -500);
});

test('admin grant queues credits in the inbox for players without a cloud save', async () => {
  const id = user.id;
  const storage = memoryStorage({ [`user:${id}`]: { ...user } });
  const admin = makeAdmin(storage);

  const res = await admin.userAction(user, 'grant', { amount: 5000 }, json);
  assert.equal(res.status, 200);
  assert.deepEqual(res.payload, { ok: true, queued: true, amount: 5000 });

  const storedUser = await storage.get(`user:${id}`);
  assert.equal(storedUser.inbox.length, 1);
  assert.equal(storedUser.inbox[0].credits, 5000);
  assert.equal((await storage.get('audit'))[0].action, 'user.grant.inbox');
});

test('admin grant rejects invalid amounts and unsupported unsynced grants', async () => {
  const id = user.id;
  const storage = memoryStorage({
    [`user:${id}`]: { ...user },
    [`save:${id}`]: { save: { wallet: 0, stats: {} }, updatedAt: 'old' },
  });
  const admin = makeAdmin(storage);

  assert.equal((await admin.userAction(user, 'grant', { amount: 10_000_001 }, json)).status, 400);
  assert.equal((await admin.userAction(user, 'grant', { amount: 0 }, json)).status, 400);
  assert.equal((await admin.userAction(user, 'grant', { amount: 'abc' }, json)).status, 400);

  await storage.delete(`save:${id}`);
  assert.equal((await admin.userAction(user, 'grant', { amount: 100_001 }, json)).status, 409);
  assert.equal((await admin.userAction(user, 'grant', { amount: -100 }, json)).status, 409);
});
