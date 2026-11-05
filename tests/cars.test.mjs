import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CARS,
  FINISHES,
  PAINTS,
  RIM_COLORS,
  RIM_STYLES,
  SPOILERS,
  STRIPES,
  TINTS,
  UNDERGLOWS,
  defaultLook,
  getCar,
  normalizeLook,
} from '../js/data/cars.js';

const HEX = /^#[0-9a-f]{6}$/i;

test('car catalogue has four unique, complete cars', () => {
  assert.equal(CARS.length, 4);
  assert.equal(new Set(CARS.map((car) => car.id)).size, CARS.length);

  for (const car of CARS) {
    assert.ok(car.name.length > 0);
    assert.ok(car.klass.length > 0);
    assert.ok(car.tagline.length > 20);
    assert.match(car.paint, HEX);
    assert.equal(car.pros.length, 2);
    assert.equal(car.cons.length, 2);

    for (const stat of Object.values(car.stats)) {
      assert.ok(Number.isInteger(stat) && stat >= 1 && stat <= 10);
    }
    for (const value of Object.values(car.physics)) {
      assert.ok(Number.isFinite(value) && value > 0);
    }
  }
});

test('getCar falls back to the first car for unknown ids', () => {
  assert.equal(getCar('kaze').id, 'kaze');
  assert.equal(getCar('missing').id, CARS[0].id);
});

test('default looks are complete and valid', () => {
  for (const car of CARS) {
    const look = defaultLook(car);
    assert.equal(look.paint, car.paint);
    assert.ok(FINISHES.some((finish) => finish.id === look.finish));
    assert.ok(RIM_COLORS.some((rim) => rim.hex === look.rim));
    assert.ok(RIM_STYLES.some((style) => style.id === look.rimStyle));
    assert.ok(SPOILERS.some((spoiler) => spoiler.id === look.spoiler));
    assert.ok(STRIPES.some((stripe) => stripe.id === look.stripe));
    assert.ok(TINTS.some((tint) => tint.id === look.tint));
    assert.ok(UNDERGLOWS.some((glow) => glow.id === look.underglow));
  }
});

test('normalizeLook repairs invalid data and sanitizes the plate', () => {
  const look = normalizeLook(CARS[0], {
    paint: 'orange',
    rim: 'silver',
    finish: 'nope',
    rimStyle: 'nope',
    spoiler: 'nope',
    stripe: 'nope',
    tint: 'nope',
    underglow: 'nope',
    plate: 'ka!ze @ home',
  });

  assert.equal(look.paint, CARS[0].paint);
  assert.equal(look.rim, defaultLook(CARS[0]).rim);
  assert.equal(look.finish, defaultLook(CARS[0]).finish);
  assert.equal(look.rimStyle, defaultLook(CARS[0]).rimStyle);
  assert.equal(look.spoiler, defaultLook(CARS[0]).spoiler);
  assert.equal(look.stripe, defaultLook(CARS[0]).stripe);
  assert.equal(look.tint, defaultLook(CARS[0]).tint);
  assert.equal(look.underglow, defaultLook(CARS[0]).underglow);
  assert.equal(look.plate, 'KAZE  HOM');
});

test('normalizeLook keeps valid custom choices', () => {
  const look = normalizeLook(CARS[2], {
    paint: '#123456',
    rim: '#abcdef',
    finish: 'matte',
    rimStyle: 'deep',
    spoiler: 'big',
    stripe: 'side',
    tint: 'dark',
    underglow: 'pink',
    plate: 'drift-01',
  });

  assert.equal(look.paint, '#123456');
  assert.equal(look.rim, '#abcdef');
  assert.equal(look.finish, 'matte');
  assert.equal(look.rimStyle, 'deep');
  assert.equal(look.spoiler, 'big');
  assert.equal(look.stripe, 'side');
  assert.equal(look.tint, 'dark');
  assert.equal(look.underglow, 'pink');
  assert.equal(look.plate, 'DRIFT-01');
});

test('cosmetic palettes use validated hex colours', () => {
  for (const option of [...PAINTS, ...RIM_COLORS]) {
    assert.match(option.hex, HEX);
    assert.ok(option.name.length > 0);
  }
  for (const glow of UNDERGLOWS) {
    if (glow.hex) assert.match(glow.hex, HEX);
  }
});
