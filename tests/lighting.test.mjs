import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HEADLIGHT, headlightIntensity } from '../js/lighting.js';

test('night headlights throw a bright, wide beam onto the road', () => {
  assert.ok(HEADLIGHT.intensity >= 200, 'the old 22 cd spots barely lit the tarmac');
  assert.ok(HEADLIGHT.distance >= 80);
  assert.ok(HEADLIGHT.angle >= 0.4 && HEADLIGHT.angle <= 0.7);
  assert.ok(HEADLIGHT.penumbra > 0 && HEADLIGHT.penumbra < 1);
  assert.ok(HEADLIGHT.decay > 0 && HEADLIGHT.decay <= 2);
  assert.ok(HEADLIGHT.aim >= 15);
});

test('headlights only shine at night', () => {
  assert.equal(headlightIntensity(true), HEADLIGHT.intensity);
  assert.equal(headlightIntensity(), HEADLIGHT.intensity);
  assert.equal(headlightIntensity(false), 0);
});
