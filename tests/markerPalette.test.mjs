import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MARKER_PALETTE_MODES,
  normalizeMarkerPaletteMode,
  resolveMarkerPalette,
} from '../js/markerPalette.js';

test('marker palette modes normalise unknown and junk values to default', () => {
  assert.deepEqual(MARKER_PALETTE_MODES, ['default', 'accessible']);
  assert.equal(normalizeMarkerPaletteMode('accessible'), 'accessible');
  assert.equal(normalizeMarkerPaletteMode('default'), 'default');
  assert.equal(normalizeMarkerPaletteMode('deuteranopia'), 'default');
  assert.equal(normalizeMarkerPaletteMode(undefined), 'default');
  assert.equal(normalizeMarkerPaletteMode(null), 'default');
  assert.equal(normalizeMarkerPaletteMode(7), 'default');
});

test('default mode keeps each circuit palette and the existing flash colour', () => {
  const base = { marker: 0x29c3d4, accent: 0x5ce1e6 };
  const p = resolveMarkerPalette('default', base);
  assert.equal(p.gate.idle, base.marker);
  assert.equal(p.gate.next, base.accent);
  assert.equal(p.gate.passed, 0x8dffb0);
  // With no circuit palette the fallback is the cyan used by the city theme.
  assert.equal(resolveMarkerPalette('default').gate.idle, 0x5ce1e6);
});

test('default minimap colours match the pre-setting hardcoded values', () => {
  const { minimap } = resolveMarkerPalette('default');
  assert.equal(minimap.nextRing, 'rgba(92,225,230,0.5)');
  assert.equal(minimap.next, '#5ce1e6');
  assert.equal(minimap.done, 'rgba(255,246,236,0.42)');
  assert.equal(minimap.player, '#ffd166');
  assert.equal(minimap.playerGlow, '#ff7a45');
});

test('accessible mode replaces red/green with distinct amber, blue and neutral', () => {
  const base = { marker: 0xd8262f, accent: 0xff3d4a }; // red-heavy circuit
  const p = resolveMarkerPalette('accessible', base);
  assert.notEqual(p.gate.idle, base.marker);
  assert.notEqual(p.gate.next, base.accent);
  assert.notEqual(p.gate.next, p.gate.passed);
  assert.notEqual(p.gate.idle, p.gate.next);
  // A red-blind player used to see "next" and "passed" as similar reds/greens;
  // now the three states are separated by warm/cool hue and brightness.
  assert.equal(p.gate.next, 0xffd23f);
  assert.equal(p.gate.passed, 0x4fc3f7);
  const def = resolveMarkerPalette('default', base);
  for (const key of Object.keys(def.minimap)) {
    assert.notEqual(p.minimap[key], def.minimap[key], `${key} changes in accessible mode`);
  }
});

test('accessible colours are valid hex values and the two palettes stay independent', () => {
  const p = resolveMarkerPalette('accessible');
  for (const value of [p.gate.idle, p.gate.next, p.gate.passed]) {
    assert.ok(Number.isInteger(value) && value >= 0 && value <= 0xffffff);
  }
  assert.match(p.minimap.next, /^#[0-9a-f]{6}$/);
  assert.match(p.minimap.player, /^#[0-9a-f]{6}$/);
  p.minimap.next = 'changed';
  assert.equal(resolveMarkerPalette('accessible').minimap.next, '#ffd23f');
});
