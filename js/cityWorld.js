import * as THREE from 'three';
import {
  CITY_GRID,
  SIDEWALK_WIDTH,
  isBoulevardLine,
  nearestRoad,
  nextJunction,
  roadWidthAt,
  sidewalkCenters,
  signalGroup,
} from './data/cityGrid.js';

// Free-roam city layer. The race track and its painted street grid already
// exist; this adds the missing *simulation*: a drivable surface, solid
// buildings, cycling signals and traffic. Everything is procedural and
// instanced so it stays cheap on a phone.

const SIGNAL_CYCLE = 14;
const GREEN_TIME = 5.8;
const AMBER_TIME = 1.6;
const TRAFFIC_COUNT = 18;
const TRAFFIC_SPEED = 13;
const PEDESTRIAN_COUNT = 90;
const PEDESTRIAN_SPEED = 1.5;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class CityWorld {
  constructor(scene, track, city) {
    this.scene = scene;
    this.track = track;
    this.grid = city?.grid || CITY_GRID;
    this.extent = this.grid.extent;
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

    // Only test the handful of buildings around the car, not the whole city.
    this.colliderCell = 64;
    this.colliderBuckets = new Map();
    for (const c of this.colliders) {
      const key = `${Math.floor(c.x / this.colliderCell)},${Math.floor(c.z / this.colliderCell)}`;
      let bucket = this.colliderBuckets.get(key);
      if (!bucket) this.colliderBuckets.set(key, bucket = []);
      bucket.push(c);
    }

    this.group = new THREE.Group();
    this.group.name = 'city-world';
    scene.add(this.group);
    this.elapsed = 0;
    this.traffic = [];
    this.buildTraffic();
    this.buildPedestrians();
  }

  /** Nearest painted road centreline: dense grid or the race boulevard. */
  surface(x, z) {
    const near = nearestRoad(x, z, this.grid);
    let { dist, x: px, z: pz, tx, tz, halfWidth } = near;
    // The race loop is a boulevard too; prefer it where it runs closer.
    for (const p of this.loopPoints) {
      const dx = x - p.x;
      const dz = z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < dist * dist) {
        dist = Math.sqrt(d2);
        px = p.x; pz = p.z; tx = p.tx; tz = p.tz;
        halfWidth = this.track.halfWidth;
      }
    }
    return { dist, x: px, z: pz, tx, tz, halfWidth };
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
    // The entire downtown is drivable. A racing-style off-road penalty here
    // made the car crawl in the blocks between the old, sparse grid lines.
    car.offroad = false;

    // Buildings are bucketed, so a physics step only checks the nine cells
    // around the car rather than every footprint in the city.
    const cell = this.colliderCell;
    const cx = Math.floor(car.pos.x / cell);
    const cz = Math.floor(car.pos.z / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const bucket = this.colliderBuckets.get(`${ix},${iz}`);
        if (!bucket) continue;
        for (const c of bucket) {
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
            car.wallNormal.x = nx;
            car.wallNormal.z = nz;
          }
        }
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

    // Walkers are soft obstacles: they dodge first, but clipping one nudges the
    // car and makes the walker stumble aside rather than passing through it.
    for (const p of this.pedestrians) {
      const dx = car.pos.x - p.x;
      const dz = car.pos.z - p.z;
      const min = 1.25;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.max(0.001, Math.sqrt(d2));
      const nx = dx / d;
      const nz = dz / d;
      car.pos.set(p.x + nx * min, 0, p.z + nz * min);
      const vn = car.vel.x * nx + car.vel.z * nz;
      if (vn < 0) {
        car.vel.x -= 0.3 * vn * nx;
        car.vel.z -= 0.3 * vn * nz;
        car.impact = Math.max(car.impact, Math.abs(vn) * 0.15);
        car.wallHit = Math.max(car.wallHit, Math.abs(vn) * 0.1);
        p.stumble = 1;
        p.dodge = Math.max(p.dodge, 1.5);
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
    const lines = this.grid.boulevardLines;
    for (let i = 0; i < TRAFFIC_COUNT; i++) {
      this.trafficMeshes[0].setColorAt(i, tint.set(colors[i % colors.length]));
      const axis = i % 2;
      const line = lines[Math.floor(i / 2) % lines.length];
      this.traffic.push({
        axis, line, lane: i % 4 < 2 ? -4.8 : 4.8,
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

  nearBuilding(x, z, margin) {
    const cell = this.colliderCell;
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    for (let ix = cx - 1; ix <= cx + 1; ix++) {
      for (let iz = cz - 1; iz <= cz + 1; iz++) {
        const bucket = this.colliderBuckets.get(`${ix},${iz}`);
        if (!bucket) continue;
        for (const c of bucket) {
          const dx = x - c.x;
          const dz = z - c.z;
          const min = c.r + margin;
          if (dx * dx + dz * dz < min * min) return true;
        }
      }
    }
    return false;
  }

  /** Instanced walkers on the sidewalks. They dodge aside for nearby cars. */
  buildPedestrians() {
    const bodyGeo = new THREE.CapsuleGeometry(0.26, 0.82, 3, 6);
    bodyGeo.translate(0, 0.7, 0);
    const headGeo = new THREE.SphereGeometry(0.22, 7, 5);
    headGeo.translate(0, 1.42, 0);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    this.pedMeshes = [
      new THREE.InstancedMesh(bodyGeo, bodyMat, PEDESTRIAN_COUNT),
      new THREE.InstancedMesh(headGeo, headMat, PEDESTRIAN_COUNT),
    ];
    const shirts = [0xc94f4f, 0x3f6d9c, 0xd39b3f, 0x4f9c72, 0x7a5b9c, 0xd6d1c4, 0x2f3540];
    const skins = [0xe8bd97, 0xc98c63, 0x8d5b3c, 0xf1cfa9, 0x6f432b];
    const tint = new THREE.Color();
    // The outermost road is clamped by the city bounds, so walk on the
    // sidewalks of streets the player can actually reach.
    const walkable = this.grid.streets.filter((s) => Math.abs(s.pos) <= this.extent - 16);
    const walkLimit = this.extent - 20;
    const maxK = Math.floor(walkLimit / this.grid.spacing);
    this.pedestrians = [];
    for (let i = 0; i < PEDESTRIAN_COUNT; i++) {
      let street, lane, k, pos, x, z;
      for (let attempt = 0; attempt < 40; attempt++) {
        street = walkable[Math.floor(Math.random() * walkable.length)];
        lane = sidewalkCenters(street)[Math.random() < 0.5 ? 0 : 1];
        k = Math.floor(Math.random() * 2 * maxK) - maxK;
        pos = (k + 0.12 + Math.random() * 0.76) * this.grid.spacing;
        x = street.axis === 1 ? pos : lane;
        z = street.axis === 1 ? lane : pos;
        if (this.track.distanceToTrack(x, z) < this.track.halfWidth + 3) continue;
        if (!this.nearBuilding(x, z, 1.5)) break;
      }
      this.pedestrians.push({
        // A walker along a horizontal street travels on X, and vice versa.
        axis: 1 - street.axis,
        line: street.pos,
        lane,
        pos,
        min: -walkLimit,
        max: walkLimit,
        dir: Math.random() < 0.5 ? -1 : 1,
        speed: PEDESTRIAN_SPEED * (0.7 + Math.random() * 0.6),
        phase: Math.random() * Math.PI * 2,
        dodge: 0,
        stumble: 0,
        x: 0, z: 0, heading: 0,
      });
      this.pedMeshes[0].setColorAt(i, tint.set(shirts[i % shirts.length]));
      this.pedMeshes[1].setColorAt(i, tint.set(skins[i % skins.length]));
    }
    for (const mesh of this.pedMeshes) {
      mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    this.syncPedestrians();
  }

  /** Next junction this walker will reach, with its crosswalk limits. */
  crossingAhead(p) {
    const next = nextJunction(p.pos, p.dir, this.grid.spacing);
    const half = roadWidthAt(next) / 2 + SIDEWALK_WIDTH / 2 + 1;
    return {
      next,
      near: next - p.dir * half,
      far: next + p.dir * half,
      painted: isBoulevardLine(p.line) || isBoulevardLine(next),
      green: this.isGreen(signalGroup(p.axis, next)),
    };
  }

  pedestrianPose(p) {
    // Dodge away from the road, never into it.
    const cross = p.lane + Math.sign(p.lane - p.line) * p.dodge;
    return p.axis === 0
      ? { x: p.pos, z: cross, heading: p.dir > 0 ? Math.PI / 2 : -Math.PI / 2 }
      : { x: cross, z: p.pos, heading: p.dir > 0 ? 0 : Math.PI };
  }

  syncPedestrians() {
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      const pose = this.pedestrianPose(p);
      p.x = pose.x;
      p.z = pose.z;
      p.heading = pose.heading;
      const bob = Math.sin(this.elapsed * p.speed * 3 + p.phase) * 0.045;
      this.dummy.position.set(pose.x, bob, pose.z);
      this.dummy.rotation.set(
        -p.stumble * (0.25 + Math.sin(this.elapsed * 18 + p.phase) * 0.08),
        pose.heading,
        Math.sin(this.elapsed * 14 + p.phase) * 0.2 * p.stumble,
      );
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      for (const mesh of this.pedMeshes) mesh.setMatrixAt(i, this.dummy.matrix);
    }
    for (const mesh of this.pedMeshes) mesh.instanceMatrix.needsUpdate = true;
  }

  updatePedestrians(dt, player) {
    for (const p of this.pedestrians) {
      let pace = 1;
      if (player?.pos) {
        const dx = player.pos.x - p.x;
        const dz = player.pos.z - p.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 100 && d2 > 0.01) {
          p.dodge = Math.max(p.dodge, (1 - Math.sqrt(d2) / 10) * 1.8);
          pace = 0.15;
        }
      }
      p.dodge = Math.max(0, p.dodge - dt * 1.6);
      p.stumble = Math.max(0, p.stumble - dt * 1.6);

      // Stop at the kerb for a red crosswalk, and turn around where there is
      // no painted crossing. Once on the crossing a walker keeps going, even
      // if the light changes while it is halfway across.
      const cross = this.crossingAhead(p);
      const toKerb = (cross.near - p.pos) * p.dir;
      let nextPos = p.pos + p.dir * p.speed * pace * dt;
      if (toKerb > 0 && toKerb < 24 && (!cross.painted || !cross.green)) {
        const stop = cross.near - p.dir * 0.2;
        if ((nextPos - stop) * p.dir >= 0) {
          nextPos = stop;
          if (!cross.painted) p.dir *= -1;
        }
      }
      p.pos = nextPos;
      if (p.pos > p.max) { p.pos = p.max; p.dir = -1; }
      if (p.pos < p.min) { p.pos = p.min; p.dir = 1; }
    }
    this.syncPedestrians();
  }

  /** Is the next downtown junction showing red for this traffic car? */
  gridLightAhead(t) {
    const next = nextJunction(t.pos, t.dir, this.grid.spacing);
    const ahead = (next - t.pos) * t.dir;
    if (ahead <= 0 || ahead > 26) return false;
    return !this.isGreen(signalGroup(t.axis, next));
  }

  update(dt, player) {
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
      // Signals on the race loop and at every downtown junction.
      let red = this.gridLightAhead(t);
      if (!red) {
        for (const j of this.junctions) {
          const ahead = t.axis === 0
            ? (j.x - t.pos) * t.dir
            : (j.z - t.pos) * t.dir;
          if (ahead <= 0 || ahead > 30) continue;
          const across = t.axis === 0 ? Math.abs(j.z - t.z) : Math.abs(j.x - t.x);
          if (across > 16) continue;
          red = !this.isGreen(j.group);
          break;
        }
      }
      if (red) target = 0;

      // Yield when the player is ahead in the same lane.
      if (player?.pos) {
        const ahead = t.axis === 0
          ? (player.pos.x - t.pos) * t.dir
          : (player.pos.z - t.pos) * t.dir;
        const across = t.axis === 0
          ? Math.abs(player.pos.z - (t.line + t.lane))
          : Math.abs(player.pos.x - (t.line + t.lane));
        if (ahead > 0 && ahead < 24 && across < 4.5) {
          target = Math.min(target, Math.max(0, (ahead - 7) * 1.6));
        }
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
      const spacing = this.grid.spacing;
      if (Math.floor(before / spacing) !== Math.floor(t.pos / spacing)
        && Math.random() < 0.18) {
        const cross = Math.round(t.pos / spacing) * spacing;
        if (Math.abs(cross) <= this.extent) {
          t.axis = 1 - t.axis;
          t.line = cross;
          t.lane = (Math.random() < 0.5 ? -1 : 1) * (isBoulevardLine(cross) ? 4.8 : 3.4);
          t.dir = Math.random() < 0.5 ? -1 : 1;
          t.speed *= 0.6;
        }
      }
      if (t.pos > this.extent) t.pos = -this.extent;
      if (t.pos < -this.extent) t.pos = this.extent;
    }
    this.syncTraffic();
    this.updatePedestrians(dt, player);
  }

  dispose() {
    for (const mesh of this.trafficMeshes.concat(this.pedMeshes)) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.group.removeFromParent();
  }
}
