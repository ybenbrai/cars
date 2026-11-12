// Modern procedural car bodies (original designs, no real-car copies).
//
// The original generator lofts one rounded box per station, which reads as a
// toy. This builder lofts a fixed-topology cross-section with real design
// features: a floor, an inset side skirt, a sharp character line, a shoulder
// crease, raised wing peaks over each axle and a low central bonnet valley.
// Creases stay sharp (creased normals) while panels stay smooth.
//
// A car opts in with `modern: 'hyper'` in its definition. The result is swapped
// into the existing CarModel like a glTF model: body parts lean with the body,
// wheels spin and steer, and the game's own paint, glass, rim and lamp
// materials are used so customisation and brake lights keep working.

import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

/* ───────────────────────── helpers ───────────────────────── */

/** Monotone cubic interpolation through [t, value] keys (no overshoot). */
function curve(keys) {
  const k = keys.slice().sort((a, b) => a[0] - b[0]);
  const n = k.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((k[i + 1][1] - k[i][1]) / (k[i + 1][0] - k[i][0]));
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) { const t = 3 / Math.sqrt(h); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (t) => {
    if (t <= k[0][0]) return k[0][1];
    if (t >= k[n - 1][0]) return k[n - 1][1];
    let i = 0;
    while (i < n - 2 && t > k[i + 1][0]) i++;
    const h = k[i + 1][0] - k[i][0];
    const u = (t - k[i][0]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * k[i][1] + (u3 - 2 * u2 + u) * h * m[i]
      + (-2 * u3 + 3 * u2) * k[i + 1][1] + (u3 - u2) * h * m[i + 1];
  };
}

/**
 * Loft closed rings (arrays of [x, y]) placed at z positions into a mesh.
 * Every ring must have the same number of points. Ends are capped.
 */
function loft(rings, zs, crease = 0.6) {
  const n = rings[0].length;
  const pos = [];
  const idx = [];
  rings.forEach((ring, i) => ring.forEach(([x, y]) => pos.push(x, y, zs[i])));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const a = i * n + j;
      const b = i * n + ((j + 1) % n);
      const c = (i + 1) * n + ((j + 1) % n);
      const d = (i + 1) * n + j;
      idx.push(a, b, c, a, c, d);
    }
  }
  const cap = (ri, flip) => {
    const ring = rings[ri];
    let cx = 0;
    let cy = 0;
    for (const [x, y] of ring) { cx += x; cy += y; }
    const c = pos.length / 3;
    pos.push(cx / n, cy / n, zs[ri]);
    for (let j = 0; j < n; j++) {
      const a = ri * n + j;
      const b = ri * n + ((j + 1) % n);
      if (flip) idx.push(c, b, a); else idx.push(c, a, b);
    }
  };
  cap(0, false);
  cap(rings.length - 1, true);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  return toCreasedNormals(geo, crease);
}

const mesh = (geo, mat, parent, shadow = true) => {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  parent.add(m);
  return m;
};

/** A thin glowing strip from point a to point b (car space). */
function strip(parent, mat, a, b, thick = 0.018, depth = 0.02) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  // Built while the parent has an identity transform, so lookAt (which works
  // in world space) points the strip's length (+z) from a to b.
  const m = mesh(new THREE.BoxGeometry(thick, depth, va.distanceTo(vb)), mat, parent, false);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.lookAt(vb);
  return m;
}

/* ───────────────────────── designs ───────────────────────── */

// Each design returns longitudinal profiles over t (0 = tail, 1 = nose) and
// a canopy description. Values are multiples of the car's own dimensions.
const DESIGNS = {
  // Mid-engined wedge hypercar: low nose, flared rear hips, teardrop canopy.
  hyper: (b) => {
    const r = b.wheelRadius;
    const tF = 0.5 + b.wheelbase / b.length; // front axle
    const tR = 0.5 - b.wheelbase / b.length; // rear axle
    return {
      floor: 0.12,
      halfWidth: curve([[0, 0.9], [0.05, 0.985], [tR, 1.0], [0.42, 0.93], [0.6, 0.92], [tF, 0.965], [0.93, 0.92], [1, 0.74]]),
      center: curve([[0, 0.8], [0.05, 0.88], [0.18, 0.92], [0.32, 0.94], [0.42, 0.91], [0.62, 0.8], [0.8, 0.72], [0.93, 0.6], [1, 0.44]]),
      fender: curve([[0, 0.82], [0.06, 0.93], [tR, r * 2 + 0.2], [0.42, 0.92], [0.6, 0.84], [tF, r * 2 + 0.09], [0.93, 0.64], [1, 0.46]]),
      mid: curve([[0, 0.5], [0.5, 0.52], [1, 0.32]]),
      canopy: { from: 0.33, to: 0.68, roof: 1.13, base: 0.88 },
    };
  },
};

