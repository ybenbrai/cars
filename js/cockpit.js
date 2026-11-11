// Driver's-eye interior for the cockpit camera: dashboard, gauges, console,
// a steering wheel that turns with the car's steering, and gloved hands that
// hold it. On every gear change the right hand leaves the wheel, moves the
// shifter and comes back. Each car class has its own interior style.
//
// Coordinates are the car body's local frame: +z forward, +x is the
// driver's LEFT (the car's right vector is -x), y up. The driver sits on the
// left (+x) side.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const rbox = (w, h, d, r = 0.02) => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2.05));

// Interior styles. wheel: round | flat (flat-bottom) | yoke | classic (thin
// rim, big diameter). shifter: manual (tall H-pattern lever), sequential
// (short racing lever), selector (small luxury T-handle).
const STYLES = {
  hatch: {
    dash: 0x2b2d33, trim: 0x3a3d45, accent: 0x8a8f99, seat: 0x30333a,
    wheel: 'round', wheelR: 0.185, spokes: 3, shifter: 'manual', cluster: 'analog', glove: 0x1b1c20,
  },
  sedan: {
    dash: 0x1d1a18, trim: 0x5b3a22, accent: 0xc9cfda, seat: 0x3a2a20,
    wheel: 'round', wheelR: 0.19, spokes: 4, shifter: 'selector', cluster: 'digital', glove: 0x2a1f19,
  },
  flagship: {
    dash: 0x2a2018, trim: 0x6b4426, accent: 0xd8dde6, seat: 0xb08a62,
    wheel: 'classic', wheelR: 0.2, spokes: 2, shifter: 'selector', cluster: 'digital', glove: 0x3a2c22,
  },
  sports: {
    dash: 0x17171a, trim: 0x26262b, accent: 0xff3b30, seat: 0x1c1c20,
    wheel: 'flat', wheelR: 0.175, spokes: 3, shifter: 'manual', cluster: 'analog', glove: 0x141416,
  },
  roadster: {
    dash: 0x1c1712, trim: 0x7a4b2a, accent: 0xd7dbe2, seat: 0x8a5a36,
    wheel: 'classic', wheelR: 0.19, spokes: 3, shifter: 'manual', cluster: 'analog', glove: 0x5a3a24,
  },
  muscle: {
    dash: 0x141414, trim: 0x2b2b2b, accent: 0xd7dbe2, seat: 0x1f1f1f,
    wheel: 'classic', wheelR: 0.2, spokes: 3, shifter: 'manual', cluster: 'analog', glove: 0x111111,
  },
  super: {
    dash: 0x0f1012, trim: 0x22252b, accent: 0xffc400, seat: 0x16171a,
    wheel: 'flat', wheelR: 0.17, spokes: 2, shifter: 'sequential', cluster: 'digital', glove: 0x101012,
  },
  hyper: {
    dash: 0x0c0d10, trim: 0x1d2229, accent: 0x31e0ff, seat: 0x121417,
    wheel: 'yoke', wheelR: 0.16, spokes: 2, shifter: 'sequential', cluster: 'digital', glove: 0x0d0e10,
  },
  gt: {
    dash: 0x1a1512, trim: 0x5e3b22, accent: 0xd8dde6, seat: 0x6d3f25,
    wheel: 'round', wheelR: 0.185, spokes: 3, shifter: 'sequential', cluster: 'analog', glove: 0x241914,
  },
  suv: {
    dash: 0x26282c, trim: 0x34373d, accent: 0xb9c0cb, seat: 0x2c2f35,
    wheel: 'round', wheelR: 0.2, spokes: 4, shifter: 'selector', cluster: 'digital', glove: 0x1e1f22,
  },
  offroad: {
    dash: 0x2d2b26, trim: 0x4a463d, accent: 0xff8a1f, seat: 0x3a372f,
    wheel: 'round', wheelR: 0.2, spokes: 3, shifter: 'manual', cluster: 'analog', glove: 0x23211c,
  },
};

export function interiorStyleFor(def) {
  if (def.body?.flagship) return 'flagship';
  const style = def.body?.style;
  if (STYLES[style]) return style;
  return STYLES[def.category] ? def.category : 'sports';
}

