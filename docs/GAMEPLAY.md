# Gameplay Guide

This is the design reference for Sunset Drift: the loop, the rules, the numbers
behind the handling model and the strategies that actually work.

## The loop

1. **Create a driver profile.** The name is used in the HUD, results screen and
   on the car's license plate.
2. **Choose a car.** Each car has a class, four 1–10 stats and two pros and two
   cons. Stats are honest: they are derived from the same physics modifiers used
   on track.
3. **Customize the look.** Paint, finish, rims, spoiler, stripes, tint, underglow
   and a nine-character plate are available per car.
4. **Race three laps.** Pass the checkpoint gates in order, drift for score and
   nitro, and set a personal best lap.
5. **Repeat.** The best lap, driver name, selected car and every car's look are
   saved in the browser.

Upgrades are intentionally not implemented yet. The tab is a preview of the next
major feature, not a hidden progression system.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Accelerate | `W` / `↑` | RT / A | GAS |
| Brake / reverse | `S` / `↓` | LT / X | BRK |
| Steer | `A` `D` / `←` `→` | Left stick | ◀ ▶ |
| Handbrake | `Space` | LB / RB | DRIFT |
| Nitro | `Shift` | B | N2O |
| Cycle camera (near chase, far chase, bumper, cockpit) | `C` | Y | — |
| Pause / resume | `Esc` / `P` | Start | ❚❚ |
| Reset to track | `R` | — | — |
| Mute | `M` | — | ♪ |

Touch controls appear automatically when the primary pointer is coarse or the
device reports touch points. The game also pauses itself when the tab loses
visibility during a race or countdown.

## The cars

| Car | Class | Speed | Accel | Handling | Drift | Character |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| FALCON GT | Balanced | 7 | 6 | 7 | 6 | Forgiving all-rounder |
| VIPER X | Top speed | 10 | 8 | 5 | 4 | Highest top end, lazy corner entry |
| KAZE S | Drift | 6 | 6 | 9 | 10 | Huge, controllable slides |
| COMET RS | Launch | 7 | 10 | 8 | 5 | Explosive starts, nervous rear |

### Physics modifiers

Each car scales the shared base setup:

| Car | Speed | Accel | Grip | Turn | Boost | Slide |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| FALCON GT | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 |
| VIPER X | 1.12 | 1.10 | 0.90 | 0.86 | 1.30 | 1.12 |
| KAZE S | 0.94 | 0.98 | 0.93 | 1.14 | 0.95 | 0.72 |
| COMET RS | 0.97 | 1.20 | 1.04 | 1.08 | 1.05 | 1.03 |

`slide` is the most misunderstood value: lower numbers mean a **lower** drift
threshold, so the car starts sliding sooner. KAZE S at `0.72` is the drift car;
VIPER X at `1.12` needs deliberate weight transfer to rotate.

## Race rules

- The race is **three laps**.
- There are **eight gates**: gate `0` is start/finish and gates `1–7` are
  checkpoints.
- Gates must be passed **in order**. The next gate glows cyan; passed gates flash
  green.
- A checkpoint grants **+5 nitro** and a chime.
- Crossing the finish line on the final lap ends the race.
- A new best lap is saved immediately, even if you quit afterwards.
- The total time is the sum of all three laps. Drift score is separate from the
  time result.
- Hitting walls or rivals adds damage (shown in the HUD), which costs a little
  top speed and power. Above 50 % damage the bonnet trails smoke. Damage slowly
  repairs while you drive, and there is no failure state.
- Kerbs count as track. On the dirt beyond them grip drops and the car eases
  down to about 80 % of its top speed (93 % for SUVs and off-roaders) over a
  couple of seconds rather than braking hard. `R` safely returns you to the
  nearest point on the circuit.

### Gate hitboxes

Gates are checked as circles, not planes: radius `12` for the finish line and
`11` for checkpoints. This keeps detection forgiving at high speed. Passing a
gate out of order does nothing; the car must reach the active gate.

## Practice sessions

Practice has no opponents and no lap limit, and **every circuit is open** even
when it is still locked in the other modes. An unlocked circuit is free; a
locked one is rented **per session**, at a price that doubles for every rank
between you and the circuit's requirement:

