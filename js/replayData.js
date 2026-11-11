// Race replay recording: every local car's position and heading at a fixed
// rate, stored as flat arrays (one per car) so a long race stays small.

export const REPLAY_RATE = 15; // samples per second
const STEP = 1 / REPLAY_RATE;
const MAX_SECONDS = 15 * 60;

export class ReplayRecorder {
  constructor(count) {
    this.tracks = Array.from({ length: count }, () => []);
    this.nextT = 0;
    this.frames = 0;
  }

  /** Record `cars` (objects with pos.x, pos.z, heading) at race time t. */
  sample(t, cars) {
    if (this.frames >= MAX_SECONDS * REPLAY_RATE) return;
    while (t >= this.nextT) {
      cars.forEach((car, i) => {
        this.tracks[i].push(
          Math.round(car.pos.x * 100) / 100,
          Math.round(car.pos.z * 100) / 100,
          Math.round(car.heading * 1000) / 1000,
        );
      });
      this.nextT += STEP;
      this.frames += 1;
    }
  }

  get duration() {
    return Math.max(0, (this.frames - 1) * STEP);
  }
}

/** Interpolated { x, z, heading, speed } of car `i` at time t. */
export function replayPose(rec, i, t) {
  const s = rec.tracks[i];
  const count = s.length / 3;
  if (count === 0) return null;
  const f = Math.min(Math.max(t * REPLAY_RATE, 0), count - 1);
  const k = Math.min(Math.floor(f), Math.max(0, count - 2));
  const a = count > 1 ? f - k : 0;
  const j = k * 3;
  const n = count > 1 ? j + 3 : j;
  const dh = Math.atan2(Math.sin(s[n + 2] - s[j + 2]), Math.cos(s[n + 2] - s[j + 2]));
  const speed = Math.hypot(s[n] - s[j], s[n + 1] - s[j + 1]) * REPLAY_RATE;
  return {
    x: s[j] + (s[n] - s[j]) * a,
    z: s[j + 1] + (s[n + 1] - s[j + 1]) * a,
    heading: s[j + 2] + dh * a,
    speed,
  };
}
