# Roadmap

This is a direction document, not a promise. Priorities can change based on
feedback and available time. **Shipped** means the feature is in the game; see
the [changelog](../CHANGELOG.md) for the full history. Items that are still
open are grouped at the end of each section.

## 1.0 — Sunset Drift (Shipped)

- Driver profiles and browser persistence
- Four cars with distinct handling personalities
- Full cosmetic customization with a live 3D turntable
- Three-lap sunset circuit, checkpoints, nitro pickups and wall collisions
- Drift scoring, combos, best laps and results
- Keyboard, gamepad and touch input
- Procedural scenery, effects and audio
- Static build, tests, CI and GitHub Pages deployment

## 1.1 — Upgrades (Shipped)

The Upgrades tab grew into the Workshop: nine tuning parts with five stages
each, a performance rating on car cards, per-car builds, next-stage previews and
visible changes on the car and in the garage. Online races run stock, so a
stock car stays competitive.

## 1.2 — More places to drive (Mostly shipped)

Shipped:

- Ten race circuits plus a practice-only runway, with distinct layouts,
  themes, palettes and unlock ranks.
- Time of day and weather in race setup: DAY, NIGHT, clear and rain, with real
  lighting changes, wet tarmac and less grip in the rain.
- Circuit selection through Race Setup and Career, with best laps in Profile.
- Sector-time HUD: three distance thirds per lap, live sector time, splits and
  personal bests saved per circuit.
- Reverse layouts of every race circuit, starting from the same arch. Each
  direction keeps its own best lap, totals, sector bests and ghost.

## 1.3 — Quality of life (Mostly shipped)

Shipped:

- Input remapping (Profile → Controls) with a reset to defaults.
- Camera-shake toggle; turning it off also softens speed-based FOV widening.
- Sound and music volume sliders plus a persistent mute preference.
- Auto Nitro with hysteresis: a spent bottle waits for a useful refill instead
  of strobing, and the manual N2O key still works.
- Graphics presets (AUTO / HIGH / MEDIUM / LOW / MOBILE) in the pause menu, with
  AUTO stepping down when a race cannot hold frame rate; phones start at MEDIUM.
  MOBILE is a fixed low-cost preset for phones (75% resolution, no shadows,
  bloom or cockpit mirror, shorter view distance).
- Photo mode using the free camera and post pipeline, saving a watermarked PNG.
- Readable markers: numbered, outlined rival discs, a larger player arrow and a
  pulsing next-checkpoint diamond; checkpoints are full-width glowing arches.

Still open:

- Steering sensitivity settings. Input remapping shipped, but sensitivity is
  still fixed per device.
- A dedicated colour-blind palette mode for gates and minimap markers. Current
  markers already use shape and number as well as colour, but there is no
  selectable alternative palette.
- Broader reduced-motion support. Camera shake can be turned off, but other
  motion effects have no master switch.

## 1.4 — City Roam (Shipped)

- Free-drive mode on the whole Downtown grid: no laps, checkpoints or race
  walls.
- Instanced towers, mid-rise blocks, houses, parks, trees, lamps and a canal
  with a bridge on every north-south street.
- Live traffic that obeys signals at every junction, plus 90 instanced walkers
  that use the crossings, wait for green and step aside for the player.
- Solid building collisions, city bounds and drift-only rewards.
- A sea and snow-capped mountain border past the outer streets, so the city no
  longer ends in a void. Procedural instanced scenery with no colliders or race
  props.
- Shared `CITY` room online with live pose relay, late-join snapshots and clean
  join/leave; no countdown, results or ranked bookkeeping.

## 1.5 — Online replay (Shipped)

- Server-authoritative recordings for every online race, sampled at 15 Hz.
- Signed-in `/api/replay/<id>` on both Node and the Worker; the last 40 races
  are kept. Replays never travel over the WebSocket or the cloud save.
- WATCH REPLAY on the results screen reuses the local TV cameras and adds
  stand-in cars for drivers who left mid-race.

## Later / exploratory

Shipped from this list:

- Local ghost replays of a best lap (Time Trial ghost).
- Daily seeded time-trial challenge with bronze / silver / gold targets.
- Online leaderboards: global best laps and ranked seasons with divisions.
- Installable PWA: manifest, network-first offline service worker and store
  publishing notes.
- A dedicated mobile performance mode (the MOBILE graphics preset).

Still open:

- Split-screen or local hot-seat time attack.

## Non-goals for now

- Full racing simulation (tyre temperatures, fuel, mechanical wear).
- Officially licensed manufacturers and scanned car assets: the roster uses
  fictional marques with original procedural bodies, plus one credited glTF
  model for the Valenza Aether GT.
- A fully simulated persistent world. City Roam is a drivable grid with live
  traffic, signals and pedestrians, not an open world with server physics.
- Server-authoritative physics or anti-cheat beyond sanity checks (online races
  relay client positions; they need the bundled Node server, and static hosts
  stay guest-only).

The project stays dependency-free at runtime and playable in a browser tab. Any
feature that compromises that should be discussed before implementation.
