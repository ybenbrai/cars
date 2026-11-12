import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CARS,
  CATEGORIES,
  FINISHES,
  PAINTS,
  RIM_COLORS,
  RIM_STYLES,
  SPOILERS,
  STARTING_MONEY,
  STRIPES,
  TINTS,
  UNDERGLOWS,
  defaultLook,
  getCar,
  normalizeLook,
  rankForWins,
} from '../js/data/cars.js';

const HEX = /^#[0-9a-f]{6}$/i;

test('car catalogue has a full, unique and complete field', () => {
  assert.ok(CARS.length >= 18, `expected at least 18 cars, got ${CARS.length}`);
  assert.equal(new Set(CARS.map((car) => car.id)).size, CARS.length);

  for (const car of CARS) {
    assert.ok(car.name.length > 0);
    assert.ok(car.klass.length > 0);
    assert.ok(car.tagline.length > 20);
    assert.ok(car.description.length > 60, `${car.id} needs a real description`);
    assert.match(car.paint, HEX);
    assert.equal(car.pros.length, 2);
    assert.equal(car.cons.length, 2);
    assert.ok(Number.isFinite(car.price) && car.price >= 0);
    assert.ok(car.specs && car.specs.power > 0 && car.specs.weight > 0);
    assert.ok(car.body && car.body.length > 0 && car.body.style);

    for (const stat of Object.values(car.stats)) {
      assert.ok(Number.isInteger(stat) && stat >= 1 && stat <= 10);
    }
    for (const value of Object.values(car.physics)) {
      assert.ok(Number.isFinite(value) && value > 0);
    }
  }
});

test('catalogue covers every body category without recolour duplicates', () => {
  const usedCategories = new Set(CARS.map((car) => car.category));
  for (const category of CATEGORIES) {
    if (category.id === 'all') continue;
    assert.ok(usedCategories.has(category.id), `no car in category ${category.id}`);
  }
  const styles = new Set(CARS.map((car) => car.body.style));
  assert.ok(styles.size >= 7, `expected distinct body styles, got ${styles.size}`);
});

test('starting money buys at least one car beyond the starter', () => {
  const starter = CARS.find((car) => car.starter);
  assert.ok(starter);
  assert.equal(starter.price, 0);
  const affordable = CARS.filter((car) => !car.starter && car.unlockRank === 0 && car.price <= STARTING_MONEY);
  assert.ok(affordable.length >= 1, 'wallet must afford an upgrade from the start');
});

test('rank ladder is monotonic', () => {
  assert.equal(rankForWins(0, 0), 0);
  assert.ok(rankForWins(4, 0) >= 1);
  assert.ok(rankForWins(20, 0) >= 3);
  assert.equal(rankForWins(40, 0), 4);
});

test('every car carries real-world design cues for its lights and grille', () => {
  const headlights = new Set(['reflector', 'projector', 'slim', 'quad', 'laser']);
  const grilles = new Set(['mesh', 'slat', 'hex', 'kidney', 'horseshoe', 'round', 'split']);
  const tails = new Set(['clusters', 'c-shape', 'l-shape', 'strip', 'bar', 'tri-bar', 'rings', 'quad', 'y-shape']);
  const names = new Set();
  for (const car of CARS) {
    assert.ok(car.design, `${car.id} needs a design block`);
    assert.ok(headlights.has(car.design.headlight), `${car.id} headlight ${car.design.headlight}`);
    assert.ok(grilles.has(car.design.grille), `${car.id} grille ${car.design.grille}`);
    assert.ok(tails.has(car.design.tail), `${car.id} tail ${car.design.tail}`);
    assert.ok(typeof car.design.drl === 'string' && car.design.drl.length > 0, `${car.id} needs a DRL`);
    names.add(car.name);
  }
  // The roster is a set of real production cars, each named exactly once.
  assert.equal(names.size, CARS.length);
  assert.ok(CARS.some((car) => /koto mira/i.test(car.name)));
  assert.ok(CARS.some((car) => /valmont nocturne/i.test(car.name)));
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

test('no real car brand names appear in the catalogue', () => {
  const brands = /toyota|volkswagen|\bvw\b|honda|bmw|mercedes|\bamg\b|audi|subaru|\bford\b|porsche|range rover|land rover|dodge|mazda|mclaren|ferrari|lamborghini|bugatti|nissan|chevrolet|jeep/i;
  for (const car of CARS) {
    for (const text of [car.name, car.klass, car.tagline, car.description, ...(car.pros || []), ...(car.cons || [])]) {
      assert.ok(!brands.test(text || ''), `${car.id}: ${text}`);
    }
  }
});
