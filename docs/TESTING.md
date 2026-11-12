# Testing

Sunset Drift uses two layers of testing: fast zero-dependency checks for logic
and infrastructure, and a manual browser matrix for rendering, input and feel.
The browser layer matters because no unit test can tell you whether a drift feels
right or whether a car clips a wall.

## Automated checks

```bash
npm run check     # syntax, JSON, local refs, import graph, CSS sanity
npm test          # server + car data unit tests
npm run build     # clean dist/ build and bundle size report
```

### What `npm run check` covers

- `node --check` on every `.js`/`.mjs` file in the project.
- JSON and web manifest parsing.
- Required runtime and documentation assets.
- Local `src`/`href` references in `index.html`.
- Relative ES module imports.
- CSS brace balance, viewport meta and HTML language attribute.

### What `npm test` covers

- Static server: HTML, JS, manifest and image MIME types, HEAD requests,
  unsupported methods, 404s, malformed percent-encoding and traversal attempts.
- Car catalogue: unique ids, complete data, stat ranges, physics ranges, default
  looks, cosmetic palettes and `normalizeLook()` repair/sanitization behavior.
- Handling math: coasting is always weaker than braking for every car and speed,
  brake fade and stopping distances match the designed curve, brake distance and
  entry speed are inverses, and steering only breaks traction after a sustained
  hold.
- AI planning: rivals keep the player's real brakes (no hidden multiplier) and
  plan to stop within the car's actual braking distance, with higher difficulty
  carrying more speed into the same corner.
- Ghost laps: fixed-rate sampling with in-between replay, heading wrap-around,
  and only a faster lap replacing the stored ghost per account and circuit.
- Practice rentals: the 1,000 / 2,000 / 4,000 / 8,000 CR price curve, per-session
  charging, insufficient funds, refunds and free unlocked circuits.

The test runner is Node's built-in `node:test`; there are no test dependencies.

### CI

`.github/workflows/ci.yml` runs the same three commands on every push and pull
request to `main`, using Node 20.

## Manual browser matrix

Run through the relevant rows before a release or a large pull request.

| Area | Desktop Chrome | Desktop Safari | Firefox | iOS Safari | Android Chrome |
| --- | --- | --- | --- | --- | --- |
| Profile → garage | ☐ | ☐ | ☐ | ☐ | ☐ |
| Car selection and stats | ☐ | ☐ | ☐ | ☐ | ☐ |
| Customization updates live | ☐ | ☐ | ☐ | ☐ | ☐ |
| Race start / countdown | ☐ | ☐ | ☐ | ☐ | ☐ |
| Driving and drifting | ☐ | ☐ | ☐ | ☐ | ☐ |
| Touch controls | — | — | — | ☐ | ☐ |
| Gamepad | ☐ | ☐ | ☐ | — | ☐ |
| Pause / resume / restart | ☐ | ☐ | ☐ | ☐ | ☐ |
| Practice rental confirmation, HUD badge and results receipt | ☐ | ☐ | ☐ | ☐ | ☐ |
| Three-lap finish / results | ☐ | ☐ | ☐ | ☐ | ☐ |
| Persistence after reload | ☐ | ☐ | ☐ | ☐ | ☐ |

## Core flow checklist

1. Clear site data, reload, and confirm the profile screen appears.
2. Submit a name. Confirm the garage opens with the Koto Mira.
3. Select every car. Confirm the turntable, stats, name and pros/cons change.
4. Change every cosmetic control. Confirm the preview updates immediately.
5. Reload. Confirm the name, car and look survived.
6. Start a race. Confirm the countdown, camera, HUD and engine audio start.
7. Accelerate, brake, reverse, steer and handbrake.
8. Drift for two seconds. Confirm smoke, skid marks, live score, combo and nitro
   gain.
9. Hit a wall. Confirm the car is pushed back inside and the impact sound and
   shake fire.
10. Drive off-road. Confirm reduced speed, grip loss, dust and the wrong-way
    warning when applicable.
11. Pause. Confirm the timer stops, resume works, restart resets the race and
    quit returns to the garage.
12. Complete three laps. Confirm lap increments, best-lap toast, finish camera,
    results data, race-again and garage buttons.
13. Reload after a race. Confirm the best lap appears in the garage header.
14. Resize the window and rotate a phone. Confirm the HUD and touch controls
    remain usable.

## Gameplay invariants

These are quick checks worth repeating after physics or track changes:

- Top speed should be reachable on the bottom straight (roughly 161 km/h for
  the Koto Mira, 234 km/h for the Braxton Serpent TR and 209 km/h for the
  Takeda Kaze WRS; nitro raises the cap).
- Handbrake + steering at speed should produce a visible slip angle and a drift
  state, but the car should recover when the handbrake is released.
- Nitro should not activate while off-road.
- Gate order must be `1 → 2 → … → 7 → 0`; gate `0` must increment the lap.
- Crossing the finish line must bank any active drift score before results.
- The car must never escape the wall corridor, even at full speed into a corner.
- The minimap must draw during the countdown and while racing.
- A best lap set in a race must survive a quit and a reload.

## Debug hook

The browser console exposes a small debug surface:

```js
__sunsetDrift.state;        // "profile" | "garage" | "countdown" | ...
__sunsetDrift.car;          // Car instance (physics + model)
__sunsetDrift.track;        // track API: gates, pads, samples, nearest()
__sunsetDrift.nextGate;     // active gate index
__sunsetDrift.raceTime;     // seconds since GO
__sunsetDrift.startRace();  // start with the saved profile
```

A headless smoke test can drive the gate sequence by teleporting the car to each
gate and waiting for `nextGate` to advance. This is useful for validating the
lap/finish/results path without driving a full race:

```js
for (let i = 1; i < 8; i++) {
  const gate = __sunsetDrift.track.gates[i];
  __sunsetDrift.car.pos.set(gate.point.x, 0, gate.point.z);
  // wait a few physics frames, then check __sunsetDrift.nextGate
}
```

## Performance checks

- Keep the frame rate at or near the display refresh rate on the target device.
- Watch for a growing `renderer.info.memory.geometries` after repeated
  garage/race cycles; it should plateau, not climb.
- Test at device pixel ratio 2 and at a small window size.
- Verify that pausing and returning does not fast-forward the simulation.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Blank page, import map error | Opening `index.html` via `file://`; use `npm start` |
| Three.js fails to load | CDN blocked or offline; check the Network tab |
| WebGL context creation fails | Hardware acceleration disabled or GPU blocklisted |
| No audio | Browser autoplay policy; click/press a key first, then unmute |
| Touch controls missing | Device reports a fine pointer; resize or test on real hardware |
| Corrupt profile | Clear site data; the loader normalizes but cannot recover a bad name |

Headless Chrome may log `GPU stall due to ReadPixels` warnings; these come from
software WebGL screenshot capture and are not game errors.

## Release checklist

- [ ] `npm run check`, `npm test` and `npm run build` pass.
- [ ] Manual matrix completed for the changed areas.
- [ ] `CHANGELOG.md` updated.
- [ ] Version bumped in `package.json` when appropriate.
- [ ] Screenshots refreshed if the UI changed.
- [ ] The Pages deployment succeeds and the live URL loads without console
      errors.
