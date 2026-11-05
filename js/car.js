import * as THREE from 'three';
import { CarModel } from './carModel.js';

const BASE = {
  maxSpeed: 56,
  power: 21,
  brake: 34,
  reverseMax: 12,
  turn: 1.8,
  grip: 10.5,
  offroadGrip: 3.4,
  boostPower: 16,
};

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export class Car {
  constructor(scene, def, look) {
    this.def = def;
    this.physics = def.physics;
    this.model = new CarModel(def, look);
    this.group = this.model.root;
    scene.add(this.group);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
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
    this.damage = 0;
    this.offroad = false;
    this.trackInfo = null;
    this.wheelSpin = 0;
    this.prevSpeed = 0;
    this.roll = 0;
    this.pitch = 0;
    this.braking = false;
    this.paceScale = 1;
    this.isPlayer = false;

    this.maxSpeed = BASE.maxSpeed * this.physics.speed;
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
    this.damage = 0;
    this.offroad = false;
    this.trackInfo = null;
    this.wheelSpin = 0;
    this.prevSpeed = 0;
    this.model.setBodyTilt(0, 0);
    this.model.setSteer(0);
    this.model.setSpin(0);
    this.model.setDamage(0);
    this.syncTransform();
  }

  enableHeadlights() {
    this.model.enableHeadlights();
  }

  syncTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
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
    const p = this.physics;
    const pace = this.paceScale || 1;
    const f0x = Math.sin(this.heading);
    const f0z = Math.cos(this.heading);
    let vF = this.vel.x * f0x + this.vel.z * f0z;
    const r0x = -Math.cos(this.heading);
    const r0z = Math.sin(this.heading);
    let vR = this.vel.x * r0x + this.vel.z * r0z;

    const throttle = input.gas ? 1 : 0;
    const brake = input.brake ? 1 : 0;
    const handbrake = !!input.handbrake;
    const steerTarget = input.steer;
    this.steer = damp(this.steer, steerTarget, steerTarget === 0 ? 9 : 11, dt);

    const speedN = clamp(Math.abs(vF) / this.maxSpeed, 0, 1);
    const speedSteer = clamp(Math.abs(vF) / 14, 0, 1);
    const highSpeedDamp = 1 - 0.34 * speedN;
    const driftSteer = handbrake ? 1.16 : 1;
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
      this.boost = Math.max(0, this.boost - 26 * dt);
      nF += BASE.boostPower * p.boost * pace * dt;
    }

    const offroad = this.offroad;
    const damagePenalty = 1 - this.damage * 0.16;
    const maxNow = this.maxSpeed * pace * damagePenalty * (offroad ? 0.58 : 1) + (this.boosting ? 7 : 0);

    if (throttle) {
      if (nF < -0.5) {
        nF = Math.min(0, nF + BASE.brake * dt);
      } else {
        const push = BASE.power * p.accel * pace * (this.boosting ? 1.45 : 1) * damagePenalty;
        nF += push * (1 - clamp(nF / maxNow, 0, 1)) * dt;
      }
    }
    if (brake) {
      if (nF > 0.4) {
        nF -= BASE.brake * dt;
      } else {
        nF -= 9 * (1 - clamp(-nF / BASE.reverseMax, 0, 1)) * dt;
      }
    }
    if (!throttle && !brake) {
      nF -= nF * 0.55 * dt;
    }
    if (handbrake) {
      nF *= Math.exp(-0.55 * dt);
    }
    if (offroad) {
      nF *= Math.exp(-1.1 * dt);
    }
    nF = clamp(nF, -BASE.reverseMax, maxNow + 1.5);

    const grip = handbrake ? BASE.grip * 0.15 * p.slide : offroad ? BASE.offroadGrip : this.grip;
    nR *= Math.exp(-grip * dt);
    nR = clamp(nR, -22, 22);

    this.vel.set(fx * nF + rx * nR, 0, fz * nF + rz * nR);
    this.pos.addScaledVector(this.vel, dt);

    const near = track.nearest(this.pos, this.trackInfo?.index);
    this.trackInfo = near;
    this.offroad = Math.abs(near.signed) > track.halfWidth + 0.15;

    const limit = track.wallOffset - 0.95;
    if (Math.abs(near.signed) > limit) {
      const sign = Math.sign(near.signed);
      this.pos.set(
        near.point.x + near.side.x * sign * limit,
        0,
        near.point.z + near.side.z * sign * limit,
      );
      const nx = near.side.x * sign;
      const nz = near.side.z * sign;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn > 0) {
        this.vel.x -= nx * vn * 1.4;
        this.vel.z -= nz * vn * 1.4;
      }
      this.vel.multiplyScalar(0.88);
      const hit = Math.min(1, Math.abs(vn) / 16);
      if (hit > 0.08) {
        this.damage = clamp(this.damage + hit * 0.08, 0, 1);
        this.model.setDamage(this.damage);
      }
      this.impact = Math.max(this.impact, hit);
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
    this.wheelSpin += (nF * dt) / this.def.body.wheelRadius;
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
