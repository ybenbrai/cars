// Track-following AI drivers. They read the circuit geometry, plan a racing
// line, avoid the car ahead and use the exact same physics as the player.
//
// They never read or follow the player's position: every decision comes from
// the circuit, their own pace target and nearby traffic.

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export const AI_NAMES = [
  'M. VOSS', 'R. KAI', 'S. OKADA', 'L. BRANT', 'N. DIAZ',
  'A. VOLKOV', 'T. REYES', 'J. HALE', 'K. MORI', 'D. CROSS',
];

const PERSONALITIES = [
  { id: 'clean', line: -1.5, aggression: 0.4, boost: 0.7 },
  { id: 'late', line: 0.8, aggression: 0.8, boost: 0.9 },
  { id: 'wide', line: 1.9, aggression: 0.5, boost: 0.6 },
  { id: 'inside', line: -2.1, aggression: 0.7, boost: 0.8 },
  { id: 'drift', line: 0.2, aggression: 0.9, boost: 0.55 },
  { id: 'metronome', line: 1.2, aggression: 0.3, boost: 0.75 },
];

// How close to the car's real cornering limit each difficulty drives
// (1 = the physical limit), and how late it brakes.
const LIMIT = { easy: 0.72, normal: 0.84, hard: 0.93, expert: 1.0 };

export class AIDriver {
  constructor(car, track, difficulty, seed = 0, name = 'AI') {
    this.car = car;
    this.track = track;
    this.difficulty = difficulty;
    this.name = name;
    this.personality = PERSONALITIES[seed % PERSONALITIES.length];
    this.seed = seed;
    this.phase = seed * 1.7;
    this.lineOffset = this.personality.line;
    this.steerGain = difficulty.steer * (0.94 + ((seed * 37) % 13) / 100);
    this.mistakeTimer = 0;
    this.mistakeCooldown = 2 + (seed % 5);
    this.stuckTimer = 0;
    this.reverseTimer = 0;
    this.input = { gas: false, brake: false, steer: 0, handbrake: false, boost: false };
    this.currentLine = this.lineOffset;
    car.paceScale = difficulty.pace * (0.98 + ((seed * 53) % 9) / 200);
  }

  get speed() { return this.car.speed; }

  /** Signed heading change per metre of track around distance `d`. */
  curvatureAt(d) {
    const a = this.track.sampleAt(d - 5).tangent;
    const b = this.track.sampleAt(d + 5).tangent;
    return Math.abs(wrap(Math.atan2(b.x, b.z) - Math.atan2(a.x, a.z))) / 10;
  }

  /**
   * Fastest speed the car can hold on a bend of radius `r`. In this physics
   * the turn is limited by the steering yaw rate, which fades with speed:
   * yaw = turnRate * (1 - 0.34 v / vMax), and a circle needs yaw = v / r.
   */
  cornerSpeed(r) {
    const t = this.car.turnRate;
    const vMax = this.car.maxSpeed;
    return (t * r) / (1 + (0.34 * t * r) / vMax);
  }

  /**
   * Target speed now: the minimum, over the track ahead, of each point's
   * corner speed plus what the brakes can shed before reaching it.
   */
  planSpeed(dist, speed) {
    const car = this.car;
    const limit = LIMIT[this.difficulty.id] ?? 0.85;
    const top = car.maxSpeed * (car.paceScale || 1);
    // Plan with slightly faded brakes so the car is never caught out.
    const decel = (car.brakeDecel || 20) * 0.8 * (0.85 + 0.15 * limit);
    const horizon = Math.min(240, (speed * speed) / (2 * decel) + 25);
    let allowed = top;
    for (let d = 0; d <= horizon; d += 5) {
      const k = this.curvatureAt(dist + d);
      if (k < 1e-4) continue;
      // 0.9: margin for the steering controller and the car's slip.
      const vc = this.cornerSpeed(1 / k) * 0.9 * limit;
      const v = Math.sqrt(vc * vc + 2 * decel * Math.max(0, d - 3));
      if (v < allowed) allowed = v;
    }
    return Math.max(8, allowed);
  }

