import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CARS } from '../js/data/cars.js';
import {
  BRAKE_FADE,
  DRIFT_MAX,
  assistedDriftTarget,
  brakeDistance,
  brakeDecelAt,
  coastDrag,
  driftCommit,
  maxEntrySpeed,
} from '../js/vehicleMath.js';

const HEAVY = new Set(['offroad', 'suv', 'muscle']);

function carBrake(car) {
  return 9.5 * car.physics.grip * (HEAVY.has(car.category) ? 0.86 : 1);
}

test('coasting is always weaker than braking, for every car and speed', () => {
  for (const car of CARS) {
    const maxSpeed = 56 * car.physics.speed;
    const brakeDecel = carBrake(car);
    // Include a little nitro overspeed above the car's natural top speed.
    for (let speed = 0; speed <= maxSpeed + 10; speed += 0.5) {
      const brake = brakeDecelAt(speed, maxSpeed, brakeDecel);
      const coast = coastDrag(speed);
      assert.ok(
        coast < brake,
        `${car.id} at ${speed.toFixed(1)} m/s: coast ${coast.toFixed(2)} >= brake ${brake.toFixed(2)}`,
      );
    }
  }
});

test('brake force fades with the square of speed', () => {
  const max = 56;
  const decel = 9.5;
  assert.equal(brakeDecelAt(0, max, decel), decel);
  assert.ok(brakeDecelAt(max * 0.5, max, decel) < decel);
  assert.ok(brakeDecelAt(max, max, decel) < brakeDecelAt(max * 0.5, max, decel));
  assert.equal(brakeDecelAt(max, max, decel), decel * (1 - BRAKE_FADE));
  assert.equal(brakeDecelAt(max * 2, max, decel), decel * (1 - BRAKE_FADE));
});

test('a sports car stops in about 43 m from 100 km/h and 163 m from 180', () => {
  const max = 56;
  const decel = 9.5;
  const from100 = brakeDistance({ from: 100 / 3.6, maxSpeed: max, brakeDecel: decel });
  const from180 = brakeDistance({ from: 180 / 3.6, maxSpeed: max, brakeDecel: decel });
  assert.ok(from100 > 42 && from100 < 44, `100 km/h: ${from100.toFixed(1)} m`);
  assert.ok(from180 > 160 && from180 < 166, `180 km/h: ${from180.toFixed(1)} m`);
});

test('brake distance and max entry speed are inverses', () => {
  const max = 56;
  const decel = 9.5;
  for (const target of [8, 15, 25]) {
    for (const distance of [20, 60, 140]) {
      const entry = maxEntrySpeed({ target, distance, maxSpeed: max, brakeDecel: decel });
      const back = brakeDistance({ from: entry, to: target, maxSpeed: max, brakeDecel: decel });
      assert.ok(Math.abs(back - distance) < 0.01, `${target} m/s over ${distance} m: got ${back}`);
    }
  }
});

test('steering alone needs a sustained hold before it becomes a drift', () => {
  assert.equal(driftCommit(0), 0);
  assert.equal(driftCommit(0.5), 0);
  assert.equal(driftCommit(0.9), 0);
  assert.ok(driftCommit(1.5) > 0);
  assert.equal(driftCommit(2.1), 1);
  assert.equal(driftCommit(5), 1);

  assert.equal(assistedDriftTarget(1, 0.5), 0, 'a quick flick stays gripped');
  assert.ok(assistedDriftTarget(1, 1.5) > 0);
  assert.equal(assistedDriftTarget(1, 2.5), DRIFT_MAX);
  assert.equal(assistedDriftTarget(0.1, 2.5), 0, 'straightening the wheel restores grip');
});

test('coast drag grows smoothly with speed', () => {
  assert.equal(coastDrag(0), 1.2);
  let previous = coastDrag(0);
  for (let speed = 1; speed <= 80; speed += 1) {
    const current = coastDrag(speed);
    assert.ok(current > previous);
    previous = current;
  }
});
