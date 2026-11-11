// Track-following AI drivers. They read the circuit geometry, plan their
// speed from the car's real cornering and braking limits, and race the cars
// around them with the exact same physics as the player.
//
// Racecraft treats every nearby car alike (player, AI or online rival): they
// pass slower cars, cover the line against a car closing from behind, lean on
// a car alongside, chase nitro bottles and use nitro tactically. Nothing ever
// slows them down or speeds them up based on where the player is.

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

// Racecraft per difficulty: how hard they defend, how much they lean on a car
// alongside, how well they time nitro and how keenly they chase bottles.
const TACTICS = {
  easy: { defend: 0, lean: 0, nitro: 0.35, seek: 0.3 },
  normal: { defend: 0.45, lean: 0.25, nitro: 0.6, seek: 0.6 },
  hard: { defend: 0.85, lean: 0.7, nitro: 0.9, seek: 0.9 },
  expert: { defend: 1, lean: 1, nitro: 1, seek: 1 },
};

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
    this.tactics = TACTICS[difficulty.id] || TACTICS.normal;
    this.nitroOn = false;
    this.nitroDecideIn = 0;
    this.state = 'race'; // race | pass | defend | seek (for debugging/telemetry)
    // Where each nitro bottle sits along and across the track.
    this.bottles = (track.pads || []).map((pad) => {
      const near = track.nearest(pad.point);
      return { pad, dist: near.dist, offset: near.signed };
    });
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
    const safety = 0.8 * (0.85 + 0.15 * limit);
    const horizon = Math.min(320, car.brakeDistance(speed, 0, safety) + 25);
    let allowed = Infinity;
    for (let d = 0; d <= horizon; d += 5) {
      const k = this.curvatureAt(dist + d);
      if (k < 1e-4) continue;
      // 0.9: margin for the steering controller and the car's slip.
      const vc = this.cornerSpeed(1 / k) * 0.9 * limit;
      const v = car.maxEntrySpeed(vc, Math.max(0, d - 3), safety);
      if (v < allowed) allowed = v;
    }
    // Uncapped corner limit ahead: nitro can lift the car past `top`.
    this.cornerLimit = allowed;
    return Math.max(8, Math.min(top, allowed));
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
    const T = this.tactics;
    const aggression = this.personality.aggression;
    const edge = track.halfWidth - 1.2; // keep the whole car on the asphalt
    const length = track.length;
    const myOffset = info.signed;

    // Base racing line: personality offset with a gentle weave.
    let line = this.lineOffset + Math.sin(info.dist * 0.007 + this.phase) * 0.9;
    this.state = 'race';

    // Chase a nitro bottle when the tank is not full.
    if (car.boost < 75 && T.seek > 0) {
      let best = null;
      for (const b of this.bottles) {
        if (!b.pad.active) continue;
        const ahead = (b.dist - info.dist + length) % length;
        if (ahead < 12 || ahead > 150) continue;
        const cost = Math.abs(b.offset - this.currentLine) + ahead * 0.01;
        if (!best || cost < best.cost) best = { ...b, cost };
      }
      // Lower difficulties only go for some rows.
      if (best && ((Math.floor(best.dist) * 7 + this.seed) % 100) / 100 < T.seek) {
        line = best.offset;
        this.state = 'seek';
      }
    }

    // Racecraft against nearby cars, measured along and across the track.
    let trafficBrake = 0;
    let passLine = null;
    let defendLine = null;
    let leanLine = null;
    let attackTarget = false;
    let underAttack = false;
    for (const other of others) {
      if (other === car || !other.trackInfo) continue;
      const along = ((other.trackInfo.dist - info.dist + length * 1.5) % length) - length / 2;
      const lat = other.trackInfo.signed - myOffset;
      const closing = speed - other.speed;
      if (along > 1.5 && along < 32) {
        // Ahead of us.
        if (Math.abs(lat) < 2.7 && (closing > -0.5 || along < 9)) {
          // In our path and we are as quick or quicker: go round it on the
          // side with more room instead of queueing behind.
          const left = other.trackInfo.signed - 3.4;
          const right = other.trackInfo.signed + 3.4;
          const options = [left, right].filter((o) => Math.abs(o) <= edge);
          const pick = (options.length ? options : [Math.sign(-other.trackInfo.signed || 1) * edge])
            .sort((p, q) => Math.abs(p - this.currentLine) - Math.abs(q - this.currentLine))[0];
          if (passLine === null || along < passLine.along) passLine = { line: pick, along };
          attackTarget = true;
          if (along < 5.5 && Math.abs(lat) < 1.9 && closing > 0) {
            trafficBrake = Math.max(trafficBrake, (5.5 - along) / 5.5);
          }
        }
      } else if (along < -1.5 && along > -24) {
        // Behind us and closing: cover the line it is aiming for.
        if (T.defend > 0 && closing < 1.0) {
          underAttack = true;
          const block = this.currentLine + (other.trackInfo.signed - this.currentLine) * T.defend * (0.5 + aggression * 0.5);
          if (defendLine === null || along > defendLine.along) defendLine = { line: block, along };
        }
      } else if (Math.abs(along) <= 1.5 && Math.abs(lat) < 3.4 && T.lean > 0) {
        // Side by side: lean in to squeeze the other car towards the edge.
        underAttack = true;
        // Enough to squeeze, not ram: contact unsettles both cars.
        const push = Math.sign(lat || 1) * 0.7 * T.lean * aggression;
        leanLine = this.currentLine + push;
      }
    }
    if (passLine) {
      line = passLine.line;
      this.state = 'pass';
    } else if (leanLine !== null) {
      line = leanLine;
      this.state = 'defend';
    } else if (defendLine) {
      line = defendLine.line;
      this.state = 'defend';
    }
    line = clamp(line, -edge, edge);
    // Line changes are smooth; overtaking moves are a little quicker.
    const rate = this.state === 'pass' ? 5.5 : this.state === 'defend' ? 3.5 : 3;
    this.currentLine += (line - this.currentLine) * Math.min(1, dt * rate);

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

    // Nitro: decided a few times a second (not every frame) and only where it
    // helps: the planner says the car can still speed up, ideally on a
    // straight, or to complete a pass / hold off an attack.
    this.nitroDecideIn -= dt;
    if (this.nitroDecideIn <= 0) {
      this.nitroDecideIn = 0.4;
      // Room to accelerate before the next corner, counting the extra top
      // speed nitro gives (~7 m/s).
      const room = Math.min(this.cornerLimit ?? targetSpeed, car.maxSpeed * (car.paceScale || 1) + 7) - speed;
      const straight = curvature < 0.06 && Math.abs(diff) < 0.14;
      const tactical = (attackTarget || underAttack) && curvature < 0.16;
      const useful = car.boost > 12 && speed > car.maxSpeed * 0.35 && room > 2.5 && (straight || tactical);
      // Better drivers keep a reserve for a fight when nothing is going on.
      const reserve = !tactical && car.boost < 30 * T.nitro;
      this.nitroOn = useful && !reserve && Math.random() < 0.45 + 0.55 * T.nitro;
    }
    const boost = this.nitroOn && car.boost > 1 && !brake;

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

/**
 * Put an AI driver in a car. AI cars share the player's physics and brakes;
 * the planner's long horizon and safety margin are what keep them on the road.
 */
export function createAiDriver(car, track, difficulty, seed = 0, name = 'AI') {
  return new AIDriver(car, track, difficulty, seed, name);
}
