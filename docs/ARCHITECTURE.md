# Architecture

Sunset Drift is a static, client-side Three.js game. There is no bundler, no
framework and no runtime dependency beyond Three.js and the UI fonts, both
loaded from CDNs. This document explains how the pieces fit together and where
to make changes.

## Design goals

- **Instant play.** Open a URL; no install, account or build step.
- **Readable source.** Small ES modules with a single responsibility each.
- **Procedural assets.** Track, cars, scenery, textures, particles and audio are
  generated at runtime, so the repository stays small.
- **Arcade feel first.** The handling model is deliberately simple, predictable
  and tuned for drifting rather than simulation accuracy.
- **Graceful persistence.** A profile survives reloads; corrupt or stale data is
  normalized instead of crashing the app.

## Runtime overview

```text
index.html
  └─ import map (three + three/addons)
  └─ js/main.js
       ├─ renderer / scene / camera / composer
       ├─ createEnvironment() + createTrack() + populateScenery()
       ├─ UI ─────── profile, garage, results, pause screens
       ├─ GarageScene ── second renderer for the turntable
       ├─ Input ───── keyboard, gamepad, touch
       ├─ AudioEngine ─ Web Audio synthesis
       ├─ HUD ─────── DOM + minimap canvas
       └─ race loop
            ├─ Car.update() at a fixed 120 Hz
            ├─ Effects.update()
            ├─ Track.update()
            ├─ updateCamera()
            └─ composer.render()
```

`main.js` owns all application state and wires the other modules together. The
gameplay modules do not reach into the DOM except where noted.

## Module map

| File | Responsibility |
| --- | --- |
| `js/main.js` | Boot, renderer, state machine, race rules, camera, scoring, persistence gluing, debug hook |
| `js/track.js` | Closed Catmull-Rom circuit, road/curb geometry, start arch, gates, boost pads, nearest-point query |
| `js/scenery.js` | Sky dome, sun, lighting, environment map, ground, mesas, palms, rocks, grandstands, props |
| `js/car.js` | Arcade vehicle physics, wall collisions, off-road handling, nitro, drift state |
| `js/carModel.js` | Procedural car mesh, materials, wheels, spoilers, stripes, plate, underglow, body tilt |
| `js/garageScene.js` | Independent WebGL renderer and turntable scene for the garage |
| `js/effects.js` | Skid marks, drift smoke, dust, sparks, nitro flames |
| `js/audio.js` | Procedural engine, tire, wind, impact and UI sounds through Web Audio |
| `js/input.js` | Keyboard, pointer/touch and gamepad normalization |
| `js/hud.js` | Race HUD DOM updates, lap formatting, minimap rendering |
| `js/ui.js` | Screen navigation, garage lists, customization controls, results and pause actions |
| `js/data/cars.js` | Car catalogue, cosmetic palettes, look defaults/normalization, storage keys |

## Application state machine

```text
boot
 ├─ profile ──(submit name)──► garage
 └─ garage (saved profile) ──► garage

garage ──(race)──► countdown ──(3s)──► racing
racing ──(pause)──► paused ──(resume)──► racing
racing ──(finish)──► finished ──(1.6s)──► results
paused ──(restart)──► countdown
paused / results ──(quit)──► garage
```

- `profile` and `boot` skip world rendering.
- `garage` renders only through `GarageScene`.
- `countdown` runs the race renderer but not physics.
- `racing` is the only state that advances physics, gates, scoring, effects and
  race audio.
- `finished` keeps rendering for a short orbit camera before the results modal.
- `paused` freezes the simulation and idles the engine sound.

The canvas is hidden while the profile or garage screens are active; this keeps
the expensive race renderer from competing with the turntable renderer.

## Frame loop and fixed timestep

```js
const FIXED = 1 / 120;
const dt = Math.min((now - last) / 1000, 0.25);

physicsAcc += dt;
let steps = 0;
while (physicsAcc >= FIXED && steps < 32) {
  raceCar.update(FIXED, input, track);
  physicsAcc -= FIXED;
  steps++;
}
if (steps === 32) physicsAcc = 0;
```