/* ───────────────────────── body ───────────────────────── */

const RING = 10; // points per half-section (mirrored to 20)

function buildBody(model, def, d) {
  const b = def.body;
  const L = b.length;
  const W = b.width;
  const r = b.wheelRadius;
  const archR = r + 0.06;
  const axles = [-b.wheelbase, b.wheelbase];
  const group = new THREE.Group();
  const STATIONS = 90;
  const rings = [];
  const zs = [];
  const info = [];

  for (let i = 0; i < STATIONS; i++) {
    const t = i / (STATIONS - 1);
    const z = -L / 2 + t * L;
    const w = (W / 2) * d.halfWidth(t);
    let floor = d.floor;
    // Wheel openings: raise the lower edge of the body over each wheel.
    for (const za of axles) {
      const dz = z - za;
      if (Math.abs(dz) < archR) floor = Math.max(floor, r + Math.sqrt(archR * archR - dz * dz));
    }
    const center = d.center(t);
    const fender = Math.max(d.fender(t), center + 0.015);
    const mid = Math.min(d.mid(t), fender - 0.12);
    const skirt = Math.min(floor + 0.09, mid - 0.04);
    const shoulder = Math.max(mid + 0.06, fender - 0.07);
    // Half section from bottom centre, round the side, to top centre.
    const half = [
      [0, floor],
      [w * 0.82, floor],
      [w * 0.93, floor + 0.01],
      [w * 0.95, skirt], // inset skirt: a dark-shadowed step
      [w, skirt + 0.03],
      [w * 1.0, mid], // character line
      [w * 0.985, shoulder], // shoulder crease
      [w * 0.84, fender], // wing peak
      [w * 0.62, (fender + center) / 2 + 0.01], // wing flowing into the bonnet
      [w * 0.36, center + 0.008], // bonnet valley edge
      [0, center],
    ];
    const ring = [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];
    rings.push(ring);
    zs.push(z);
    info.push({ t, z, w, floor, center, fender, mid });
  }
  const shell = mesh(loft(rings, zs, 0.62), model.paintMat, group);
  shell.userData.part = 'shell';

  // Dark wheel-arch liners so the openings read as deep wells.
  for (const za of axles) {
    for (const sx of [-1, 1]) {
      const st = info.reduce((a, s) => (Math.abs(s.z - za) < Math.abs(a.z - za) ? s : a));
      const liner = mesh(new THREE.CylinderGeometry(archR, archR, 0.42, 28, 1, true, 0, Math.PI), model.archMat || model.trimMat, group, false);
      liner.rotation.z = Math.PI / 2;
      liner.position.set(sx * (st.w - 0.24), r, za);
    }
  }
  return { group, info, axles, archR };
}

/** Surface helpers from the station table. */
function sampler(info) {
  const at = (z) => info.reduce((a, s) => (Math.abs(s.z - z) < Math.abs(a.z - z) ? s : a));
  return { at };
}

function buildCanopy(model, def, d, info) {
  const b = def.body;
  const L = b.length;
  const group = new THREE.Group();
  const c = d.canopy;
  const S = 22;
  const rings = [];
  const zs = [];
  const roofLine = curve([[0, c.base], [0.18, c.roof - 0.05], [0.42, c.roof], [0.62, c.roof - 0.015], [0.86, c.roof - 0.16], [1, c.base]]);
  for (let i = 0; i < S; i++) {
    const s = i / (S - 1);
    const t = c.from + (c.to - c.from) * s;
    const z = -L / 2 + t * L;
    const st = info.reduce((a, x) => (Math.abs(x.z - z) < Math.abs(a.z - z) ? x : a));
    const base = Math.max(st.center - 0.02, c.base - 0.05);
    const top = Math.max(base + 0.02, roofLine(s));
    const wb = st.w * 0.62;
    const wt = st.w * 0.36 * Math.min(1, 0.4 + Math.sin(Math.PI * s) * 0.9);
    const half = [[0, base], [wb, base], [wb * 0.96, base + (top - base) * 0.45], [wt, top - 0.03], [0, top]];
    rings.push([...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])]);
    zs.push(z);
  }
  mesh(loft(rings, zs, 0.9), model.glassMat, group, false);
  // Body-colour spine over the canopy and gloss-black pillars.
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.02, (c.to - c.from) * L * 0.62), model.paintMat);
  spine.position.set(0, c.roof + 0.005, -L / 2 + ((c.from + c.to) / 2) * L - 0.05);
  group.add(spine);
  return group;
}

/* ───────────────────────── details ───────────────────────── */

