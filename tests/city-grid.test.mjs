import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BOULEVARD_WIDTH,
  CITY_EXTENT,
  CITY_GRID,
  MINOR_WIDTH,
  SIDEWALK_WIDTH,
  isBoulevardLine,
  nearestRoad,
  nextJunction,
  roadWidthAt,
  sidewalkCenters,
  signalGroup,
  turnDirection,
} from '../js/data/cityGrid.js';

test('the downtown grid mixes narrow streets with wider boulevards', () => {
  assert.equal(CITY_GRID.vertical.length, CITY_GRID.horizontal.length);
  assert.ok(CITY_GRID.streets.length > 40, 'grid should be denser than a handful of roads');
  for (const s of CITY_GRID.streets) {
    assert.ok(Math.abs(s.pos) <= CITY_EXTENT);
    assert.equal(s.width, s.boulevard ? BOULEVARD_WIDTH : MINOR_WIDTH);
  }
  assert.equal(CITY_GRID.vertical.filter((s) => s.boulevard).length, 9);
});

test('boulevard lines are recognised by world position', () => {
  assert.equal(isBoulevardLine(0), true);
  assert.equal(isBoulevardLine(288), true);
  assert.equal(isBoulevardLine(-576), true);
  assert.equal(isBoulevardLine(96), false);
});

test('nearest road reports the surface a car is actually on', () => {
  const boulevard = nearestRoad(0, 200, CITY_GRID);
  assert.equal(boulevard.axis, 0);
  assert.equal(boulevard.edge, 0);
  assert.equal(boulevard.halfWidth, BOULEVARD_WIDTH / 2);

  const minor = nearestRoad(96, 200, CITY_GRID);
  assert.equal(minor.axis, 0);
  assert.equal(minor.edge, 0);
  assert.equal(minor.halfWidth, MINOR_WIDTH / 2);
});

test('sidewalks sit flush with both sides of the road', () => {
  for (const street of CITY_GRID.streets) {
    const [left, right] = sidewalkCenters(street);
    assert.ok(left < street.pos && right > street.pos);
    assert.equal(right - left, street.width + SIDEWALK_WIDTH);
  }
});

test('crossing junctions know their road width and next stop', () => {
  assert.equal(roadWidthAt(0), BOULEVARD_WIDTH);
  assert.equal(roadWidthAt(288), BOULEVARD_WIDTH);
  assert.equal(roadWidthAt(-288), BOULEVARD_WIDTH);
  assert.equal(roadWidthAt(96), MINOR_WIDTH);
  assert.equal(nextJunction(20, 1), 96);
  assert.equal(nextJunction(20, -1), 0);
  assert.equal(nextJunction(-110, -1), -192);
});

test('perpendicular signal groups alternate at a junction', () => {
  assert.equal(signalGroup(0, 0), 0);
  assert.equal(signalGroup(1, 0), 1);
  assert.equal(signalGroup(0, 96), 1);
  assert.equal(signalGroup(1, 96), 0);
  assert.equal(signalGroup(0, -96), 1);
});

test('turn direction follows the car heading, not the world axis', () => {
  assert.equal(turnDirection(0, 1, 1, 1), 1);
  assert.equal(turnDirection(0, 1, 1, -1), -1);
  assert.equal(turnDirection(1, 1, 0, 1), -1);
  assert.equal(turnDirection(1, 1, 0, -1), 1);
});
