import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SaveStore } from '../js/save.js';
import { CARS, STARTING_MONEY } from '../js/data/cars.js';
import { CAREER_EVENTS } from '../js/data/career.js';
import { computeRewards } from '../js/economy.js';
import { getCircuit } from '../js/data/circuits.js';

function freshStore() {
  const store = new SaveStore(`test-${Math.random()}`);
  store.load();
  store.createProfile('TESTER');
  return store;
}

const race = (overrides = {}) => ({
  mode: 'quick', circuitId: 'sunset-coast', position: 1, totalRacers: 4,
  totalTime: 180, bestLap: 58, laps: 3, driftScore: 0, reward: 1000,
  difficulty: 'normal', eventId: null, ...overrides,
});

test('new saves start with the starter car and starting money', () => {
  const store = freshStore();
  assert.equal(store.wallet, STARTING_MONEY);
  assert.deepEqual(store.data.ownedCars, [CARS.find((c) => c.starter).id]);
});

test('buying a car spends credits and equips it; overspending is refused', () => {
  const store = freshStore();
  const cheap = CARS.find((c) => !c.starter && c.unlockRank === 0 && c.price <= STARTING_MONEY);
  const result = store.buyCar(cheap.id);
  assert.ok(result.ok);
  assert.equal(store.wallet, STARTING_MONEY - cheap.price);
  assert.equal(store.selectedCarId, cheap.id);
  const hyper = CARS.find((c) => c.category === 'hyper');
  assert.equal(store.buyCar(hyper.id).ok, false);
});

test('practice sessions never count toward rank', () => {
  const store = freshStore();
  for (let i = 0; i < 10; i++) store.completeRace(race({ mode: 'practice', position: 1, reward: 0 }));
  assert.equal(store.data.stats.races, 0);
  assert.equal(store.data.stats.sessions, 10);
  assert.equal(store.rank, 0);
});

test('clearing a career event unlocks the next event circuit once', () => {
  const store = freshStore();
  const index = CAREER_EVENTS.findIndex((e) => e.id === 'dust-devil');
  const event = CAREER_EVENTS[index];
  const next = CAREER_EVENTS[index + 1];
  assert.ok(!store.data.circuits.includes(next.circuitId));

  const missed = store.completeRace(race({ mode: 'career', eventId: event.id, position: event.targetPosition + 1 }));
  assert.equal(missed.unlocks.length, 0);

  const cleared = store.completeRace(race({ mode: 'career', eventId: event.id, position: 1 }));
  assert.deepEqual(cleared.unlocks.map((u) => u.id), [next.circuitId]);
  assert.ok(store.circuitUnlocked(next.circuitId));

  const replay = store.completeRace(race({ mode: 'career', eventId: event.id, position: 1 }));
  assert.equal(replay.unlocks.length, 0);
});

test('time trials report no race position', () => {
  const result = computeRewards({ mode: 'time-trial', circuit: getCircuit('velocity-park'), laps: 3, position: 1 });
  assert.equal(result.position, null);
  assert.ok(result.total > 0);
});

test('practice never writes circuit records', () => {
  const store = freshStore();
  store.completeRace(race({ mode: 'practice', position: null, totalTime: 61, bestLap: 55, laps: 0, reward: 0 }));
  assert.equal(store.bestLapFor('sunset-coast'), null);
  assert.equal(store.data.records['sunset-coast'], undefined);
});

test('race totals are kept per lap count', () => {
  const store = freshStore();
  store.completeRace(race({ laps: 3, totalTime: 180 }));
  store.completeRace(race({ laps: 4, totalTime: 230 }));
  store.completeRace(race({ laps: 3, totalTime: 200 }));
  assert.equal(store.bestTotalFor('sunset-coast'), 180);
  assert.equal(store.bestTotalFor('sunset-coast', 4), 230);
  assert.equal(store.data.records['sunset-coast'].bestTotal, 180);
});

test('loading drops legacy mixed-distance totals and junk records', () => {
  const store = freshStore();
  store.import({
    ...store.toJSON(),
    records: {
      'sunset-coast': { bestLap: 55, bestTotal: 61, bestLaps: [55, 'x'] },
      'no-such-circuit': { bestLap: 1 },
    },
  });
  const rec = store.data.records['sunset-coast'];
  assert.equal(rec.bestLap, 55);
  assert.equal(rec.bestTotal, null);
  assert.deepEqual(rec.bestLaps, [55]);
  assert.equal(store.data.records['no-such-circuit'], undefined);
});
