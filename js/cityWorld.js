import * as THREE from 'three';

// Free-roam city layer. The race track and its painted street grid already
// exist; this adds the missing *simulation*: a drivable surface, solid
// buildings, cycling signals and traffic. Everything is procedural and
// instanced so it stays cheap on a phone.

const GRID_HALF = 5.5;
const SIGNAL_CYCLE = 14;
const GREEN_TIME = 5.8;
const AMBER_TIME = 1.6;
const TRAFFIC_COUNT = 18;
const TRAFFIC_SPEED = 13;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class CityWorld {
  constructor(scene, track, city) {
    this.scene = scene;
    this.track = track;
    this.block = city?.block || 170;
    this.extent = city?.extent || 1200;
    this.colliders = city?.colliders || [];
    this.lightSets = city?.lights?.sets || [];
    this.junctions = [];
    const spots = city?.junctions || [];
    for (let i = 0; i < spots.length; i += 2) {
      this.junctions.push({ x: spots[i].x, z: spots[i].z, group: Math.floor(i / 2) % 2 });
    }

    // The race loop is drivable too; sample it sparsely for the surface query.
    this.loopPoints = track.samples.filter((_, i) => i % 3 === 0).map((s) => ({
      x: s.point.x, z: s.point.z, tx: s.tangent.x, tz: s.tangent.z,
    }));

    this.group = new THREE.Group();
    this.group.name = 'city-world';
    scene.add(this.group);
    this.elapsed = 0;
    this.traffic = [];
    this.buildTraffic();
  }

  /** Nearest drivable road centreline: painted grid or the race boulevard. */
  surface(x, z) {
    const k = Math.round(x / this.block);
    let best = Infinity;
    let px = x;
    let pz = z;
    let tx = 1;
    let tz = 0;
    let halfWidth = GRID_HALF;
    for (let n = k - 1; n <= k + 1; n++) {
      const line = n * this.block;
      if (Math.abs(line) > this.extent) continue;
      let d = Math.abs(x - line);
      if (d < best) { best = d; px = line; pz = z; tx = 0; tz = 1; halfWidth = GRID_HALF; }
      d = Math.abs(z - line);
      if (d < best) { best = d; px = x; pz = line; tx = 1; tz = 0; halfWidth = GRID_HALF; }
    }
    for (const p of this.loopPoints) {
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < best * best) {
        best = Math.sqrt(d2);
        px = p.x; pz = p.z; tx = p.tx; tz = p.tz;
        halfWidth = this.track.halfWidth;
      }
    }
    return { dist: best, x: px, z: pz, tx, tz, halfWidth };
  }

  isGreen(group) {
    const phase = ((this.elapsed + group * SIGNAL_CYCLE / 2) % SIGNAL_CYCLE) / SIGNAL_CYCLE;
    return phase < GREEN_TIME / SIGNAL_CYCLE;
  }

  isAmber(group) {
    const phase = ((this.elapsed + group * SIGNAL_CYCLE / 2) % SIGNAL_CYCLE) / SIGNAL_CYCLE;
    return phase >= GREEN_TIME / SIGNAL_CYCLE
      && phase < (GREEN_TIME + AMBER_TIME) / SIGNAL_CYCLE;
  }

  /** Replace the closed-loop wall clamp with city bounds and solid buildings. */
  constrain(car) {
    const surface = this.surface(car.pos.x, car.pos.z);
    car.offroad = surface.dist > surface.halfWidth + 0.8;

    for (const c of this.colliders) {
      const dx = car.pos.x - c.x;
      const dz = car.pos.z - c.z;
      const min = c.r + 1.2;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.max(0.001, Math.sqrt(d2));
      const nx = dx / d;
      const nz = dz / d;
      car.pos.set(c.x + nx * min, 0, c.z + nz * min);
      const vn = car.vel.x * nx + car.vel.z * nz;
      if (vn < 0) {
        car.vel.x -= 1.5 * vn * nx;
        car.vel.z -= 1.5 * vn * nz;
        car.impact = Math.max(car.impact, Math.abs(vn));
        car.wallHit = Math.max(car.wallHit, Math.abs(vn));
        car.wallNormal.set(nx, 0, nz);
      }
    }

    // Traffic cars are solid too, so the streets feel occupied.
    for (const t of this.traffic) {
      const dx = car.pos.x - t.x;
      const dz = car.pos.z - t.z;
      const min = 3.2;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min || d2 < 0.0001) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      car.pos.set(t.x + nx * min, 0, t.z + nz * min);
      const vn = car.vel.x * nx + car.vel.z * nz;
      if (vn < 0) {
        car.vel.x -= 1.4 * vn * nx;
        car.vel.z -= 1.4 * vn * nz;
        car.impact = Math.max(car.impact, Math.abs(vn) * 0.6);
        t.speed *= 0.7;
      }
    }

    const limit = this.extent - 12;
    if (Math.abs(car.pos.x) > limit) {
      car.pos.x = Math.sign(car.pos.x) * limit;
      car.vel.x *= -0.35;
      car.impact = Math.max(car.impact, Math.abs(car.vel.x));
    }
    if (Math.abs(car.pos.z) > limit) {
      car.pos.z = Math.sign(car.pos.z) * limit;
      car.vel.z *= -0.35;
      car.impact = Math.max(car.impact, Math.abs(car.vel.z));
    }
  }

  buildTraffic() {
    const bodyGeo = new THREE.BoxGeometry(1.9, 0.72, 4.2);
    const cabinGeo = new THREE.BoxGeometry(1.65, 0.56, 2.0);
    cabinGeo.translate(0, 0.62, -0.2);
    const lampGeo = new THREE.BoxGeometry(1.55, 0.16, 0.1);
    lampGeo.translate(0, 0.1, 2.12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.35 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x151822, roughness: 0.25, metalness: 0.6 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffe9c0, emissive: 0xffd28a, emissiveIntensity: 1.6, roughness: 0.4,
    });
    this.trafficMeshes = [
      new THREE.InstancedMesh(bodyGeo, bodyMat, TRAFFIC_COUNT),
      new THREE.InstancedMesh(cabinGeo, cabinMat, TRAFFIC_COUNT),
      new THREE.InstancedMesh(lampGeo, lampMat, TRAFFIC_COUNT),
    ];
    const colors = [0xd8d9de, 0x2c3d63, 0x8f2530, 0x255b45, 0xc8a13a, 0x4a4a55, 0xe4e0d2];
    const tint = new THREE.Color();
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      this.trafficMeshes[0].setColorAt(i, tint.set(colors[i % colors.length]));
      const axis = i % 2;
      const line = (Math.floor(i / 2) - 4) * this.block * 1.5;
      this.traffic.push({
        axis, line, lane: i % 4 < 2 ? -3.1 : 3.1,
        pos: ((i * 317) % (this.extent * 2)) - this.extent,
        dir: i % 3 === 0 ? -1 : 1,
        speed: TRAFFIC_SPEED * (0.75 + (i % 5) * 0.07),
        x: 0, z: 0, heading: 0,
      });
    }
    this.trafficMeshes[0].instanceColor.needsUpdate = true;
    for (const mesh of this.trafficMeshes) {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.dummy = new THREE.Object3D();
    this.syncTraffic();
  }

  trafficPose(t) {
    return t.axis === 0
      ? { x: t.pos, z: t.line + t.lane, heading: t.dir > 0 ? Math.PI / 2 : -Math.PI / 2 }
      : { x: t.line + t.lane, z: t.pos, heading: t.dir > 0 ? 0 : Math.PI };
  }

  syncTraffic() {
    for (let i = 0; i < this.traffic.length; i++) {
      const t = this.traffic[i];
      const pose = this.trafficPose(t);
      t.x = pose.x;
      t.z = pose.z;
      t.heading = pose.heading;
      this.dummy.position.set(pose.x, 0.42, pose.z);
      this.dummy.rotation.set(0, pose.heading, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      for (const mesh of this.trafficMeshes) mesh.setMatrixAt(i, this.dummy.matrix);
    }
    for (const mesh of this.trafficMeshes) mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    this.elapsed += dt;
    for (let g = 0; g < this.lightSets.length; g++) {
      const set = this.lightSets[g];
      const green = this.isGreen(g);
      const amber = this.isAmber(g);
      set.red.emissiveIntensity = !green && !amber ? 3.4 : 0.25;
      set.amber.emissiveIntensity = amber ? 3.2 : 0.25;
      set.green.emissiveIntensity = green ? 3.0 : 0.25;
    }

    for (const t of this.traffic) {
      let target = TRAFFIC_SPEED;
      // Stop for a red light at a junction ahead on this road.
      for (const j of this.junctions) {
        const ahead = t.axis === 0
          ? (j.x - t.pos) * t.dir
          : (j.z - t.pos) * t.dir;
        if (ahead <= 0 || ahead > 30) continue;
        const across = t.axis === 0 ? Math.abs(j.z - t.z) : Math.abs(j.x - t.x);
        if (across > 16) continue;
        if (!this.isGreen(j.group)) target = 0;
        break;
      }
      // Keep a gap to the next car travelling the same way on this street.
      for (const other of this.traffic) {
        if (other === t || other.axis !== t.axis || other.dir !== t.dir) continue;
        if (Math.abs(other.line - t.line) > 2) continue;
        const gap = (other.pos - t.pos) * t.dir;
        if (gap > 0 && gap < 12) target = Math.min(target, Math.max(0, (gap - 6) * 2.2));
      }
      const accel = target < t.speed ? -34 : 7;
      t.speed = clamp(t.speed + accel * dt, 0, TRAFFIC_SPEED * 1.15);
      const before = t.pos;
      t.pos += t.dir * t.speed * dt;

      // Turn at painted grid intersections.
      if (Math.floor(before / this.block) !== Math.floor(t.pos / this.block)
        && Math.random() < 0.32) {
        const cross = Math.round(t.pos / this.block) * this.block;
        if (Math.abs(cross) <= this.extent) {
          t.axis = 1 - t.axis;
          t.line = cross;
          t.lane = Math.random() < 0.5 ? -3.1 : 3.1;
          t.dir = Math.random() < 0.5 ? -1 : 1;
          t.speed *= 0.6;
        }
      }
      if (t.pos > this.extent) t.pos = -this.extent;
      if (t.pos < -this.extent) t.pos = this.extent;
    }
    this.syncTraffic();
  }

  dispose() {
    for (const mesh of this.trafficMeshes) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.group.removeFromParent();
  }
}
