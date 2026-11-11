import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dailyChallenge, tierFor, todayKey } from '../js/daily.js';
import { getCircuit } from '../js/data/circuits.js';

test('the same date always gives the same challenge', () => {
  assert.deepEqual(dailyChallenge('2026-11-11'), dailyChallenge('2026-11-11'));
});

test('challenges vary across days and never use practice-only circuits', () => {
  const seen = new Set();
  for (let d = 1; d <= 28; d++) {
    const c = dailyChallenge(`2026-12-${String(d).padStart(2, '0')}`);
    assert.ok(!getCircuit(c.circuitId).practiceOnly);
    seen.add(`${c.circuitId}/${c.carId}`);
  }
  assert.ok(seen.size > 10);
});

test('targets get harder from bronze to gold and tiers follow the best lap', () => {
  const c = dailyChallenge('2026-11-11');
  const [bronze, silver, gold] = c.targets;
  assert.ok(bronze.time > silver.time && silver.time > gold.time);
  assert.equal(tierFor(c, bronze.time + 1), -1);
  assert.equal(tierFor(c, silver.time), 1);
  assert.equal(tierFor(c, gold.time - 0.5), 2);
  assert.equal(tierFor(c, null), -1);
});

test('todayKey formats the local date', () => {
  assert.equal(todayKey(new Date(2026, 0, 5)), '2026-01-05');
});