// Shift animation timing (seconds): reach for the lever, move it, come back.
const REACH = 0.16;
const THROW = 0.12;
const RETURN = 0.2;
const SHIFT_TIME = REACH + THROW + RETURN;

const ease = (t) => t * t * (3 - 2 * t);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Cockpit {
  constructor(def, model) {
    this.def = def;
    this.model = model;
    this.styleId = interiorStyleFor(def);
    this.style = STYLES[this.styleId];
    const b = def.body;
    const top = model.bodyTop;

    // Driver's eye, on the left of the cabin, about 0.6 m behind the base of
    // the windscreen.
    const side = Math.min(0.36, b.cabinWidth * 0.23);
    this.eye = new THREE.Vector3(
      side,
      top + Math.min(0.42, b.cabinHeight * 0.66),
      b.cabinZ + b.cabinLength * 0.5 - 0.66,
    );
    this.root = new THREE.Group();
    this.root.visible = false;
    model.body.add(this.root);

    this.materials = [];
    // A little self-illumination keeps the cabin readable in the roof's
    // shadow, like dash lighting and light through the side glass.
    const mat = (color, opts = {}) => {
      const m = new THREE.MeshStandardMaterial({
        color, roughness: 0.7, metalness: 0.05, emissive: color, emissiveIntensity: 0.2, ...opts,
      });
      this.materials.push(m);
      return m;
    };
    const s = this.style;
    this.dashMat = mat(s.dash, { roughness: 0.85 });
    this.trimMat = mat(s.trim, { roughness: 0.45, metalness: s.trim === 0x22252b || s.trim === 0x1d2229 ? 0.4 : 0.1 });
    this.accentMat = mat(s.accent, { roughness: 0.3, metalness: 0.7 });
    this.seatMat = mat(s.seat, { roughness: 0.9 });
    this.rimMat = mat(0x111114, { roughness: 0.6 });
    this.gloveMat = mat(s.glove, { roughness: 0.75 });
    this.sleeveMat = mat(0x20232a, { roughness: 0.9 });
    this.glowMat = new THREE.MeshBasicMaterial({ color: s.accent });
    this.screenMat = new THREE.MeshBasicMaterial({ color: 0x0b1420 });
    this.materials.push(this.glowMat, this.screenMat);

    // Soft cabin light just above the dashboard.
    const lamp = new THREE.PointLight(0xffe2c4, 0.5, 1.6, 2);
    lamp.position.set(this.eye.x * 0.5, this.eye.y + 0.05, this.eye.z + 0.35);
    this.root.add(lamp);

    this.buildDash(b);
    this.buildHeadliner(b);
    this.buildWheel();
    this.buildShifter();
    this.buildHands();

    // Cabin cut-out: exterior panels inside this box (the shell's top under
    // the cabin, roof scoops) are clipped while the driver's view is on, so
    // they never cover the wheel and hands on low cars. Planes face outward:
    // with clipIntersection a fragment is cut only when inside all six.
    const x = b.cabinWidth * 0.46;
    const z0 = b.cabinZ - b.cabinLength * 0.5 + 0.05;
    const z1 = b.cabinZ + b.cabinLength * 0.5 - 0.02;
    const y0 = top - 0.4;
    // Open-top cars: the low windscreen frame would sit at eye level, so the
    // cut-out reaches above it.
    const y1 = model.openTop ? top + b.cabinHeight + 0.3 : (model.roofY ?? top + b.cabinHeight) + 0.06;
    this.clipLocal = [
      new THREE.Plane(new THREE.Vector3(1, 0, 0), -x),
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), -x),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), -z1),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), z0),
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -y1),
      new THREE.Plane(new THREE.Vector3(0, -1, 0), y0),
    ];
    this.clipWorld = this.clipLocal.map((p) => p.clone());
    this.clipped = false;

    this.steerAngle = 0;
    this.shiftT = -1; // -1 idle, otherwise seconds into the shift
    this.shiftDir = 1;
    this.leverTilt = 0;
  }

  add(geo, material, x, y, z, parent = this.root) {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = false;
    m.receiveShadow = false;
    parent.add(m);
    return m;
  }

  /**
   * Roof lining for closed cars. The painted roof only renders from outside,
   * so without it the driver saw sky (and the roof-edge trim) overhead.
   */
  buildHeadliner(b) {
    const stations = this.model.roofStations;
    if (this.model.openTop || !stations?.length) return;
    const roofTop = Math.max(...stations.map((st) => st.yTop));
    const flat = stations.filter((st) => st.yTop > roofTop - 0.05);
    if (!flat.length) return;
    const z0 = Math.min(...flat.map((st) => st.z)) - 0.04;
    const z1 = Math.max(...flat.map((st) => st.z)) + 0.04;
    const width = b.roofWidth * 0.94;
    this.headMat = new THREE.MeshStandardMaterial({
      color: this.style.seat, roughness: 0.95, emissive: this.style.seat, emissiveIntensity: 0.12,
    });
    this.materials.push(this.headMat);
    this.add(rbox(width, 0.03, z1 - z0, 0.012), this.headMat, 0, roofTop - 0.045, (z0 + z1) / 2);
    // Windscreen header: a darker band where the lining meets the glass.
    this.add(rbox(width, 0.045, 0.06, 0.015), this.dashMat, 0, roofTop - 0.055, z1 - 0.02);
  }

  buildDash(b) {
    const e = this.eye;
    const W = b.cabinWidth * 0.98;
    const dashZ = e.z + 0.74;
    const dashTop = e.y - 0.24;
    // Main dash slab across the cabin and a trim strip along its face.
    this.add(rbox(W, 0.26, 0.42, 0.05), this.dashMat, 0, dashTop - 0.13, dashZ + 0.06);
    this.add(rbox(W * 0.96, 0.035, 0.02, 0.01), this.trimMat, 0, dashTop - 0.1, dashZ - 0.155);
    // Instrument binnacle in front of the driver.
    const hood = this.add(rbox(0.36, 0.09, 0.2, 0.04), this.dashMat, e.x, dashTop + 0.02, dashZ - 0.05);
    hood.rotation.x = -0.12;
    const clusterY = dashTop - 0.005;
    const clusterZ = dashZ - 0.14;
    // Green indicator arrows either side of the cluster.
    this.arrowMat = { left: new THREE.MeshBasicMaterial({ color: 0x1d3b22 }), right: new THREE.MeshBasicMaterial({ color: 0x1d3b22 }) };
    this.materials.push(this.arrowMat.left, this.arrowMat.right);
    for (const [side, sx] of [['left', 1], ['right', -1]]) {
      const tri = new THREE.Shape();
      tri.moveTo(0, 0.014);
      tri.lineTo(0, -0.014);
      tri.lineTo(0.02, 0);
      tri.closePath();
      const arrow = this.add(new THREE.ShapeGeometry(tri), this.arrowMat[side], e.x + sx * 0.165, clusterY + 0.03, clusterZ - 0.004);
      // Face the driver (looking +z) and point outwards on each side.
      arrow.rotation.y = side === 'left' ? 0 : Math.PI;
      arrow.rotation.x = 0.12;
    }
    if (this.style.cluster === 'digital') {
      const screen = this.add(new THREE.PlaneGeometry(0.3, 0.085), this.screenMat, e.x, clusterY, clusterZ);
      screen.rotation.y = Math.PI;
      screen.rotation.x = 0.12;
      const bar = this.add(new THREE.PlaneGeometry(0.2, 0.01), this.glowMat, e.x, clusterY - 0.022, clusterZ - 0.002);
      bar.rotation.y = Math.PI;
      bar.rotation.x = 0.12;
      // Wide centre screen on modern interiors.
      const centre = this.add(new THREE.PlaneGeometry(0.26, 0.15), this.screenMat, 0, dashTop - 0.06, dashZ - 0.19);
      centre.rotation.y = Math.PI;
      centre.rotation.x = 0.25;
    } else {
      for (const dx of [-0.075, 0.075]) {
        const dial = this.add(new THREE.CircleGeometry(0.048, 28), this.screenMat, e.x + dx, clusterY, clusterZ);
        dial.rotation.y = Math.PI;
        dial.rotation.x = 0.12;
        const ring = this.add(new THREE.TorusGeometry(0.05, 0.005, 6, 28), this.accentMat, e.x + dx, clusterY, clusterZ - 0.002);
        ring.rotation.y = Math.PI;
        ring.rotation.x = 0.12;
        const needle = this.add(new THREE.PlaneGeometry(0.004, 0.04), this.glowMat, e.x + dx, clusterY + 0.012, clusterZ - 0.004);
        needle.rotation.y = Math.PI;
        needle.rotation.z = dx > 0 ? -0.9 : 0.6;
      }
      // Two vents in the centre of the dash.
      for (const dx of [-0.08, 0.08]) {
        this.add(rbox(0.1, 0.045, 0.02, 0.01), this.trimMat, dx, dashTop - 0.07, dashZ - 0.16);
      }
    }
    // Centre console running back between the seats.
    this.consoleTop = e.y - 0.44;
    this.add(rbox(0.22, 0.2, 0.72, 0.04), this.dashMat, 0, this.consoleTop - 0.1, e.z + 0.32);
    this.add(rbox(0.2, 0.012, 0.6, 0.005), this.trimMat, 0, this.consoleTop + 0.002, e.z + 0.3);
    // Seat-back bolster edges at the bottom of the view.
    for (const sx of [-1, 1]) {
      this.add(rbox(0.09, 0.16, 0.12, 0.04), this.seatMat, e.x + sx * 0.24, e.y - 0.58, e.z - 0.05);
    }
    // Door cards with a trim line.
    for (const sx of [-1, 1]) {
      const x = sx * (b.cabinWidth * 0.5 - 0.03);
      this.add(rbox(0.04, 0.22, 0.95, 0.02), this.dashMat, x, e.y - 0.36, e.z + 0.25);
      this.add(rbox(0.02, 0.02, 0.8, 0.008), this.trimMat, x - sx * 0.02, e.y - 0.26, e.z + 0.25);
    }
  }

  buildWheel() {
    const e = this.eye;
    const s = this.style;
    const R = s.wheelR;
    // The wheel faces the driver, tilted back about 22°.
    this.column = new THREE.Group();
    this.column.position.set(e.x, e.y - 0.3, e.z + 0.5);
    this.column.rotation.x = 0.38;
    this.root.add(this.column);
    this.add(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 10), this.dashMat, 0, 0, 0.12, this.column)
      .rotation.x = Math.PI / 2;

    this.wheel = new THREE.Group();
    this.column.add(this.wheel);
    const rim = (geo) => this.add(geo, this.rimMat, 0, 0, 0, this.wheel);
    if (s.wheel === 'yoke') {
      // Rectangular yoke: two grips joined by a top bar and a hub bar.
      for (const sx of [-1, 1]) rim(rbox(0.035, 0.17, 0.04, 0.016)).position.set(sx * R, -0.01, 0);
      rim(rbox(R * 2, 0.03, 0.035, 0.012)).position.set(0, -0.09, 0);
      rim(rbox(R * 1.4, 0.026, 0.03, 0.01)).position.set(0, 0.07, 0);
    } else if (s.wheel === 'flat') {
      // Round rim with a flat bottom section.
      rim(new THREE.TorusGeometry(R, 0.017, 8, 40, Math.PI * 1.62)).rotation.z = -Math.PI * 0.31;
      rim(rbox(R * 1.12, 0.03, 0.03, 0.012)).position.set(0, -R * 0.84, 0);
      // Accent stripe at 12 o'clock.
      this.add(rbox(0.012, 0.035, 0.036, 0.004), this.glowMat, 0, R, 0, this.wheel);
    } else {
      const thick = s.wheel === 'classic' ? 0.011 : 0.017;
      rim(new THREE.TorusGeometry(R, thick, 8, 44));
    }
    // Hub and spokes.
    this.add(new THREE.CylinderGeometry(0.05, 0.055, 0.04, 18), this.dashMat, 0, 0, 0.01, this.wheel)
      .rotation.x = Math.PI / 2;
    this.add(new THREE.CircleGeometry(0.018, 14), this.accentMat, 0, 0, -0.012, this.wheel).rotation.y = Math.PI;
    const spokeAngles = s.spokes === 2 ? [0, Math.PI]
      : s.spokes === 4 ? [0.35, Math.PI - 0.35, Math.PI + 0.45, -0.45]
        : [0, Math.PI, -Math.PI / 2];
    if (s.wheel !== 'yoke') {
      for (const a of spokeAngles) {
        const spoke = this.add(rbox(R - 0.05, 0.022, 0.016, 0.008), s.wheel === 'classic' ? this.accentMat : this.dashMat,
          Math.cos(a) * (R / 2 + 0.02), Math.sin(a) * (R / 2 + 0.02), 0.004, this.wheel);
        spoke.rotation.z = a;
      }
    }
    // Grip points on the rim at 9 and 3 o'clock (driver's left is +x).
    this.gripLeft = new THREE.Vector3(R, 0.0, -0.01);
    this.gripRight = new THREE.Vector3(-R, 0.0, -0.01);
  }

  buildShifter() {
    const e = this.eye;
    const s = this.style;
    // The lever sits on the console, beside the driver's right leg (-x of
    // the driver, towards the car's centre).
    this.lever = new THREE.Group();
    this.lever.position.set(Math.max(0.02, e.x - 0.3), this.consoleTop + 0.01, e.z + 0.52);
    this.root.add(this.lever);
    const boot = this.add(new THREE.CylinderGeometry(0.045, 0.06, 0.03, 14), this.dashMat, 0, 0.012, 0, this.lever);
    boot.scale.set(1, 1, 1);
    let length;
    if (s.shifter === 'selector') {
      length = 0.07;
      this.add(rbox(0.05, 0.03, 0.07, 0.012), this.accentMat, 0, length, 0, this.lever);
    } else if (s.shifter === 'sequential') {
      length = 0.13;
      this.add(rbox(0.035, 0.06, 0.05, 0.014), this.rimMat, 0, length, 0, this.lever);
      this.add(rbox(0.037, 0.01, 0.052, 0.004), this.glowMat, 0, length + 0.02, 0, this.lever);
    } else {
      length = 0.2;
      this.add(new THREE.SphereGeometry(0.03, 16, 12), s.trim === 0x26262b ? this.rimMat : this.accentMat, 0, length, 0, this.lever);
    }
    this.add(new THREE.CylinderGeometry(0.008, 0.01, length, 8), this.accentMat, 0, length / 2, 0, this.lever);
    this.knobLocal = new THREE.Vector3(0, length + 0.01, 0);
  }

  buildHands() {
    const e = this.eye;
    // Shoulders sit just below and either side of the eye.
    this.shoulderLeft = new THREE.Vector3(e.x + 0.22, e.y - 0.46, e.z - 0.05);
    this.shoulderRight = new THREE.Vector3(e.x - 0.22, e.y - 0.46, e.z - 0.05);
    const hand = () => {
      const g = new THREE.Group();
      this.add(rbox(0.085, 0.045, 0.1, 0.02), this.gloveMat, 0, 0, 0, g);
      // Fingers curled over the rim and a thumb on top.
      this.add(rbox(0.08, 0.035, 0.035, 0.014), this.gloveMat, 0, -0.015, 0.05, g);
      this.add(rbox(0.026, 0.026, 0.06, 0.012), this.gloveMat, 0, 0.026, 0.02, g);
      this.root.add(g);
      return g;
    };
    const arm = () => {
      const geo = new THREE.CylinderGeometry(0.034, 0.042, 1, 10);
      geo.translate(0, 0.5, 0);
      const m = new THREE.Mesh(geo, this.sleeveMat);
      m.castShadow = false;
      this.root.add(m);
      return m;
    };
    this.handLeft = hand();
    this.handRight = hand();
    this.armLeft = arm();
    this.armRight = arm();
  }

  /** Light the dashboard arrow for an indicator blink. */
  setSignal(side, on) {
    for (const key of ['left', 'right']) {
      this.arrowMat[key].color.setHex(on && key === side ? 0x3dff6a : 0x1d3b22);
    }
  }

  /** Start the shift animation (dir +1 for an upshift, -1 for a downshift). */
  shift(dir) {
    this.shiftT = 0;
    this.shiftDir = dir >= 0 ? 1 : -1;
  }

  /** Grip position on the wheel rim, in cockpit space. */
  gripWorld(local, out) {
    this.root.updateMatrixWorld(true);
    out.copy(local);
    this.wheel.localToWorld(out);
    return this.root.worldToLocal(out);
  }

  knobWorld(out) {
    out.copy(this.knobLocal);
    this.lever.localToWorld(out);
    return this.root.worldToLocal(out);
  }

  placeArm(arm, shoulder, handPos) {
    tmpB.copy(handPos).sub(shoulder);
    const len = tmpB.length();
    arm.position.copy(shoulder);
    arm.quaternion.setFromUnitVectors(UP, tmpB.normalize());
    arm.scale.set(1, Math.max(0.05, len - 0.04), 1);
  }

  /** Turn the cabin cut-out on or off on every exterior material. */
  setClipping(on) {
    if (on === this.clipped) return;
    this.clipped = on;
    this.model.body.traverse((obj) => {
      if (!obj.isMesh) return;
      let p = obj;
      while (p && p !== this.root) p = p.parent;
      if (p === this.root) return; // the cockpit itself is never clipped
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        m.clippingPlanes = on ? this.clipWorld : null;
        m.clipIntersection = on;
        m.needsUpdate = true;
      }
    });
  }

  update(dt, steer, visible) {
    this.root.visible = visible;
    // The exterior model's dark cabin filler would sit right under the eye.
    if (this.model.interiorBlock) this.model.interiorBlock.visible = !visible;
    this.setClipping(visible);
    if (!visible) return;
    this.model.body.updateMatrixWorld(true);
    for (let i = 0; i < this.clipLocal.length; i++) {
      this.clipWorld[i].copy(this.clipLocal[i]).applyMatrix4(this.model.body.matrixWorld);
    }
    // About 100° of wheel at full lock; turning left turns the wheel
    // anticlockwise as the driver sees it.
    this.steerAngle += (steer * 1.75 - this.steerAngle) * (1 - Math.exp(-18 * dt));
    this.wheel.rotation.z = this.steerAngle;

    // Lever: rests upright, tilts forward for downshifts, back for upshifts.
    let reach = 0;
    if (this.shiftT >= 0) {
      this.shiftT += dt;
      const t = this.shiftT;
      if (t < REACH) reach = ease(t / REACH);
      else if (t < REACH + THROW) {
        reach = 1;
        this.leverTilt = -this.shiftDir * 0.35 * ease((t - REACH) / THROW);
      } else if (t < SHIFT_TIME) {
        reach = 1 - ease((t - REACH - THROW) / RETURN);
      } else {
        this.shiftT = -1;
      }
    }
    // The lever springs back to centre once released.
    if (this.shiftT < 0 || this.shiftT > REACH + THROW) this.leverTilt *= Math.exp(-10 * dt);
    this.lever.rotation.x = this.leverTilt;

    // Left hand always on the wheel; the right hand blends from its grip to
    // the shift knob.
    const left = this.gripWorld(this.gripLeft, tmpA).clone();
    this.handLeft.position.copy(left);
    this.handLeft.quaternion.copy(this.column.quaternion);
    this.handLeft.rotateZ(this.steerAngle);
    this.placeArm(this.armLeft, this.shoulderLeft, left);

    const grip = this.gripWorld(this.gripRight, new THREE.Vector3());
    const knob = this.knobWorld(new THREE.Vector3());
    knob.y += 0.03;
    const right = grip.lerp(knob, reach);
    this.handRight.position.copy(right);
    this.handRight.quaternion.copy(this.column.quaternion);
    this.handRight.rotateZ(this.steerAngle * (1 - reach));
    this.handRight.rotateX(reach * 1.0);
    this.placeArm(this.armRight, this.shoulderRight, right);
  }

  /** Camera position for the cockpit view, in world space. */
  eyeWorld(out) {
    this.model.body.updateMatrixWorld(true);
    out.copy(this.eye);
    return this.model.body.localToWorld(out);
  }
}
