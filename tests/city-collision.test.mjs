import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// CityWorld imports Three.js, which is only available in the browser build.
// Guard the collision hook against reintroducing a Vector3-only `.set()` call:
// Car.wallNormal is a plain `{ x, z }` object shared with the track collision.
test('city building collisions write wall normals in the Car format', () => {
  const source = readFileSync(new URL('../js/cityWorld.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /wallNormal\.set\(/);
  assert.match(source, /wallNormal\.x = nx/);
  assert.match(source, /wallNormal\.z = nz/);
});
