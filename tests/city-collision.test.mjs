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

// City collisions used to write raw m/s velocities into car.impact, which made
// a fast building hit shake the camera far harder than any circuit wall. Every
// impact/wallHit write must go through the shared 0–1 normaliser.
test('city collisions normalise impact strength instead of using raw velocity', () => {
  const source = readFileSync(new URL('../js/cityWorld.js', import.meta.url), 'utf8');
  assert.match(source, /import \{ impactFromSpeed \} from '\.\/vehicleMath\.js'/);
  assert.doesNotMatch(source, /car\.(impact|wallHit) = Math\.max\([^)]*Math\.abs\(vn\)/);
  const normalized = source.match(/car\.(impact|wallHit) = Math\.max\([^;]*impactFromSpeed\([^;]*\);/g) || [];
  assert.equal(normalized.length, 7, 'all seven city impact writes use impactFromSpeed');
});
