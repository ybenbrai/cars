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
  revLimiterActive,
  wallAlign,
  wallResponse,
  driveAccel,
  launchAccel,
  powerConstant,
  topSpeedFor,
  TOP_SPEED_SCALE,
} from '../js/vehicleMath.js';

const HEAVY = new Set(['offroad', 'suv', 'muscle']);

function carBrake(car) {
  return 11.5 * car.physics.grip * (HEAVY.has(car.category) ? 0.86 : 1);
}

test('coasting is always weaker than braking, for every car and speed', () => {
  for (const car of CARS) {
    const maxSpeed = topSpeedFor(car);
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

test('a head-on wall hit recoils a little instead of stopping the car dead', () => {
  const incoming = 16; // m/s straight into the barrier, normal +x
  const result = wallResponse(incoming, 0, 1, 0);
  assert.equal(result.bounces, true);
  assert.ok(result.vx < -1.5, `expected a visible recoil, got ${result.vx}`);
  assert.ok(result.vx > -6, `recoil should not fire the car backwards, got ${result.vx}`);
  assert.equal(result.hit, 1);
});

test('an angled wall hit keeps most of the speed along the barrier', () => {
  // 30 m/s at 45°: half into the wall, half along it.
  const into = 30 * Math.SQRT1_2;
  const along = 30 * Math.SQRT1_2;
  const result = wallResponse(into, along, 1, 0);
  assert.ok(result.bounces);
  assert.ok(result.vz > along * 0.85, `tangential speed was scrubbed too hard: ${result.vz}`);
  const speed = Math.hypot(result.vx, result.vz);
  assert.ok(speed > 19, `angled hit should retain speed, got ${speed.toFixed(1)} m/s`);
});

test('a glancing wall hit keeps almost all of the road speed', () => {
  const result = wallResponse(0.5, 20, 1, 0);
  assert.ok(result.bounces);
  assert.ok(result.hit < 0.05);
  // Tangential speed down the wall is barely scrubbed.
  assert.ok(Math.abs(result.vz - 20) < 0.2, `glancing hit lost too much speed: ${result.vz}`);
});

test('a wall hit turns the nose towards the barrier direction of travel', () => {
  // Heading 30° into a wall whose tangent runs +z; the car should rotate a
  // little towards +z (heading 0), not the other way.
  const heading = 0.5;
  const vx = Math.sin(heading) * 20;
  const vz = Math.cos(heading) * 20;
  const turned = wallAlign(heading, vx, vz, 0, 1, 0.8);
  assert.ok(turned < heading, `expected a turn towards +z, got ${turned}`);
  assert.ok(heading - turned <= 0.04 + 1e-9, 'one step must be smooth, not a snap');
});

test('the wall alignment follows the direction the car is travelling', () => {
  // Tangent points +z, but the car is sliding backwards (-z). It must align
  // with the direction of travel, not flip the car around.
  const heading = Math.PI - 0.4;
  const vx = Math.sin(heading) * 20;
  const vz = Math.cos(heading) * 20;
  const turned = wallAlign(heading, vx, vz, 0, 1, 0.5);
  assert.ok(turned > heading, `expected a turn towards -z travel, got ${turned}`);
});

test('a car already moving away from the wall is left alone', () => {
  const result = wallResponse(-3, 5, 1, 0);
  assert.equal(result.bounces, false);
  assert.equal(result.vx, -3);
  assert.equal(result.vz, 5);
});

test('top gear at max rpm bounces off the limiter', () => {
  const base = { throttle: 1, offroad: false, gear: 6, rpm: 0.99, drifting: false };
  assert.equal(revLimiterActive(base), true);
  // Lifting off or leaving the track silences it.
  assert.equal(revLimiterActive({ ...base, throttle: 0 }), false);
  assert.equal(revLimiterActive({ ...base, offroad: true }), false);
  // Lower gears reaching the redline do not stutter at top speed.
  assert.equal(revLimiterActive({ ...base, gear: 5 }), false);
});

test('a drift can hit the limiter before top speed', () => {
  const drift = { throttle: 1, offroad: false, gear: 3, rpm: 0.9, drifting: true };
  assert.equal(revLimiterActive(drift), true);
  assert.equal(revLimiterActive({ ...drift, drifting: false }), false);
  assert.equal(revLimiterActive({ ...drift, rpm: 0.8 }), false);
});

function sprint(car, toKmh) {
  const max = topSpeedFor(car);
  const powerK = powerConstant(car);
  const launch = launchAccel(car);
  let v = 0;
  let t = 0;
  while (v < toKmh / 3.6 && t < 120) {
    v += driveAccel({ speed: v, maxSpeed: max, powerK, launch }) / 120;
    t += 1 / 120;
  }
  return t;
}

test('top speed follows each car\'s spec sheet', () => {
  for (const car of CARS) {
    const kmh = topSpeedFor(car) * 3.6;
    assert.ok(Math.abs(kmh - car.specs.topSpeed * TOP_SPEED_SCALE) < 0.01, car.id);
  }
  const fastest = Math.max(...CARS.map((c) => topSpeedFor(c)));
  const slowest = Math.min(...CARS.map((c) => topSpeedFor(c)));
  assert.ok(fastest / slowest > 1.7, 'top speeds should differ widely across the catalogue');
});

test('acceleration follows power-to-weight: hypercars out-sprint hatchbacks', () => {
  const starter = CARS.find((c) => c.starter);
  const hyper = CARS.filter((c) => c.category === 'hyper');
  for (const car of hyper) {
    assert.ok(sprint(car, 100) < sprint(starter, 100) * 0.65, `${car.id} 0-100`);
    assert.ok(sprint(car, 150) < sprint(starter, 150) * 0.5, `${car.id} 0-150`);
  }
});

test('drive force fades to nothing at top speed', () => {
  const car = CARS[0];
  const max = topSpeedFor(car);
  const a = driveAccel({ speed: max, maxSpeed: max, powerK: powerConstant(car), launch: launchAccel(car) });
  assert.equal(a, 0);
});
