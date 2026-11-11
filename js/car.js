import * as THREE from 'three';
import { CarModel } from './carModel.js';
import {
  brakeDecelAt,
  brakeDistance,
  coastDrag,
  maxEntrySpeed,
  assistedDriftTarget,
  revLimiterActive,
  wallResponse,
  wallAlign,
  driveAccel,
  launchAccel,
  powerConstant,
  topSpeedFor,
} from './vehicleMath.js';
import { upgradeMultipliers } from './data/upgrades.js';

const BASE = {
  maxSpeed: 56,
  power: 21,
  brake: 34, // reversing / low-speed only; see `brakeDecel` for real braking
  reverseMax: 12,
  turn: 1.8,
  grip: 10.5,
  offroadGrip: 5.6,
  boostPower: 16,
};

// Brake fade, coasting drag and drift-entry timing live in vehicleMath.js so
// the car, the AI and the tests share the exact same curves.

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export class Car {
  constructor(scene, def, look, upgrades = null) {
    this.def = def;
    // Upgrades scale the car's own physics, so every system (AI planning,
    // braking maths, HUD) sees the tuned car without special cases.
    const m = upgradeMultipliers(upgrades);
    this.upgrades = upgrades;
    this.physics = {
      ...def.physics,
      speed: def.physics.speed * m.speed,
      accel: def.physics.accel * m.accel,
      grip: def.physics.grip * m.grip,
      turn: def.physics.turn * m.turn,
      boost: def.physics.boost * m.boost,
    };
    this.nitroBurn = 26 * m.nitroBurn;
    this.brakeUpgrade = m.brake;
    this.model = new CarModel(def, look);
    this.group = this.model.root;
    scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    // Physics runs at a fixed 120 Hz but frames arrive whenever the display
    // refreshes, so a frame can see 0, 1 or 2 steps. Drawing the car at the
    // raw step position made it judder against the camera; instead the
    // renderer blends between the previous and current step (`interpolate`).
    this.prevPos = new THREE.Vector3();
    this.prevHeading = 0;
    this.renderPos = new THREE.Vector3();
    this.renderForward = new THREE.Vector3(0, 0, 1);
    this.forward = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(-1, 0, 0);
    this.heading = 0;
    this.steer = 0;
    this.speed = 0;
    this.slip = 0;
    this.lateral = 0;
    this.drifting = false;
    this.boost = 45;
    this.boosting = false;
    this.impact = 0;
    this.wallHit = 0;
    this.wallNormal = { x: 0, z: 0 };
    this.damage = 0;
    this.offroad = false;
    this.trackInfo = null;
    this.wheelSpin = 0;
    this.prevSpeed = 0;
    this.roll = 0;
    this.pitch = 0;
    this.braking = false;
    this.throttle = 0;
    this.liftOff = false;
    this.paceScale = 1;
    this.isPlayer = false;
    // Drift state 0–1. Rises with the handbrake or with hard steering at speed
    // (player cars only, see `driftAssist`), and is sustained by keeping the
    // throttle and steering into the corner, so a drift can be held through
    // a bend instead of ending the moment the handbrake is released.
    this.driftHold = 0;
    // How long the driver has held a hard steering input. Steering alone only
    // breaks traction after a sustained hold, not on a quick flick.
    this.steerHold = 0;
    this.driftAssist = false;
    // Off-road ability: rugged cars barely notice dirt.
    const rugged = def.category === 'offroad' || def.category === 'suv';
    this.offroadPace = rugged ? 0.93 : 0.8;
    // Braking: about 1.2 g for a sports car, scaled by tyre grip; heavy
    // SUVs, off-roaders and muscle cars stop noticeably later. The force also
    // fades with speed (see `brakeDecelAt`), so a high-speed stop needs much
    // more road than a low-speed one.
    const heavy = rugged || def.category === 'muscle';
    this.brakeDecel = 11.5 * this.physics.grip * (heavy ? 0.86 : 1) * this.brakeUpgrade;
    // Wheel lock: a long, hard stop from high speed locks the tyres. Locked
    // tyres stop less well, barely steer and let the car slide.
    this.locked = false;
    this.canLock = false; // player cars only; AI drivers never lock up
    this.brakeHeld = 0;
    this.offroadDrag = rugged ? 0.1 : 0.25;

    // Top speed and pull come from the spec sheet (power, weight, listed
    // top speed, drivetrain); upgrades scale them.
    this.maxSpeed = topSpeedFor(def) * m.speed;
    this.powerK = powerConstant(def) * m.accel;
    this.launch = launchAccel(def, this.physics.grip) * m.launch;
    this.turnRate = BASE.turn * this.physics.turn;
    this.grip = BASE.grip * this.physics.grip;
    this.driftThreshold = 6.5 * this.physics.slide;
  }

  reset(point, tangent) {
    this.pos.set(point.x, 0, point.z);
    this.vel.set(0, 0, 0);
    this.heading = Math.atan2(tangent.x, tangent.z);
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.right.set(-Math.cos(this.heading), 0, Math.sin(this.heading));
    this.steer = 0;
    this.speed = 0;
    this.slip = 0;
    this.lateral = 0;
    this.drifting = false;
    this.boosting = false;
    this.boost = 45;
    this.impact = 0;
    this.wallHit = 0;
    this.wallNormal.x = 0;
    this.wallNormal.z = 0;
    this.damage = 0;
    this.offroad = false;
    this.trackInfo = null;
    this.wheelSpin = 0;
    this.prevSpeed = 0;
    this.driftHold = 0;
    this.steerHold = 0;
    this.locked = false;
    this.brakeHeld = 0;
    this.model.setBodyTilt(0, 0);
    this.model.setSteer(0);
    this.model.setSpin(0);
    this.model.setDamage(0);
    this.syncTransform();
    this.prevPos.copy(this.pos);
    this.prevHeading = this.heading;
  }

  enableHeadlights() {
    this.model.enableHeadlights();
  }

  syncTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
    this.renderPos.copy(this.pos);
    this.renderForward.copy(this.forward);
  }

  /** Place the model `alpha` (0–1) of the way from the last step to this one. */
  interpolate(alpha) {
    const a = Math.min(1, Math.max(0, alpha));
    this.renderPos.lerpVectors(this.prevPos, this.pos, a);
    const dh = Math.atan2(Math.sin(this.heading - this.prevHeading), Math.cos(this.heading - this.prevHeading));
    const h = this.prevHeading + dh * a;
    this.group.position.copy(this.renderPos);
    this.group.rotation.y = h;
    this.renderForward.set(Math.sin(h), 0, Math.cos(h));
  }

  /**
   * Brake deceleration (m/s²) available at a given forward speed. Tyres can
   * only shed so much energy, so the force fades towards top speed: a stop
   * from 200 km/h takes far more road than twice the distance from 100 km/h.
   */
  brakeDecelAt(speed) {
    return brakeDecelAt(speed, this.maxSpeed, this.brakeDecel);
  }

  /**
   * Distance needed to slow from `from` to `to`, integrating the speed-
   * dependent brake force above. `scale` lets the AI plan with a safety
   * margin instead of braking at the absolute limit.
   */
  brakeDistance(from, to, scale = 1) {
    return brakeDistance({ from, to, maxSpeed: this.maxSpeed, brakeDecel: this.brakeDecel, scale });
  }

  /** Fastest speed from which `target` can be reached within `distance`. */
  maxEntrySpeed(target, distance, scale = 1) {
    return maxEntrySpeed({ target, distance, maxSpeed: this.maxSpeed, brakeDecel: this.brakeDecel, scale });
  }

  /** Collision response used by the race director for car-to-car contact. */
  takeHit(strength, nx = 0, nz = 0) {
    const push = clamp(strength, 0, 1);
    this.damage = clamp(this.damage + push * 0.16, 0, 1);
    this.impact = Math.max(this.impact, push);
    this.vel.x += nx * push * 5.5;
    this.vel.z += nz * push * 5.5;
    this.vel.multiplyScalar(0.94);
    this.model.setDamage(this.damage);
  }

  update(dt, input, track) {
    this.prevPos.copy(this.pos);
    this.prevHeading = this.heading;
    this.wallHit = 0;
    const p = this.physics;
    const pace = this.paceScale || 1;
    const f0x = Math.sin(this.heading);
    const f0z = Math.cos(this.heading);
    let vF = this.vel.x * f0x + this.vel.z * f0z;
    const r0x = -Math.cos(this.heading);
    const r0z = Math.sin(this.heading);
    let vR = this.vel.x * r0x + this.vel.z * r0z;

    const throttle = input.gas ? 1 : 0;
    this.liftOff = this.throttle === 1 && throttle === 0; // for exhaust pops
    this.throttle = throttle;
    const brake = input.brake ? 1 : 0;
    const handbrake = !!input.handbrake;
    const steerTarget = input.steer;
    this.steer = damp(this.steer, steerTarget, steerTarget === 0 ? 9 : 11, dt);

    const speedN = clamp(Math.abs(vF) / this.maxSpeed, 0, 1);
    const speedSteer = clamp(Math.abs(vF) / 14, 0, 1);
    const highSpeedDamp = 1 - 0.34 * speedN;

    // ── drift state
    const speedAbs = Math.abs(vF);
    const steerAbs = Math.abs(this.steer);
    // Steering alone does not snap the car sideways: the driver must hold a
    // hard line for about a second before the rear starts to step out.
    const hardSteer = throttle && !brake && !this.offroad && speedAbs > 13 && steerAbs > 0.45;
    this.steerHold = hardSteer ? this.steerHold + dt : Math.max(0, this.steerHold - 3 * dt);
    if (handbrake && speedAbs > 8) {
      // The handbrake is still the instant way to start a slide.
      this.driftHold = Math.min(1, this.driftHold + 4 * dt);
      // A handbrake slide counts as a committed line, so it can be caught by
      // the throttle and steering once `Space` is released.
      if (steerAbs > 0.2) this.steerHold = Math.min(2.1, this.steerHold + 2 * dt);
    } else if (this.driftAssist && throttle && !brake && !this.offroad && speedAbs > 13) {
      if (steerAbs > 0.2) {
        // 0 until the line has been held for ~0.9 s, then builds over the next
        // 1.2 s: a long sweeper gradually loosens the rear, while a quick
        // direction change keeps full grip.
        const target = assistedDriftTarget(steerAbs, this.steerHold);
        const rate = target > this.driftHold ? 1.1 : 1.6;
        this.driftHold += clamp(target - this.driftHold, -rate * dt, rate * dt);
      } else {
        this.driftHold = Math.max(0, this.driftHold - 1.6 * dt);
      }
    } else {
      // Straightening the wheel or braking regains grip quickly; otherwise
      // the slide fades out gradually.
      const fade = steerAbs < 0.2 || brake ? 2.6 : 1.1;
      this.driftHold = Math.max(0, this.driftHold - fade * dt);
    }
    // ── wheel lock
    this.brakeHeld = brake && vF > 0.4 ? this.brakeHeld + dt : 0;
    if (!this.locked && this.canLock && brake && vF > this.maxSpeed * 0.62 && this.brakeHeld > 0.35) {
      this.locked = true;
    } else if (this.locked && (!brake || vF < this.maxSpeed * 0.3)) {
      // Easing off the pedal (or scrubbing enough speed) lets the tyres roll.
      this.locked = false;
    }
    // Locked: steering still swings the body round, but with almost no
    // sideways grip the car keeps travelling the old way, so it slides.
    const driftSteer = (handbrake ? 1.16 : 1 + 0.18 * this.driftHold) * (this.locked ? 0.75 : 1);
    const dir = vF < -0.2 ? -1 : 1;
    const yaw = -this.steer * this.turnRate * speedSteer * highSpeedDamp * driftSteer * dir;
    this.heading += yaw * dt;

    // Re-project the old velocity onto the new heading (this is what makes the car slide).
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const rx = -Math.cos(this.heading);
    const rz = Math.sin(this.heading);
    this.forward.set(fx, 0, fz);
    this.right.set(rx, 0, rz);

    vF = this.vel.x * fx + this.vel.z * fz;
    vR = this.vel.x * rx + this.vel.z * rz;
    let nF = vF;
    let nR = vR;

    this.boosting = !!input.boost && this.boost > 0.5 && !this.offroad;
    if (this.boosting) {
      this.boost = Math.max(0, this.boost - this.nitroBurn * dt);
      nF += BASE.boostPower * p.boost * pace * dt;
    }

    const offroad = this.offroad;
    const damagePenalty = 1 - this.damage * 0.16;
    const maxNow = this.maxSpeed * pace * damagePenalty * (offroad ? this.offroadPace : 1) + (this.boosting ? 7 : 0);

    if (throttle) {
      if (nF < -0.5) {
        nF = Math.min(0, nF + BASE.brake * dt);
      } else {
        const drive = driveAccel({
          speed: nF, maxSpeed: maxNow, powerK: this.powerK, launch: this.launch,
        });
        nF += drive * pace * (this.boosting ? 1.45 : 1) * damagePenalty * dt;
      }
    }
    if (brake) {
      if (nF > 0.4) {
        // The brake force fades with speed, so stopping from 200 km/h takes
        // far more road than twice the distance from 100 km/h.
        const force = this.brakeDecelAt(nF) * (this.locked ? 0.82 : 1);
        nF = Math.max(0, nF - force * dt);
      } else {
        nF -= 9 * (1 - clamp(-nF / BASE.reverseMax, 0, 1)) * dt;
      }
    }
    if (!throttle && !brake) {
      // Coasting is engine braking + rolling resistance, plus aero drag that
      // grows with speed. It must never slow the car faster than the pedal.
      const drag = coastDrag(nF);
      const sign = Math.sign(nF);
      nF -= sign * Math.min(Math.abs(nF) / Math.max(dt, 1e-4), drag) * dt;
    }
    if (handbrake) {
      nF *= Math.exp(-0.35 * dt);
    }
    if (offroad) {
      nF *= Math.exp(-this.offroadDrag * dt);
    }
    // Over the current limit (dirt, damage, nitro ending): bleed speed off
    // over a second or two instead of snapping down to the limit.
    if (nF > maxNow + 1.5) nF -= (nF - maxNow) * 1.6 * dt;
    nF = clamp(nF, -BASE.reverseMax, this.maxSpeed * 1.6);

    // Locked tyres have little sideways grip either: any cornering speed
    // turns into a slide.
    const baseGrip = (offroad ? BASE.offroadGrip : this.grip) * (this.locked ? 0.16 : 1);
    const slideGrip = handbrake ? BASE.grip * 0.15 * p.slide : BASE.grip * 0.3 * p.slide;
    const grip = baseGrip + (Math.min(baseGrip, slideGrip) - baseGrip) * this.driftHold;
    nR *= Math.exp(-grip * dt);
    nR = clamp(nR, -22, 22);

    this.vel.set(fx * nF + rx * nR, 0, fz * nF + rz * nR);
    this.pos.addScaledVector(this.vel, dt);

    const near = track.nearest(this.pos, this.trackInfo?.index);
    this.trackInfo = near;
    // Kerbs are part of the track; only the dirt beyond them is off-road.
    this.offroad = Math.abs(near.signed) > (track.curbOuter ?? track.halfWidth + 1.2) + 0.1;

    const limit = track.wallOffset - 0.95;
    if (Math.abs(near.signed) > limit) {
      const sign = Math.sign(near.signed);
      const nx = near.side.x * sign;
      const nz = near.side.z * sign;
      this.pos.set(
        near.point.x + near.side.x * sign * limit,
        0,
        near.point.z + near.side.z * sign * limit,
      );
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn > 0) {
        // Reflect only the part of the velocity going into the wall. The rest
        // keeps sliding along it, so brushing a barrier does not stop the car
        // dead. A short extra shove provides the visible recoil.
        const bounce = wallResponse(this.vel.x, this.vel.z, nx, nz);
        this.vel.x = bounce.vx;
        this.vel.z = bounce.vz;
        this.wallHit = bounce.hit;
        this.wallNormal.x = nx;
        this.wallNormal.z = nz;
        // Turn the nose down the barrier: without this the car keeps driving
        // into the wall, every frame cancels the throttle, and the hit feels
        // as if the car has stopped dead. The rotation is deliberately small
        // per step so a scrape slides instead of snapping.
        if (near.tangent) {
          this.heading = wallAlign(
            this.heading,
            this.vel.x,
            this.vel.z,
            near.tangent.x,
            near.tangent.z,
            bounce.hit,
          );
          this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
          this.right.set(-Math.cos(this.heading), 0, Math.sin(this.heading));
        }
        if (bounce.hit > 0.08) {
          this.damage = clamp(this.damage + bounce.hit * 0.08, 0, 1);
          this.model.setDamage(this.damage);
        }
        this.impact = Math.max(this.impact, bounce.hit);
      }
    }

    this.speed = this.vel.length();
    this.lateral = nR;
    this.slip = Math.abs(nR);
    this.drifting =
      this.speed > 8 &&
      (handbrake ? this.slip > 1.6 : this.slip > this.driftThreshold);

    if (this.drifting) {
      this.boost = Math.min(100, this.boost + 15 * dt);
    } else if (!this.boosting && !this.offroad) {
      // Passive recharge keeps nitro useful without making it free.
      this.boost = Math.min(100, this.boost + 2.6 * dt);
    }
    // Damage slowly repairs itself (about 40 s from heavy damage to none).
    this.damage = Math.max(0, this.damage - 0.025 * dt);

    this.braking = !!brake || handbrake;
    if (!this.locked) this.wheelSpin += (nF * dt) / this.def.body.wheelRadius;
    this.model.setSpin(this.wheelSpin);
    this.model.setSteer(this.steer);
    this.model.setBraking(this.braking);

    const accel = (nF - this.prevSpeed) / Math.max(dt, 0.0001);
    this.prevSpeed = nF;
    const pitchTarget = clamp(-accel * 0.0024, -0.035, 0.035);
    const rollTarget = -this.steer * speedN * 0.075 - clamp(nR * 0.002, -0.03, 0.03);
    this.roll = damp(this.roll, rollTarget, 6, dt);
    this.pitch = damp(this.pitch, pitchTarget, 6, dt);
    this.model.setBodyTilt(this.roll, this.pitch);

    this.syncTransform();
  }

  get speedKmh() {
    return this.speed * 3.6;
  }

  get maxSpeedKmh() {
    return this.maxSpeed * 3.6;
  }

  get gear() {
    if (this.prevSpeed < -0.5) return 'R';
    if (this.speed < 0.5) return 'N';
    return String(Math.min(6, 1 + Math.floor(this.speed / (this.maxSpeed / 6))));
  }

  /**
   * Engine speed 0–1 inside the current gear. Sixth gear reaches the redline
   * at top speed and stays there; it must not wrap around and keep climbing.
   * A slide spins the rear wheels faster than the road, so drifting pushes the
   * needle towards the limiter even at modest road speed.
   */
  get rpmRatio() {
    if (this.prevSpeed < -0.5 || this.speed < 0.5) return 0.06;
    const span = this.maxSpeed / 6;
    const gear = Math.min(6, 1 + Math.floor(this.speed / span));
    const base = clamp((this.speed - (gear - 1) * span) / span, 0, 1);
    const wheelspin = clamp((this.slip - 1) / 6.8, 0, 1);
    const driftRev = wheelspin * (this.throttle > 0 ? 1 : 0.66);
    return clamp(Math.max(base, driftRev), 0, 1);
  }

  /**
   * True while the throttle is pinned and the engine is bouncing off the
   * limiter: in top gear at top speed, or drifting at the redline. The audio
   * gate and the tach shiver both key off this so they stay in sync.
   */
  get revLimiter() {
    return revLimiterActive({
      throttle: this.throttle,
      offroad: this.offroad,
      gear: Number(this.gear),
      rpm: this.rpmRatio,
      drifting: this.drifting,
    });
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      }
    });
    this.model.dispose?.();
  }
}
