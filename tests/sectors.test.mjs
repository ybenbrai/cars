import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SECTOR_COUNT, SectorTimer, cleanSectors, sectorBoundaries, sectorFor,
} from '../js/sectors.js';

test('sectors split every lap into three equal distance thirds', () => {
  assert.deepEqual(sectorBoundaries(900), [300, 600]);
  assert.equal(sectorFor(0, 900), 0);
  assert.equal(sectorFor(299.9, 900), 0);
  assert.equal(sectorFor(300, 900), 1);
  assert.equal(sectorFor(600, 900), 2);
  assert.equal(sectorFor(899.9, 900), 2);
  // Distances are modulo the lap, and the position just before the line is
  // still the last sector.
  assert.equal(sectorFor(-1, 900), 2);
  assert.equal(sectorFor(900, 900), 0);
  assert.deepEqual(sectorBoundaries(0), []);
  assert.equal(sectorFor(10, 0), 0);
});

test('stored splits are sanitized to a fixed three-cell list', () => {
  assert.deepEqual(cleanSectors(null), [null, null, null]);
  assert.deepEqual(cleanSectors([12.3, -4, NaN, 9, 'x']), [12.3, null, null]);
  assert.deepEqual(cleanSectors([1, 2, 3, 4]), [1, 2, 3]);
});

test('a lap records three splits and rotates them into last', () => {
  const t = new SectorTimer(900);
  assert.equal(t.started, false);
  t.start(0, 100);
  assert.equal(t.started, true);

  assert.equal(t.sector, 0);
  t.update(301, 12); // crosses 300
  assert.equal(t.sector, 1);
  assert.equal(t.current[0], 12);
  assert.equal(t.elapsed(15), 3);

  t.update(620, 25); // crosses 600
  assert.equal(t.sector, 2);
  assert.deepEqual(t.current.slice(0, 2), [12, 13]);

  // The flag is reported by the caller, not inferred from the wrap.
  t.finishLap(36);
  assert.deepEqual(t.current, [null, null, null]);
  assert.deepEqual(t.last, [12, 13, 11]);
  assert.equal(t.sector, 0);
  assert.equal(t.elapsed(40), 4);
});

test('crossing a boundary backwards does not close a second sector', () => {
  const t = new SectorTimer(900);
  t.start(0, 100);
  t.update(320, 10);
  assert.equal(t.sector, 1);
  t.update(100, 12); // reversed back past 300
  assert.equal(t.sector, 1);
  assert.equal(t.current[0], 10);
  t.update(320, 14); // forward again: the next boundary is 600, not 300
  assert.equal(t.sector, 1);
  assert.equal(t.current[1], null);
});

test('teleports are ignored instead of counting as sector crossings', () => {
  const t = new SectorTimer(900);
  t.start(0, 100);
  const jumped = t.update(700, 6); // +600 m in one step: a respawn, not driving
  assert.equal(jumped, false);
  assert.equal(t.sector, 0);
  assert.equal(t.current[0], null);
  // The next genuine crossing still works.
  t.update(290, 8);
  assert.equal(t.update(320, 12), true);
  assert.equal(t.current[0], 12);
});

test('best splits are kept per sector and survive a reset', () => {
  const t = new SectorTimer(900);
  t.start(0, 100);
  assert.equal(t.update(310, 10), true);
  assert.equal(t.isBest(0), true);

  t.finishLap(30); // sector 2 is closed at the flag: 20 s
  t.start(30, 100);
  assert.equal(t.update(310, 41), false); // 11 s is slower than 10 s
  assert.deepEqual(t.best, [10, 20, null]);
  assert.equal(t.isBest(0), false);

  assert.equal(t.update(610, 51), true); // 10 s beats 20 s
  t.finishLap(60); // 9 s for sector 3
  t.start(60, 100);
  assert.equal(t.update(310, 68), true); // 8 s beats the stored 10 s
  assert.deepEqual(t.best, [8, 10, 9]);
});

test('a stored personal best seeds the timer and lap one can beat it', () => {
  const t = new SectorTimer(900, [10, 20, 30]);
  t.start(0, 100);
  assert.equal(t.update(310, 9), true);
  assert.equal(t.update(620, 30), false); // 21 s does not beat 20 s
  t.finishLap(39); // 9 s beats the stored 30 s
  assert.deepEqual(t.best, [9, 20, 9]);
});
