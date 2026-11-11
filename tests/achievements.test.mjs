import assert from 'node:assert/strict';
import { test } from 'node:test';

// Minimal localStorage for Node, so saves can be reloaded.
const mem = new Map();
globalThis.localStorage ??= {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { SaveStore } = await import('../js/save.js');
import { ACHIEVEMENTS, earnedNow } from '../js/achievements.js';

function freshStore() {
  const store = new SaveStore(`ach-${Math.random()}`);
  store.load();
  store.createProfile('TESTER');
  return store;
}

test('achievement ids are unique and every one has a reward', () => {
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  assert.ok(ACHIEVEMENTS.every((a) => a.reward > 0 && a.name && a.desc));
});

test('a new driver has earned nothing', () => {
  assert.equal(earnedNow(freshStore().data).length, 0);
});

test('achievements pay once and context ones need the right race', () => {
  const store = freshStore();
  store.data.stats.races = 1;
  store.data.stats.wins = 1;
  const before = store.wallet;
  const first = store.awardAchievements({ mode: 'quick', position: 1, totalRacers: 4, conditions: { time: 'day', weather: 'clear' } });
  assert.deepEqual(first.map((a) => a.id).sort(), ['first-race', 'first-win']);
  assert.equal(store.wallet, before + 1500);
  assert.equal(store.awardAchievements({}).length, 0, 'never paid twice');

  const rain = store.awardAchievements({ mode: 'quick', position: 1, totalRacers: 8, conditions: { time: 'night', weather: 'rain' } });
  assert.deepEqual(rain.map((a) => a.id).sort(), ['full-grid', 'night-win', 'rain-win']);
  assert.equal(store.awardAchievements({ mode: 'time-trial', position: 1, conditions: { weather: 'rain' } }).length, 0);
});

test('earned achievements survive a reload and unknown ids are dropped', () => {
  const store = freshStore();
  store.data.achievements = ['first-race', 'not-a-thing'];
  store.save();
  const again = new SaveStore(store.accountId);
  again.load();
  assert.deepEqual(again.data.achievements, ['first-race']);
});
