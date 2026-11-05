import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CIRCUITS } from '../js/data/circuits.js';

// A single control point that turns the track too sharply makes a kink the
// road ribbon cannot follow: its edges, kerbs and barriers fold across the
// corner (Sunset Coast had a 136° kink). Hairpins must be spread over several
// points.
test('no circuit has a kink sharper than 75° at one control point', () => {
  for (const circuit of CIRCUITS) {
    const cp = circuit.cp;
    for (let i = 0; i < cp.length; i++) {
      const prev = cp[(i - 1 + cp.length) % cp.length];
      const here = cp[i];
      const next = cp[(i + 1) % cp.length];
      const h1 = Math.atan2(here[1] - prev[1], here[0] - prev[0]);
      const h2 = Math.atan2(next[1] - here[1], next[0] - here[0]);
      const turn = Math.abs(((((h2 - h1) * 180) / Math.PI + 540) % 360) - 180);
      assert.ok(turn <= 75, `${circuit.id} control point ${i} [${here}] turns ${turn.toFixed(0)}°`);
    }
  }
});
