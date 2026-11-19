import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CIRCUITS, getCircuit } from '../js/data/circuits.js';
import { CARS } from '../js/data/cars.js';
import { expectedLap } from '../js/daily.js';
import { SaveStore } from '../js/save.js';

const raceCircuits = () => CIRCUITS.filter((c) => !c.practiceOnly && !c.reverseOf);
const reverseOf = (id) => CIRCUITS.find((c) => c.reverseOf === id);

function freshStore(tag) {
  const store = new SaveStore(`test-reverse-${tag}-${Math.random()}`);
  store.load();
  store.createProfile('REVERSE');
  store.data.stats.wins = 0;
  store.data.stats.races = 0;
  return store;
}

test('every race circuit has a reverse layout that keeps the same start', () => {
  const forward = raceCircuits();
  assert.ok(forward.length >= 10);
  for (const circuit of forward) {
    const reverse = reverseOf(circuit.id);
    assert.ok(reverse, `${circuit.id} has a reverse layout`);
    assert.equal(reverse.id, `${circuit.id}-reverse`);
    assert.equal(reverse.reverseOf, circuit.id);
    assert.equal(reverse.name, `${circuit.name} REVERSE`);
    assert.ok(reverse.features.includes('REVERSE'));
    assert.deepEqual(reverse.cp[0], circuit.cp[0]);
    assert.deepEqual(reverse.cp.slice(1), [...circuit.cp.slice(1)].reverse());
    assert.ok(Math.abs(reverse.length - circuit.length) < 0.01, `${circuit.id} keeps its length`);
    assert.equal(reverse.width, circuit.width);
    assert.equal(reverse.gates, circuit.gates);
    assert.equal(reverse.laps, circuit.laps);
    assert.equal(reverse.unlockRank, circuit.unlockRank);
    assert.equal(reverse.theme, circuit.theme);
    assert.deepEqual(reverse.palette, circuit.palette);
  }
});

test('forward circuits stay in order and the practice runway is not duplicated', () => {
  assert.equal(CIRCUITS[0].id, 'sunset-coast');
  assert.equal(getCircuit('unknown-layout').id, 'sunset-coast');
  for (const circuit of CIRCUITS) {
    if (!circuit.reverseOf) continue;
    const base = CIRCUITS.findIndex((c) => c.id === circuit.reverseOf);
    assert.ok(base >= 0 && base < CIRCUITS.indexOf(circuit));
  }
  assert.equal(CIRCUITS.filter((c) => c.id === 'runway-01').length, 1);
  assert.equal(reverseOf('runway-01'), undefined);
});

test('reverse nitro strips stay at the same physical positions', () => {
  for (const circuit of CIRCUITS.filter((c) => c.reverseOf)) {
    const base = getCircuit(circuit.reverseOf);
    const expected = base.pads.map((t) => (1 - t) % 1).sort((a, b) => a - b);
    assert.deepEqual(circuit.pads, expected, `${circuit.id} nitro rows`);
  }
});

test('reverse layouts keep separate lap, sector and total records', () => {
  const store = freshStore('records');
  assert.equal(store.bestLapFor('sunset-coast-reverse'), null);
  assert.deepEqual(store.bestSectorsFor('sunset-coast-reverse'), [null, null, null]);

  store.recordLap('sunset-coast', 42);
  store.recordSectors('sunset-coast', [12, 13, 14]);
  store.data.records['sunset-coast'].bestTotals = { 3: 126 };

  assert.equal(store.bestLapFor('sunset-coast'), 42);
  assert.equal(store.bestTotalFor('sunset-coast'), 126);
  assert.equal(store.bestLapFor('sunset-coast-reverse'), null);
  assert.equal(store.bestTotalFor('sunset-coast-reverse'), null);
  assert.deepEqual(store.bestSectorsFor('sunset-coast-reverse'), [null, null, null]);

  store.recordLap('sunset-coast-reverse', 45);
  store.recordSectors('sunset-coast-reverse', [15, 16, 17]);
  store.data.records['sunset-coast-reverse'].bestTotals = { 3: 135 };

  assert.equal(store.bestLapFor('sunset-coast-reverse'), 45);
  assert.equal(store.bestTotalFor('sunset-coast-reverse'), 135);
  assert.deepEqual(store.bestSectorsFor('sunset-coast'), [12, 13, 14]);
  assert.deepEqual(store.bestSectorsFor('sunset-coast-reverse'), [15, 16, 17]);

  const reloaded = freshStore('reload');
  reloaded.import(store.toJSON());
  assert.equal(reloaded.bestLapFor('sunset-coast-reverse'), 45);
  assert.deepEqual(reloaded.bestSectorsFor('sunset-coast'), [12, 13, 14]);
});

test('a reverse layout unlocks with its forward circuit', () => {
  const store = freshStore('unlock');
  assert.equal(store.circuitUnlocked('dust-basin'), false);
  assert.equal(store.circuitUnlocked('dust-basin-reverse'), false);
  assert.ok(store.practiceFee('dust-basin-reverse') > 0);

  // Career unlocks the forward id only; the reverse inherits it.
  store.unlockCircuit('dust-basin');
  assert.equal(store.circuitUnlocked('dust-basin-reverse'), true);
  assert.equal(store.practiceFee('dust-basin-reverse'), 0);

  const direct = freshStore('direct');
  direct.unlockCircuit('alpine-pass-reverse');
  assert.equal(direct.circuitUnlocked('alpine-pass'), false);
  assert.equal(direct.circuitUnlocked('alpine-pass-reverse'), true);
});

test('reverse layouts use the forward daily pace reference', () => {
  const reference = CARS.find((c) => c.id === 'falcon');
  for (const circuit of CIRCUITS.filter((c) => c.reverseOf)) {
    const base = getCircuit(circuit.reverseOf);
    assert.ok(Math.abs(expectedLap(reference, circuit) - expectedLap(reference, base)) < 1e-9);
  }
});