- Simulation runs at **120 Hz**, independent of display refresh rate.
- A frame may run up to **32** physics steps, covering ~267 ms of simulation.
- Frame delta is capped at **250 ms** to avoid a spiral of death after a tab
  switch or a long stall.
- Rendering, effects, track animation and camera use the variable frame delta.
- The simulation, drift logic and nitro advance on fixed steps. Race time and
  lap timing advance with the capped frame delta, keeping the clock smooth while
  collision and handling behavior stay stable on 60 Hz, 120 Hz and high-refresh
  displays.

## Vehicle model

The car is a 2D point mass with a heading. `Car.update()` is deterministic for a
given input sequence and timestep.

### Velocity decomposition

```text
forward = (sin(heading), 0, cos(heading))
right   = (-cos(heading), 0, sin(heading))
vF      = velocity · forward
vR      = velocity · right
```

Steering rotates `heading`; then the **old velocity** is re-projected onto the
new axes. The mismatch becomes lateral velocity (`vR`), which is damped by grip.
Handbrake grip is 15% of normal, so lateral velocity survives and the car slides.

### Per-step order

1. Smooth steering with an exponential damp.
2. Rotate heading by `-steer × turnRate × speedFactor × highSpeedDamp × driftSteer`.
3. Re-project velocity.
4. Apply nitro drain and forward thrust.
5. Apply throttle/brake/reverse, coast drag, handbrake drag and off-road drag.
6. Damp lateral velocity by grip and clamp it.
7. Integrate position.
8. Query the nearest track sample; update off-road state.
9. Clamp to the wall corridor and reflect normal velocity on impact.
10. Derive `speed`, `slip`, `drifting`, nitro gain, gear, wheel spin, roll/pitch.

### Tuning constants

| Constant | Value |
| --- | ---: |
| Base max speed | 56 m/s |
| Base power | 21 |
| Brake | 34 |
| Reverse max | 12 m/s |
| Turn rate | 1.8 rad/s |
| Grip | 10.5 |
| Off-road grip | 3.4 |
| Boost power | 16 |
| Drift threshold | 6.5 × car slide |
| Nitro drain | 26/s |
| Nitro from drift | 15/s |

Each car multiplies these through `physics` in `js/data/cars.js`.

### Collisions

Track collision is a corridor, not mesh collision. `track.nearest(pos)` returns
the closest sampled centerline point, its tangent and side vector, and the signed
lateral distance. If the distance exceeds `wallOffset - 0.95`, the car is
projected back inside and the outward velocity component is reflected and
damped. The nearest-point scan is linear over the sampled centerline; with a few
hundred samples this is cheap and completely stable.

## Track generation

`js/track.js`:

1. Defines 28 control points ordered so the start/finish is on the long bottom
   straight.
2. Builds a closed `THREE.CatmullRomCurve3`.
3. Samples it into a fixed number of points (`N`), each with position, tangent
   and side vector.
4. Generates the asphalt ribbon, curbs, walls, start arch, gates and boost pads
   from those samples.
5. Exposes `nearest()`, `distanceToTrack()`, `update()`, `flashGate()`,
   `wallOffset`, `start`, `startGrid`, `gates` and `pads`.

Because geometry and physics share the same samples, the visual road and the
handling corridor can never drift apart. The car starts eight samples behind the
line (`startGrid`) so the first gate crossing is a real lap.

## Rendering

- `WebGLRenderer` with antialiasing, ACES Filmic tone mapping, sRGB output and
  soft shadows.
- Device pixel ratio is capped at **2**; the post-processing composer is capped
  at **1.75**.
- Post chain: `RenderPass → UnrealBloomPass → OutputPass`.
- The sun is a directional light whose shadow camera follows the player, keeping
  shadow resolution useful across the whole circuit.
- Scenery uses instancing/merged geometry where practical; cars and props are
  built from shared box/cylinder primitives with per-instance materials.
