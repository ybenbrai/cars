// Modern procedural car bodies (original designs, no real-car copies).
//
// One body engine, many design families. Every car is lofted from a
// fixed-topology cross-section with real design features: a floor, an inset
// side skirt, a character line, a shoulder crease, wings raised over each axle
// and a bonnet between them. Creases stay sharp (creased normals) while panels
// stay smooth. Proportions come from each car's own dimensions; the family
// (body style) decides the design language: roof shape, lamps, grille, tail
// lights, wing, exhausts and cladding.
//
// The result is swapped into the existing CarModel like a glTF model: body
// parts lean with the body, wheels spin and steer, and the game's own paint,
// glass, rim and lamp materials are used so customisation and lights work.

import * as THREE from 'three';
import { toCreasedNormals, mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ───────────────────────── design families ───────────────────────── */

// hood: bonnet curvature (1 = straight wedge, >1 = flat then rolls over)
// flare: extra width over the axles; wing: extra height of the wings
// roof: fast | notch | hatch | boxy | open | canopy
// lamps: y | slim | bar | square | round; grille: none | mesh | big | wide
// tail: y | bar | split | triple | square; spoiler: big | duck | roof | none
// exhaust: hex | quad | twin; spokes: rim spoke count
export const FAMILIES = {
  hatch: { cabinToTail: true, beltRaise: 0.26, hoodDrop: 0.2, tailDrop: 0.04, hood: 1.8, flare: 0.04, wing: 0.05, roof: 'hatch', lamps: 'slim', grille: 'mesh', tail: 'split', spoiler: 'roof', exhaust: 'twin', spokes: 5 },
  sedan: { beltRaise: 0.36, hoodDrop: 0.18, tailDrop: 0.06, hood: 2.6, flare: 0.035, wing: 0.04, roof: 'notch', lamps: 'bar', grille: 'big', tail: 'bar', spoiler: 'none', exhaust: 'quad', spokes: 5 },
  sports: { beltRaise: 0.12, hoodDrop: 0.26, tailDrop: 0.08, hood: 1.4, flare: 0.06, wing: 0.06, roof: 'fast', lamps: 'slim', grille: 'mesh', tail: 'split', spoiler: 'duck', exhaust: 'twin', spokes: 10 },
  roadster: { beltRaise: 0.1, hoodDrop: 0.2, tailDrop: 0.06, hood: 1.6, flare: 0.05, wing: 0.05, roof: 'open', lamps: 'round', grille: 'mesh', tail: 'split', spoiler: 'duck', exhaust: 'twin', spokes: 5 },
  gt: { beltRaise: 0.14, hoodDrop: 0.24, tailDrop: 0.08, hood: 2.0, flare: 0.06, wing: 0.06, roof: 'fast', lamps: 'slim', grille: 'mesh', tail: 'bar', spoiler: 'duck', exhaust: 'quad', spokes: 10 },
  muscle: { beltRaise: 0.26, hoodDrop: 0.12, tailDrop: 0.06, hood: 3.0, flare: 0.07, wing: 0.05, roof: 'fast', lamps: 'square', grille: 'wide', tail: 'triple', spoiler: 'duck', exhaust: 'twin', spokes: 5 },
  super: { beltRaise: 0.02, hoodDrop: 0.36, tailDrop: 0.12, hood: 1.15, flare: 0.08, wing: 0.08, roof: 'canopy', lamps: 'slim', grille: 'none', tail: 'bar', spoiler: 'duck', exhaust: 'quad', spokes: 10, scoops: true, diffuser: true },
  hyper: { beltRaise: 0, hoodDrop: 0.42, tailDrop: 0.16, hood: 1.0, flare: 0.09, wing: 0.1, roof: 'canopy', lamps: 'y', grille: 'none', tail: 'y', spoiler: 'big', exhaust: 'hex', spokes: 10, scoops: true, diffuser: true },
  suv: { beltRaise: 0.3, hoodDrop: 0.14, tailDrop: 0.04, hood: 3.2, flare: 0.04, wing: 0.03, roof: 'boxy', lamps: 'square', grille: 'big', tail: 'square', spoiler: 'roof', exhaust: 'twin', spokes: 5, clad: true, rails: true },
  offroad: { beltRaise: 0.3, hoodDrop: 0.12, tailDrop: 0.04, hood: 3.0, flare: 0.06, wing: 0.04, roof: 'boxy', lamps: 'round', grille: 'wide', tail: 'square', spoiler: 'roof', exhaust: 'twin', spokes: 6, clad: true, lightbar: true },
};

export const familyFor = (def) => (FAMILIES[def.body?.style] ? def.body.style : null);

/* ───────────────────────── helpers ───────────────────────── */

/** Monotone cubic interpolation through [t, value] keys (no overshoot). */
function curve(keys) {
  const k = keys.slice().sort((a, b) => a[0] - b[0]);
  const n = k.length;
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((k[i + 1][1] - k[i][1]) / Math.max(1e-6, k[i + 1][0] - k[i][0]));
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
    const h = Math.max(1e-6, k[i + 1][0] - k[i][0]);
    const u = (t - k[i][0]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * k[i][1] + (u3 - 2 * u2 + u) * h * m[i]
      + (-2 * u3 + 3 * u2) * k[i + 1][1] + (u3 - u2) * h * m[i + 1];
  };
}

const smooth = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));

