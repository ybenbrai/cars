import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONTACT_SHAKE_SCALE, IMPACT_SHAKE_SCALE, contactShake, impactShake,
} from '../js/cameraShake.js';

test('collision shake is at least half the old strength', () => {
  // Old values were 0.9 for walls/buildings and 0.55 for car-to-car contact.
  assert.ok(IMPACT_SHAKE_SCALE <= 0.9 / 2);
  assert.ok(CONTACT_SHAKE_SCALE <= 0.55 / 2);
  assert.equal(impactShake(1), IMPACT_SHAKE_SCALE);
  assert.equal(contactShake(1), CONTACT_SHAKE_SCALE);
});

test('shake scales with impact and ignores junk', () => {
  assert.equal(impactShake(0), 0);
  assert.equal(impactShake(-1), 0);
  assert.equal(impactShake(NaN), 0);
  assert.equal(contactShake(0), 0);
  assert.equal(contactShake(undefined), 0);
  assert.ok(impactShake(0.5) < impactShake(1));
  assert.ok(contactShake(0.5) < contactShake(1));
});
