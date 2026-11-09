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
 * Wall contact response. Only the velocity component heading into the barrier
 * is reflected (with a little restitution and an extra shove); the tangential
 * component survives, so brushing a wall never stops the car dead.
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
  const restitution = 0.18 + hit * 0.22;
  const shock = hit > 0.04 ? hit * hit * 2.6 : 0;
  const tangent = 1 - hit * 0.22;
  return {
    vx: tx * tangent - nx * (vn * restitution + shock),
    vz: tz * tangent - nz * (vn * restitution + shock),
    vn,
    hit,
    bounces: true,
  };
}
