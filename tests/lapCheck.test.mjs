import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CARS } from '../js/data/cars.js';
import { CIRCUITS } from '../js/data/circuits.js';
import { expectedLap } from '../js/daily.js';
import { minimumLap, plausibleLap } from '../js/lapCheck.js';

test('genuine laps in every car, even fully tuned and beating the autopilot, are allowed', () => {
  for (const circuit of CIRCUITS) {
    for (const car of CARS) {
      // 30% faster than autopilot pace with a fully tuned car (+11% speed).
      // Nobody averages more than ~85% of the fastest build's top speed over
      // a whole lap, so genuine laps are never quicker than that either.
      const quick = Math.max((expectedLap(car, circuit) / 1.11) * 0.7, circuit.length / (113 * 0.85));
      assert.ok(plausibleLap(circuit.id, quick), `${car.id} on ${circuit.id}: ${quick.toFixed(1)} < ${minimumLap(circuit.id).toFixed(1)}`);
    }
  }
});

test('impossible laps are rejected', () => {
  for (const circuit of CIRCUITS) {
    assert.equal(plausibleLap(circuit.id, minimumLap(circuit.id) * 0.8), false, circuit.id);
  }
  assert.equal(plausibleLap('sunset-coast', 2), false);
  assert.equal(plausibleLap('sunset-coast', NaN), false);
});