/** Loft closed rings (same point count) at z positions; ends are capped. */
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
    let cx = 0;
    let cy = 0;
    for (const [x, y] of rings[ri]) { cx += x; cy += y; }
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

const mirror = (half) => [...half, ...half.slice(1, -1).reverse().map(([x, y]) => [-x, y])];

function mesh(geo, mat, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.receiveShadow = false;
  parent.add(m);
  return m;
}

/** A thin bar from a to b (car space; parent must have identity transform). */
function strip(parent, mat, a, b, thick = 0.018, depth = 0.02) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const m = mesh(new THREE.BoxGeometry(thick, depth, va.distanceTo(vb)), mat, parent, false);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.lookAt(vb);
  return m;
}

/* ───────────────────────── profile ───────────────────────── */

/** Longitudinal profile of a car from its dimensions and family. */
function profileFor(def, fam) {
  const b = def.body;
  const L = b.length;
  const r = b.wheelRadius;
  const tOf = (z) => Math.min(1, Math.max(0, (z + L / 2) / L));
  // Hatchbacks: the roof runs almost to the tail, ending in a steep hatch.
  const tCabR = fam.cabinToTail ? tOf(-L / 2 + 0.22) : tOf(b.cabinZ - b.cabinLength / 2);
  const tCabF = tOf(b.cabinZ + b.cabinLength / 2);
  // Beltline: part of the old cabin height becomes painted body, so tall
  // cars get tall flanks and a sensible amount of glass.
  const raise = b.cabinHeight * fam.beltRaise;
  const belt = Math.max(b.rideHeight + 0.33, r * 2 + 0.11) + raise;
  const glassH = b.cabinHeight - raise;
  const floor = Math.max(0.1, b.rideHeight - 0.2);
  const noseY = Math.max(floor + 0.2, b.noseDrop - 0.04, belt - fam.hoodDrop - 0.1);
  const tailY = fam.cabinToTail ? belt - 0.02 : Math.max(b.tailHeight, belt - fam.tailDrop);
  const hoodTop = belt - 0.03;
  // Bonnet from the windscreen (u=0) to the nose (u=1).
  const keys = [[0, tailY - 0.05], [0.035, tailY + 0.01], [Math.max(0.06, tCabR - 0.05), Math.max(tailY + 0.03, belt - 0.04)], [tCabR, belt], [tCabF, belt - 0.01]];
  for (const u of [0.08, 0.3, 0.55, 0.78, 0.92]) {
    const t = tCabF + (0.985 - tCabF) * u;
    keys.push([t, hoodTop - (hoodTop - noseY) * u ** fam.hood]);
  }
  keys.push([1, noseY - 0.06]);
  return { center: curve(keys), floor, belt, glassH, tCabR, tCabF };
}

/* ───────────────────────── body ───────────────────────── */

