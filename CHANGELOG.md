# Changelog

All notable changes to Sunset Drift are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Online invites: rooms show an INVITE FRIENDS card with COPY CODE and
  SHARE INVITE LINK (native share sheet on phones). Opening a link like
  `/?room=ABCDE` jumps to ONLINE and joins the room after sign-in.
- Open public rooms are listed in the ONLINE lobby (refreshed every few
  seconds) with one-tap JOIN.
- Cloudflare backend: on the Cloudflare Workers deployment, accounts, cloud
  saves and online races now work (Worker + one SQLite Durable Object, free
  plan). The API matches the Node server, so the game code is unchanged.
- FREE DRIFT: a solo, no-clock session on every street circuit, built around
  angle rather than lap times. The session pays a bonus from the banked drift
  score (capped at 3,600 CR); pause → END SESSION banks it at any time.
- Downtown Run: a 3.8 km street circuit through a full city grid, with houses
  lining both kerbs, painted side streets, a lit downtown skyline, street
  lamps and red traffic lights at every junction.
- Neon Skidpad: a wide, walled 1.7 km drift park with long sweepers and one
  big hairpin.
- The twenty-car roster now uses real production models, from the Toyota Yaris
  and VW Golf GTI to the Bugatti Chiron. Each keeps its stable internal id, so
  saves and career progress carry over, while names, classes, specs, pros and
  cons, factory-style paints and handling character come from the real car.
- Realistic light hardware on every car: halogen-reflector, projector, slim
  LED, quad and laser head-lamp clusters; marque-inspired DRL signatures; mesh,
  slat, honeycomb, kidney, round, split and horseshoe grilles; and LED tail
  signatures including C-hooks, rings, tri-bars, Y-shapes and full-width bars.
  A high-mounted stop lamp sits above every tail.
- Night lighting: all cars switch to bright lamps and DRLs after dark, the
  player's car projects twin headlight beams down the road, and brake lights
  brighten both the lens and the LED signature.
- Cars are rebuilt from lofted superellipse sections instead of stacked rounded
  boxes: circular wheel arches cut into the shell, lathed tyres with tread,
  brake discs and calipers, painted roof skins framed by A/B/C pillars, and
  merged static meshes to keep mobile draw calls down.
- Workshop tuning views in the garage: pointing at (or tapping) a part
  moves the camera to it. Engine and turbo open the bonnet to show the
  engine (turbo and filter appear with their upgrades), suspension raises
  the car on a two-post lift, tyres and brakes zoom on a spinning wheel,
  intake & exhaust frames the tips, nitro glows blue at the back. Buying a
  stage fires a spark burst and a flash.
- Race replays: WATCH REPLAY on the results screen plays the whole race
  back with automatic TV cameras (chase, trackside, helicopter, low orbit)
  cutting every few seconds. Every car is recorded at 15 Hz; Escape or EXIT
  REPLAY returns to the results.
- Settings screen (⚙ in the garage header): graphics, language, sound,
  music, turn signals, camera shake, speed units (km/h or mph) and an FPS
  counter, plus Replay Tutorial and a two-tap Reset All Progress. The same
  settings stay in the pause menu.
- Tuning preview: each part shows its next stage and how many PR points it
  adds; pointing at a price previews the new stat bars before you buy.
- More visible tuning: a bonnet scoop from Turbo stage 3, a carbon bonnet
  from Weight Reduction stage 3 and wider tyres from Tyres stage 4.
- Tuning shows on the car: suspension stages lower the body (up to 4 cm)
  and intake & exhaust stages fit bigger exhaust tips, in the garage and
  on track.
- Deeper tuning: nine parts (engine, turbo, intake & exhaust, gearbox,
  weight reduction, suspension, tyres, brakes, nitro) with five named
  stages each, and a performance rating (PR) on car cards and the tuning
  panel. Existing upgrades carry over.
- Languages: English, Español, Français, Português and Deutsch. The game
  follows the browser language on first visit; switch any time from the
  first screen or the pause menu. Covers menus, settings, race setup,
  tutorial tips, results and HUD labels.
- New circuit CORAL BAY: a tight twilight harbour loop with esses and a
  hairpin (Pro rank), with its own cooler sky and turquoise kerbs, a career
  event (CORAL TWILIGHT) and daily-challenge targets. Circuits can now
  override their theme's colours.
- Accessibility: CAMERA SHAKE off removes impact and nitro shake and
  softens the speed-based field-of-view widening.
- Key remapping (Profile → Controls): change the main key for accelerate,
  brake, steering, handbrake, nitro and look back; arrow keys and gamepads
  keep working. Reset restores the defaults.
- First-race tutorial: a new driver's first race shows five short tips at
  the moment they matter (accelerate, brake before the corner, drift, use
  nitro, camera and pause), with keyboard or touch wording. Runs once.
- Sound and music volume settings in the pause menu.
- Sell cars from the Customize tab (two taps to confirm): 60 % of the price
  plus half of the upgrade spend. The starter car cannot be sold.
- Offline support: a network-first service worker caches the game so it
  loads offline after the first visit (updates are always picked up first).
- New share card (link previews) and up-to-date descriptions in the page,
  manifest and structured data.
- Achievements: 19 goals (wins, podiums, laps, drift totals, garage
  collecting, upgrades, daily gold, series gold, full career, winning at
  night, in the rain or against a full grid, saving a photo), each paying
  credits once. Shown on the results screen and in a Profile grid.
- Photo mode (pause menu): the race freezes, drag to orbit around your car,
  scroll or pinch to zoom, and save a watermarked PNG to share.
- Landscape phone layout: menu beside the car, slim header, compact pause
  menu with settings in two columns.
