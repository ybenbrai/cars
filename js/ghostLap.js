// Time Trial ghost: records the player's lap and replays the best one as a
// see-through car. Ghosts live in their own localStorage key per account and
// circuit (not in the cloud save) so a 20 Hz lap never bloats the sync.

const KEY = 'sunset-drift-ghost-v1';
export const GHOST_RATE = 20; // samples per second
const STEP = 1 / GHOST_RATE;
const MAX_SAMPLES = GHOST_RATE * 60 * 6; // six-minute lap cap

const ghostKey = (accountId, circuitId) => `${KEY}:${accountId}:${circuitId}`;
const round = (v, digits) => Math.round(v * digits) / digits;

/** Records one lap at a fixed rate: flat [x, z, heading, ...] triples. */
export class GhostRecorder {
  constructor() {
    this.samples = [];
    this.nextT = 0;
    this.prev = null;
  }

  start() {
    this.samples = [];
    this.nextT = 0;
    this.prev = null;
  }

  /**
   * Frames rarely land exactly on a sample slot, so each slot is filled by
   * interpolating between the previous observation and this one.
   */
  sample(lapTime, car) {
    const now = { t: lapTime, x: car.pos.x, z: car.pos.z, h: car.heading };
    const prev = this.prev || now;
    while (lapTime >= this.nextT && this.samples.length < MAX_SAMPLES * 3) {
      const span = now.t - prev.t;
      const a = span > 1e-9 ? Math.min(Math.max((this.nextT - prev.t) / span, 0), 1) : 1;
      const dh = Math.atan2(Math.sin(now.h - prev.h), Math.cos(now.h - prev.h));
      this.samples.push(
        round(prev.x + (now.x - prev.x) * a, 100),
        round(prev.z + (now.z - prev.z) * a, 100),
        round(prev.h + dh * a, 1000),
      );
      this.nextT += STEP;
    }
    this.prev = now;
  }

  /** Finish the lap: a ghost record ready to store. */
  finish(lapTime, carId, paint) {
    return { time: lapTime, carId, paint, rate: GHOST_RATE, samples: this.samples.slice() };
  }
}

export function loadGhost(accountId, circuitId) {
  try {
    const raw = JSON.parse(localStorage.getItem(ghostKey(accountId, circuitId)));
    if (!raw || !Number.isFinite(raw.time) || !Array.isArray(raw.samples) || raw.samples.length < 6) return null;
    if (raw.samples.length % 3 !== 0 || raw.rate !== GHOST_RATE) return null;
    return raw;
  } catch {
    return null;
  }
}

/** Keep the ghost only if it beats the stored one. Returns true when saved. */
export function saveGhostIfFaster(accountId, circuitId, ghost) {
  const current = loadGhost(accountId, circuitId);
  if (current && current.time <= ghost.time) return false;
  try {
    localStorage.setItem(ghostKey(accountId, circuitId), JSON.stringify(ghost));
    return true;
  } catch {
    return false;
  }
}

/** Position and heading of a ghost `t` seconds into its lap. */
export function ghostPose(ghost, t) {
  const s = ghost.samples;
  const count = s.length / 3;
  const f = Math.min(Math.max(t * ghost.rate, 0), count - 1);
  const i = Math.min(Math.floor(f), count - 2);
  const a = f - i;
  const j = i * 3;
  const dh = Math.atan2(Math.sin(s[j + 5] - s[j + 2]), Math.cos(s[j + 5] - s[j + 2]));
  return {
    x: s[j] + (s[j + 3] - s[j]) * a,
    z: s[j + 1] + (s[j + 4] - s[j + 1]) * a,
    heading: s[j + 2] + dh * a,
  };
}
