import assert from 'node:assert/strict';
import { test } from 'node:test';

import { QUALITY_LEVELS, QUALITY_MODES, QualityManager } from '../js/quality.js';
import { SaveStore } from '../js/save.js';

// QualityManager reads window dimensions and the coarse-pointer hint when it
// applies a preset. Node has no window, so provide the small surface it needs.
function setWindow({ coarse = false } = {}) {
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 800,
    matchMedia: () => ({ matches: coarse }),
  };
}
setWindow();

function makeQuality(overrides = {}) {
  const renderer = {
    pixelRatio: 1,
    shadowMap: { enabled: true },
    setPixelRatio(v) { this.pixelRatio = v; },
    setSize() {},
  };
  const composer = {
    pixelRatio: 1,
    setPixelRatio(v) { this.pixelRatio = v; },
    setSize() {},
  };
  const bloom = { enabled: true };
  const scene = { fog: { near: 10, far: 1000 }, traverse() {} };
  const sun = {
    shadow: {
      mapSize: { x: 2048, y: 2048, set(x, y) { this.x = x; this.y = y; } },
      map: null,
    },
  };
  const quality = new QualityManager({
    renderer, composer, bloom, scene, dpr: 2, ...overrides,
  });
  return { quality, renderer, composer, bloom, scene, sun };
}

test('MOBILE is appended so the AUTO ladder keeps its existing indexes', () => {
  assert.deepEqual(QUALITY_LEVELS.map((q) => q.id), ['low', 'medium', 'high', 'mobile']);
  assert.deepEqual(QUALITY_MODES, ['auto', 'high', 'medium', 'low', 'mobile']);
  assert.equal(QUALITY_LEVELS.findIndex((q) => q.id === 'low'), 0);
  assert.equal(QUALITY_LEVELS.findIndex((q) => q.id === 'medium'), 1);
  assert.equal(QUALITY_LEVELS.findIndex((q) => q.id === 'high'), 2);
  assert.equal(QUALITY_LEVELS.findIndex((q) => q.id === 'mobile'), 3);
  for (const q of QUALITY_LEVELS) {
    for (const key of ['id', 'label', 'pixelRatio', 'composerRatio', 'shadowMap', 'drawDistance', 'note']) {
      assert.ok(q[key] != null, `${q.id} has ${key}`);
    }
    assert.equal(typeof q.shadows, 'boolean');
    assert.equal(typeof q.bloom, 'boolean');
  }
});

test('the MOBILE preset is cheaper than LOW on every cost knob', () => {
  const low = QUALITY_LEVELS.find((q) => q.id === 'low');
  const mobile = QUALITY_LEVELS.find((q) => q.id === 'mobile');
  assert.equal(mobile.label, 'MOBILE');
  assert.ok(mobile.pixelRatio < low.pixelRatio);
  assert.ok(mobile.composerRatio < low.composerRatio);
  assert.ok(mobile.shadowMap < low.shadowMap);
  assert.ok(mobile.drawDistance < low.drawDistance);
  assert.equal(mobile.shadows, false);
  assert.equal(mobile.bloom, false);
});

test('selecting MOBILE applies its renderer and post settings', () => {
  const { quality, renderer, composer, bloom, scene, sun } = makeQuality();
  quality.setMode('mobile');
  assert.equal(quality.mode, 'mobile');
  assert.equal(quality.current.id, 'mobile');
  assert.equal(renderer.pixelRatio, 0.75);
  assert.equal(composer.pixelRatio, 0.75);
  assert.equal(bloom.enabled, false);
  assert.equal(renderer.shadowMap.enabled, false);

  quality.applyWorld(sun);
  assert.equal(scene.fog.far, 500);
  assert.equal(sun.shadow.mapSize.x, 256);
});

test('an unknown saved quality falls back to AUTO, but MOBILE is remembered', () => {
  const { quality } = makeQuality();
  quality.setMode('mobile');
  assert.equal(quality.current.id, 'mobile');

  quality.setMode('not-a-preset');
  assert.equal(quality.mode, 'auto');
  assert.equal(quality.current.id, 'high');

  // A saved 'mobile' survives the save layer unchanged; QualityManager, not
  // the save format, decides whether a value is a valid preset.
  const store = new SaveStore(`test-quality-${Math.random()}`);
  store.load();
  store.createProfile('QUALITY');
  assert.equal(store.data.settings.quality, 'auto');
  store.data.settings.quality = 'mobile';
  store.import(store.toJSON());
  assert.equal(store.data.settings.quality, 'mobile');
});

test('AUTO still starts at HIGH on desktop and steps down to LOW, never below', () => {
  const { quality } = makeQuality();
  assert.equal(quality.mode, 'auto');
  assert.equal(quality.autoLevel, 2);
  assert.equal(quality.current.id, 'high');

  // Clear the settle window, then feed slow frames to force each step.
  quality.sample(3);
  quality.sample(3);
  assert.equal(quality.autoLevel, 1);
  assert.equal(quality.current.id, 'medium');
  quality.sample(3);
  quality.sample(3);
  assert.equal(quality.autoLevel, 0);
  assert.equal(quality.current.id, 'low');
  quality.sample(3);
  quality.sample(3);
  assert.equal(quality.autoLevel, 0);
  assert.equal(quality.current.id, 'low');
});

test('coarse-pointer devices still start AUTO at MEDIUM', () => {
  setWindow({ coarse: true });
  try {
    const { quality } = makeQuality();
    assert.equal(quality.mode, 'auto');
    assert.equal(quality.autoLevel, 1);
    assert.equal(quality.current.id, 'medium');
  } finally {
    setWindow();
  }
});

test('AUTO sampling is inert in a fixed mode such as MOBILE', () => {
  const { quality } = makeQuality();
  quality.setMode('mobile');
  const before = quality.autoLevel;
  for (let i = 0; i < 10; i++) quality.sample(5);
  assert.equal(quality.autoLevel, before);
  assert.equal(quality.current.id, 'mobile');
});