| Rank gap | Rental |
| ---: | ---: |
| 1 | 1,000 CR |
| 2 | 2,000 CR |
| 3 | 4,000 CR |
| 4 | 8,000 CR |

The fee is taken when the session starts. `RESTART SESSION` and `DRIVE AGAIN`
reuse the same rental, but quitting to the garage ends it, so a new practice
session on a locked circuit pays again. Career, Quick Race and Time Trial keep
the normal circuit unlock rules.

Before charging, the garage asks you to confirm the rental and shows how many
ranks ahead the circuit is plus your wallet balance. During the session a
`TRACK RENTAL` badge sits under the lap counter, and the results sheet lists the
fee under the payout so the deduction never appears out of nowhere.

## Braking and wheel lock

- Brakes stop a sports car at about **1 g** (roughly 43 m from 100 km/h),
  scaled by tyre grip; SUVs, off-roaders and muscle cars stop about 14 % later.
  Braking force fades with the square of speed, so a stop from 180 km/h needs
  around **163 m** — nearly four times the distance from 100 km/h. Brake before
  the corner, not at it.
- Lifting off the throttle is **not** braking: engine, rolling and aero drag
  only slow the car at about 1.2–3 m/s², so it keeps rolling for a long time.
  The pedal is always several times stronger, even at top speed.
- Holding the brake hard for more than about **0.35 s** above roughly 60 % of
  top speed **locks the wheels**: tyres smoke, screech and leave marks, the car
  stops a little less well and loses almost all sideways grip. Braking in a
  straight line stays stable; steering while locked swings the car into a
  slide. Ease off the brake (or slow below ~30 % of top speed) to unlock.
- AI drivers brake harder (about 2 g) and never lock up.

## AI rivals

AI drivers plan their speed from the track ahead: for every bend they work out
the fastest speed the car can actually turn at, then brake only as late as
their brakes allow. Difficulty sets how close to that limit they drive and how
much power their car gets:

| Difficulty | Cornering limit | Car power / top speed | Mistakes |
| --- | --- | --- | --- |
| Easy | 72 % | 76 % | frequent |
| Normal | 84 % | 88 % | occasional |
| Hard | 93 % | 96 % | rare |
| Expert | 100 % | 100 % (same as yours) | almost none |

For scale, in the Pulse H3 on Sunset Coast the AI laps in about 58 s (Easy),
50 s (Normal), 46 s (Hard) and 44 s (Expert).

Racecraft (applies to every nearby car, including you):

- **Overtaking:** a slower car in their path gets passed on the side with room
  instead of followed.
- **Defending** (Normal and up, strongest on Expert): a car closing from behind
  makes them move across to cover its line.
- **Leaning** (Normal and up): side by side, aggressive drivers squeeze you
  towards the edge. Contact damages both cars.
- **Nitro:** they steer for nitro bottles when their tank is not full, fire
  nitro on straights where they can still accelerate and to pass or hold off
  an attack, and keep a reserve for a fight on the higher difficulties. Their
  exhaust flames show when they boost.

## Starting and holding a drift

- **Handbrake** (`Space`) kicks the rear out at any speed above 8 m/s.
- **Steering hard at speed** with the throttle on can also break traction, but
  only after the driver has **held the turn for about a second**: the rear then
  steps out progressively over the next second or so. A quick flick of the
  wheel keeps full grip, so normal cornering stays clean.
- **Holding a drift:** once sliding, keep the throttle on and keep steering into
  the corner. The drift lasts as long as you do, even after releasing `Space`.
- **Ending a drift:** straighten the wheel or brake and grip returns within
  about a quarter of a second.

AI drivers do not get the steering-initiated slide; they keep full grip.

## Drift scoring

A drift starts when the car is moving faster than **8 m/s** and either:

- the handbrake is held with lateral slip above `1.6 m/s`, or
- lateral slip exceeds the car's drift threshold (`6.5 × slide`).

While drifting, score accumulates continuously:

```text
combo   = 1 + min(4, driftTime × 0.5)
score  += slip × max(speed, 8) × dt × 1.35 × combo
```

The score is banked when the drift ends **if** it lasted longer than `0.3 s` and
the bank is above `15` points. A bank above `550` also triggers a toast. Crashing,
spinning below the speed threshold or leaving the track ends the chain.

