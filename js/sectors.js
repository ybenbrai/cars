// Per-lap sector timing. Sectors are equal thirds of the circuit distance so
// every layout gets them without circuit-specific metadata. Distances come from
// the car's `trackInfo.dist`; lap boundaries are reported separately by the
// finish-line crossing, which keeps this module free of wrap-direction guesses.

export const SECTOR_COUNT = 3;

/** Track distances where sector 1→2 and 2→3 change. */
export function sectorBoundaries(length) {
  if (!Number.isFinite(length) || length <= 0) return [];
  return [length / SECTOR_COUNT, (length * (SECTOR_COUNT - 1)) / SECTOR_COUNT];
}

/** Which third of the lap a distance falls in (0, 1 or 2). */
export function sectorFor(dist, length) {
  if (!Number.isFinite(dist) || !Number.isFinite(length) || length <= 0) return 0;
  const d = ((dist % length) + length) % length;
  return Math.min(SECTOR_COUNT - 1, Math.floor(d / (length / SECTOR_COUNT)));
}

/** Sanitize stored or caller-supplied sector times into a fixed-length list. */
export function cleanSectors(values) {
  const out = Array(SECTOR_COUNT).fill(null);
  if (!Array.isArray(values)) return out;
  for (let i = 0; i < SECTOR_COUNT; i++) {
    const t = values[i];
    if (Number.isFinite(t) && t > 0) out[i] = t;
  }
  return out;
}

export class SectorTimer {
  constructor(length, best = null) {
    this.length = Number.isFinite(length) && length > 0 ? length : 0;
    this.boundaries = sectorBoundaries(this.length);
    this.best = cleanSectors(best);
    this.reset();
  }

  reset() {
    this.sector = 0;
    this.sectorStart = null;
    this.prevDist = null;
    this.current = Array(SECTOR_COUNT).fill(null);
    this.last = Array(SECTOR_COUNT).fill(null);
  }

  /** Start timing at the line. The grid sits behind it, so the first crossing
   *  is lap 1's real start rather than a lap boundary. Passing the current
   *  distance seeds the crossing detector so no genuine split is missed. */
  start(time, dist = null) {
    this.reset();
    this.sectorStart = Number.isFinite(time) ? time : 0;
    if (Number.isFinite(dist)) this.prevDist = dist;
  }

  get started() {
    return this.sectorStart != null;
  }

  elapsed(time) {
    if (!this.started || !Number.isFinite(time)) return null;
    return Math.max(0, time - this.sectorStart);
  }

  complete(index, time) {
    const split = this.elapsed(time);
    if (split == null || index < 0 || index >= SECTOR_COUNT) return false;
    this.current[index] = split;
    const previous = this.best[index];
    const improved = previous == null || split < previous;
    if (improved) this.best[index] = split;
    return improved;
  }

  /** Feed the player's track distance. Returns true when the split just closed
   *  beat the stored best. Teleports are ignored, not read as lap crossings. */
  update(dist, time) {
    if (!this.started || !Number.isFinite(dist)) return false;
    const prev = this.prevDist;
    this.prevDist = dist;
    if (prev == null || this.length <= 0) return false;
    // Respawns and QA teleports jump far more than a car can travel in a step.
    if (Math.abs(dist - prev) > this.length * 0.5) return false;
    const boundary = this.boundaries[this.sector];
    if (boundary == null || prev >= boundary || dist < boundary) return false;
    const improved = this.complete(this.sector, time);
    this.sector += 1;
    this.sectorStart = Number.isFinite(time) ? time : this.sectorStart;
    return improved;
  }

  /** Close the final sector at the flag and rotate the splits. Call on every
   *  crossing after the first; the first one starts the lap instead. */
  finishLap(time) {
    if (!this.started) return false;
    if (this.sector < SECTOR_COUNT) this.complete(this.sector, time);
    this.last = this.current;
    this.current = Array(SECTOR_COUNT).fill(null);
    this.sector = 0;
    this.sectorStart = Number.isFinite(time) ? time : this.sectorStart;
    return true;
  }

  /** True when a completed split on this lap is a personal best. */
  isBest(index) {
    const t = this.current[index];
    return t != null && this.best[index] === t;
  }
}
