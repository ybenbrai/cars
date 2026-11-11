// Turn signals: when the driver commits to a turn, that side's indicators
// blink three times. Small steering corrections do not trigger them: the
// wheel must be held past THRESHOLD for HOLD seconds, and the same side only
// re-arms after the wheel has come back towards centre.

const THRESHOLD = 0.45;
const HOLD = 0.12;
const CENTRE = 0.2;
const BLINKS = 3;
const ON = 0.32;
const OFF = 0.26;

export class TurnSignals {
  constructor() {
    this.side = null; // 'left' | 'right' while blinking
    this.lit = false;
    this.t = 0;
    this.blink = 0;
    this.held = 0;
    this.heldSide = null;
    this.armed = { left: true, right: true };
  }

  /**
   * Advance by dt with the car's steering (-1 full left … +1 full right).
   * Returns { side, on } when the lamps change, otherwise null.
   */
  update(dt, steer) {
    const side = steer <= -THRESHOLD ? 'left' : steer >= THRESHOLD ? 'right' : null;
    if (Math.abs(steer) < CENTRE) this.armed = { left: true, right: true };

    if (side && side === this.heldSide) this.held += dt;
    else {
      this.held = side ? dt : 0;
      this.heldSide = side;
    }

    let change = null;
    if (side && this.held >= HOLD && this.armed[side] && this.side !== side) {
      this.side = side;
      this.armed[side] = false;
      this.blink = 0;
      this.t = 0;
      this.lit = true;
      return { side, on: true };
    }

    if (!this.side) return null;
    this.t += dt;
    if (this.lit && this.t >= ON) {
      this.lit = false;
      this.t = 0;
      this.blink++;
      change = { side: this.side, on: false };
      if (this.blink >= BLINKS) this.side = null;
    } else if (!this.lit && this.t >= OFF) {
      this.lit = true;
      this.t = 0;
      change = { side: this.side, on: true };
    }
    return change;
  }
}