Long drifts are worth much more than short ones because the combo rises up to
`×5` after eight seconds. The practical target is a single committed slide
through a corner, not a series of handbrake stabs.

## Nitro

- Every car starts with **45** nitro.
- Nitro drains at **26 units/second** while boosting.
- Boost adds acceleration and raises the speed cap by **7 m/s** temporarily.
- Drifting refills **15 units/second**.
- Checkpoints grant **+5**, a completed lap grants **+18**.
- Nitro pickups are floating NOS bottles, three across the road at each spot.
  Driving through one grants **+34** and a small forward impulse; each bottle
  respawns after **4 s**.
- Boosting is disabled while off-road.

Nitro is best used on corner exit or the long bottom straight. Using it to cover
a mistake usually costs more time than it saves.

## Handling model

The car is a point mass with a heading, not a full tire simulation. Each fixed
step:

1. Split velocity into forward and lateral components relative to the heading.
2. Smooth the steering input, then rotate the heading based on speed, steering,
   car turn rate and a high-speed damping factor.
3. Re-project the old velocity onto the **new** heading. The leftover lateral
   component is the slide.
4. Apply throttle, braking, coasting, handbrake drag, off-road drag and speed
   limits.
5. Damp lateral velocity with grip. The handbrake drops grip to 15%, which is
   what makes the rear step out.
6. Move the car, query the nearest track sample, apply off-road detection and
   clamp against the walls.
7. Derive slip, drift state, nitro gain, wheel spin and body roll/pitch.

The handbrake also multiplies steering by `1.16`, making rotation easier while
sliding. Braking while moving forward is much stronger than reverse throttle, so
trail-braking works; holding `S` from a standstill engages reverse.

### Surface and walls

- Track half-width: `7.4 m`.
- Off-road begins outside `7.55 m` from the centerline.
- Walls sit at `10.4 m`.
- Off-road limits speed to 80% (93% for SUVs and off-roaders) and applies
  extra drag and low grip.
- Wall contact projects the car back inside the corridor, reflects the normal
  velocity and damps the rest, so you scrub speed instead of sticking.

## The circuit

The sunset circuit is a closed Catmull-Rom loop generated from 28 control points.
It combines a long bottom straight, a fast right-hand sweep, a tight infield
complex and a technical back section. Landmarks include the start arch,
grandstands, light towers, palms, rocks and mesas.

The minimap is drawn from the same sampled centerline used by the physics, with
the active gate highlighted and the car shown as an arrow.

## HUD

- **Top center** — lap counter, current lap time and best lap.
- **Top left** — driver name.
- **Top right** — sound, camera and pause buttons.
- **Right** — minimap and total drift score.
- **Bottom center** — speedometer, gear and nitro bar.
- **Center** — live drift chain and score while sliding.
- **Warnings** — `WRONG WAY` appears after 0.9 s of sustained opposite travel.

## Persistence

| Key | Contents |
| --- | --- |
| `sunset-drift-profile-v1` | Driver name, selected car, per-car look data |
| `sunset-drift-best-v1` | Best lap time in seconds |

Clearing site data resets the profile. Invalid or older data is normalized on
load; unknown cars fall back to FALCON GT and invalid cosmetic values fall back
to that car's defaults.

## Practical tips

- **Look through the corner.** The chase camera follows the car's heading, not
  the velocity, so the slide angle is your steering reference.
- **Brake before the handbrake.** Pull the nose in with the brake, then use the
  handbrake to rotate; holding both through the whole corner kills exit speed.
- **Short-shift the nitro.** A small boost on exit is usually faster than one
  long boost down a straight.
- **Use the whole track.** The curbs and walls are generous; clipping an apex is
  faster than a clean but wide line.
- **KAZE S for score, VIPER X for lap times, COMET RS for the start.** FALCON GT
  is the best car to learn the circuit in.

## Planned upgrades

The upgrade tab previews the next progression layer: engine, tires, suspension
and nitro tanks, funded by credits earned from racing. The credits counter is
already present in the garage header, but it is not yet connected to a shop.
See [ROADMAP.md](ROADMAP.md) for the intended direction.