function buildBody(model, def, fam, prof) {
  const b = def.body;
  const L = b.length;
  const W = b.width;
  const r = b.wheelRadius;
  const archR = r + 0.07;
  const axles = [-b.wheelbase, b.wheelbase];
  const group = new THREE.Group();
  const STATIONS = 96;
  const rings = [];
  const zs = [];
  const info = [];
  const wingTop = r + archR + 0.06 + fam.wing;

  for (let i = 0; i < STATIONS; i++) {
    const t = i / (STATIONS - 1);
    const z = -L / 2 + t * L;
    let flare = 0;
    let wing = 0;
    let floor = prof.floor;
    for (const za of axles) {
      const dz = Math.abs(z - za);
      const reach = archR + 0.55;
      if (dz < reach) {
        const u = 1 - smooth(Math.max(0, dz - archR * 0.6) / (reach - archR * 0.6));
        flare = Math.max(flare, u);
        wing = Math.max(wing, u);
      }
      if (dz < archR) floor = Math.max(floor, r + Math.sqrt(archR * archR - dz * dz));
    }
    // Width: flared over the axles, tapered at both ends.
    const endTaper = Math.min(1, 0.86 + Math.min(1, t / 0.07) * 0.14) * Math.min(1, 0.8 + Math.min(1, (1 - t) / 0.09) * 0.2);
    const w = (W / 2) * endTaper * (0.94 + fam.flare * flare) / (1 + fam.flare * 0.4);
    const center = prof.center(t);
    const archClear = (r + archR + 0.07) * wing;
    const fender = Math.max(center + 0.02, center + fam.wing * wing, archClear, Math.min(wingTop, center + fam.wing + 0.06) * (wing > 0.5 ? 1 : 0));
    const top = Math.max(fender, center);
    const mid = floor + (Math.min(top, center + 0.1) - floor) * 0.55;
    const skirt = Math.min(floor + 0.08, mid - 0.05);
    const shoulder = Math.max(mid + 0.05, top - 0.07);
    const half = [
      [0, floor],
      [w * 0.82, floor],
      [w * 0.93, floor + 0.01],
      [w * 0.95, skirt],
      [w, skirt + 0.03],
      [w, mid],
      [w * 0.985, shoulder],
      [w * 0.86, fender],
      [w * 0.62, (fender + center) / 2 + 0.01],
      [w * 0.36, center + 0.008],
      [0, center],
    ];
    rings.push(mirror(half));
    zs.push(z);
    info.push({ t, z, w, floor, center, fender, mid });
  }
  mesh(loft(rings, zs, 0.62), model.paintMat, group);

  // Deep wheel wells (and black cladding on rugged cars).
  for (const za of axles) {
    const st = nearest(info, za);
    for (const sx of [-1, 1]) {
      const liner = mesh(new THREE.CylinderGeometry(archR, archR, 0.42, 28, 1, true, 0, Math.PI), model.archMat || model.trimMat, group, false);
      liner.rotation.z = Math.PI / 2;
      liner.position.set(sx * (st.w - 0.24), r, za);
      if (fam.clad) {
        const clad = mesh(new THREE.TorusGeometry(archR + 0.03, 0.045, 6, 24, Math.PI), model.trimMat, group, false);
        clad.rotation.y = Math.PI / 2;
        clad.position.set(sx * (st.w - 0.01), r, za);
      }
    }
  }
  if (def.modernBed) {
    // Pickup: an open load bed between the cab and the tailgate.
    const z0 = -L / 2 + 0.12;
    const z1 = b.cabinZ - b.cabinLength / 2 - 0.08;
    const st = nearest(info, (z0 + z1) / 2);
    const bed = mesh(new THREE.BoxGeometry(st.w * 1.7, 0.02, z1 - z0), model.trimMat, group, false);
    bed.position.set(0, st.center + 0.004, (z0 + z1) / 2);
    for (const sx of [-1, 1]) {
      const rail = mesh(new THREE.BoxGeometry(0.05, 0.05, z1 - z0), model.trimMat, group, false);
      rail.position.set(sx * st.w * 0.9, st.center + 0.03, (z0 + z1) / 2);
    }
    // Low sports bar behind the cab: two posts and a crossbar.
    for (const sx of [-1, 1]) {
      const post = mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), model.trimMat, group, false);
      post.position.set(sx * st.w * 0.8, st.center + 0.15, z1 - 0.12);
    }
    const cross = mesh(new THREE.BoxGeometry(st.w * 1.65, 0.05, 0.05), model.trimMat, group, false);
    cross.position.set(0, st.center + 0.3, z1 - 0.12);
  }
  if (fam.clad) {
    const st = info[Math.floor(info.length / 2)];
    for (const sx of [-1, 1]) {
      const sill = mesh(new THREE.BoxGeometry(0.04, 0.09, Math.max(0.3, b.wheelbase * 2 - (r + 0.1) * 2)), model.trimMat, group, false);
      sill.position.set(sx * (st.w + 0.005), st.floor + 0.06, 0);
    }
  }
  return { group, info, axles };
}

function nearest(info, z) {
  return info.reduce((a, s) => (Math.abs(s.z - z) < Math.abs(a.z - z) ? s : a));
}

/* ───────────────────────── cabin ───────────────────────── */

