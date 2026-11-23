// Car-to-car contact uses a capsule built from a row of circles along the
// body. A single centre circle could not tell a long car's nose from its
// middle: cars sank nose-first into each other while being pushed apart too
// early when running side by side.

const DEFAULT_LENGTH = 4.2;
const DEFAULT_WIDTH = 1.8;
const CIRCLES = 3;

function carBody(car) {
  return car?.def?.body || {};
}

/**
 * Fill `out` with three circles spanning the car's length. The circles stay
 * inside the bodywork, so the capsule is an honest, slightly conservative fit
 * rather than a bubble that keeps cars visually apart.
 */
export function bodyCircles(car, out = []) {
  const body = carBody(car);
  const length = Number(body.length);
  const width = Number(body.width);
  const halfLength = Math.max(0.8, (Number.isFinite(length) ? length : DEFAULT_LENGTH) / 2);
  const radius = Math.max(0.42, (Number.isFinite(width) ? width : DEFAULT_WIDTH) / 2);
  const reach = Math.max(0, halfLength - radius);
  const heading = Number(car?.heading) || 0;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const cx = Number(car?.pos?.x) || 0;
  const cz = Number(car?.pos?.z) || 0;

  out.length = 0;
  for (let i = 0; i < CIRCLES; i++) {
    const t = i - 1; // rear, middle, front
    out.push({ x: cx + fx * reach * t, z: cz + fz * reach * t, r: radius });
  }
  return out;
}

/**
 * Deepest overlap between two circle rows. Returns the separating normal
 * (pointing from `a` towards `b`), penetration depth and a contact point, or
 * null when the bodies are clear.
 */
export function deepestContact(a, b) {
  let best = null;
  for (const ca of a) {
    for (const cb of b) {
      const dx = cb.x - ca.x;
      const dz = cb.z - ca.z;
      const sum = ca.r + cb.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= sum * sum) continue;
      const d = Math.sqrt(d2);
      const penetration = sum - d;
      if (best && penetration <= best.penetration) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      best = {
        nx,
        nz,
        penetration,
        x: (ca.x + cb.x) / 2,
        z: (ca.z + cb.z) / 2,
      };
    }
  }
  return best;
}

// A closing speed below this is a rub, not a collision. The bodies still get
// separated, but no impulse or crash effects are applied. Without this gate a
// car rubbing a rival for a second would be hit 60 times and lose all speed.
export const RUB_SPEED = 2.5;
const MAX_CONTACT_IMPULSE = 4.2; // m/s added along the contact normal
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/** 0 for a gentle rub, 0–1 for a real hit, scaled by the closing speed. */
export function contactImpulse(closingSpeed) {
  if (!Number.isFinite(closingSpeed) || closingSpeed <= RUB_SPEED) return 0;
  return clamp((closingSpeed - RUB_SPEED) / 12, 0.08, 1);
}

/**
 * Apply one contact impulse to a car-like body (`vel` is a Vector3 or any
 * `{ x, z }`). Only the velocity along the contact normal changes: a side rub
 * must not scrub away the speed the driver is carrying down the road. There is
 * deliberately no blanket damping here — repeating an impulse every physics
 * step is what used to bring both cars to a standstill.
 */
export function applyContactImpulse(car, strength, nx, nz) {
  const push = clamp(strength, 0, 1);
  if (!push) return;
  car.impact = Math.max(car.impact || 0, push);
  const impulse = push * MAX_CONTACT_IMPULSE;
  car.vel.x += nx * impulse;
  car.vel.z += nz * impulse;
}
