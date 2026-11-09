# Changelog

All notable changes to Sunset Drift are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Time Trial ghost: your best Time Trial lap on each circuit replays as a
  see-through car. Any faster lap replaces it on the spot ("GHOST BEATEN").
  Ghosts are stored per account and circuit in the browser.
- Car upgrades: engine, tyres, brakes and nitro, three levels each, bought
  per car from the Customize tab. Prices scale with the car's value, tuned
  stats show in green, and upgrade spend raises the AI grid's price band so
  a tuned car still meets a fair field. Online races stay stock.
- Eighteen-car catalogue across eight categories, each with its own body style,
  stats, physics, price and rank requirement. New: Kestrel RS open roadster and
  Sovereign GT12 front-engined grand tourer.
- Economy: 30,000 CR starting wallet, performance-based payouts and a 2.4x
  price-band rule for AI grids.
- AI opponents (1–7) with personalities and four difficulty levels.
- Seven circuits, including the new Velocity Park grand prix venue with tyre
  walls, hoardings and a pit building.
- Practice-only test runway: a wide airport loop with a 3.6 km straight, edge
  lights, hangars and a control tower, built for top-speed testing. It never
  appears in Career, Quick Race, Time Trial or online lobbies.
- Game modes: Career (nine events, four series), Quick Race, Time Trial and
  Practice. Practice times laps and can be ended from pause to bank drift score.
- Practice opens every circuit. Circuits still locked by rank are rented per
  session for 1,000–8,000 CR depending on how far ahead they are. A confirmation
  dialog shows the fee before charging, the HUD carries a rental badge for the
  session, and the results sheet lists the deduction.
- Clearing a career event unlocks the circuit used by the next event.
- Profile tab with rank progress, statistics, personal records and race history.
- Results screen shows unlocks, promotions and career objective status.
- Real accounts via the bundled Node server (scrypt hashes, HttpOnly session
  cookie, cloud save sync); local guest mode on static hosts.
- Four camera views cycled with `C`: a new close chase camera (half the old
  distance, now the default), the original far chase, bumper and cockpit. The
  choice is remembered.
- Menu music: a procedural synthwave loop on the profile and garage screens
  (no audio files; follows the mute button and stops in races and background
  tabs).
- Front license plates on every car.
- Nitro pickups are floating NOS bottles (three across the road per spot)
  instead of arrows painted on the asphalt.
- Analog speedometer in the bottom-left corner: numbered dial scaled to each
  car (nitro range in cyan), needle, speed sweep, digital speed, gear and rev
  bar. Stays centred on touch devices, clear of the steering buttons.
- Exhaust smoke from every pipe when idling and pulling away (rivals nearby
  too), backfire flashes with a crack when lifting off at speed, and visible
  pipe bores.
- AI racecraft: rivals overtake instead of queueing, defend their line against
  a car closing from behind, lean on a car alongside, steer for nitro bottles
  and time their nitro; their nitro flames are now visible.
- Wheel lock: a long hard stop from high speed locks the tyres, with smoke,
  screech and skid marks; steering while locked slides the car.
- Drifts can be started by steering hard at speed and held through a corner
  with throttle and steering, instead of ending the moment the handbrake is
  released.
- Online multiplayer: quick match, private rooms with share codes, up to six
  drivers, live interpolated rival cars, server-ranked results, rematches and
  online payouts. Built on a dependency-free WebSocket endpoint in the Node
  server; requires a signed-in account.
- Mobile landscape layout: a rotate hint in portrait, best-effort orientation
  lock, safe-area padding and a compact set of see-through steering and pedal
  buttons in the screen corners.
- Numbered circular tachometer with a needle, plus a drift-limiter shake and
  engine stutter when a slide pins the RPM at the redline.
- Hold `E` for a rear-view look in every camera mode.
- A short "what's new" card on the first launch after an update.

### Fixed

- Wall hits no longer feel like the car stopped dead: the nose turns with the
  barrier and the car keeps most of its speed along the wall, with only a short
  recoil on impact.
- Cars could sink nose-first into each other; contact now uses a capsule of
  three circles per body and sparks at the real touch point.
- Text inputs no longer lose letters such as "A" to driving controls.
- Typography and contrast: minimum 10–11 px labels, brighter muted text.
- Car-card stat bars rendered empty; mobile garage overflowed horizontally.
- Account sign-in was unreachable below 1100 px wide.
- Signed-in players on a new browser now receive their cloud save on load.
- Practice sessions no longer count toward rank.
- Practice sessions no longer write circuit records, and best race times are
  kept per lap count instead of comparing different distances.
- A DNF no longer counts as a podium.
- A failed race start no longer does "nothing": the player sees the reason and
  returns to the garage, unexpected errors show a message instead of failing
  silently, and the Profile tab shows the build id.