const ROOF_SHAPES = {
  // s: 0 = rear of the cabin, 1 = front (windscreen base)
  fast: [[0, 0], [0.38, 0.93], [0.55, 1], [0.74, 0.97], [0.9, 0.55], [1, 0]],
  canopy: [[0, 0], [0.25, 0.8], [0.45, 1], [0.66, 0.97], [0.86, 0.5], [1, 0]],
  notch: [[0, 0.06], [0.14, 0.82], [0.27, 1], [0.72, 1], [0.88, 0.6], [1, 0]],
  hatch: [[0, 0], [0.05, 0.86], [0.12, 1], [0.76, 1], [0.92, 0.5], [1, 0]],
  boxy: [[0, 0], [0.03, 0.9], [0.08, 1], [0.86, 1], [0.95, 0.72], [1, 0]],
};

function buildCabin(model, def, fam, prof, info) {
  const b = def.body;
  const L = b.length;
  const g = new THREE.Group();
  const z0 = -L / 2 + prof.tCabR * L;
  const z1 = -L / 2 + prof.tCabF * L;

  if (fam.roof === 'open') {
    // Roadster: raked windscreen, dark cockpit tub and two roll hoops.
    const st = nearest(info, z1 - 0.1);
    const screen = mesh(new THREE.BoxGeometry(b.cabinWidth * 0.86, 0.32, 0.02), model.glassMat, g, false);
    screen.position.set(0, st.center + 0.14, z1 - 0.05);
    screen.rotation.x = -0.55;
    const tub = mesh(new THREE.BoxGeometry(b.cabinWidth * 0.8, 0.02, (z1 - z0) * 0.8), model.trimMat, g, false);
    tub.position.set(0, nearest(info, (z0 + z1) / 2).center + 0.012, (z0 + z1) / 2);
    for (const sx of [-1, 1]) {
      const hoop = mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 18, Math.PI), model.chromeMat, g, false);
      hoop.position.set(sx * b.cabinWidth * 0.24, nearest(info, z0 + 0.2).center + 0.02, z0 + 0.22);
    }
    return g;
  }

  const shape = curve(ROOF_SHAPES[fam.roof] || ROOF_SHAPES.fast);
  const S = 26;
  const rings = [];
  const zs = [];
  const tops = [];
  for (let i = 0; i < S; i++) {
    const s = i / (S - 1);
    const z = z0 + (z1 - z0) * s;
    const st = nearest(info, z);
    const base = st.center - 0.015;
    const top = Math.max(base + 0.015, prof.belt + prof.glassH * shape(s));
    const wb = Math.min(b.cabinWidth / 2, st.w - 0.05);
    const taper = fam.roof === 'canopy' || fam.roof === 'fast' ? Math.min(1, 0.45 + Math.sin(Math.PI * s) * 0.8) : 1;
    const wt = Math.max(0.1, Math.min(wb - 0.04, (b.roofWidth / 2) * taper));
    const half = [[0, base], [wb, base], [wb * 0.97, base + (top - base) * 0.42], [wt, top - 0.04], [wt * 0.55, top - 0.004], [0, top]];
    rings.push(mirror(half));
    zs.push(z);
    tops.push({ z, top, wt, s });
  }
  mesh(loft(rings, zs, 0.9), model.glassMat, g, false);

  // Painted roof over the flat part (a canopy keeps a body-colour spine).
  const roofed = tops.filter((p) => shape(p.s) > 0.9);
  if (roofed.length > 2) {
    const rz = roofed.map((p) => p.z);
    if (fam.roof === 'canopy') {
      const spine = roofed.map((p) => mirror([[0, p.top + 0.002], [0.16, p.top - 0.004], [0.17, p.top + 0.008], [0.08, p.top + 0.014], [0, p.top + 0.016]]));
      mesh(loft(spine, rz, 0.6), model.paintMat, g);
    } else {
      const roof = roofed.map((p) => mirror([[0, p.top + 0.002], [p.wt * 0.92, p.top - 0.01], [p.wt * 0.94, p.top + 0.006], [p.wt * 0.5, p.top + 0.016], [0, p.top + 0.018]]));
      mesh(loft(roof, rz, 0.6), model.paintMat, g);
      const first = roofed[0];
      const last = roofed[roofed.length - 1];
      if (fam.rails) {
        for (const sx of [-1, 1]) {
          const rail = mesh(new THREE.BoxGeometry(0.035, 0.035, (last.z - first.z) * 0.92), model.chromeMat, g, false);
          rail.position.set(sx * first.wt * 0.8, first.top + 0.05, (first.z + last.z) / 2);
        }
      }
      if (fam.lightbar) {
        const bar = mesh(new THREE.BoxGeometry(last.wt * 1.5, 0.06, 0.07), model.trimMat, g, false);
        bar.position.set(0, last.top + 0.06, last.z - 0.05);
        const leds = mesh(new THREE.BoxGeometry(last.wt * 1.42, 0.035, 0.01), model.drlMat, g, false);
        leds.position.set(0, last.top + 0.06, last.z - 0.012);
      }
    }
    if (fam.spoiler === 'roof') {
      const rear = roofed[0];
      const lip = mesh(new THREE.BoxGeometry(rear.wt * 1.8, 0.025, 0.16), model.paintMat, g);
      lip.position.set(0, rear.top + 0.01, rear.z - 0.1);
      lip.rotation.x = 0.12;
    }
  }
  return g;
}

