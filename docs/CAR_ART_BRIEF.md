# Car art brief for 3D artists

Sunset Drift's cars use **fictional brands**, GTA-style: each car should read
instantly as "that kind of car" while being **its own design**. Do **not**
copy a real car: change at least the headlights, grille/intake, tail-light
signature, bumpers and the main body line, and use no real logos, badges or
model names.

## Technical requirements (every car)

- **Format:** glTF 2.0 binary (`.glb`), metres, +Y up, nose toward +Z
  (the game auto-rotates if not, but please follow it).
- **Polygons:** 40k–90k triangles for the full car including interior;
  wheels ~4k each.
- **Textures:** PBR metal/rough, max 2048 px (the game compresses to 1024 px
  WebP); no baked logos or plates.
- **Node names** (the game finds parts by name):
  - Wheels as four groups: `WheelFrontL`, `WheelFrontR`, `WheelRearL`,
    `WheelRearR`, each containing tyre, rim, brake disc and caliper, centred
    on the axle.
  - Everything else under one root.
- **Material names** (the game swaps in its own paint and lights):
  - `Paint 1` — main body colour (player-paintable)
  - `Paint 2` — secondary/trim colour
  - `Glass` — all windows (player tint)
  - `Rim1` — wheel rims (player rim colour)
  - `Brakelight`, `Headlight`, `Signallight` — lamp lenses
- **Interior:** seats, dashboard, steering wheel (cockpit camera).
- **Licence to us:** full commercial use in a game, including app stores.

## The 20 cars

| In game | Inspired by (vibe only) | Brief |
| --- | --- | --- |
| KOTO MIRA | Small Japanese city hatch | Tall, rounded 5-door, friendly face, short overhangs. |
| HALDEN SPRINT R | German hot hatch | Crisp 3-door, wide stance, red accent line, twin exhausts. |
| TAKEDA ARROW TYPE-Z | Japanese track hatch | Aggressive vents, big rear wing, triple centre exhaust idea but our own shape. |
| HALDEN AURA 30 | German compact sports saloon | Clean executive saloon, sharp shoulder line, slim lamps. |
| HALDEN R3 COMPETITION | German super-saloon | Same family as Aura 30 but flared arches, quad exhausts, carbon bits. |
| VOGEL ARGENT 63 | German luxury limousine | Long wheelbase, chrome, upright grille of our own design. |
| KOTO RONIN GT | Japanese sports coupe | Long bonnet, double-bubble roof, ducktail. |
| VOGEL ORBIT RS | Compact rounded sports coupe | Round, soft profile, big circular arches. |
| TAKEDA KAZE WRS | Rally saloon | Bonnet scoop, mud flaps, big wing, rally stance. |
| LONGHORN DUSTRUNNER | Off-road performance pickup | Huge tyres, wide fenders, light bar. |
| KESSLER KANTO S | Performance SUV | Sloped coupe-like roof SUV, sporty lamps. |
| ASHCOMBE HIGHLANDER XR | British luxury SUV | Boxy, floating roof, clamshell bonnet. |
| LONGHORN STALLION GT | American muscle coupe | Long nose, short deck, three-bar tail-lights of our own design. |
| BRAXTON HELLHOUND | American supercharged muscle | Wide, menacing, bonnet scoop, retro-modern. |
| KOTO KESTREL RS | Japanese roadster | Tiny, round, open top, pop-out-style friendly lamps. |
| BRAXTON SERPENT TR | American track supercar | Very long bonnet, side exhausts, giant wing. |
| MORELLI 740 VELOCE | British carbon supercar | Teardrop canopy, deep eye-socket headlights. |
| VALENZA SOVRANO V12 | Italian front-engined V12 GT | Long bonnet, fastback, quad round-ish tail-lights of our own shape. |
| AURELIO TEMPESTA SV | Italian wedge hypercar | Hexagon/Y motifs of our own, scissor-door look, huge intakes. |
| VALMONT NOCTURNE W16 | French luxury hypercar | Horseshoe-like grille of our own design, two-tone body, central spine. |

Already done: **VALENZA AETHER GT** (concept GT, licensed model).

When a model is ready, put it in `assets/cars/<id>.glb` and add
`model: { url: 'assets/cars/<id>.glb', credit: '...' }` to the car in
`js/data/cars.js`. Everything else is automatic.
