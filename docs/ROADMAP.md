# Roadmap

This is a direction document, not a promise. Priorities can change based on
feedback and available time.

## 1.0 — Sunset Drift

Shipped:

- Driver profiles and browser persistence
- Four cars with distinct handling personalities
- Full cosmetic customization with a live 3D turntable
- Three-lap sunset circuit, checkpoints, nitro pickups and wall collisions
- Drift scoring, combos, best laps and results
- Keyboard, gamepad and touch input
- Procedural scenery, effects and audio
- Static build, tests, CI and GitHub Pages deployment

## 1.1 — Upgrades

The **Upgrades** tab is the next planned feature. Intended scope:

- Credits earned from laps, drift score and personal bests
- Four upgrade lines: engine, tires, suspension and nitro
- Multi-level upgrades with visible stat changes and handling trade-offs
- Per-car builds stored alongside each car's look
- A proper shop UI with affordability states and reset options
- Balance pass so stock cars remain viable in time trials

Open design questions: whether upgrades affect all cars or one car at a time,
whether credits are per-car, and how to avoid turning the game into a grind.

## 1.2 — More places to drive

- A second circuit with a different personality (tight technical or high-speed)
- Time-of-day and weather variants using the existing procedural environment
- Reverse layouts and sector-time HUD
- Track selection screen with best laps per track

## 1.3 — Quality of life

- Input remapping and sensitivity settings
- Reduced-motion and camera-shake toggles
- Colour-blind-friendly gate and minimap markers
- Volume sliders and a persistent mute preference
- Pause-menu performance preset for integrated GPUs
- Photo mode using the existing free camera and post pipeline

## Later / exploratory

- Local ghost replays of a best lap
- Daily seeded time-trial challenge
- Optional online leaderboards (requires a backend and abuse controls)
- Split-screen or local hot-seat time attack
- Mobile-specific performance mode and installable PWA polish

## Non-goals for now

- Full racing simulation (tire temperatures, fuel, damage)
- Real-world licensed cars or brands
- A large open world
- Matchmaking or online multiplayer (accounts and cloud saves ship with the
  bundled Node server; static hosts stay guest-only)

The project stays dependency-free at runtime and playable in a browser tab. Any
feature that compromises that should be discussed before implementation.