/* ───────────────────────── front, rear, sides ───────────────────────── */

function buildFront(model, def, fam, info, g) {
  const b = def.body;
  const L = b.length;
  const W = b.width;
  const black = model.trimMat;
  const nose = nearest(info, L / 2 - 0.06);
  const upright = fam.lamps === 'bar' || fam.lamps === 'square' || fam.lamps === 'round';
  const lampY = upright ? nose.center - 0.08 : nearest(info, L / 2 - 0.2).center + 0.006;
  const lampZ = upright ? L / 2 - 0.01 : L / 2 - 0.2;
  const lampX = nose.w * (upright ? 0.66 : 0.68);

  for (const sx of [-1, 1]) {
    const x = sx * lampX;
    if (fam.lamps === 'y') {
      const housing = mesh(new THREE.BoxGeometry(0.34, 0.035, 0.24), model.projectorMat || black, g, false);
      housing.position.set(x, lampY - 0.004, lampZ);
      housing.rotation.set(-0.18, sx * 0.32, 0);
      const lens = mesh(new THREE.BoxGeometry(0.16, 0.022, 0.09), model.headMat, g, false);
      lens.position.set(x + sx * 0.03, lampY + 0.012, lampZ - 0.03);
      lens.rotation.y = sx * 0.32;
      strip(g, model.drlMat, [x, lampY + 0.02, lampZ + 0.04], [x + sx * 0.17, lampY + 0.008, lampZ - 0.1], 0.022, 0.012);
      strip(g, model.drlMat, [x, lampY + 0.02, lampZ + 0.04], [x - sx * 0.13, lampY + 0.02, lampZ + 0.02], 0.022, 0.012);
      strip(g, model.drlMat, [x, lampY + 0.02, lampZ + 0.04], [x + sx * 0.04, lampY - 0.05, lampZ + 0.14], 0.022, 0.012);
    } else if (fam.lamps === 'slim') {
      const housing = mesh(new THREE.BoxGeometry(0.36, 0.04, 0.2), model.projectorMat || black, g, false);
      housing.position.set(x, lampY, lampZ);
      housing.rotation.set(-0.12, sx * 0.28, 0);
      const lens = mesh(new THREE.BoxGeometry(0.2, 0.024, 0.08), model.headMat, g, false);
      lens.position.set(x - sx * 0.03, lampY + 0.012, lampZ + 0.02);
      lens.rotation.y = sx * 0.28;
      strip(g, model.drlMat, [x - sx * 0.16, lampY + 0.03, lampZ + 0.08], [x + sx * 0.16, lampY + 0.03, lampZ - 0.08], 0.012, 0.012);
    } else if (fam.lamps === 'bar') {
      const lens = mesh(new THREE.BoxGeometry(0.34, 0.07, 0.03), model.projectorMat || black, g, false);
      lens.position.set(x, lampY, lampZ);
      const head = mesh(new THREE.BoxGeometry(0.26, 0.035, 0.02), model.headMat, g, false);
      head.position.set(x, lampY - 0.008, lampZ + 0.012);
      strip(g, model.drlMat, [x - sx * 0.16, lampY + 0.028, lampZ + 0.017], [x + sx * 0.16, lampY + 0.028, lampZ + 0.017], 0.012, 0.012);
    } else if (fam.lamps === 'square') {
      const box = mesh(new THREE.BoxGeometry(0.3, 0.11, 0.03), model.projectorMat || black, g, false);
      box.position.set(x, lampY, lampZ);
      const head = mesh(new THREE.BoxGeometry(0.22, 0.06, 0.02), model.headMat, g, false);
      head.position.set(x + sx * 0.02, lampY + 0.005, lampZ + 0.012);
      strip(g, model.drlMat, [x - sx * 0.14, lampY - 0.045, lampZ + 0.017], [x + sx * 0.14, lampY - 0.045, lampZ + 0.017], 0.01, 0.01);
    } else {
      const ring = mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 28), model.drlMat, g, false);
      ring.position.set(x, lampY, lampZ + 0.02);
      const head = mesh(new THREE.CircleGeometry(0.065, 24), model.headMat, g, false);
      head.position.set(x, lampY, lampZ + 0.018);
    }
  }
  // A full-width light strip across a sloping nose: modern signature.
  if (fam.lamps === 'slim') {
    strip(g, model.drlMat, [-lampX + 0.12, lampY + 0.028, lampZ + 0.09], [lampX - 0.12, lampY + 0.028, lampZ + 0.09], 0.008, 0.008);
  }

  // Grille on the nose face.
  const faceY = (nose.floor + nose.center) / 2;
  const faceH = Math.max(0.08, nose.center - nose.floor - 0.12);
  if (fam.grille === 'mesh') {
    const gr = mesh(new THREE.BoxGeometry(W * 0.42, faceH * 0.6, 0.03), black, g, false);
    gr.position.set(0, faceY - faceH * 0.1, L / 2 - 0.005);
  } else if (fam.grille === 'big') {
    const gw = W * 0.34;
    const gh = Math.min(0.26, faceH * 0.9);
    const gr = mesh(new THREE.BoxGeometry(gw, gh, 0.03), black, g, false);
    gr.position.set(0, faceY + 0.02, L / 2 - 0.005);
    const frame = mesh(new THREE.BoxGeometry(gw + 0.04, gh + 0.04, 0.02), model.chromeMat, g, false);
    frame.position.set(0, faceY + 0.02, L / 2 - 0.012);
    for (let i = 0; i < 5; i++) {
      const slat = mesh(new THREE.BoxGeometry(gw * 0.92, 0.012, 0.012), model.chromeMat, g, false);
      slat.position.set(0, faceY + 0.02 - gh * 0.38 + i * gh * 0.19, L / 2 + 0.012);
    }
  } else if (fam.grille === 'wide') {
    const gr = mesh(new THREE.BoxGeometry(W * 0.74, Math.min(0.18, faceH * 0.7), 0.03), black, g, false);
    gr.position.set(0, faceY + 0.03, L / 2 - 0.005);
    const bar = mesh(new THREE.BoxGeometry(W * 0.74, 0.014, 0.012), model.chromeMat, g, false);
    bar.position.set(0, faceY + 0.03, L / 2 + 0.012);
  }
  // Lower splitter and corner vents.
  // Splitter tucked under the nose, within the body's width there.
  const splitter = mesh(new THREE.BoxGeometry(nose.w * 1.7, 0.022, 0.16), model.carbonMat, g);
  splitter.position.set(0, nose.floor + 0.012, L / 2 - 0.1);
}

