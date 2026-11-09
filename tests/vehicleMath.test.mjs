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
  wallResponse,
} from '../js/vehicleMath.js';

const HEAVY = new Set(['offroad', 'suv', 'muscle']);

function carBrake(car) {
  return 11.5 * car.physics.grip * (HEAVY.has(car.category) ? 0.86 : 1);
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

test('a sports car stops in about 35 m from 100 km/h and 121 m from 180', () => {
  const max = 56;
  const decel = 11.5;
  const from100 = brakeDistance({ from: 100 / 3.6, maxSpeed: max, brakeDecel: decel });
  const from180 = brakeDistance({ from: 180 / 3.6, maxSpeed: max, brakeDecel: decel });
  assert.ok(from100 > 34 && from100 < 36, `100 km/h: ${from100.toFixed(1)} m`);
  assert.ok(from180 > 119 && from180 < 124, `180 km/h: ${from180.toFixed(1)} m`);
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

test('a head-on wall hit recoils instead of stopping the car dead', () => {
  const incoming = 16; // m/s straight into the barrier, normal +x
  const result = wallResponse(incoming, 0, 1, 0);
  assert.equal(result.bounces, true);
  assert.ok(result.vx < -6, `expected a real recoil, got ${result.vx}`);
  assert.equal(result.hit, 1);
});

test('a glancing wall hit keeps almost all of the road speed', () => {
  const result = wallResponse(0.5, 20, 1, 0);
  assert.ok(result.bounces);
  assert.ok(result.hit < 0.05);
  // Tangential speed down the wall is barely scrubbed.
  assert.ok(Math.abs(result.vz - 20) < 0.2, `glancing hit lost too much speed: ${result.vz}`);
});

test('a car already moving away from the wall is left alone', () => {
  const result = wallResponse(-3, 5, 1, 0);
  assert.equal(result.bounces, false);
  assert.equal(result.vx, -3);
  assert.equal(result.vz, 5);
});
