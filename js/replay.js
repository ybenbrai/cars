// Race replay playback with automatic TV-style cameras. Cars are moved
// straight from the recording (no physics); the camera cuts between chase,
// trackside, helicopter and low-orbit shots every few seconds.

import * as THREE from 'three';
import { replayPose } from './replayData.js';

export { ReplayRecorder } from './replayData.js';

const SHOTS = ['chase', 'trackside', 'heli', 'orbit', 'trackside', 'chase'];
const SHOT_TIME = 4.5;

const tmp = new THREE.Vector3();
const look = new THREE.Vector3();

export class ReplayPlayer {
  constructor(recording, racers, camera, track) {
    this.rec = recording;
    this.racers = racers;
    this.camera = camera;
    this.track = track;
    this.t = 0;
    this.shotIndex = 0;
    this.shotT = 0;
    this.focus = racers.findIndex((r) => r.isPlayer);
    this.spin = racers.map(() => 0);
    this.finished = false;
    this.startShot();
  }

  get duration() {
    return this.rec.duration;
  }

  startShot() {
    this.shot = SHOTS[this.shotIndex % SHOTS.length];
    this.shotT = 0;
    const p = replayPose(this.rec, this.focus, this.t);
    if (!p) return;
    if (this.shot === 'trackside') {
      // A camera beside the road, a little ahead of where the car is going.
      const ahead = replayPose(this.rec, this.focus, Math.min(this.duration, this.t + 2.2)) || p;
      const side = Math.random() < 0.5 ? 1 : -1;
      this.fixed = new THREE.Vector3(
        ahead.x + Math.cos(ahead.heading) * side * 9,
        1.4,
        ahead.z - Math.sin(ahead.heading) * side * 9,
      );
    }
    this.orbitStart = Math.random() * Math.PI * 2;
  }

  /** Advance playback; returns false once the replay has ended. */
  update(dt) {
    this.t += dt;
    this.shotT += dt;
    if (this.t >= this.duration) {
      this.t = this.duration;
      this.finished = true;
    }
    if (this.shotT >= SHOT_TIME) {
      this.shotIndex += 1;
      this.startShot();
    }

    this.racers.forEach((racer, i) => {
      const p = replayPose(this.rec, i, this.t);
      if (!p) return;
      const car = racer.car;
      car.group.position.set(p.x, 0, p.z);
      car.group.rotation.y = p.heading;
      car.pos.set(p.x, 0, p.z);
      car.renderPos.set(p.x, 0, p.z);
      this.spin[i] += (p.speed * dt) / car.def.body.wheelRadius;
      car.model.setSpin(this.spin[i]);
    });

    const p = replayPose(this.rec, this.focus, this.t);
    if (p) this.aim(p, dt);
    return !this.finished;
  }

  aim(p, dt) {
    const c = this.camera;
    const fx = Math.sin(p.heading);
    const fz = Math.cos(p.heading);
    look.set(p.x, 0.8, p.z);
    if (this.shot === 'chase') {
      tmp.set(p.x - fx * 6.5, 2.3, p.z - fz * 6.5);
      c.position.lerp(tmp, this.shotT < 0.05 ? 1 : 1 - Math.exp(-6 * dt));
      look.set(p.x + fx * 4, 0.9, p.z + fz * 4);
      c.fov = 60;
    } else if (this.shot === 'trackside') {
      c.position.copy(this.fixed);
      c.fov = 38;
    } else if (this.shot === 'heli') {
      tmp.set(p.x - fx * 14 + fz * 8, 16, p.z - fz * 14 - fx * 8);
      c.position.lerp(tmp, this.shotT < 0.05 ? 1 : 1 - Math.exp(-3 * dt));
      c.fov = 50;
    } else {
      const a = this.orbitStart + this.shotT * 0.45;
      c.position.set(p.x + Math.sin(a) * 6, 0.9, p.z + Math.cos(a) * 6);
      c.fov = 52;
    }
    c.lookAt(look);
    c.updateProjectionMatrix();
  }
}