function buildDetails(model, def, info) {
  const b = def.body;
  const L = b.length;
  const W = b.width;
  const g = new THREE.Group();
  const { at } = sampler(info);
  const nose = at(L / 2 - 0.02);
  const tail = at(-L / 2 + 0.02);
  const black = model.trimMat;
  const carbon = model.carbonMat;

  // Front: carbon splitter, two deep intakes and a centre slot.
  const splitter = mesh(new THREE.BoxGeometry(W * 0.8, 0.025, 0.2), carbon, g);
  splitter.position.set(0, 0.13, L / 2 - 0.02);
  for (const sx of [-1, 1]) {
    // Intake recessed into the nose face, not hanging below it.
    // (Lower intakes are left to the splitter's shadow for now.)
    // Y-shaped LED running light: three thin strips meeting at a point.
    const yx = sx * W * 0.33;
    const yz = L / 2 - 0.2;
    const yy = at(yz).center + 0.02;
    // Dark headlamp housing with a bright lens and a Y-shaped LED signature.
    const housing = mesh(new THREE.BoxGeometry(0.34, 0.035, 0.24), model.projectorMat || black, g, false);
    housing.position.set(yx, yy - 0.004, yz);
    housing.rotation.y = sx * 0.32;
    housing.rotation.x = -0.18;
    const lens = mesh(new THREE.BoxGeometry(0.16, 0.022, 0.09), model.headMat, g, false);
    lens.position.set(yx + sx * 0.03, yy + 0.012, yz - 0.03);
    lens.rotation.y = sx * 0.32;
    strip(g, model.drlMat, [yx, yy + 0.02, yz + 0.04], [yx + sx * 0.17, yy + 0.008, yz - 0.1], 0.022, 0.012);
    strip(g, model.drlMat, [yx, yy + 0.02, yz + 0.04], [yx - sx * 0.13, yy + 0.02, yz + 0.02], 0.022, 0.012);
    strip(g, model.drlMat, [yx, yy + 0.02, yz + 0.04], [yx + sx * 0.04, yy - 0.05, yz + 0.14], 0.022, 0.012);
    // Side intake behind the door: a dark, raked scoop on the flank.
    const zs = -0.25;
    const st = at(zs);
    const scoop = mesh(new THREE.BoxGeometry(0.012, 0.17, 0.56), black, g, false);
    scoop.position.set(sx * (st.w + 0.004), st.mid + 0.05, zs);
    scoop.rotation.x = 0.32;
    // Wing mirror on a thin stalk.
    const mz = 0.62;
    const ms = at(mz);
    const mx = sx * ms.w * 0.72;
    const my = ms.center + 0.17;
    const mirror = mesh(new THREE.SphereGeometry(0.075, 16, 10), model.paintMat, g);
    mirror.scale.set(1.3, 0.62, 0.9);
    mirror.position.set(mx + sx * 0.16, my, mz);
    const stalk = mesh(new THREE.BoxGeometry(0.16, 0.018, 0.04), black, g, false);
    stalk.position.set(mx + sx * 0.07, my - 0.03, mz + 0.02);
    stalk.rotation.z = sx * 0.3;
  }

  // Rear: full-width LED bar, Y lamps, diffuser fins, hexagonal exhaust, wing.
  const ty = tail.center - 0.06;
  const bar = mesh(new THREE.BoxGeometry(W * 0.84, 0.022, 0.02), model.tailMat, g, false);
  bar.position.set(0, ty, -L / 2 - 0.004);
  for (const sx of [-1, 1]) {
    const x0 = sx * W * 0.36;
    strip(g, model.tailMat, [x0, ty, -L / 2], [x0 + sx * 0.08, ty - 0.12, -L / 2 + 0.03], 0.02, 0.02);
    strip(g, model.tailMat, [x0, ty, -L / 2], [x0 - sx * 0.1, ty - 0.1, -L / 2 + 0.03], 0.02, 0.02);
    const sig = mesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), model.signalMats?.[sx > 0 ? 'left' : 'right'] || model.tailMat, g, false);
    sig.position.set(sx * W * 0.43, ty - 0.035, -L / 2 + 0.005);
  }
  // Dark tail panel the lamps sit on, and a diffuser tucked under the tail.
  const panel = mesh(new THREE.BoxGeometry(W * 0.86, 0.17, 0.02), black, g, false);
  panel.position.set(0, ty - 0.05, -L / 2 - 0.002);
  const diffuser = mesh(new THREE.BoxGeometry(W * 0.72, 0.035, 0.36), carbon, g);
  diffuser.position.set(0, 0.2, -L / 2 + 0.16);
  diffuser.rotation.x = -0.22;
  for (let i = -3; i <= 3; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.016, 0.09, 0.3), carbon, g, false);
    fin.position.set(i * W * 0.1, 0.235, -L / 2 + 0.14);
  }
  const exhaust = mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.16, 6), model.chromeMat, g, false);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0, 0.34, -L / 2 - 0.02);
  const bore = mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.17, 6), black, g, false);
  bore.rotation.x = Math.PI / 2;
  bore.position.copy(exhaust.position);
  model.exhausts = [new THREE.Vector3(0, 0.34, -L / 2 - 0.12)];

  const wingZ = -L / 2 + 0.2;
  const wy = at(wingZ).center + 0.38;
  const wing = mesh(new THREE.BoxGeometry(W * 0.86, 0.03, 0.3), carbon, g);
  wing.position.set(0, wy, wingZ);
  wing.rotation.x = -0.08;
  for (const sx of [-1, 1]) {
    const plate = mesh(new THREE.BoxGeometry(0.02, 0.18, 0.38), carbon, g, false);
    plate.position.set(sx * W * 0.43, wy - 0.02, wingZ);
    const strut = mesh(new THREE.BoxGeometry(0.03, 0.28, 0.08), black, g, false);
    strut.position.set(sx * W * 0.2, wy - 0.15, wingZ + 0.02);
  }
  return g;
}