function buildRear(model, def, fam, info, g) {
  const b = def.body;
  const L = b.length;
  const W = b.width;
  const black = model.trimMat;
  const tail = nearest(info, -L / 2 + 0.05);
  const ty = tail.center - 0.07;
  const tz = -L / 2 - 0.004;
  const panelH = fam.tail === 'square' ? 0.24 : 0.16;
  const panel = mesh(new THREE.BoxGeometry(tail.w * 1.84, panelH, 0.02), black, g, false);
  panel.position.set(0, ty - panelH * 0.25, tz + 0.002);

  const tw = tail.w; // the tail is narrower than the car's full width
  for (const sx of [-1, 1]) {
    const x = sx * tw * 0.72;
    if (fam.tail === 'y') {
      strip(g, model.tailMat, [x, ty, tz], [x + sx * 0.08, ty - 0.12, tz + 0.03], 0.02, 0.02);
      strip(g, model.tailMat, [x, ty, tz], [x - sx * 0.1, ty - 0.1, tz + 0.03], 0.02, 0.02);
    } else if (fam.tail === 'split') {
      const lamp = mesh(new THREE.BoxGeometry(0.34, 0.06, 0.02), model.tailMat, g, false);
      lamp.position.set(x - sx * 0.04, ty, tz);
      lamp.rotation.z = sx * 0.08;
    } else if (fam.tail === 'triple') {
      for (let i = 0; i < 3; i++) {
        const bar = mesh(new THREE.BoxGeometry(0.03, 0.08, 0.02), model.tailMat, g, false);
        bar.position.set(x - sx * (0.1 - i * 0.07), ty - 0.01, tz);
      }
    } else if (fam.tail === 'square') {
      const lamp = mesh(new THREE.BoxGeometry(0.12, 0.2, 0.02), model.tailMat, g, false);
      lamp.position.set(sx * tw * 0.82, ty - 0.03, tz);
    }
    const sig = mesh(new THREE.BoxGeometry(0.09, 0.025, 0.02), model.signalMats?.[sx > 0 ? 'left' : 'right'] || model.tailMat, g, false);
    sig.position.set(sx * tw * 0.86, ty - (fam.tail === 'square' ? 0.15 : 0.045), tz + 0.004);
  }
  if (fam.tail === 'bar' || fam.tail === 'y') {
    const bar = mesh(new THREE.BoxGeometry(tail.w * 1.8, 0.022, 0.02), model.tailMat, g, false);
    bar.position.set(0, ty, tz - 0.002);
  }

  if (fam.diffuser) {
    const diffuser = mesh(new THREE.BoxGeometry(W * 0.72, 0.035, 0.36), model.carbonMat, g);
    diffuser.position.set(0, tail.floor + 0.08, -L / 2 + 0.16);
    diffuser.rotation.x = -0.22;
    for (let i = -3; i <= 3; i++) {
      const fin = mesh(new THREE.BoxGeometry(0.016, 0.09, 0.3), model.carbonMat, g, false);
      fin.position.set(i * W * 0.1, tail.floor + 0.11, -L / 2 + 0.14);
    }
  }
  const ey = tail.floor + 0.12;
  const pipes = fam.exhaust === 'hex' ? [[0, 0.075, 6]] : fam.exhaust === 'quad'
    ? [[-W * 0.3, 0.045, 16], [-W * 0.22, 0.045, 16], [W * 0.22, 0.045, 16], [W * 0.3, 0.045, 16]]
    : [[-W * 0.28, 0.05, 16], [W * 0.28, 0.05, 16]];
  model.exhausts = [];
  for (const [x, rad, seg] of pipes) {
    const pipe = mesh(new THREE.CylinderGeometry(rad, rad, 0.16, seg), model.chromeMat, g, false);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, fam.exhaust === 'hex' ? Math.max(ey, ty - 0.2) : ey, -L / 2 - 0.02);
    const bore = mesh(new THREE.CylinderGeometry(rad * 0.78, rad * 0.78, 0.17, seg), black, g, false);
    bore.rotation.x = Math.PI / 2;
    bore.position.copy(pipe.position);
    model.exhausts.push(new THREE.Vector3(x, pipe.position.y, -L / 2 - 0.12));
  }

  if (fam.spoiler === 'big') {
    const wingZ = -L / 2 + 0.2;
    const wy = nearest(info, wingZ).center + 0.38;
    const wing = mesh(new THREE.BoxGeometry(W * 0.86, 0.03, 0.3), model.carbonMat, g);
    wing.position.set(0, wy, wingZ);
    wing.rotation.x = -0.08;
    for (const sx of [-1, 1]) {
      const plate = mesh(new THREE.BoxGeometry(0.02, 0.18, 0.38), model.carbonMat, g, false);
      plate.position.set(sx * W * 0.43, wy - 0.02, wingZ);
      const strut = mesh(new THREE.BoxGeometry(0.03, 0.34, 0.08), black, g, false);
      strut.position.set(sx * W * 0.2, wy - 0.18, wingZ + 0.02);
    }
  } else if (fam.spoiler === 'duck') {
    const st = nearest(info, -L / 2 + 0.08);
    const lip = mesh(new THREE.BoxGeometry(W * 0.74, 0.03, 0.14), model.paintMat, g);
    lip.position.set(0, st.center + 0.02, -L / 2 + 0.07);
    lip.rotation.x = 0.22;
  }
}

