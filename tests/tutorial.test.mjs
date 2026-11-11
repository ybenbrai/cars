import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Tutorial, TUTORIAL_STEPS } from '../js/tutorial.js';

const base = { time: 1, speedKmh: 0, braking: false, drifting: false, boosting: false, boost: 40, cornerAhead: false };

function drive(t, seconds, state) {
  const events = [];
  for (let i = 0; i < seconds * 60; i++) {
    const e = t.update(1 / 60, { ...base, ...state });
    if (e) events.push(e);
  }
  return events;
}

test('the first tip shows at the start and clears once the driver gets going', () => {
  const t = new Tutorial(false);
  const [first] = drive(t, 0.5, {});
  assert.match(first.text, /accelerate/);
  assert.equal(first.step, 1);
  assert.deepEqual(drive(t, 2, { speedKmh: 60 }), [{ hide: true }]);
});

test('touch players get touch wording', () => {
  const [first] = drive(new Tutorial(true), 0.5, {});
  assert.match(first.text, /GAS/);
});

test('every tip eventually times out and the tutorial finishes', () => {
  const t = new Tutorial(false);
  drive(t, 2, { speedKmh: 60 });
  let shown = 1;
  for (let i = 0; i < 20 && !t.finished; i++) {
    const events = drive(t, 4, { speedKmh: 90, cornerAhead: i % 2 === 0, boost: 80 });
    shown += events.filter((e) => e.text).length;
  }
  assert.ok(t.finished);
  assert.equal(shown, TUTORIAL_STEPS);
});
