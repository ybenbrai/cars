import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ENGINE_PROFILES,
  engineProfile,
  turboAmount,
  intakeAmount,
  squealAmount,
  wheelspinSound,
  tireChirpAmount,
  rivalGain,
  rivalPan,
  shiftPop,
  isValidWave,
} from '../js/audioProfiles.js';

const FULL_BUILD = {
  engine: 5, turbo: 5, intake: 5, gearbox: 5, weight: 5,
  suspension: 5, tyres: 5, brakes: 5, nitro: 5,
};

test('every category has a complete, valid engine and exhaust voice', () => {
  assert.ok(Object.keys(ENGINE_PROFILES).length >= 8);
  for (const [id, p] of Object.entries(ENGINE_PROFILES)) {
    for (const key of ['base', 'span', 'sub', 'bright', 'gain', 'burble', 'turbo', 'exhaustRatio']) {
      assert.ok(Number.isFinite(p[key]) && p[key] >= 0, `${id}.${key}`);
    }
    assert.ok(isValidWave(p.wave), `${id}.wave`);
    assert.ok(isValidWave(p.exhaustWave), `${id}.exhaustWave`);
  }
  // The original arcade identity survives: a hyper revs higher than a muscle
  // car, which in turn rumbles louder at idle.
  assert.ok(ENGINE_PROFILES.hyper.base > ENGINE_PROFILES.muscle.base);
  assert.ok(ENGINE_PROFILES.muscle.burble > ENGINE_PROFILES.hyper.burble);
});

test('engineProfile keeps the car identity but upgrades sharpen the note', () => {
  const stock = engineProfile('sports');
  const built = engineProfile('sports', FULL_BUILD);
  assert.equal(stock.base, built.base);
  assert.equal(stock.wave, built.wave);
  assert.equal(stock.exhaustWave, built.exhaustWave);
  assert.ok(built.bright > stock.bright);
  assert.ok(built.gain > stock.gain);
  assert.ok(built.turbo > stock.turbo);
  assert.ok(built.burble > stock.burble);
  // Grip/brake-only tuning must not change the engine note.
  const gripOnly = engineProfile('sports', { tyres: 5, brakes: 5 });
  assert.equal(gripOnly.turbo, stock.turbo);
  assert.equal(gripOnly.burble, stock.burble);
});

test('an unknown category falls back to the sports voice', () => {
  const fallback = engineProfile('deuteranopia');
  assert.equal(fallback.base, ENGINE_PROFILES.sports.base);
  assert.equal(fallback.turbo, engineProfile('sports').turbo);
});

test('turbo whistle needs a turbo and follows revs, load and nitro', () => {
  assert.equal(turboAmount({ rpm: 1, throttle: true, turbo: 0 }), 0);
  const low = turboAmount({ rpm: 0.1, throttle: true, turbo: 0.8 });
  const high = turboAmount({ rpm: 0.9, throttle: true, turbo: 0.8, speedN: 0.8 });
  assert.ok(high > low);
  assert.ok(high > turboAmount({ rpm: 0.9, throttle: false, turbo: 0.8, speedN: 0.8 }));
  assert.ok(turboAmount({ rpm: 0.9, throttle: true, boosting: true, turbo: 0.8, speedN: 0.8 }) > high);
  assert.ok(high <= 1);
});

test('intake roar responds to throttle and revs', () => {
  const coast = intakeAmount({ rpm: 0.2 });
  const pull = intakeAmount({ rpm: 0.2, throttle: true });
  assert.ok(pull > coast);
  assert.ok(intakeAmount({ rpm: 0.9, throttle: true }) > pull);
  for (const v of [coast, pull, intakeAmount({ rpm: 9, throttle: true, speedN: 9 })]) {
    assert.ok(v >= 0 && v <= 1);
  }
});

test('wheelspin scrub is loudest off the line and stronger in the wet', () => {
  assert.equal(wheelspinSound({ wheelspin: 0 }), 0);
  const start = wheelspinSound({ wheelspin: 0.8 });
  assert.ok(start > 0);
  assert.ok(wheelspinSound({ wheelspin: 0.8, speedN: 0.8 }) < start);
  assert.ok(wheelspinSound({ wheelspin: 0.8, wet: true }) > start);
  assert.ok(wheelspinSound({ wheelspin: 2, wet: true }) <= 1);
});

test('tyre squeal grows with slip, speed and handbrake', () => {
  assert.equal(squealAmount({ slip: 12, speedN: 0 }), 0);
  const mild = squealAmount({ slip: 3, speedN: 0.6 });
  const full = squealAmount({ slip: 14, speedN: 0.6 });
  assert.ok(full > mild);
  assert.ok(squealAmount({ slip: 3, speedN: 0.6, handbrake: true }) > mild);
  assert.ok(squealAmount({ slip: 40, speedN: 2 }) <= 1);
});

test('tyre chirp peaks as traction breaks and fades in a full slide', () => {
  assert.equal(tireChirpAmount({ slip: 2, speedN: 0 }), 0);
  const chirp = tireChirpAmount({ slip: 2.5, speedN: 0.8 });
  assert.ok(chirp > 0);
  assert.ok(tireChirpAmount({ slip: 12, speedN: 0.8 }) < chirp);
  assert.ok(chirp <= 1);
});

test('rival engines fade with distance and pan to the correct side', () => {
  assert.ok(rivalGain(4) > rivalGain(20));
  assert.equal(rivalGain(48), 0);
  assert.equal(rivalGain(80), 0);
  assert.equal(rivalGain(NaN), 0);
  assert.ok(rivalGain(0) <= 1);
  assert.ok(rivalPan(-30) === -1 && rivalPan(30) === 1);
  assert.equal(rivalPan(0), 0);
  assert.equal(rivalPan(NaN), 0);
});

test('upshifts pop louder than downshifts and grow with revs and boost', () => {
  assert.ok(shiftPop({ up: true, rpm: 0.5 }) > shiftPop({ up: false, rpm: 0.5 }));
  assert.ok(shiftPop({ up: true, rpm: 0.9 }) > shiftPop({ up: true, rpm: 0.1 }));
  assert.ok(shiftPop({ up: true, turbo: 1 }) > shiftPop({ up: true, turbo: 0 }));
  assert.ok(shiftPop({ up: true, rpm: 1, turbo: 1.5 }) <= 0.09);
});
