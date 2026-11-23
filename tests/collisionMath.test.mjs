import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyContactImpulse, bodyCircles, contactImpulse, deepestContact, RUB_SPEED,
} from '../js/collisionMath.js';

function car(x, z, heading = 0, length = 4.8, width = 1.9) {
  return {
    def: { body: { length, width } },
    heading,
    pos: { x, z },
  };
}

test('body circles span the car length and stay inside its width', () => {
  const circles = bodyCircles(car(10, 20));
  assert.equal(circles.length, 3);
  assert.equal(circles[0].r, 0.95);
  // Heading 0 points along +z, so the row runs from tail to nose.
  assert.ok(Math.abs(circles[0].z - (20 - 1.45)) < 1e-9);
  assert.ok(Math.abs(circles[1].z - 20) < 1e-9);
  assert.ok(Math.abs(circles[2].z - (20 + 1.45)) < 1e-9);
  assert.ok(circles.every((c) => Math.abs(c.x - 10) < 1e-9));
});

test('the circle row rotates with the car heading', () => {
  const circles = bodyCircles(car(0, 0, Math.PI / 2));
  assert.ok(Math.abs(circles[2].x - 1.45) < 1e-9);
  assert.ok(Math.abs(circles[2].z) < 1e-9);
});

test('nose-to-tail contact is detected before the bodies overlap', () => {
  const a = bodyCircles(car(0, 0));
  const b = bodyCircles(car(0, 4.5));
  const contact = deepestContact(a, b);
  assert.ok(contact, 'cars 4.5 m apart should touch when each is 4.8 m long');
  assert.ok(contact.penetration > 0.25 && contact.penetration < 0.35);
  assert.ok(Math.abs(contact.nz - 1) < 1e-9);
});

test('cars with a real gap do not collide nose to tail', () => {
  const contact = deepestContact(bodyCircles(car(0, 0)), bodyCircles(car(0, 4.95)));
  assert.equal(contact, null);
});

test('side-by-side contact uses the real body width, not a centre bubble', () => {
  const touching = deepestContact(bodyCircles(car(0, 0)), bodyCircles(car(1.85, 0)));
  assert.ok(touching, '1.85 m centre spacing means the 1.9 m wide bodies overlap');
  assert.ok(Math.abs(touching.nx - 1) < 1e-9);

  const clear = deepestContact(bodyCircles(car(0, 0)), bodyCircles(car(2.05, 0)));
  assert.equal(clear, null, 'cars with 0.15 m of daylight must not be pushed apart');
});

test('the deepest circle pair wins when several circles overlap', () => {
  const a = bodyCircles(car(0, 0));
  const b = bodyCircles(car(0.3, 3.6));
  const contact = deepestContact(a, b);
  assert.ok(contact);
  // The front of A and the rear of B are closest, so the normal points +z.
  assert.ok(contact.nz > 0.9);
});

test('gentle contact is a rub, not a collision', () => {
  assert.equal(contactImpulse(0), 0);
  assert.equal(contactImpulse(-10), 0);
  assert.equal(contactImpulse(RUB_SPEED), 0);
  assert.equal(contactImpulse(RUB_SPEED - 0.1), 0);
  assert.ok(contactImpulse(8) > 0);
  assert.ok(contactImpulse(20) > contactImpulse(8));
  assert.equal(contactImpulse(1000), 1);
});

test('a sustained rub never drains a car of its speed', () => {
  const car = { impact: 0, vel: { x: 0, z: 24 } };
  for (let frame = 0; frame < 120; frame++) {
    applyContactImpulse(car, contactImpulse(1.5), 1, 0);
  }
  assert.deepEqual(car.vel, { x: 0, z: 24 });
  assert.equal(car.impact, 0);
});

test('a real hit is bounded and leaves speed along the car untouched', () => {
  const car = { impact: 0, vel: { x: 0, z: 24 } };
  applyContactImpulse(car, 1, 1, 0);
  assert.equal(car.vel.z, 24, 'a side hit must not brake the car');
  assert.ok(car.vel.x > 0 && car.vel.x <= 4.2 + 1e-9);
  assert.equal(car.impact, 1);

  const rear = { impact: 0, vel: { x: 0, z: -18 } };
  applyContactImpulse(rear, 0.5, 0, 1);
  assert.equal(rear.vel.x, 0);
  assert.ok(rear.vel.z > -18 && rear.vel.z <= -18 + 2.1 + 1e-9);
});
