import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CAREER_EVENTS } from '../js/data/career.js';
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

test('day is genuinely brighter than night on every circuit', () => {
  for (const circuit of CIRCUITS) {
    const day = paletteFor(circuit.palette, { time: 'day' });
    const night = paletteFor(circuit.palette, { time: 'night' });
    assert.ok(luminance(day.skyTop) > luminance(night.skyTop), circuit.id);
    assert.ok(day.sunIntensity > night.sunIntensity, circuit.id);
    assert.ok(day.hemiIntensity > night.hemiIntensity, circuit.id);
  }
});

test('the sun is hidden at night and stars only appear at night', () => {
  const base = CIRCUITS[0].palette;
  const day = paletteFor(base, { time: 'day' });
  const night = paletteFor(base, { time: 'night' });
  const wetDay = paletteFor(base, { time: 'day', weather: 'rain' });
  const wetNight = paletteFor(base, { time: 'night', weather: 'rain' });
  assert.equal(day.sunDisc, 1);
  assert.equal(day.stars, 0);
  assert.equal(night.sunDisc, 0);
  assert.equal(night.stars, 1);
  assert.ok(wetDay.sunDisc < day.sunDisc);
  assert.ok(wetNight.stars < night.stars);
});

test('night and rain career events declare their conditions', () => {
  const nightEvents = ['neon-nights', 'coral-twilight', 'dockyard-duel'];
  const rainEvents = ['redwood-rhythm', 'alpine-gauntlet', 'dockyard-duel'];
  for (const id of nightEvents) {
    const event = CAREER_EVENTS.find((e) => e.id === id);
    assert.ok(event, id);
    assert.equal(normalizeConditions(event.conditions).time, 'night', id);
  }
  for (const id of rainEvents) {
    const event = CAREER_EVENTS.find((e) => e.id === id);
    assert.ok(event, id);
    assert.equal(normalizeConditions(event.conditions).weather, 'rain', id);
  }
});
