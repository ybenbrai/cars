// Pure handling math shared by the car, the AI and the tests.
//
// Keeping this free of Three.js means the braking, coasting and drift-entry
// model can be tested directly in Node instead of only by driving the game.

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

// Fraction of the brake force lost at top speed. It grows with the square of
// speed, so low-speed stops stay strong while a high-speed stop needs much
// more road — late braking into a corner no longer works.
export const BRAKE_FADE = 0.25;

// Steering must be held this long before it can break traction.
export const DRIFT_COMMIT_DELAY = 0.9;
export const DRIFT_COMMIT_RAMP = 1.2;
export const DRIFT_MAX = 0.75;

// Performance comes from each car's own spec sheet instead of hand-tuned
// multipliers. Listed top speeds are scaled down for the arcade circuits.
export const TOP_SPEED_SCALE = 0.82;
// Power-limited acceleration: a = POWER_K × (hp/kg) / speed. Calibrated so a
// 0.225 hp/kg coupe pulls about 0.8 g at 100 km/h and a hatch about 0.4 g.
export const POWER_K = 950;
// Traction-limited launch (m/s²) before tyre grip and drivetrain.
export const LAUNCH_ACCEL = 10.5;
const DRIVE_TRACTION = { AWD: 1.08, '4WD': 1.06, RWD: 1, FWD: 0.95 };

/** In-game top speed (m/s) for a car definition. */
export function topSpeedFor(def) {
  return (def.specs.topSpeed * TOP_SPEED_SCALE) / 3.6;
}

/** Power constant (m²/s³): drive acceleration × speed at full throttle. */
export function powerConstant(def) {
  return POWER_K * (def.specs.power / def.specs.weight);
}

/** Launch traction limit (m/s²) from tyre grip and drivetrain. */
export function launchAccel(def, grip = def.physics.grip) {
  return LAUNCH_ACCEL * grip * (DRIVE_TRACTION[def.specs.drivetrain] ?? 1);
}

/**
 * Full-throttle drive acceleration (m/s²) at a forward speed: traction-limited
 * off the line, power-limited once moving, fading to zero at top speed. Low
 * power cars feel it most at high speed, which is where real cars differ.
 */
export function driveAccel({ speed, maxSpeed, powerK, launch }) {
  const v = Math.max(0, speed);
  const n = clamp(v / maxSpeed, 0, 1);
  return Math.min(launch, powerK / Math.max(v, 1)) * (1 - n * n * n);
}

/**
 * Coasting deceleration (m/s²): engine braking + rolling resistance, plus aero
 * drag that grows with speed. It must stay weaker than the brake pedal at every
 * speed, otherwise lifting off would stop the car faster than pressing S.
 */
export function coastDrag(speed) {
  const v = Math.abs(speed);
  return 1.2 + 0.00045 * v * v;
}

/** Brake deceleration (m/s²) available at a given forward speed. */
export function brakeDecelAt(speed, maxSpeed, brakeDecel) {
  const n = clamp(Math.abs(speed) / maxSpeed, 0, 1);
  return brakeDecel * (1 - BRAKE_FADE * n * n);
}

/**
 * Distance needed to slow from `from` to `to`, integrating the speed-dependent
 * brake force above. `scale` lets the AI plan with a safety margin instead of
 * braking at the absolute limit.
 */
export function brakeDistance({ from, to = 0, maxSpeed, brakeDecel, scale = 1 }) {
  from = Math.abs(from);
  to = Math.min(Math.abs(to), maxSpeed);
  if (from <= to) return 0;
  const a0 = brakeDecel * scale;
  const vm = maxSpeed;
  const k = BRAKE_FADE;
  let distance = 0;
  if (from > vm) {
    // Above top speed the fade is capped, so the force is constant there.
    distance += (from * from - vm * vm) / (2 * a0 * (1 - k));
    from = vm;
  }
  if (from <= to) return distance;
  if (k <= 0) return distance + (from * from - to * to) / (2 * a0);
  const c = (vm * vm) / (2 * a0 * k);
  const ratio = (1 - k * (to / vm) ** 2) / (1 - k * (from / vm) ** 2);
  return distance + c * Math.log(ratio);
}

