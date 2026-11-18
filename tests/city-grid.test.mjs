import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BOULEVARD_WIDTH,
  CITY_EXTENT,
  CITY_GRID,
  MINOR_WIDTH,
  SIDEWALK_WIDTH,
  bridgeCrossings,
  cityLots,
  createRiver,
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

test('the river lies between street lines so no road is painted underwater', () => {
  const river = createRiver();
  const positions = CITY_GRID.horizontal.map((s) => s.pos);
  assert.ok(!positions.some((p) => p > river.min && p < river.max));
  const lower = positions.filter((p) => p <= river.min).pop();
  const upper = positions.find((p) => p >= river.max);
  assert.ok(upper - lower > river.halfWidth * 2);
  assert.ok(river.pos > lower && river.pos < upper);
});

test('every north-south street gets a bridge over the river', () => {
  const river = createRiver();
  const crossings = bridgeCrossings();
  const streets = CITY_GRID.vertical.filter((s) => Math.abs(s.pos) <= CITY_EXTENT);
  assert.equal(crossings.length, streets.length);
  for (const street of streets) {
    const bridge = crossings.find((b) => b.pos === street.pos);
    assert.ok(bridge, `missing bridge at ${street.pos}`);
    assert.equal(bridge.width, street.width);
    assert.ok(bridge.halfLength > river.halfWidth, 'bridge spans the full canal');
  }
});

test('city lots densely fill the blocks without covering streets or the canal', () => {
  const river = createRiver();
  const lots = cityLots();
  const buildings = lots.filter((l) => !l.park);
  assert.ok(lots.length > 400, `expected a dense city, got ${lots.length} lots`);
  assert.ok(lots.some((l) => l.park), 'some blocks are parks');
  assert.ok(buildings.some((l) => l.kind === 'tower' && l.h > 60), 'towers rise above the skyline');
  assert.ok(buildings.some((l) => l.kind === 'mid' && l.h > 12), 'mid-rise blocks fill the streets');
  assert.ok(buildings.some((l) => l.kind === 'low' && l.h < 15), 'low-rise blocks add variety');

  for (const lot of lots) {
    assert.ok(lot.x - lot.w / 2 > -CITY_EXTENT);
    assert.ok(lot.x + lot.w / 2 < CITY_EXTENT);
    assert.ok(lot.z - lot.d / 2 > -CITY_EXTENT);
    assert.ok(lot.z + lot.d / 2 < CITY_EXTENT);
    assert.ok(lot.z + lot.d / 2 < river.min || lot.z - lot.d / 2 > river.max,
      'no parcel sits in the canal');

    const near = nearestRoad(lot.x, lot.z);
    const horizontal = CITY_GRID.horizontal.find((s) => Math.abs(lot.z - s.pos) <= Math.abs(near.z - s.pos));
    const vertical = CITY_GRID.vertical.find((s) => Math.abs(lot.x - s.pos) <= Math.abs(near.x - s.pos));
    assert.ok(Math.abs(lot.z - horizontal.pos) > horizontal.width / 2 + SIDEWALK_WIDTH,
      'lot rear/front clears the sidewalk');
    assert.ok(Math.abs(lot.x - vertical.pos) > vertical.width / 2 + SIDEWALK_WIDTH,
      'lot sides clear the sidewalk');
  }
});

test('turn direction follows the car heading, not the world axis', () => {
  assert.equal(turnDirection(0, 1, 1, 1), 1);
  assert.equal(turnDirection(0, 1, 1, -1), -1);
  assert.equal(turnDirection(1, 1, 0, 1), -1);
  assert.equal(turnDirection(1, 1, 0, -1), 1);
});
