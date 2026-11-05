# Changelog

All notable changes to Sunset Drift are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Eighteen-car catalogue across eight categories, each with its own body style,
  stats, physics, price and rank requirement. New: Kestrel RS open roadster and
  Sovereign GT12 front-engined grand tourer.
- Economy: 30,000 CR starting wallet, performance-based payouts and a 2.4x
  price-band rule for AI grids.
- AI opponents (1–7) with personalities and four difficulty levels.
- Seven circuits, including the new Velocity Park grand prix venue with tyre
  walls, hoardings and a pit building.
- Game modes: Career (nine events, four series), Quick Race, Time Trial and
  Practice. Practice times laps and can be ended from pause to bank drift score.
- Clearing a career event unlocks the circuit used by the next event.
- Profile tab with rank progress, statistics, personal records and race history.
- Results screen shows unlocks, promotions and career objective status.
- Real accounts via the bundled Node server (scrypt hashes, HttpOnly session
  cookie, cloud save sync); local guest mode on static hosts.

### Fixed

- Text inputs no longer lose letters such as "A" to driving controls.
- Typography and contrast: minimum 10–11 px labels, brighter muted text.
- Car-card stat bars rendered empty; mobile garage overflowed horizontally.
- Account sign-in was unreachable below 1100 px wide.
- Signed-in players on a new browser now receive their cloud save on load.
- Practice sessions no longer count toward rank.

### Security

- The Node server no longer serves dot-files or the account data directory
  (`.data/users.json` with password hashes, cloud saves, `.git`, `.env`).

### Reliability

- Cloud saves are versioned: the server rejects writes from a stale tab or
  device (HTTP 409) and the client re-syncs from the cloud instead of
  overwriting newer progress.
- A failed or corrupt cloud-save read no longer counts as "no save", so it can
  never cause the local copy to overwrite the player's real progress.
- A malformed unrelated cookie no longer breaks every API request.
- Sign-up username field now matches the server rule (3–16 characters).

### Planned

- Car upgrades: engine, tires, suspension and nitro tanks
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
