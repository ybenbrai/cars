import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ReplayRecorder, replayPose, REPLAY_RATE } from '../js/replayData.js';

test('records every car at a fixed rate and replays in between', () => {
  const rec = new ReplayRecorder(2);
  const a = { pos: { x: 0, z: 0 }, heading: 0 };
  const b = { pos: { x: 5, z: 0 }, heading: 1 };
  for (let t = 0; t <= 4 + 1e-9; t += 1 / 120) {
    a.pos.z = 20 * t;
    b.pos.z = 10 * t;
    rec.sample(t, [a, b]);
  }
  assert.ok(Math.abs(rec.tracks[0].length / 3 - (4 * REPLAY_RATE + 1)) <= 1);
  const p = replayPose(rec, 0, 2);
  assert.ok(Math.abs(p.z - 40) < 1.5, `z ${p.z}`);
  assert.ok(Math.abs(p.speed - 20) < 0.5, `speed ${p.speed}`);
  assert.equal(replayPose(rec, 1, 1).x, 5);
  assert.ok(Math.abs(rec.duration - 4) < 0.1);
});

test('poses are clamped to the recording', () => {
  const rec = new ReplayRecorder(1);
  rec.sample(0, [{ pos: { x: 1, z: 2 }, heading: 0 }]);
  assert.equal(replayPose(rec, 0, 99).x, 1);
  assert.equal(replayPose(new ReplayRecorder(1), 0, 0), null);
});
