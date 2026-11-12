import assert from 'node:assert/strict';
import { test } from 'node:test';

const mem = new Map();
globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { SaveStore } = await import('../js/save.js');
const { REWARD_LADDER } = await import('../js/dailyReward.js');

function store() {
  const s = new SaveStore(`dr-${Math.random()}`);
  s.load();
  s.createProfile('T');
  return s;
}

test('first login pays day one, once per day', () => {
  const s = store();
  const before = s.wallet;
  assert.equal(s.claimLoginReward('2026-11-12').paid, REWARD_LADDER[0]);
  assert.equal(s.claimLoginReward('2026-11-12').paid, 0);
  assert.equal(s.wallet, before + REWARD_LADDER[0]);
});

test('consecutive days climb the ladder and wrap after a week', () => {
  const s = store();
  const days = Array.from({ length: 8 }, (_, i) => `2026-11-${String(10 + i).padStart(2, '0')}`);
  const paid = days.map((d) => s.claimLoginReward(d).paid);
  assert.deepEqual(paid, [...REWARD_LADDER, REWARD_LADDER[0]]);
  assert.equal(s.data.login.streak, 8);
});

test('missing a day restarts the streak', () => {
  const s = store();
  s.claimLoginReward('2026-11-01');
  s.claimLoginReward('2026-11-02');
  assert.equal(s.claimLoginReward('2026-11-04').streak, 1);
  assert.equal(s.data.login.best, 2);
});
