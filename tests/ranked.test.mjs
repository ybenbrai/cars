import assert from 'node:assert/strict';
import { test } from 'node:test';

import { rateRace, divisionFor, seasonReset, START_RATING } from '../server/ranked.mjs';

test('the winner gains, the last driver loses, ratings stay balanced', () => {
  const after = rateRace([1000, 1000, 1000, 1000]);
  assert.ok(after[0] > 1000 && after[3] < 1000);
  assert.ok(after[0] > after[1] && after[1] > after[2] && after[2] > after[3]);
  const sum = after.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 4000) <= 2);
});

test('beating a stronger driver pays more than beating a weaker one', () => {
  const [upset] = rateRace([1000, 1400]);
  const [expected] = rateRace([1400, 1000]);
  assert.ok(upset - 1000 > expected - 1400);
});

test('divisions and season reset', () => {
  assert.equal(divisionFor(START_RATING).id, 'bronze');
  assert.equal(divisionFor(1260).id, 'gold');
  assert.equal(divisionFor(2000).id, 'champion');
  assert.equal(seasonReset(1600), 1300);
});
