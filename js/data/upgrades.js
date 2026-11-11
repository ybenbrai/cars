// Performance tuning. Every owned car has nine parts, each with five
// stages. A stage's price is a share of the car's value, so building a
// hypercar costs far more than building the starter hatch. Effects multiply
// the car's own physics; a fully built car gains roughly +30 % acceleration,
// +11 % top speed, +23 % grip and +35 % braking.

export const MAX_UPGRADE_LEVEL = 5;

const pct = (n, per) => 1 + per * n;

export const UPGRADE_PARTS = [
  {
    id: 'engine',
    name: 'ENGINE',
    levels: ['STOCK', 'REMAP', 'PORTED HEAD', 'FORGED INTERNALS', 'STROKER KIT', 'RACE BLOCK'],
    blurb: 'More power across the rev range.',
    effect: (n) => ({ accel: pct(n, 0.02), speed: pct(n, 0.01) }),
  },
  {
    id: 'turbo',
    name: 'TURBO',
    levels: ['STOCK', 'BOOST CONTROLLER', 'HYBRID TURBO', 'BIG TURBO', 'TWIN SCROLL', 'TWIN TURBO'],
    blurb: 'Extra shove, strongest at high revs.',
    effect: (n) => ({ accel: pct(n, 0.016), speed: pct(n, 0.005) }),
  },
  {
    id: 'intake',
    name: 'INTAKE & EXHAUST',
    levels: ['STOCK', 'PANEL FILTER', 'COLD AIR INTAKE', 'SPORTS CAT', 'STRAIGHT PIPE', 'RACE MANIFOLD'],
    blurb: 'Lets the engine breathe: power and top speed.',
    effect: (n) => ({ accel: pct(n, 0.008), speed: pct(n, 0.006) }),
  },
  {
    id: 'gearbox',
    name: 'GEARBOX',
    levels: ['STOCK', 'SHORT SHIFTER', 'LIGHT FLYWHEEL', 'CLOSE RATIOS', 'PADDLE SHIFT', 'SEQUENTIAL'],
    blurb: 'Faster launches and quicker shifts.',
    effect: (n) => ({ launch: pct(n, 0.03), accel: pct(n, 0.005) }),
  },
  {
    id: 'weight',
    name: 'WEIGHT REDUCTION',
    levels: ['STOCK', 'SPARE WHEEL OUT', 'LIGHT SEATS', 'CARBON BONNET', 'POLYCARBONATE GLASS', 'STRIPPED SHELL'],
    blurb: 'Less mass: quicker in every direction.',
    effect: (n) => ({ accel: pct(n, 0.005), brake: pct(n, 0.01), turn: pct(n, 0.006) }),
  },
  {
    id: 'suspension',
    name: 'SUSPENSION',
    levels: ['STOCK', 'LOWERING SPRINGS', 'SPORT DAMPERS', 'COILOVERS', 'ANTI-ROLL BARS', 'RACE GEOMETRY'],
    blurb: 'Sharper turn-in and a flatter car.',
    effect: (n) => ({ turn: pct(n, 0.02), grip: pct(n, 0.012) }),
  },
  {
    id: 'tyres',
    name: 'TYRES',
    levels: ['STOCK', 'SPORT', 'PERFORMANCE', 'SEMI-SLICK', 'TRACK COMPOUND', 'RACE SLICK'],
    blurb: 'More grip in corners, off the line and under braking.',
    effect: (n) => ({ grip: pct(n, 0.03), launch: pct(n, 0.02), turn: pct(n, 0.006) }),
  },
  {
    id: 'brakes',
    name: 'BRAKES',
    levels: ['STOCK', 'PERFORMANCE PADS', 'BRAIDED LINES', 'DRILLED DISCS', 'BIG BRAKE KIT', 'CARBON CERAMIC'],
    blurb: 'Shorter stopping distances at every speed.',
    effect: (n) => ({ brake: pct(n, 0.05) }),
  },
  {
    id: 'nitro',
    name: 'NITRO',
    levels: ['STOCK', 'LARGER BOTTLE', 'WET SHOT', 'DUAL STAGE', 'DIRECT PORT', 'RACE SYSTEM'],
    blurb: 'Stronger boost that lasts longer.',
    effect: (n) => ({ boost: pct(n, 0.07), nitroBurn: 1 - 0.08 * n }),
  },
];

// Cost of each stage as a share of the car's price (cheap cars use a floor).
// A full build is about 2.8x the car's price.
const LEVEL_SHARE = [0, 0.02, 0.035, 0.055, 0.08, 0.12];
const PRICE_FLOOR = 15000;

export function blankUpgrades() {
  return Object.fromEntries(UPGRADE_PARTS.map((p) => [p.id, 0]));
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

/** Price of buying stage `level` (1–5) of a part for this car. */
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
  const m = { speed: 1, accel: 1, launch: 1, grip: 1, turn: 1, brake: 1, boost: 1, nitroBurn: 1 };
  for (const part of UPGRADE_PARTS) {
    for (const [key, value] of Object.entries(part.effect(levels[part.id]))) m[key] *= value;
  }
  return m;
}

/** Garage stat bars (1–10) after upgrades. */
export function upgradedStats(car, upgrades) {
  const m = upgradeMultipliers(upgrades);
  const s = car.stats;
  const bump = (value, amount) => Math.min(10, Math.round((value + amount) * 10) / 10);
  return {
    speed: bump(s.speed, (m.speed - 1) * 25),
    accel: bump(s.accel, (m.accel - 1) * 10 + (m.launch - 1) * 3),
    handling: bump(s.handling, (m.grip - 1) * 6 + (m.turn - 1) * 6 + (m.brake - 1) * 2),
    drift: s.drift,
  };
}

/**
 * Performance rating (PR): one number for how quick a car is, so a tuned
 * cheap car can be compared with a stock expensive one.
 */
export function performanceRating(car, upgrades) {
  const s = upgradedStats(car, upgrades);
  return Math.round((s.speed * 1.2 + s.accel * 1.1 + s.handling) * 25);
}