/* ───────────────────────── wheels ───────────────────────── */

function buildWheel(model, def, front) {
  const r = def.body.wheelRadius;
  const width = front ? 0.27 : 0.33;
  const g = new THREE.Group();
  // Low-profile tyre: lathe around the axle (x).
  const rimR = r * 0.76;
  const prof = [
    [rimR, -width / 2], [r * 0.93, -width / 2], [r, -width * 0.38], [r, width * 0.38], [r * 0.93, width / 2], [rimR, width / 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tyre = new THREE.LatheGeometry(prof, 40);
  tyre.rotateZ(Math.PI / 2);
  mesh(tyre, model.rubberMat, g);
  // Rim: barrel, 10 split spokes and a centre cap, on the outer face.
  const outer = width / 2 - 0.02;
  const barrel = new THREE.CylinderGeometry(rimR, rimR, width * 0.9, 36, 1, true);
  barrel.rotateZ(Math.PI / 2);
  mesh(barrel, model.rimMat, g, false);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spoke = mesh(new THREE.BoxGeometry(0.03, rimR * 0.92, 0.035), model.rimMat, g, false);
    spoke.position.set(outer, Math.cos(a) * rimR * 0.48, Math.sin(a) * rimR * 0.48);
    spoke.rotation.x = -a;
    spoke.rotation.y = 0.1;
  }
  const hub = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6), model.rimMat, g, false);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = outer + 0.01;
  // Brake disc (spins) — the caliper is added to the non-spinning pivot.
  const disc = mesh(new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, 32), model.chromeMat, g, false);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = outer - 0.08;
  return { g, width, rimR, outer };
}

/* ───────────────────────── swap-in ───────────────────────── */

const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd8262f, metalness: 0.3, roughness: 0.4 });

export function attachModernBody(model, def) {
  const designFn = DESIGNS[def.modern];
  if (!designFn) return;
  const d = designFn(def.body);
  const { group: body, info, axles } = buildBody(model, def, d);
  body.add(buildCanopy(model, def, d, info));
  body.add(buildDetails(model, def, info));

  for (const child of model.body.children) child.visible = false;
  for (const wheel of model.wheels) wheel.pivot.visible = false;
  model.detailMeshes = [];
  model.body.add(body);

  const W = def.body.width;
  const wheels = [];
  for (const za of axles) {
    for (const sx of [-1, 1]) {
      const front = za > 0;
      const st = info.reduce((a, s) => (Math.abs(s.z - za) < Math.abs(a.z - za) ? s : a));
      const built = buildWheel(model, def, front);
      const pivot = new THREE.Group();
      pivot.position.set(sx * Math.min(st.w - built.width / 2 - 0.02, W / 2 - built.width / 2), def.body.wheelRadius, za);
      model.root.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      // Wheels are built with their outer face on +x; mirror the right side.
      if (sx < 0) built.g.scale.x = -1;
      spin.add(built.g);
      const caliper = mesh(new THREE.BoxGeometry(0.06, built.rimR * 0.5, built.rimR * 0.36), caliperMat, pivot, false);
      caliper.position.set(sx * (built.outer - 0.1), built.rimR * 0.45, front ? -0.05 : 0.05);
      wheels.push({ pivot, spin, side: sx, front });
    }
  }
  model.wheels = wheels;
  model.frontWheels = wheels.filter((w) => w.front);
  model.modernBody = body;
}
