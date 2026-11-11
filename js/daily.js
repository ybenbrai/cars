// Daily challenge: one circuit, one loan car and three best-lap targets per
// calendar day, picked from the date so every player gets the same one.
// Each tier pays once per day (beating a higher tier pays the difference).

import { CARS } from './data/cars.js';
import { CIRCUITS } from './data/circuits.js';
import { topSpeedFor } from './vehicleMath.js';

export const DAILY_TIERS = [
  // Gold is autopilot pace: a clean, committed lap.
  { id: 'bronze', label: 'BRONZE', factor: 1.2, reward: 800 },
  { id: 'silver', label: 'SILVER', factor: 1.08, reward: 1800 },
  { id: 'gold', label: 'GOLD', factor: 1.0, reward: 3500 },
];

/** Local calendar date as YYYY-MM-DD. */
export function todayKey(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function seeded(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Autopilot best laps (s) in the FALCON GT, the reference car. Targets for
// other cars scale with top speed^0.7, fitted to autopilot laps in a slow
// hatch, a fast saloon and a muscle car.
const REFERENCE_CAR = 'falcon';
const REFERENCE_LAPS = {
  'sunset-coast': 42.57,
  'neon-city': 21.67,
  'redwood-run': 27.43,
  'dust-basin': 26.52,
  'velocity-park': 51.18,
  'alpine-pass': 28.68,
  dockyard: 31.72,
  'coral-bay': 24.45,
};

/** Expected clean best lap (s) for a car on a circuit, at autopilot pace. */
export function expectedLap(car, circuit) {
  const ref = CARS.find((c) => c.id === REFERENCE_CAR);
  const speedRatio = (topSpeedFor(ref) / topSpeedFor(car)) ** 0.7;
  const known = REFERENCE_LAPS[circuit.id];
  // Unknown (new) circuits: about 24 m/s average for the reference car.
  const base = known ?? ((circuit.lengthKm || 2) * 1000) / 24;
  return base * speedRatio;
}

export function dailyChallenge(dateKey = todayKey()) {
  const rnd = seeded(`sunset-daily:${dateKey}`);
  const circuits = CIRCUITS.filter((c) => !c.practiceOnly);
  const circuit = circuits[Math.floor(rnd() * circuits.length)];
  const car = CARS[Math.floor(rnd() * CARS.length)];
  const base = expectedLap(car, circuit);
  return {
    date: dateKey,
    circuitId: circuit.id,
    carId: car.id,
    targets: DAILY_TIERS.map((t) => ({ ...t, time: Math.round(base * t.factor * 100) / 100 })),
  };
}

/** Highest tier index (0-2) a best lap reaches, or -1. */
export function tierFor(challenge, bestLap) {
  if (!Number.isFinite(bestLap)) return -1;
  let tier = -1;
  challenge.targets.forEach((t, i) => { if (bestLap <= t.time) tier = i; });
  return tier;
}