function buildSides(model, def, fam, info, g) {
  const b = def.body;
  const black = model.trimMat;
  for (const sx of [-1, 1]) {
    if (fam.scoops) {
      const zs = b.cabinZ - b.cabinLength * 0.4;
      const st = nearest(info, zs);
      // Side intake: a slim dark slot along the flank, angled with the body.
      const scoop = mesh(new THREE.BoxGeometry(0.01, 0.07, 0.48), black, g, false);
      scoop.position.set(sx * (st.w + 0.003), st.mid + 0.02, zs);
      scoop.rotation.x = 0.12;
    }
    // Mirror on a short stalk near the base of the windscreen.
    const mz = b.cabinZ + b.cabinLength / 2 - 0.12;
    const ms = nearest(info, mz);
    const mx = sx * Math.min(b.cabinWidth / 2, ms.w - 0.05);
    const my = ms.center + (fam.roof === 'boxy' ? 0.2 : 0.14);
    const m = mesh(new THREE.SphereGeometry(0.075, 16, 10), model.paintMat, g);
    m.scale.set(1.3, 0.62, 0.9);
    m.position.set(mx + sx * 0.14, my, mz);
    const stalk = mesh(new THREE.BoxGeometry(0.14, 0.018, 0.04), black, g, false);
    stalk.position.set(mx + sx * 0.06, my - 0.025, mz + 0.02);
    stalk.rotation.z = sx * 0.3;
    // Flush door handle on the side.
    const hz = b.cabinZ + 0.05;
    const hs = nearest(info, hz);
    const handle = mesh(new THREE.BoxGeometry(0.008, 0.02, 0.14), model.chromeMat, g, false);
    handle.position.set(sx * (hs.w * 0.995), hs.mid + 0.07, hz);
  }
}

