// First-race coaching. A new driver's first race shows short tips at the
// moment they matter (go, the first fast approach to a corner, a chance to
// drift, a full nitro bar), then the camera/pause controls. It runs once.

const STEPS = [
  {
    id: 'gas',
    key: 'Hold W or ↑ to accelerate · A / D to steer',
    touch: 'Hold GAS to accelerate · ◀ ▶ to steer',
    when: (s) => s.time > 0.2,
    done: (s) => s.speedKmh > 45,
  },
  {
    id: 'brake',
    key: 'Brake with S or ↓ before the corner, not in it',
    touch: 'Tap BRAKE before the corner, not in it',
    when: (s) => s.speedKmh > 80 && s.cornerAhead,
    done: (s) => s.braking || s.stepTime > 5,
  },
  {
    id: 'drift',
    key: 'Hold SPACE in a corner to drift · drifting refills nitro',
    touch: 'Pull the HANDBRAKE in a corner to drift · drifting refills nitro',
    when: (s) => s.speedKmh > 60 && s.cornerAhead && s.sinceLast > 6,
    done: (s) => s.drifting || s.stepTime > 6,
  },
  {
    id: 'nitro',
    key: 'Nitro is ready: hold SHIFT on a straight',
    touch: 'Nitro is ready: hold N2O on a straight',
    when: (s) => s.boost >= 60 && !s.cornerAhead && s.sinceLast > 5,
    done: (s) => s.boosting || s.stepTime > 6,
  },
  {
    id: 'controls',
    key: 'C changes camera · R resets the car · ESC pauses',
    touch: '◉ changes camera · ❚❚ pauses',
    when: (s) => s.sinceLast > 6,
    done: (s) => s.stepTime > 5,
  },
];

export class Tutorial {
  constructor(touch = false) {
    this.touch = touch;
    this.index = 0;
    this.stepTime = 0;
    this.sinceLast = 0;
    this.showing = false;
    this.finished = false;
  }

  /**
   * Advance with the current race state. Returns { text } to show, { hide }
   * when a tip is done, or null when nothing changes.
   */
  update(dt, state) {
    if (this.finished) return null;
    const step = STEPS[this.index];
    if (!step) {
      this.finished = true;
      return null;
    }
    const s = { ...state, stepTime: this.stepTime, sinceLast: this.sinceLast };
    if (!this.showing) {
      this.sinceLast += dt;
      if (step.when(s)) {
        this.showing = true;
        this.stepTime = 0;
        return { text: this.touch ? step.touch : step.key, step: this.index + 1, total: STEPS.length };
      }
      return null;
    }
    this.stepTime += dt;
    if (step.done({ ...s, stepTime: this.stepTime }) && this.stepTime > 1.2) {
      this.showing = false;
      this.sinceLast = 0;
      this.index += 1;
      if (this.index >= STEPS.length) this.finished = true;
      return { hide: true };
    }
    return null;
  }
}

export const TUTORIAL_STEPS = STEPS.length;