/** Fastest speed from which `target` can be reached within `distance`. */
export function maxEntrySpeed({ target, distance, maxSpeed, brakeDecel, scale = 1 }) {
  target = Math.min(Math.abs(target), maxSpeed);
  if (distance <= 0) return target;
  const a0 = brakeDecel * scale;
  const vm = maxSpeed;
  const k = BRAKE_FADE;
  let v;
  if (k <= 0) {
    v = Math.sqrt(target * target + 2 * a0 * distance);
  } else {
    const c = (vm * vm) / (2 * a0 * k);
    const remaining = 1 - k * (target / vm) ** 2;
    v = Math.sqrt(Math.max(0, (vm * vm / k) * (1 - remaining * Math.exp(-distance / c))));
  }
  return Math.min(vm, v);
}

/**
 * How committed a steering hold is to a drift (0–1). Nothing happens for
 * `DRIFT_COMMIT_DELAY`, then the rear builds out over `DRIFT_COMMIT_RAMP`.
 */
export function driftCommit(steerHold) {
  return clamp((steerHold - DRIFT_COMMIT_DELAY) / DRIFT_COMMIT_RAMP, 0, 1);
}

/**
 * Target drift state (0–1) for steering alone. A quick flick stays at zero;
 * a long, hard turn gradually loosens the rear.
 */
export function assistedDriftTarget(steerAbs, steerHold) {
  if (steerAbs <= 0.2) return 0;
  const sustain = clamp((steerAbs - 0.2) / 0.45, 0, 1);
  return DRIFT_MAX * driftCommit(steerHold) * sustain;
}

/**
 * Rev-limiter decision shared by the car, the audio engine and the HUD.
 * Sixth gear at top speed sits on the limiter; a drift can also bounce the
 * needle into the red without reaching top speed. Off-road or lifting off
 * never triggers it.
 */
export function revLimiterActive({ throttle, offroad, gear, rpm, drifting }) {
  if (!(throttle > 0) || offroad) return false;
  if (gear === 6 && rpm > 0.96) return true;
  return !!drifting && rpm > 0.86;
}

/**
 * Wall contact response. Arcade rules: the speed running along the barrier is
 * kept almost intact, and only a small slice of the normal component bounces
 * back, so a hit gives a visible recoil without throwing the car to a stop.
 *
 * `nx`/`nz` point out of the track towards the wall. Returns the new velocity,
 * the incoming normal speed, the 0–1 impact strength and whether it bounced.
 */
export function wallResponse(vx, vz, nx, nz) {
  const vn = vx * nx + vz * nz;
  if (vn <= 0) return { vx, vz, vn, hit: 0, bounces: false };
  const hit = clamp(vn / 16, 0, 1);
  const tx = vx - nx * vn;
  const tz = vz - nz * vn;
  // A scrape should not scrub a meaningful amount of road speed.
  const tangent = 1 - hit * 0.08;
  // Head-on hits bounce a little; angled hits barely push back at all.
  const restitution = 0.1 + hit * 0.16;
  const shock = hit > 0.45 ? (hit - 0.45) * 1.8 : 0;
  return {
    vx: tx * tangent - nx * (vn * restitution + shock),
    vz: tz * tangent - nz * (vn * restitution + shock),
    vn,
    hit,
    bounces: true,
  };
}

/**
 * Rotate the car towards the wall tangent after a hit, so an angled impact
 * turns into a slide along the barrier instead of pinning the nose and
 * cancelling every metre the throttle tries to make. The rotation is capped
 * per step to keep it smooth at 120 Hz.
 *
 * `tx`/`tz` are the track tangent (either direction). The car follows whichever
 * way it is actually travelling, falling back to the direction it is facing.
 */
export function wallAlign(heading, vx, vz, tx, tz, hit) {
  const along = vx * tx + vz * tz;
  let dir;
  if (Math.abs(along) > 0.4) {
    dir = along > 0 ? 1 : -1;
  } else {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    dir = fx * tx + fz * tz >= 0 ? 1 : -1;
  }
  const target = Math.atan2(tx * dir, tz * dir);
  const delta = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
  const blend = Math.min(0.5, 0.1 + hit * 0.5);
  return heading + clamp(delta * blend, -0.04, 0.04);
}
