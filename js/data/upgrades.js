// Performance upgrades. Every owned car has four parts, each with three
// levels. Prices scale with the car's value, so tuning a hypercar costs far
// more than tuning the starter hatch.

export const MAX_UPGRADE_LEVEL = 3;

export const UPGRADE_PARTS = [
  {
    id: 'engine',
    name: 'ENGINE',
    levels: ['STOCK', 'STREET MAP', 'SPORT INTAKE', 'RACE BUILD'],
    blurb: 'More power and a higher top speed.',
    // Per level: +6 % acceleration, +2.5 % top speed.
    effect: (n) => ({ accel: 1 + 0.06 * n, speed: 1 + 0.025 * n }),
  },
  {
    id: 'tyres',
    name: 'TYRES',
    levels: ['STOCK', 'SPORT', 'SEMI-SLICK', 'RACE SLICK'],
    blurb: 'More grip in corners and under braking.',
    // Per level: +4 % grip (which also adds braking), +2 % turn-in.
    effect: (n) => ({ grip: 1 + 0.04 * n, turn: 1 + 0.02 * n }),
  },
  {
    id: 'brakes',
    name: 'BRAKES',
    levels: ['STOCK', 'PERFORMANCE PADS', 'BIG BRAKE KIT', 'CARBON CERAMIC'],
    blurb: 'Shorter stopping distances at every speed.',
    // Per level: +8 % brake force.
    effect: (n) => ({ brake: 1 + 0.08 * n }),
  },
  {
    id: 'nitro',
    name: 'NITRO',
    levels: ['STOCK', 'LARGER BOTTLE', 'DUAL STAGE', 'DIRECT PORT'],
    blurb: 'Stronger boost that lasts longer.',
    // Per level: +8 % boost thrust, 12 % slower burn.
    effect: (n) => ({ boost: 1 + 0.08 * n, nitroBurn: 1 - 0.12 * n }),
  },
];

// Cost of each level as a share of the car's price (cheap cars use a floor).
const LEVEL_SHARE = [0, 0.07, 0.12, 0.2];
const PRICE_FLOOR = 15000;

export function blankUpgrades() {
  return { engine: 0, tyres: 0, brakes: 0, nitro: 0 };
}

export function normalizeUpgrades(raw) {
  const out = blankUpgrades();
  if (!raw || typeof raw !== 'object') return out;
  for (const part of UPGRADE_PARTS) {
    const n = Math.round(Number(raw[part.id]));
    out[part.id] = Number.isFinite(n) ? Math.min(MAX_UPGRADE_LEVEL, Math.max(0, n)) : 0;
  }
  return out;
}

/** Price of buying `level` (1–3) of a part for this car. */
export function upgradeCost(car, level) {
  if (level < 1 || level > MAX_UPGRADE_LEVEL) return 0;
  const base = Math.max(car.price || 0, PRICE_FLOOR);
  return Math.round((base * LEVEL_SHARE[level]) / 100) * 100;
}

/** Credits already invested in this car's upgrades. */
export function upgradeValue(car, upgrades) {
  const levels = normalizeUpgrades(upgrades);
  let total = 0;
  for (const part of UPGRADE_PARTS) {
    for (let l = 1; l <= levels[part.id]; l++) total += upgradeCost(car, l);
  }
  return total;
}

/** Physics multipliers for a set of upgrade levels (all 1 when stock). */
export function upgradeMultipliers(upgrades) {
  const levels = normalizeUpgrades(upgrades);
  const m = { speed: 1, accel: 1, grip: 1, turn: 1, brake: 1, boost: 1, nitroBurn: 1 };
  for (const part of UPGRADE_PARTS) {
    for (const [key, value] of Object.entries(part.effect(levels[part.id]))) m[key] *= value;
  }
  return m;
}

/** Garage stat bars (1–10) after upgrades. */
export function upgradedStats(car, upgrades) {
  const levels = normalizeUpgrades(upgrades);
  const s = car.stats;
  const bump = (value, amount) => Math.min(10, Math.round((value + amount) * 10) / 10);
  return {
    speed: bump(s.speed, levels.engine * 0.3),
    accel: bump(s.accel, levels.engine * 0.5 + levels.nitro * 0.2),
    handling: bump(s.handling, levels.tyres * 0.4 + levels.brakes * 0.3),
    drift: s.drift,
  };
}
