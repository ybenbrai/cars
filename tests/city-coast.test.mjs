import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// scenery.js needs Three.js, so guard the roam coast rules by source instead.
const source = readFileSync(new URL('../js/scenery.js', import.meta.url), 'utf8');
const coastComment = source.indexOf('// The street grid is a square');
const coast = source.slice(
  source.lastIndexOf('if (roam) {', coastComment),
  source.indexOf('if (!roam) {', coastComment),
);

test('roam gets a procedural coast instead of a void at the grid edge', () => {
  assert.ok(coast.length > 0, 'the roam coast block exists');
  assert.match(coast, /if \(roam\)/);
  assert.match(coast, /PlaneGeometry\(CITY_EXTENT \* 2 \+ 160/, 'land covers the square corners');
  assert.match(coast, /PlaneGeometry\(4800, 4800\)/, 'a large sea reaches past fog range');
  assert.match(coast, /InstancedMesh/);
  assert.match(coast, /ConeGeometry/);
});

test('the coast adds no colliders or race props to roam', () => {
  assert.doesNotMatch(coast, /addCollider/);
  assert.doesNotMatch(coast, /barrier|grandstand|startArch|nitro/i);
});

test('coast meshes are cheap and do not cast shadows', () => {
  assert.match(coast, /mountains\.castShadow = false/);
  assert.match(coast, /snow\.castShadow = false/);
  assert.match(coast, /MeshLambertMaterial/);
});
