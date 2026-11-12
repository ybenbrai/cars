// Lap-time sanity checks shared by the leaderboards and online results.
// A lap is "plausible" when it is no faster than the fastest car in the game,
// fully tuned, could drive it. Two limits, the stricter wins:
//  - physics: circuit length at the top speed of the fastest build + nitro;
//  - pace: the measured autopilot lap (daily.js) scaled to the fastest build,
//    with a generous margin for players who beat the autopilot.

import { CARS } from './data/cars.js';
import { CIRCUITS } from './data/circuits.js';
import { topSpeedFor } from './vehicleMath.js';
import { UPGRADE_PARTS, MAX_UPGRADE_LEVEL, upgradeMultipliers } from './data/upgrades.js';
import { expectedLap } from './daily.js';

const FULL_BUILD = Object.fromEntries(UPGRADE_PARTS.map((p) => [p.id, MAX_UPGRADE_LEVEL]));
const FASTEST = CARS.reduce((a, c) => (topSpeedFor(c) > topSpeedFor(a) ? c : a), CARS[0]);
const VMAX = topSpeedFor(FASTEST) * upgradeMultipliers(FULL_BUILD).speed + 7;
// A skilled player may beat the autopilot by up to ~35%.
const PACE_MARGIN = 0.65;

const floors = new Map();

/** Fastest believable lap (seconds) on a circuit. */
export function minimumLap(circuitId) {
  if (floors.has(circuitId)) return floors.get(circuitId);
  const circuit = CIRCUITS.find((c) => c.id === circuitId);
  if (!circuit) return Infinity;
  const physics = circuit.length / VMAX;
  const pace = expectedLap(FASTEST, circuit) / upgradeMultipliers(FULL_BUILD).speed * PACE_MARGIN;
  const floor = Math.max(physics, pace);
  floors.set(circuitId, floor);
  return floor;
}

export function plausibleLap(circuitId, time) {
  return Number.isFinite(time) && time >= minimumLap(circuitId) && time < 3600;
}
