import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createAiDriver } from '../js/ai.js';
import { brakeDistance, maxEntrySpeed } from '../js/vehicleMath.js';

const MAX_SPEED = 56; // m/s, the base car top speed
const BRAKE_DECEL = 11.5; // m/s², a sports car at low speed
const TURN_RATE = 1.8; // rad/s at low speed

function makeCar() {
  return {
    maxSpeed: MAX_SPEED,
    turnRate: TURN_RATE,
    brakeDecel: BRAKE_DECEL,
    paceScale: 1,
    brakeDistance(from, to, scale = 1) {
      return brakeDistance({
        from, to, maxSpeed: MAX_SPEED, brakeDecel: this.brakeDecel, scale,
      });
    },
    maxEntrySpeed(target, distance, scale = 1) {
      return maxEntrySpeed({
        target, distance, maxSpeed: MAX_SPEED, brakeDecel: this.brakeDecel, scale,
      });
    },
  };
}

// A constant-radius corner starts at `cornerStart`; before it the track runs
// dead straight. `curvatureAt` compares headings 5 m either side of a point,
// so the first fully-inside-corner sample sits at `cornerStart + 5`.
function makeTrack(cornerStart, radius) {
  const heading = (d) => (d <= cornerStart ? 0 : (d - cornerStart) / radius);
  return {
    length: 100000,
    pads: [],
    sampleAt(d) {
      const h = heading(d);
      return {
        tangent: { x: Math.sin(h), z: Math.cos(h) },
        point: { x: 0, z: 0 },
        signed: 0,
      };
    },
  };
}

const difficulty = (id) => ({
  id, pace: 1, steer: 1, mistakes: 0,
});

test('AI cars keep the player\'s brakes instead of a hidden multiplier', () => {
  const car = makeCar();
  createAiDriver(car, makeTrack(115, 20), difficulty('expert'), 0, 'TEST');
  assert.equal(car.brakeDecel, BRAKE_DECEL);
});

test('the AI plans to brake inside the car\'s real stopping distance', () => {
  const radius = 20;
  const cornerStart = 115;
  const cornerDistance = cornerStart + 5 - 3; // first sample minus the 3 m buffer
  for (const id of ['normal', 'hard', 'expert']) {
    const car = makeCar();
    const driver = createAiDriver(car, makeTrack(cornerStart, radius), difficulty(id), 0, 'TEST');
    const cornerSpeed = driver.cornerSpeed(radius);
    const planned = driver.planSpeed(0, MAX_SPEED);
    const needed = brakeDistance({
      from: planned, to: cornerSpeed, maxSpeed: MAX_SPEED, brakeDecel: BRAKE_DECEL,
    });
    assert.ok(
      needed <= cornerDistance,
      `${id} plans ${planned.toFixed(1)} m/s, needing ${needed.toFixed(1)} m of real braking for a corner ${cornerDistance} m away`,
    );
  }
});

test('faster difficulty settings carry more speed into the same corner', () => {
  const radius = 20;
  const cornerStart = 115;
  const target = (id) => createAiDriver(makeCar(), makeTrack(cornerStart, radius), difficulty(id), 0, id)
    .planSpeed(0, MAX_SPEED);
  assert.ok(target('easy') < target('normal'));
  assert.ok(target('normal') < target('hard'));
  assert.ok(target('hard') < target('expert'));
});
