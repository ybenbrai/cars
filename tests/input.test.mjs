import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_BINDINGS, DRIVE_ACTIONS, keyLabel, resolveBindings } from '../js/input.js';

test('every drive action has a default binding', () => {
  for (const a of DRIVE_ACTIONS) assert.ok(DEFAULT_BINDINGS[a.id]?.length, a.id);
});

test('a saved key replaces the primary and keeps the secondary', () => {
  const b = resolveBindings({ gas: 'KeyI', boost: 'KeyN' });
  assert.deepEqual(b.gas, ['KeyI', 'ArrowUp']);
  assert.deepEqual(b.boost, ['KeyN', 'ShiftRight']);
  assert.deepEqual(b.brake, DEFAULT_BINDINGS.brake);
});

test('junk saved values fall back to defaults', () => {
  assert.deepEqual(resolveBindings({ gas: 42 }), resolveBindings({}));
  assert.deepEqual(resolveBindings(null), resolveBindings({}));
});

test('key labels are readable', () => {
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('ArrowLeft'), '←');
  assert.equal(keyLabel('ShiftLeft'), 'L-SHIFT');
});