- Time of day and weather in race setup: NIGHT darkens any circuit (your
  headlights light the road) and RAIN adds falling rain, grey skies,
  shorter fog, darker wet tarmac and 16 % less grip and braking for every
  car on the grid.
- Cockpit: live speed and rev needles, digital readouts with speed and gear,
  and a working rear-view mirror.
- Daily challenge (Career tab): one circuit, one loan car and bronze /
  silver / gold best-lap targets per calendar day, the same for every
  player. Each tier pays once per day (800 / 1,800 / 3,500 CR). Targets are
  calibrated to autopilot laps per circuit and scaled by the car's speed.
- Championship standings per career series: points from your best finish
  in each event against three named rivals, and a gold, silver or bronze
  trophy once the series is complete.
- Turn signals: commit to a turn and that side's indicators blink three
  times with a relay tick (and green arrows on the cockpit cluster).
- Pause-menu settings: graphics quality (AUTO / HIGH / MEDIUM / LOW) and
  turn signals on/off, saved with your profile.
- Adaptive graphics: AUTO steps down from HIGH to MEDIUM (lower resolution)
  to LOW (no shadows or bloom) when a race can't hold ~42 fps; phones start
  at MEDIUM.
- Cockpit camera now sits in the driver's seat of a modelled interior:
  dashboard, gauges, console, door cards, a steering wheel that turns with
  your steering and gloved hands holding it. On every gear change the right
  hand reaches for the shifter, moves it and returns. Each class has its own
  interior: wheel shape (round, flat-bottom, thin classic, hypercar yoke),
  shifter (H-pattern, sequential, luxury selector), analog or digital
  cluster, and trim (plastic, wood and tan leather, carbon with coloured
  accents). The car's own bodywork inside the cabin is clipped away so low
  cars and open tops never block the view.
- Top-speed rev limiter: holding top gear at maximum RPM now bounces the
  engine with the same hard ignition-cut stutter as launch control, with a
  shaking tach and a short exhaust crack on every cut.
- Time Trial ghost: your best Time Trial lap on each circuit replays as a
  see-through car. Any faster lap replaces it on the spot ("GHOST BEATEN").
  Ghosts are stored per account and circuit in the browser.
- Car upgrades: engine, tyres, brakes and nitro, three levels each, bought
  per car from the Customize tab. Prices scale with the car's value, tuned
  stats show in green, and upgrade spend raises the AI grid's price band so
  a tuned car still meets a fair field. Online races stay stock.
- Twenty-car catalogue across eight categories, each with its own body style,
  stats, physics, price and rank requirement. New: Kestrel RS open roadster,
  Sovereign GT12 front-engined grand tourer, Orion H red compact hatch and
  Monarch L8 long-wheelbase flagship saloon (chrome-framed upright grille,
  slim lamps, sill and roofline chrome, factory no-stripe metallic spec).
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

### Changed

- Mobile race HUD: the nitro panel is now a borderless top-left overlay,
  the old refill hint is gone and camera/pause stay in the top action row.
  Brake and gas are large pedal-shaped pads in the bottom-right; the handbrake
  is a lever beside the brake and the N2O circle sits on the gas pedal, where
  pressing it also applies throttle so one thumb can boost.

### Fixed

- FPS counter: it now samples raw animation-frame intervals with a 480 ms
  window and shows the average frame time next to the frame rate. A monitor
  locked to 100 Hz will still read 100 FPS when the game is keeping up, so the
  millisecond figure (e.g. `100 FPS · 10.0 ms`) is the live load indicator.
- Picking up a nitro bottle no longer changes the engine sound: it used to
  shove the car forward ~11 km/h, jumping revs and gears. Bottles now only
  refill the nitro bar.
- Rev counter: revs and gears follow wheel (forward) speed, so cornering
  and sliding no longer move the needle; upshifts drop the revs part-way
  like a real gearbox instead of back to idle; downshifts wait until you
  really slow down; the needle moves smoothly; only real drifts flare it.
- Rear turn signals were hidden inside the rear bumper; they now sit at the
  outer edge of the tail lamps and glow orange.
- Graphics levels now look clearly different: LOW renders at 80 %
  resolution with no shadows or glow and a shorter view distance, MEDIUM
  uses native resolution and softer shadows, HIGH full sharpness and
  detailed shadows. Each level is described in the menu.
- Sound and music volume are sliders instead of four steps.
- Performance: each car was ~132 separate meshes (100 of them wheel parts);
  wheels are now merged, cutting an 8-car race from 757 to 560 draw calls
  per frame (427 on LOW).
- Car bodies looked wrinkled. Each body slice was re-spaced along its
  outline, so points slid between slices and twisted the surface; every
  slice now has a fixed point layout. The side profile uses a smooth monotone
  curve instead of flattening at every key (which rippled long panels), and
  wing lines run back to the windscreen instead of dipping in front of it.
- Bonnets were long ramps from the windscreen down to the nose, and the
  fender fix lifted the whole bonnet into a hump. Bonnets are now nearly level
  (a gentle wedge on supercars) and the wings rise at the outer edges over
  each wheel, easing smoothly back into the bonnet and rear deck.
- Every car had nearly the same acceleration (about 2 g off the line,
  0–100 km/h in 2–3 s) and top speeds squeezed into 165–250 km/h. Performance
  now comes from each car's spec sheet: top speed from its listed figure,
  launch from grip and drivetrain, pull from power-to-weight. Top speeds now
  span 161–292 km/h, 0–100 km/h 2.3–4.6 s, and the speedometer dial follows.
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

### Removed

- All damage mechanics and the damage bar: collisions still unsettle the car
  and scrub momentum, but there is no health bar, smoke trail, top-speed
  penalty, repair timer or darkened paint.

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
