import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CIRCUITS } from '../js/data/circuits.js';
import { normalizeConditions, paletteFor, RAIN_GRIP } from '../js/conditions.js';

const luminance = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
};

test('unknown conditions fall back to a clear day', () => {
  assert.deepEqual(normalizeConditions({ time: 'dusk', weather: 'snow' }), { time: 'day', weather: 'clear' });
});

test('night darkens every circuit and dims the sun', () => {
  for (const circuit of CIRCUITS) {
    const night = paletteFor(circuit.palette, { time: 'night' });
    assert.ok(luminance(night.skyTop) <= luminance(circuit.palette.skyTop), circuit.id);
    assert.ok(night.sunIntensity < 1);
  }
});

test('rain shortens the fog, darkens the road and costs grip', () => {
  const base = CIRCUITS[0].palette;
  const wet = paletteFor(base, { weather: 'rain' });
  assert.ok(wet.fogFar < base.fogFar);
  assert.ok(luminance(wet.road) < luminance(base.road));
  assert.ok(RAIN_GRIP < 1 && RAIN_GRIP > 0.7);
  assert.equal(paletteFor(base, {}).wet, undefined);
});