/* ───────────────────────── wheels ───────────────────────── */

const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd8262f, metalness: 0.3, roughness: 0.4 });

function buildWheel(model, def, fam, front) {
  const r = def.body.wheelRadius;
  const rugged = !!fam.clad;
  const width = rugged ? 0.32 : front ? 0.26 : 0.31;
  const g = new THREE.Group();
  const rimR = r * (rugged ? 0.62 : 0.76);
  const prof = [
    [rimR, -width / 2], [r * 0.93, -width / 2], [r, -width * 0.38], [r, width * 0.38], [r * 0.93, width / 2], [rimR, width / 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tyre = new THREE.LatheGeometry(prof, 40);
  tyre.rotateZ(Math.PI / 2);
  mesh(tyre, model.rubberMat, g);
  const outer = width / 2 - 0.02;
  const barrel = new THREE.CylinderGeometry(rimR, rimR, width * 0.9, 36, 1, true);
  barrel.rotateZ(Math.PI / 2);
  mesh(barrel, model.rimMat, g, false);
  const n = fam.spokes;
  const thick = n <= 6 ? 0.055 : 0.03;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const spoke = mesh(new THREE.BoxGeometry(0.03, rimR * 0.92, thick), model.rimMat, g, false);
    spoke.position.set(outer, Math.cos(a) * rimR * 0.48, Math.sin(a) * rimR * 0.48);
    spoke.rotation.x = a;
  }
  const hub = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 6), model.rimMat, g, false);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = outer + 0.01;
  const disc = mesh(new THREE.CylinderGeometry(rimR * 0.82, rimR * 0.82, 0.03, 32), model.chromeMat, g, false);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = outer - 0.08;
  return { g, width, rimR, outer };
}

/**
 * Bake a group's meshes into one mesh per material (fewer draw calls). The
 * group must not move relative to its parts afterwards.
 */
function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.material.uuid;
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, shadow: false, geos: [] });
    const b = buckets.get(key);
    let geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    b.geos.push(geo);
    b.shadow ||= o.castShadow;
  });
  const out = new THREE.Group();
  for (const { mat, shadow, geos } of buckets.values()) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = shadow;
    out.add(m);
  }
  return out;
}

/* ───────────────────────── swap-in ───────────────────────── */

export function attachModernBody(model, def) {
  const id = familyFor(def);
  if (!id) return;
  const fam = FAMILIES[id];
  const prof = profileFor(def, fam);
  const { group: body, info, axles } = buildBody(model, def, fam, prof);
  body.add(buildCabin(model, def, fam, prof, info));
  const details = new THREE.Group();
  buildFront(model, def, fam, info, details);
  buildRear(model, def, fam, info, details);
  buildSides(model, def, fam, info, details);
  body.add(details);
  const bakedBody = mergeByMaterial(body);

  // Drop the hidden procedural parts entirely (they still cost memory).
  for (const child of model.body.children) child.visible = false;
  for (const wheel of model.wheels) wheel.pivot.visible = false;
  model.detailMeshes = [];
  model.body.add(bakedBody);

  const W = def.body.width;
  const wheels = [];
  for (const za of axles) {
    for (const sx of [-1, 1]) {
      const front = za > 0;
      const st = nearest(info, za);
      const built = buildWheel(model, def, fam, front);
      const pivot = new THREE.Group();
      pivot.position.set(sx * Math.min(st.w - built.width / 2 - 0.02, W / 2 - built.width / 2), def.body.wheelRadius, za);
      model.root.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      if (sx < 0) built.g.scale.x = -1; // outer face outward on both sides
      const holder = new THREE.Group();
      holder.add(built.g);
      spin.add(mergeByMaterial(holder));
      const caliper = mesh(new THREE.BoxGeometry(0.06, built.rimR * 0.5, built.rimR * 0.36), caliperMat, pivot, false);
      caliper.position.set(sx * (built.outer - 0.1), built.rimR * 0.45, front ? -0.05 : 0.05);
      wheels.push({ pivot, spin, side: sx, front });
    }
  }
  model.wheels = wheels;
  model.frontWheels = wheels.filter((w) => w.front);
  model.modernBody = bakedBody;
}
