import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TurnSignals } from '../js/signals.js';

function run(signals, steer, seconds, dt = 1 / 60) {
  const events = [];
  for (let t = 0; t < seconds; t += dt) {
    const e = signals.update(dt, steer);
    if (e) events.push(e);
  }
  return events;
}

test('committing to a turn blinks that side exactly three times', () => {
  const s = new TurnSignals();
  const events = run(s, -0.8, 4);
  assert.deepEqual(events.map((e) => `${e.side}:${e.on}`), [
    'left:true', 'left:false', 'left:true', 'left:false', 'left:true', 'left:false',
  ]);
});

test('small corrections and quick flicks do not trigger the indicators', () => {
  const s = new TurnSignals();
  assert.equal(run(s, 0.3, 2).length, 0);
  assert.equal(run(s, 0.9, 0.05).length, 0);
});

test('the same side re-arms only after the wheel returns to centre', () => {
  const s = new TurnSignals();
  run(s, 0.8, 4);
  assert.equal(run(s, 0.8, 2).length, 0, 'still holding the same turn');
  run(s, 0, 0.2);
  assert.equal(run(s, 0.8, 4)[0].side, 'right');
});

test('switching to the other side starts a new sequence on that side', () => {
  const s = new TurnSignals();
  run(s, -0.8, 0.5);
  const events = run(s, 0.8, 0.3);
  assert.equal(events[0].side, 'right');
  assert.equal(events[0].on, true);
});
