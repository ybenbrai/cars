import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GhostRecorder, GHOST_RATE, ghostPose, loadGhost, saveGhostIfFaster,
} from '../js/ghostLap.js';

// Minimal localStorage for Node.
const mem = new Map();
globalThis.localStorage ??= {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

function recordStraightLap(seconds, speed) {
  const rec = new GhostRecorder();
  rec.start();
  const car = { pos: { x: 0, z: 0 }, heading: 0 };
  for (let t = 0; t <= seconds + 1e-9; t += 1 / 120) {
    car.pos.z = speed * t;
    rec.sample(t, car);
  }
  return rec.finish(seconds, 'pulse', '#ff7a45');
}

test('the recorder samples at a fixed rate and replays positions in between', () => {
  const lap = recordStraightLap(10, 30);
  assert.equal(lap.samples.length / 3, 10 * GHOST_RATE + 1);
  const mid = ghostPose(lap, 4.025);
  assert.ok(Math.abs(mid.z - 30 * 4.025) < 0.05, `z ${mid.z}`);
  const end = ghostPose(lap, 99);
  assert.ok(Math.abs(end.z - 300) < 0.05);
});

test('heading interpolation takes the short way round', () => {
  const ghost = { rate: GHOST_RATE, time: 1, samples: [0, 0, 3.1, 0, 0, -3.1] };
  const pose = ghostPose(ghost, 0.5 / GHOST_RATE);
  assert.ok(Math.abs(Math.abs(pose.heading) - Math.PI) < 0.05, `heading ${pose.heading}`);
});

test('only a faster lap replaces the stored ghost', () => {
  const slow = recordStraightLap(12, 25);
  const fast = recordStraightLap(10, 30);
  assert.equal(saveGhostIfFaster('guest', 'test-circuit', fast), true);
  assert.equal(saveGhostIfFaster('guest', 'test-circuit', slow), false);
  assert.equal(loadGhost('guest', 'test-circuit').time, 10);
  assert.equal(loadGhost('other-account', 'test-circuit'), null);
});