- The car vibrated while driving, worst on 120 Hz screens: physics steps at
  120 Hz but frames see 0, 1 or 2 steps, so the car jumped up to 25 cm against
  the camera. Cars are now drawn between physics steps (under 1 cm), and the
  camera shake is a smooth wobble instead of a random jump every frame.
- AI rivals were far too slow (Expert lapped Sunset Coast in 70 s where a
  good driver does about 45 s). They now plan speed from the real cornering
  limit of their car and the braking distance ahead, collect nitro bottles,
  and Expert races identical machinery at the limit instead of a 6 % power
  bonus with very cautious cornering.
- AI cars had a hidden 2x brake force left over from when they only looked
  50 m ahead. Now that the planner reads the whole braking zone, rivals use
  the player's real brakes instead of out-braking identical machinery: up to
  about 3 s over two laps, and a few tenths on the tightest circuit.
- Brakes were about 3.5 g at any speed (100 km/h to a stop in 11 m). They are
  now about 1.2 g, scaled by grip and car weight, with the force fading with the
  square of speed: about 35 m from 100 km/h but 121 m from 180 km/h, so
  high-speed corners need early braking instead of a last-second stab.
- Lifting off the throttle slowed the car faster than pressing the brake
  (about 15 m/s² at 100 km/h). Coasting is now engine, rolling and aero drag
  only — roughly 2 m/s² at 100 km/h — so the pedal is always clearly stronger.
- Steering alone snapped into a drift after a quick flick. The rear now only
  steps out after a hard turn is held for about a second, and builds
  progressively; the handbrake still starts a slide instantly.
- The rev bar kept climbing past sixth gear and wrapped back to zero at top
  speed. It now fills through sixth gear and stays on the redline above it.
- A collected nitro pickup stayed dimmed for the rest of the race even after
  it respawned.
- Starting a race could do nothing after a deploy: browsers mixed cached old
  modules with new ones (e.g. `audio.setMusic is not a function`). The build
  now stamps every module URL with a release hash.
- Sunset Coast's hairpin was a single 136° kink, so road edges, kerbs and a
  row of barriers folded across the corner. It is now a proper ~16 m hairpin;
  barriers that would land on any road are skipped, and a test guards against
  new kinks.
- Running wide no longer brakes the car hard: kerbs count as track, dirt eases
  the car down to 80 % of top speed (93 % for SUVs and off-roaders) instead of
  58 % with heavy drag, and any over-limit speed bleeds off smoothly.
- License plates were hidden inside the rear diffuser (and behind the diffuser
  fins on supercars and hypercars) and were dark text on a dark plate; they are
  now light plates with a faint plate light, readable from the chase camera.
- Bonnet smoke now only appears on a heavily damaged car (over 50 % damage)
  and damage repairs about three times faster, so a couple of wall scrapes no
  longer leave the car smoking for the rest of the lap.

### Security

- The Node server no longer serves dot-files or the account data directory
  (`.data/users.json` with password hashes, cloud saves, `.git`, `.env`).

### Reliability

- Cloud saves are versioned: the server rejects writes from a stale tab or
  device (HTTP 409) and the client re-syncs from the cloud instead of
  overwriting newer progress.
- A failed or corrupt cloud-save read no longer counts as "no save", so it can
  never cause the local copy to overwrite the player's real progress.
- After a save conflict the cloud copy is always adopted. Previously two tabs
  on the same account could overwrite each other's progress.
- Signing out waits for an in-flight cloud upload and any change queued
  behind it, so the last race is never lost.
- A malformed unrelated cookie no longer breaks every API request.
- Sign-up username field now matches the server rule (3–16 characters).

### Planned

- Additional circuits and time-of-day variants
- Accessibility options and input remapping

## [1.0.0] — 2026-11-05

### Added

- Driver profile with name entry and browser persistence.
- Garage with four cars, stat comparisons, strengths and trade-offs.
- Live 3D turntable preview with paint, finish, rim, spoiler, stripe, tint,
  underglow and license-plate customization.
- Three-lap sunset circuit with eight checkpoint gates, curb geometry, walls,
  grandstands, trackside props and nitro pickups.
- Arcade drift physics with handbrake slides, slip angle, drift scoring,
  combo multipliers, nitro boost and off-road grip penalties.
- Lap timer, best-lap storage, drift score, speedometer, gear indicator,
  minimap, wrong-way warning and countdown.
- Keyboard, gamepad and touch controls.
- Procedural engine, tire, wind, impact and UI audio with mute support.
- Camera modes, speed-sensitive FOV, impact shake, particle effects, skid
  marks and a post-processing bloom pipeline.
- Pause, restart, results, race-again and quit-to-garage flows.
- Zero-dependency static dev server, project checks, unit tests, build output
  and deployment automation for GitHub Pages.

[Unreleased]: https://github.com/ybenbrai/cars/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ybenbrai/cars/releases/tag/v1.0.0