- The garage has its own renderer, camera and lights so the race scene can be
  fully hidden while customizing.

## UI

`index.html` contains every screen and the HUD. `ui.js` owns navigation and
control binding. The HUD is plain DOM plus one 2D canvas for the minimap, which
is redrawn at up to 30 Hz from the same centerline samples as the physics.

Touch controls are real `<button>` elements using pointer events and pointer
capture, so they work with touch, pen and mouse. Input is normalized in
`input.js`; gameplay code only reads `input.gas`, `input.brake`, `input.steer`,
`input.handbrake` and `input.boost`.

## Persistence schema

```json
{
  "name": "NOVA",
  "carId": "viper",
  "looks": {
    "viper": {
      "paint": "#a855f7",
      "finish": "metallic",
      "rim": "#e8b54d",
      "rimStyle": "deep",
      "spoiler": "big",
      "stripe": "twin",
      "stripeColor": "#fff3e2",
      "tint": "dark",
      "underglow": "pink",
      "plate": "NOVA"
    }
  }
}
```

- Key: `sunset-drift-profile-v1`.
- Best lap: `sunset-drift-best-v1` (a decimal number of seconds).
- Loading validates the name, car id and every cosmetic. Invalid values are
  replaced by defaults from `normalizeLook()`.
- Each car keeps its own look, so switching cars does not destroy a build.
- The plate follows the driver name only when it still matches the old name.

## Garage lifecycle

- `GarageScene` is created lazily on first entry and reused.
- The current `CarModel` is rebuilt only when the selected car changes; cosmetic
  changes call `applyLook()` in place.
- Replaced models dispose their geometries.
- Starting a race disposes the race car and detaches effects.
- Returning to the garage disposes the race car and reuses the garage model.

This keeps repeated garage/race cycles from leaking GPU memory.

## Audio and effects

Audio is synthesized with Web Audio oscillators, filters and noise buffers — no
audio files. Engine pitch and gain follow speed and throttle; tire noise follows
slip; wind follows speed; discrete cues cover countdown, checkpoints, crashes,
lap completion and UI actions. The context is created on the first user gesture
to satisfy browser autoplay rules.

Effects use small pooled meshes for skid marks, smoke, dust, sparks and nitro
flames. They read the car's slip, off-road and boost state, so they double as
visual feedback for the physics.

## Performance notes

- Pixel ratio and bloom resolution are capped rather than tied to raw device
  resolution.
- Physics is fixed-step and bounded; a slow frame cannot run away.
- The minimap is canvas 2D, not a WebGL render target.
- The race scene is hidden while the garage renders.
- Geometry is disposed when cars are replaced.
- Typical desktop target is 60 fps at 1440p; integrated GPUs should use a
  smaller window or the browser's hardware acceleration.

## Extending the game

- **New car:** add a `CARS` entry; the garage and stat display are data-driven.
- **New cosmetic:** add it to a palette, validate it in `normalizeLook`, build it
  in `carModel.js`, and expose it automatically through `ui.js`.
- **New track:** replace the control-point list and keep the sample interface
  (`point`, `tangent`, `side`) intact. Gates and pads are generated from it.
- **Upgrades:** the natural insertion points are `Car`'s constructor (apply
  modifiers), `cars.js` (catalogue) and `ui.js` (shop tab).
- **Game modes:** add a state, a timer rule and a results variant in `main.js`;
  keep the physics and HUD reusable.

## Debug hook

`window.__sunsetDrift` exposes read-only getters for `state`, `car`, `lap`,
`nextGate` and `raceTime`, plus `track`, `scene`, `camera` and `startRace()`.
Useful for console experiments and automated smoke tests:

```js
__sunsetDrift.state;             // "racing"
__sunsetDrift.car.speedKmh;      // 143.2
__sunsetDrift.track.gates[3];    // gate transform and point
__sunsetDrift.nextGate;          // next gate index
```

The debug object is intentionally small; it is not a stable public API.