  update(dt, others = []) {
    const car = this.car;
    const track = this.track;
    const info = car.trackInfo || track.nearest(car.pos);
    car.trackInfo = info;

    const speed = car.speed;
    const lookAhead = 7.5 + speed * 0.72;
    const sample = track.sampleAt(info.dist + lookAhead);
    const far = track.sampleAt(info.dist + lookAhead + 18);
    const veryFar = track.sampleAt(info.dist + lookAhead + 36);

    // Racing line: gentle, speed-dependent drift from the centre plus a fixed
    // personality offset. This alone never makes them follow the player.
    let line = this.lineOffset + Math.sin(info.dist * 0.007 + this.phase) * 0.9;

    // Traffic avoidance: look at nearby cars that are ahead on track.
    let trafficBrake = 0;
    let avoid = 0;
    for (const other of others) {
      if (other === car) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 14) continue;
      const forwardDot = (dx * car.forward.x + dz * car.forward.z) / (dist || 1);
      if (forwardDot < 0.35) continue;
      const side = dx * car.right.x + dz * car.right.z;
      if (Math.abs(side) > 3.2) continue;
      avoid += side >= 0 ? -1.7 : 1.7;
      if (dist < 6.5 && speed > other.speed - 1) trafficBrake = Math.max(trafficBrake, (6.5 - dist) / 6.5);
    }
    line += clamp(avoid, -2.4, 2.4);
    this.currentLine += (line - this.currentLine) * Math.min(1, dt * 4);

    const targetX = sample.point.x + sample.side.x * this.currentLine;
    const targetZ = sample.point.z + sample.side.z * this.currentLine;
    const desiredHeading = Math.atan2(targetX - car.pos.x, targetZ - car.pos.z);
    const diff = wrap(desiredHeading - car.heading);
    let steer = clamp(-diff * 2.35 * this.steerGain, -1, 1);

    // Curvature: compare headings over the next 50 m (used for nitro).
    const h1 = Math.atan2(far.tangent.x, far.tangent.z);
    const h2 = Math.atan2(veryFar.tangent.x, veryFar.tangent.z);
    const curvature = Math.abs(wrap(h2 - h1));
    const localCurve = Math.abs(diff);

    let targetSpeed = this.planSpeed(info.dist, speed);
    // Far off the intended line (after contact, a spin): back off until settled.
    if (localCurve > 0.3) targetSpeed *= clamp(1 - (localCurve - 0.3) * 0.9, 0.45, 1);

    // Mistake modelling: occasional lift, more frequent on easy.
    this.mistakeCooldown -= dt;
    if (this.mistakeCooldown <= 0) {
      this.mistakeCooldown = 4 + (this.seed % 7) * 1.3;
      if (Math.random() < this.difficulty.mistakes) this.mistakeTimer = 0.35 + Math.random() * 0.55;
    }
    if (this.mistakeTimer > 0) {
      this.mistakeTimer -= dt;
      targetSpeed *= 0.72;
    }

    // Stuck recovery: if we have been crawling, reverse for a moment.
    if (speed < 2.2) this.stuckTimer += dt;
    else this.stuckTimer = 0;
    if (this.stuckTimer > 1.6) {
      this.reverseTimer = 0.9;
      this.stuckTimer = 0;
    }

    const gas = speed < targetSpeed - 0.4;
    const brake = speed > targetSpeed + 1.2 || trafficBrake > 0.45;
    const handbrake = this.personality.id === 'drift'
      && localCurve > 0.5
      && speed > 16
      && this.difficulty.pace > 0.85;

    const straight = curvature < 0.055 && Math.abs(diff) < 0.12;
    const boost = straight
      && car.boost > 28
      && speed > car.maxSpeed * 0.48
      && Math.random() < this.personality.boost * 0.7;

    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      this.input.gas = false;
      this.input.brake = true;
      this.input.steer = -steer;
      this.input.handbrake = false;
      this.input.boost = false;
    } else {
      this.input.gas = gas;
      this.input.brake = brake;
      this.input.steer = steer;
      this.input.handbrake = handbrake;
      this.input.boost = boost;
    }
    return this.input;
  }
}
