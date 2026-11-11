import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CAREER_EVENTS } from '../js/data/career.js';
import { POINTS, rivalPositions, seriesStandings } from '../js/championship.js';

const rookie = CAREER_EVENTS.filter((e) => e.series === 'rookie');

test('no points before any event is raced', () => {
  const t = seriesStandings('rookie', {});
  assert.equal(t.raced, 0);
  assert.ok(t.rows.every((r) => r.points === 0));
  assert.equal(t.trophy, null);
});

test('rivals never share a position with the player or each other', () => {
  for (const event of CAREER_EVENTS) {
    for (let p = 1; p <= event.opponents + 1; p++) {
      const pos = rivalPositions(event.series, event, p);
      assert.ok(!pos.includes(p), `${event.id} P${p}`);
      assert.equal(new Set(pos).size, pos.length);
      assert.ok(pos.every((x) => x >= 1 && x <= event.opponents + 1));
    }
  }
});

test('winning every event in a series earns the gold trophy and maximum points', () => {
  const best = Object.fromEntries(rookie.map((e) => [e.id, 1]));
  const t = seriesStandings('rookie', best, 'ME');
  assert.equal(t.rank, 1);
  assert.equal(t.trophy, 'gold');
  assert.equal(t.rows[0].points, POINTS[0] * rookie.length);
});

test('standings are stable between visits', () => {
  const best = { [rookie[0].id]: 3 };
  assert.deepEqual(seriesStandings('rookie', best), seriesStandings('rookie', best));
});
