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
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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
  // Rings run counter-clockwise seen from +z: the rear cap (first ring) must
  // face -z and the front cap +z, or they are culled and the body is hollow.
  cap(0, true);
  cap(rings.length - 1, false);
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

/** A box with softened edges: small parts catch light like moulded pieces
 * rather than like razor-cut cubes. Kept low-segment and only for parts that
 * are large enough for the rounding to be visible. */
function softBox(w, h, d, r = 0.012) {
  return new RoundedBoxGeometry(w, h, d, 2, Math.min(r, Math.min(w, h, d) / 2.05));
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
  // Real ground clearance: bumpers come down to ~12-16 cm on road cars.
  const clearance = { suv: 0.26, offroad: 0.3, super: 0.11, hyper: 0.1, sports: 0.13, roadster: 0.13 }[def.body.style] ?? 0.15;
  const floor = Math.min(b.rideHeight - 0.2, clearance);
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
  const archR = r + 0.035;
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
    const end = Math.min(t, 1 - t);
    // Bumper roll-under: the underside lifts over the last few centimetres so
    // the nose and tail end in a rounded bumper instead of a letterbox cut
    // from a slab.
    const roll = 1 - smooth(Math.min(1, end / 0.06));
    floor = Math.max(floor, prof.floor + roll * 0.08);
    // Width: flared over the axles, tapered at both ends.
    // Corners round off at the very ends, but the body stays wider than the
    // wheels so no tyre pokes out past the bumpers.
    const endTaper = Math.min(1, 0.9 + Math.min(1, t / 0.06) * 0.1) * Math.min(1, 0.8 + Math.min(1, (1 - t) / 0.09) * 0.2);
    const w = (W / 2) * endTaper * (0.94 + fam.flare * flare) / (1 + fam.flare * 0.4);
    const center = prof.center(t);
    const archClear = (r + archR + 0.05) * wing;
    const fender = Math.max(center + 0.02, center + fam.wing * wing, archClear, Math.min(wingTop, center + fam.wing + 0.06) * (wing > 0.5 ? 1 : 0));
    const top = Math.max(fender, center, floor + 0.02);
    // Keep the section monotonic. At an axle the arch lifts the floor to the
    // wheel opening, leaving only a thin fender above it; without the clamps
    // the waist points ended up *below* the floor and the self-intersecting
    // section showed the black wheel-well liner through the paint.
    const shoulder = Math.min(top, Math.max(top - 0.07, floor + 0.012));
    const mid = Math.min(shoulder - 0.004, Math.max(floor + 0.03, floor + (Math.min(top, center + 0.1) - floor) * 0.55));
    const skirt = Math.min(mid - 0.004, Math.max(floor + 0.008, floor + 0.08));
    // The arch is a notch at the outer edge only (where the wheel is); the
    // middle of the body keeps its low floor, so bumpers and the underbody
    // stay closed when seen from the front or back.
    const base = prof.floor;
    const inner = Math.max(0.12, w - 0.4);
    const half = [
      [0, base],
      [inner, base],
      [inner + 0.02, floor],
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
  mesh(loft(rings, zs, 0.78), model.paintMat, group);

  // Deep wheel wells (and black cladding on rugged cars).
  for (const za of axles) {
    const st = nearest(info, za);
    for (const sx of [-1, 1]) {
      // Keep the liner inboard of the fender edge but close enough to fill the
      // arch: a narrow drum parked 30 cm inside the flank left a black void.
      // The shell is open at the outboard end so the wheel stays visible; a
      // half-disc closes the inboard end so you cannot see through the car.
      const liner = mesh(new THREE.CylinderGeometry(archR - 0.008, archR - 0.008, 0.44, 28, 1, true, 0, Math.PI), model.archMat || model.trimMat, group, false);
      liner.rotation.z = Math.PI / 2;
      liner.position.set(sx * (st.w - 0.23), r, za);
      const back = mesh(new THREE.CircleGeometry(archR - 0.008, 28, 0, Math.PI), model.archMat || model.trimMat, group, false);
      back.rotation.y = sx * Math.PI / 2;
      back.position.set(sx * (st.w - 0.45), r, za);
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
  } else {
    // A thin dark seal around each wheel opening defines the arch edge; a
    // thick painted torus read as a ring bolted to the side of the car.
    for (const za of axles) {
      const st = nearest(info, za);
      for (const sx of [-1, 1]) {
        const seal = mesh(new THREE.TorusGeometry(archR + 0.004, 0.006, 6, 30, Math.PI), model.trimMat, group, false);
        seal.rotation.y = Math.PI / 2;
        seal.position.set(sx * (st.w * 0.9), r, za);
      }
    }
    // Rocker: a painted skirt with a black lower lip between the arches.
    const st = nearest(info, 0);
    const len = Math.max(0.4, b.wheelbase * 2 - archR * 2 - 0.1);
    for (const sx of [-1, 1]) {
      const skirt = mesh(new THREE.BoxGeometry(0.035, 0.05, len * 0.96), model.paintMat, group, false);
      skirt.position.set(sx * (st.w - 0.006), st.floor + 0.105, 0);
      const sill = mesh(new THREE.BoxGeometry(0.045, 0.05, len), model.trimMat, group, false);
      sill.position.set(sx * (st.w - 0.012), st.floor + 0.06, 0);
    }
  }
  return { group, info, axles };
}

function nearest(info, z) {
  return info.reduce((a, s) => (Math.abs(s.z - z) < Math.abs(a.z - z) ? s : a));
}

/* ───────────────────────── cabin ───────────────────────── */

const ROOF_SHAPES = {
  // s: 0 = rear of the cabin, 1 = front (windscreen base). Real greenhouses
  // spend roughly a third of their length on the rear screen, a third on the
  // roof panel and a third on the windscreen; the old curves put almost all of
  // the rake into the last few centimetres, which read as a vertical black
  // wall from the front.
  fast: [[0, 0], [0.06, 0.34], [0.2, 0.8], [0.36, 0.99], [0.64, 1], [0.78, 0.88], [0.93, 0.4], [1, 0]],
  canopy: [[0, 0], [0.1, 0.34], [0.26, 0.8], [0.4, 0.985], [0.58, 1], [0.73, 0.9], [0.9, 0.42], [1, 0]],
  notch: [[0, 0.05], [0.1, 0.5], [0.22, 0.86], [0.3, 1], [0.7, 1], [0.8, 0.84], [0.92, 0.42], [1, 0]],
  hatch: [[0, 0], [0.02, 0.55], [0.07, 0.86], [0.12, 1], [0.66, 1], [0.8, 0.82], [0.94, 0.36], [1, 0]],
  boxy: [[0, 0], [0.02, 0.6], [0.06, 0.9], [0.09, 1], [0.76, 1], [0.86, 0.78], [1, 0]],
};

function buildCabin(model, def, fam, prof, info) {
  const b = def.body;
  const L = b.length;
  const g = new THREE.Group();
  const z0 = -L / 2 + prof.tCabR * L;
  const z1 = -L / 2 + prof.tCabF * L;

  if (fam.roof === 'open') {
    // Roadster: raked windscreen, dark cockpit tub, two seats and roll hoops.
    const st = nearest(info, z1 - 0.1);
    const screen = mesh(new THREE.BoxGeometry(b.cabinWidth * 0.84, 0.34, 0.016), model.glassMat, g, false);
    screen.position.set(0, st.center + 0.12, z1 - 0.08);
    screen.rotation.x = -0.62;
    for (const sx of [-1, 1]) {
      // Chrome screen frame.
      strip(g, model.chromeMat, [sx * b.cabinWidth * 0.43, st.center, z1 - 0.02], [sx * b.cabinWidth * 0.43, st.center + 0.28, z1 - 0.16], 0.02, 0.02);
    }
    const zc = (z0 + z1) / 2;
    const stM = nearest(info, zc);
    const tub = mesh(new THREE.BoxGeometry(b.cabinWidth * 0.8, 0.02, (z1 - z0) * 0.8), model.trimMat, g, false);
    tub.position.set(0, stM.center + 0.012, zc);
    const dash = mesh(new THREE.BoxGeometry(b.cabinWidth * 0.8, 0.12, 0.2), model.trimMat, g, false);
    dash.position.set(0, stM.center + 0.06, z1 - 0.26);
    for (const sx of [-1, 1]) {
      const seat = mesh(new THREE.BoxGeometry(0.32, 0.3, 0.14), model.trimMat, g, false);
      seat.position.set(sx * b.cabinWidth * 0.21, stM.center + 0.19, zc - 0.14);
      seat.rotation.x = -0.2;
      const head = mesh(new THREE.BoxGeometry(0.18, 0.11, 0.07), model.trimMat, g, false);
      head.position.set(sx * b.cabinWidth * 0.21, stM.center + 0.36, zc - 0.19);
      const hoop = mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 18, Math.PI), model.chromeMat, g, false);
      hoop.position.set(sx * b.cabinWidth * 0.24, stM.center + 0.02, z0 + 0.22);
    }
    return g;
  }

  const shape = curve(ROOF_SHAPES[fam.roof] || ROOF_SHAPES.fast);
  const S = 32;
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
    const taper = fam.roof === 'canopy' || fam.roof === 'fast' ? Math.min(1, 0.5 + Math.sin(Math.PI * s) * 0.75) : 1;
    const wt = Math.max(0.1, Math.min(wb - 0.04, (b.roofWidth / 2) * taper));
    // A broad, slightly crowned roof with a rounded shoulder. The old section
    // rose to a sharp ridge at the centreline, which made the greenhouse read
    // as a black tent.
    const half = [
      [0, base],
      [wb, base],
      [wb * 0.985, base + (top - base) * 0.36],
      [wt, top - 0.05],
      [wt * 0.86, top - 0.012],
      [wt * 0.52, top - 0.002],
      [0, top],
    ];
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
      mesh(loft(spine, rz, 0.75), model.paintMat, g);
    } else {
      const roof = roofed.map((p) => mirror([
        [0, p.top + 0.001], [p.wt * 0.55, p.top + 0.006], [p.wt * 0.94, p.top + 0.001],
        [p.wt, p.top - 0.01], [p.wt * 1.02, p.top - 0.04],
      ]));
      mesh(loft(roof, rz, 0.75), model.paintMat, g);
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
    // Chrome gutter along the roof edge: the detail that stops a roof from
    // looking like a painted blob.
    const wtR = Math.min(...roofed.map((p) => p.wt));
    for (const sx of [-1, 1]) {
      const gutter = mesh(new THREE.BoxGeometry(0.012, 0.012, roofed[roofed.length - 1].z - roofed[0].z), model.chromeMat, g, false);
      gutter.position.set(sx * (wtR * 0.97), roofed[0].top - 0.018, (roofed[0].z + roofed[roofed.length - 1].z) / 2);
    }
    // Windscreen (A) and rear (C) pillars tie the roof to the body. Wide,
    // painted C-pillars are what separate a coupe from a glass bubble.
    const fr = roofed[roofed.length - 1];
    const rr = roofed[0];
    const stF = nearest(info, z1);
    const stR = nearest(info, z0);
    const wbF = Math.min(b.cabinWidth / 2, stF.w - 0.05);
    const wbR = Math.min(b.cabinWidth / 2, stR.w - 0.05);
    // (A canopy is a bubble of glass: no pillars on it.)
    // Slim pillars read as glass with a frame; the old 75 mm A-pillars made
    // every car look like it wore a painted roof rack.
    const pillarW = fam.roof === 'notch' ? 0.095 : fam.roof === 'hatch' || fam.roof === 'boxy' ? 0.08 : 0.055;
    for (const sx of fam.roof === 'canopy' ? [] : [-1, 1]) {
      strip(g, model.paintMat, [sx * wbF * 0.99, stF.center, z1 - 0.015], [sx * fr.wt * 0.98, fr.top + 0.004, fr.z], 0.058, 0.052);
      strip(g, model.paintMat, [sx * wbR * 0.99, stR.center, z0 + 0.02], [sx * rr.wt * 0.98, rr.top + 0.004, rr.z], pillarW, pillarW);
    }
  }
  // Interior: dashboard, two seats and a steering wheel behind the glass. The
  // seats sit below the beltline so only the head restraints show through the
  // side glass, as in a real car (the old seats poked up into the windows).
  {
    const zc = (z0 + z1) / 2;
    const dash = mesh(new THREE.BoxGeometry(b.cabinWidth * 0.86, 0.12, 0.24), model.trimMat, g, false);
    dash.position.set(0, prof.belt - 0.015, z1 - 0.26);
    for (const sx of [-1, 1]) {
      const base = mesh(new THREE.BoxGeometry(0.34, 0.16, 0.46), model.trimMat, g, false);
      base.position.set(sx * b.cabinWidth * 0.22, prof.belt - 0.07, zc - 0.05);
      const back = mesh(new THREE.BoxGeometry(0.34, 0.46, 0.1), model.trimMat, g, false);
      back.position.set(sx * b.cabinWidth * 0.22, prof.belt + 0.1, zc - 0.25);
      back.rotation.x = -0.2;
      const head = mesh(new THREE.BoxGeometry(0.19, 0.12, 0.08), model.trimMat, g, false);
      head.position.set(sx * b.cabinWidth * 0.22, prof.belt + 0.32, zc - 0.29);
    }
    const wheel = mesh(new THREE.TorusGeometry(0.1, 0.015, 6, 20), model.trimMat, g, false);
    wheel.position.set(-b.cabinWidth * 0.22, prof.belt + 0.03, z1 - 0.4);
    wheel.rotation.x = -0.4;
    // Rear-view mirror and sun visors under the header.
    const rv = mesh(new THREE.BoxGeometry(0.17, 0.05, 0.02), model.trimMat, g, false);
    rv.position.set(0, prof.belt + prof.glassH * 0.78, z1 - 0.3);
    for (const sx of [-1, 1]) {
      const visor = mesh(new THREE.BoxGeometry(0.3, 0.014, 0.16), model.trimMat, g, false);
      visor.position.set(sx * 0.25, prof.belt + prof.glassH * 0.9, z1 - 0.44);
      visor.rotation.x = -0.22;
    }
  }
  if (fam.roof !== 'open' && roofed.length > 2 && fam.spoiler === 'roof') {
      const rear = roofed[0];
      const lip = mesh(new THREE.BoxGeometry(rear.wt * 1.8, 0.025, 0.16), model.paintMat, g);
      lip.position.set(0, rear.top + 0.01, rear.z - 0.02);
      lip.rotation.x = 0.12;
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
  // Everything on the nose sits just proud of the body's front cap. Rotating
  // lamp boxes about Y pushed one end out into thin air; flush bezels read as
  // real light units instead.
  const fz = L / 2 + 0.002;
  const upright = fam.lamps === 'bar' || fam.lamps === 'square' || fam.lamps === 'round';
  const lampY = upright ? nose.center - 0.13 : nose.center - 0.1;
  const lampX = nose.w * (upright ? 0.66 : 0.62);

  const housing = (x, w, h, y = lampY) => {
    const bezel = mesh(softBox(w, h, 0.018, 0.008), model.projectorMat || black, g, false);
    bezel.position.set(x, y, fz);
    return bezel;
  };
  const projector = (x, y, radius) => {
    const ring = mesh(new THREE.TorusGeometry(radius, 0.006, 6, 20), model.chromeMat, g, false);
    ring.position.set(x, y, fz + 0.012);
    const ball = mesh(new THREE.SphereGeometry(radius * 0.72, 14, 10), model.projectorMat || black, g, false);
    ball.scale.z = 0.5;
    ball.position.set(x, y, fz + 0.01);
    const core = mesh(new THREE.CircleGeometry(radius * 0.42, 16), model.headMat, g, false);
    core.position.set(x, y, fz + 0.016);
  };

  for (const sx of [-1, 1]) {
    const x = sx * lampX;
    const signalMat = model.signalMats[sx > 0 ? 'left' : 'right'];
    // Amber lens on the outer end of each cluster, sitting ahead of the dark
    // glass so the indicator is visible even when it is not flashing.
    const indicator = (ix, iy, w = 0.1, h = 0.028) => {
      const bezel = mesh(softBox(w + 0.016, h + 0.012, 0.012, 0.005), black, g, false);
      bezel.position.set(ix, iy, fz + 0.021);
      const lens = mesh(softBox(w, h, 0.014, 0.006), signalMat, g, false);
      lens.position.set(ix, iy, fz + 0.031);
    };
    if (fam.lamps === 'y') {
      housing(x, 0.5, 0.12, lampY + 0.005);
      // Projector inboard, then a thin Y-shaped LED signature: the Y is the
      // daytime light, not a fat white bracket glued to the nose.
      projector(x - sx * 0.14, lampY, 0.045);
      strip(g, model.drlMat, [x - sx * 0.06, lampY, fz + 0.02], [x + sx * 0.07, lampY, fz + 0.02], 0.012, 0.01);
      strip(g, model.drlMat, [x + sx * 0.07, lampY, fz + 0.02], [x + sx * 0.17, lampY + 0.042, fz + 0.02], 0.012, 0.01);
      strip(g, model.drlMat, [x + sx * 0.07, lampY, fz + 0.02], [x + sx * 0.17, lampY - 0.042, fz + 0.02], 0.012, 0.01);
      const lens = mesh(new THREE.BoxGeometry(0.09, 0.02, 0.012), model.headMat, g, false);
      lens.position.set(x - sx * 0.06, lampY + 0.032, fz + 0.014);
      indicator(x + sx * 0.205, lampY - 0.026, 0.085, 0.028);
    } else if (fam.lamps === 'slim') {
      housing(x, 0.52, 0.115);
      // Projector at the outer end, a dark glass lens inboard and a slim LED
      // brow along the top. A glowing white bar read as a fluorescent tube.
      projector(x + sx * 0.16, lampY - 0.008, 0.04);
      const lens = mesh(softBox(0.22, 0.042, 0.014, 0.006), model.projectorMat || black, g, false);
      lens.position.set(x - sx * 0.1, lampY, fz + 0.014);
      const emit = mesh(new THREE.BoxGeometry(0.17, 0.011, 0.012), model.headMat, g, false);
      emit.position.set(x - sx * 0.1, lampY + 0.006, fz + 0.019);
      const brow = mesh(new THREE.BoxGeometry(0.48, 0.011, 0.012), model.drlMat, g, false);
      brow.position.set(x, lampY + 0.05, fz + 0.011);
      indicator(x + sx * 0.205, lampY - 0.027, 0.095, 0.028);
    } else if (fam.lamps === 'bar') {
      housing(x, 0.42, 0.11, lampY);
      const lens = mesh(softBox(0.31, 0.05, 0.014, 0.006), model.projectorMat || black, g, false);
      lens.position.set(x, lampY, fz + 0.014);
      const emit = mesh(new THREE.BoxGeometry(0.26, 0.012, 0.012), model.headMat, g, false);
      emit.position.set(x, lampY + 0.006, fz + 0.019);
      const drl = mesh(new THREE.BoxGeometry(0.36, 0.012, 0.012), model.drlMat, g, false);
      drl.position.set(x, lampY + 0.042, fz + 0.016);
      const trim = mesh(new THREE.BoxGeometry(0.37, 0.007, 0.01), model.chromeMat, g, false);
      trim.position.set(x, lampY - 0.035, fz + 0.015);
      indicator(x + sx * 0.16, lampY - 0.026, 0.08, 0.028);
    } else if (fam.lamps === 'square') {
      housing(x, 0.32, 0.18, lampY);
      const lens = mesh(softBox(0.22, 0.1, 0.014, 0.006), model.projectorMat || black, g, false);
      lens.position.set(x, lampY, fz + 0.014);
      const emit = mesh(new THREE.BoxGeometry(0.16, 0.014, 0.012), model.headMat, g, false);
      emit.position.set(x, lampY + 0.02, fz + 0.019);
      const drl = mesh(new THREE.BoxGeometry(0.25, 0.014, 0.012), model.drlMat, g, false);
      drl.position.set(x, lampY - 0.072, fz + 0.016);
      indicator(x + sx * 0.115, lampY - 0.055, 0.08, 0.03);
    } else {
      // Round lamp in a black bucket with a chrome rim.
      const bucket = mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.03, 22), model.projectorMat || black, g, false);
      bucket.rotation.x = Math.PI / 2;
      bucket.position.set(x, lampY, fz);
      const ring = mesh(new THREE.TorusGeometry(0.1, 0.01, 8, 26), model.chromeMat, g, false);
      ring.position.set(x, lampY, fz + 0.016);
      const head = mesh(new THREE.CircleGeometry(0.092, 24), model.headMat, g, false);
      head.position.set(x, lampY, fz + 0.018);
      indicator(x + sx * 0.14, lampY - 0.028, 0.075, 0.028);
    }
    // Side repeater on the front flank: a real indicator is visible from the
    // side at a junction, where a lens on the nose alone disappears.
    const rz = L / 2 - 0.34;
    const rs = nearest(info, rz);
    const ry = rs.center + 0.025;
    const rb = mesh(softBox(0.012, 0.042, 0.13, 0.006), black, g, false);
    rb.position.set(sx * (rs.w - 0.002), ry, rz);
    const repeater = mesh(softBox(0.016, 0.028, 0.11, 0.007), signalMat, g, false);
    repeater.position.set(sx * (rs.w + 0.006), ry, rz);
  }
  // The lamps already carry their own LED signature; a full-width bar would
  // cut across the badge and read as a sticker.

  // Grille on the nose face.
  const faceY = (nose.floor + nose.center) / 2;
  const faceH = Math.max(0.08, nose.center - nose.floor - 0.12);
  let grilleY = faceY + 0.01;
  let grilleH = 0;
  if (fam.grille === 'mesh') {
    // Wide, shallow mesh opening tucked under the lamps: the modern sports
    // look, instead of a square hole in the middle of the bumper.
    const gw = W * 0.48;
    grilleH = Math.min(0.15, faceH * 0.34);
    grilleY = lampY - 0.115;
    const gr = mesh(softBox(gw, grilleH, 0.022, 0.008), black, g, false);
    gr.position.set(0, grilleY, fz - 0.004);
    for (let i = 1; i < 4; i++) {
      const slat = mesh(new THREE.BoxGeometry(gw * 0.96, 0.007, 0.01), model.discMat || model.chromeMat, g, false);
      slat.position.set(0, grilleY - grilleH / 2 + (i * grilleH) / 4, fz + 0.008);
    }
  } else if (fam.grille === 'big') {
    const gw = W * 0.32;
    grilleH = Math.min(0.24, faceH * 0.55);
    grilleY = lampY - 0.14;
    const gr = mesh(softBox(gw, grilleH, 0.022, 0.008), black, g, false);
    gr.position.set(0, grilleY, fz - 0.004);
    // Chrome picture-frame around the opening (a solid plate would cover it).
    const fw = gw + 0.05;
    const fh = grilleH + 0.05;
    const fzF = fz + 0.012;
    for (const [w, h, x, y] of [
      [fw, 0.012, 0, fh / 2], [fw, 0.012, 0, -fh / 2],
      [0.012, fh, fw / 2, 0], [0.012, fh, -fw / 2, 0],
    ]) {
      const bar = mesh(new THREE.BoxGeometry(w, h, 0.014), model.chromeMat, g, false);
      bar.position.set(x, grilleY + y, fzF);
    }
    for (let i = 0; i < 3; i++) {
      const slat = mesh(new THREE.BoxGeometry(gw * 0.92, 0.01, 0.01), model.chromeMat, g, false);
      slat.position.set(0, grilleY - grilleH * 0.3 + i * grilleH * 0.3, fz + 0.013);
    }
  } else if (fam.grille === 'wide') {
    grilleH = Math.min(0.15, faceH * 0.4);
    grilleY = lampY - 0.115;
    const gr = mesh(softBox(W * 0.66, grilleH, 0.022, 0.008), black, g, false);
    gr.position.set(0, grilleY, fz - 0.004);
    for (let i = 0; i < 3; i++) {
      const bar = mesh(new THREE.BoxGeometry(W * 0.66, 0.009, 0.01), model.chromeMat, g, false);
      bar.position.set(0, grilleY - grilleH / 2 + (i + 1) * grilleH / 4, fz + 0.008);
    }
  }
  // Plate in a black recess. Big-grille cars carry it on the grille; the rest
  // have it on the bumper below.
  const onGrille = fam.grille === 'big' || fam.grille === 'wide';
  const plateY = onGrille ? grilleY : nose.floor + 0.105;
  if (model.plateMat) {
    const recess = mesh(new THREE.BoxGeometry(0.42, 0.105, 0.016), black, g, false);
    recess.position.set(0, plateY, fz + 0.006);
    const plate = mesh(new THREE.PlaneGeometry(0.36, 0.08), model.plateMat, g, false);
    plate.position.set(0, plateY, fz + 0.016);
  }
  // Corner vents flanking the plate. Grille-less hypercars get bigger,
  // deeper side intakes; the low splitter feeds the centre.
  for (const sx of [-1, 1]) {
    const vw = fam.grille === 'none' ? 0.26 : 0.17;
    const vh = fam.grille === 'none' ? 0.11 : 0.062;
    const vent = mesh(new THREE.BoxGeometry(vw, vh, 0.02), black, g, false);
    vent.position.set(sx * nose.w * 0.72, plateY + 0.005, fz);
    vent.rotation.z = sx * 0.06;
    const blade = mesh(new THREE.BoxGeometry(0.012, vh * 0.8, 0.012), model.trimMat, g, false);
    blade.position.set(sx * nose.w * 0.72, plateY + 0.005, fz + 0.012);
    if (fam.grille === 'none') {
      const fin = mesh(new THREE.BoxGeometry(vw * 0.7, 0.008, 0.01), model.carbonMat, g, false);
      fin.position.set(sx * nose.w * 0.72, plateY - vh * 0.28, fz + 0.012);
    }
  }
  // Lower air dam under the bumper on cars whose plate sits on the grille.
  if (onGrille) {
    const dam = mesh(new THREE.BoxGeometry(W * 0.46, 0.05, 0.02), black, g, false);
    dam.position.set(0, nose.floor + 0.058, fz);
    for (let i = 0; i < 2; i++) {
      const slat = mesh(new THREE.BoxGeometry(W * 0.43, 0.006, 0.01), model.trimMat, g, false);
      slat.position.set(0, nose.floor + 0.045 + i * 0.022, fz + 0.012);
    }
  }
  // Splitter tucked under the nose, with dive planes on the aero cars.
  const splitter = mesh(softBox(nose.w * 1.8, 0.022, 0.18, 0.01), model.carbonMat, g);
  splitter.position.set(0, nose.floor + 0.014, L / 2 - 0.07);
  if (fam.diffuser) {
    for (const sx of [-1, 1]) {
      const plane = mesh(new THREE.BoxGeometry(0.16, 0.012, 0.1), model.carbonMat, g, false);
      plane.position.set(sx * nose.w * 0.82, nose.floor + 0.05, L / 2 - 0.055);
      plane.rotation.z = sx * 0.12;
    }
  }
  // Badge above the grille (or on the nose, on grille-less cars).
  const badgeY = fam.grille === 'none' ? lampY - 0.1
    : onGrille ? grilleY + grilleH / 2 + 0.055 : grilleY + grilleH * 0.32;
  const badge = mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.008, 20), model.chromeMat, g, false);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, badgeY, fz + 0.016);
  const badgeCore = mesh(new THREE.CircleGeometry(0.024, 18), black, g, false);
  badgeCore.position.set(0, badgeY, fz + 0.021);

  // Cowl and wipers at the base of the windscreen.
  const z1 = b.cabinZ + b.cabinLength / 2;
  const stC = nearest(info, z1);
  const cowlY = stC.center + 0.002;
  const cowl = mesh(new THREE.BoxGeometry(b.cabinWidth * 0.92, 0.02, 0.16), black, g, false);
  cowl.position.set(0, cowlY, z1 - 0.055);
  for (const [ax, bx] of [[-0.42, -0.02], [0.08, 0.48]]) {
    strip(g, black, [ax, cowlY + 0.014, z1 - 0.02], [bx, cowlY + 0.04, z1 - 0.18], 0.012, 0.01);
  }
}

function buildRear(model, def, fam, info, g) {
  const b = def.body;
  const L = b.length;
  const W = b.width;
  const black = model.trimMat;
  const tail = nearest(info, -L / 2 + 0.05);
  const ty = tail.center - 0.035;
  // Outward at the back is negative Z; the old parts sat just inside the rear
  // cap, where the body hid them.
  const tz = -L / 2 - 0.002;
  const tw = tail.w;
  const upright = fam.tail === 'square';
  // Black garnish is a thin band on light-bar cars; every other car gets a
  // dark cluster backing behind each lamp so paint shows between the units
  // instead of one full-width black slab.
  if (fam.tail === 'bar') {
    const panel = mesh(softBox(tw * 1.86, 0.05, 0.018, 0.008), black, g, false);
    panel.position.set(0, ty, tz);
  }

  for (const sx of [-1, 1]) {
    const inner = sx * tw * 0.3;
    const outer = sx * tw * (upright ? 0.84 : 0.74);
    const oy = upright ? ty - 0.035 : ty + 0.012;
    const oTop = upright ? oy + 0.1 : oy + 0.042;
    const oBot = upright ? oy - 0.1 : oy - 0.03;
    const iTop = upright ? oy + 0.07 : oy + 0.024;
    const iBot = upright ? oy - 0.07 : oy - 0.014;
    // Dark cluster backing, barely larger than the lens.
    rearPlate(g, black, [[inner, iBot - 0.014], [inner, iTop + 0.014], [outer + sx * 0.03, oTop + 0.018], [outer + sx * 0.03, oBot - 0.018]], tz - 0.002);
    if (fam.tail === 'y') {
      strip(g, model.tailMat, [inner, ty + 0.03, tz - 0.012], [sx * tw * 0.78, ty - 0.11, tz - 0.012], 0.03, 0.014);
      strip(g, model.tailMat, [inner, ty + 0.03, tz - 0.012], [sx * tw * 0.46, ty - 0.09, tz - 0.012], 0.03, 0.014);
      strip(g, model.tailLedMat, [inner, ty + 0.02, tz - 0.02], [sx * tw * 0.7, ty - 0.09, tz - 0.02], 0.012, 0.008);
    } else if (fam.tail === 'split') {
      rearPlate(g, model.tailMat, [[inner, iBot], [inner, iTop], [outer, oTop], [outer, oBot]], tz - 0.008);
      strip(g, model.tailLedMat, [inner + sx * 0.03, iBot + 0.006, tz - 0.016], [outer - sx * 0.03, oBot + 0.006, tz - 0.016], 0.012, 0.006);
      strip(g, model.chromeMat, [inner, iTop + 0.008, tz - 0.012], [outer, oTop + 0.008, tz - 0.012], 0.008, 0.006);
    } else if (fam.tail === 'triple') {
      for (let i = 0; i < 3; i++) {
        const f0 = 0.22 + i * 0.18;
        const f1 = f0 + 0.12;
        rearPlate(g, model.tailMat, [
          [sx * tw * f0, ty - 0.045], [sx * tw * f0, ty + 0.025],
          [sx * tw * f1, ty + 0.05], [sx * tw * f1, ty - 0.06],
        ], tz - 0.008);
      }
    } else if (upright) {
      rearPlate(g, model.tailMat, [[inner, iBot], [inner, iTop], [outer, oTop], [outer, oBot]], tz - 0.008);
      const led = mesh(new THREE.BoxGeometry(0.1, 0.018, 0.01), model.tailLedMat, g, false);
      led.position.set(outer - sx * 0.055, oBot + 0.03, tz - 0.018);
    }
    // Wrap-around segment on the rear quarter, aligned with the lamp.
    const wrap = mesh(new THREE.BoxGeometry(0.035, 0.05, 0.15), model.tailMat, g, false);
    wrap.position.set(sx * (tail.w - 0.006), ty, -L / 2 + 0.09);
    wrap.rotation.y = sx * 0.06;
    // The indicator sits below/outside the red lens and a little further out
    // than the LEDs; buried at the same depth as the tail lens it vanished.
    const sy = ty - (upright ? 0.15 : 0.055);
    const sxPos = sx * tw * 0.88;
    const sBezel = mesh(softBox(0.12, 0.04, 0.012, 0.005), black, g, false);
    sBezel.position.set(sxPos, sy, tz - 0.018);
    const sig = mesh(softBox(0.1, 0.03, 0.014, 0.006), model.signalMats[sx > 0 ? 'left' : 'right'], g, false);
    sig.position.set(sxPos, sy, tz - 0.029);
  }
  if (fam.tail === 'bar') {
    const bar = mesh(softBox(tail.w * 1.82, 0.03, 0.014, 0.006), model.tailMat, g, false);
    bar.position.set(0, ty, tz - 0.008);
    const led = mesh(new THREE.BoxGeometry(tail.w * 1.76, 0.014, 0.01), model.tailLedMat, g, false);
    led.position.set(0, ty - 0.018, tz - 0.018);
  }
  // Rear plate in a recess, badge and model script.
  if (model.plateMat) {
    const recess = mesh(new THREE.BoxGeometry(0.5, 0.15, 0.018), black, g, false);
    recess.position.set(0, (tail.floor + ty) / 2 + 0.02, tz);
    const plate = mesh(new THREE.PlaneGeometry(0.44, 0.11), model.plateMat, g, false);
    plate.rotation.y = Math.PI;
    plate.position.set(0, (tail.floor + ty) / 2 + 0.02, tz - 0.012);
  }
  const badge = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.008, 20), model.chromeMat, g, false);
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, ty + 0.075, tz - 0.01);
  const badgeCore = mesh(new THREE.CircleGeometry(0.021, 18), black, g, false);
  badgeCore.position.set(0, ty + 0.075, tz - 0.015);
  const script = mesh(new THREE.BoxGeometry(0.16, 0.014, 0.006), model.chromeMat, g, false);
  script.position.set(tw * 0.42, ty + 0.075, tz - 0.01);
  // Dark valance across the lower bumper, with a pair of corner vents.
  const valance = mesh(softBox(tail.w * 1.82, 0.11, 0.03, 0.012), black, g, false);
  valance.position.set(0, tail.floor + 0.06, tz);
  for (const sx of [-1, 1]) {
    const vent = mesh(new THREE.BoxGeometry(0.16, 0.045, 0.018), model.trimMat, g, false);
    vent.position.set(sx * tail.w * 0.7, tail.floor + 0.065, tz - 0.017);
  }

  if (fam.diffuser) {
    const diffuser = mesh(softBox(W * 0.7, 0.035, 0.34, 0.014), model.carbonMat, g);
    diffuser.position.set(0, tail.floor + 0.07, -L / 2 + 0.17);
    diffuser.rotation.x = -0.24;
    for (let i = -3; i <= 3; i++) {
      const fin = mesh(new THREE.BoxGeometry(0.016, 0.09, 0.3), model.carbonMat, g, false);
      fin.position.set(i * W * 0.1, tail.floor + 0.1, -L / 2 + 0.15);
    }
  }
  const ey = tail.floor + 0.065;
  const pipes = fam.exhaust === 'hex' ? [[0, 0.075, 6]] : fam.exhaust === 'quad'
    ? [[-W * 0.3, 0.042, 16], [-W * 0.23, 0.042, 16], [W * 0.23, 0.042, 16], [W * 0.3, 0.042, 16]]
    : [[-W * 0.27, 0.048, 16], [W * 0.27, 0.048, 16]];
  model.exhausts = [];
  for (const [x, rad, seg] of pipes) {
    const pipe = mesh(new THREE.CylinderGeometry(rad, rad, 0.18, seg), model.chromeMat, g, false);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, fam.exhaust === 'hex' ? ey + 0.04 : ey, -L / 2 - 0.055);
    const bore = mesh(new THREE.CylinderGeometry(rad * 0.78, rad * 0.78, 0.19, seg), black, g, false);
    bore.rotation.x = Math.PI / 2;
    bore.position.copy(pipe.position);
    model.exhausts.push(new THREE.Vector3(x, pipe.position.y, -L / 2 - 0.16));
  }

  if (fam.spoiler === 'big') {
    const wingZ = -L / 2 + 0.2;
    const wy = nearest(info, wingZ).center + 0.38;
    const wing = mesh(new THREE.BoxGeometry(W * 0.88, 0.03, 0.32), model.carbonMat, g);
    wing.position.set(0, wy, wingZ);
    wing.rotation.x = -0.08;
    const gurney = mesh(new THREE.BoxGeometry(W * 0.86, 0.05, 0.012), model.carbonMat, g, false);
    gurney.position.set(0, wy + 0.038, wingZ - 0.15);
    for (const sx of [-1, 1]) {
      const plate = mesh(new THREE.BoxGeometry(0.02, 0.2, 0.4), model.carbonMat, g, false);
      plate.position.set(sx * W * 0.44, wy - 0.025, wingZ);
      const strut = mesh(new THREE.BoxGeometry(0.035, 0.34, 0.09), black, g, false);
      strut.position.set(sx * W * 0.2, wy - 0.18, wingZ + 0.02);
    }
  } else if (fam.spoiler === 'duck') {
    const st = nearest(info, -L / 2 + 0.08);
    const lip = mesh(new THREE.BoxGeometry(W * 0.76, 0.032, 0.16), model.paintMat, g);
    lip.position.set(0, st.center + 0.018, -L / 2 + 0.06);
    lip.rotation.x = 0.22;
    const under = mesh(new THREE.BoxGeometry(W * 0.72, 0.02, 0.1), black, g, false);
    under.position.set(0, st.center + 0.005, -L / 2 + 0.03);
  }
}

/* ───────────────────────── surface helpers ───────────────────────── */

/**
 * Body station interpolated to a precise z. The loft connects neighbouring
 * stations with straight facets, so mixing their parameters linearly lands
 * exactly on the rendered surface (nearest() made shut lines cut in and out
 * between rings, which read as dashed gaps).
 */
function stationAt(info, z) {
  let i = 1;
  while (i < info.length - 1 && info[i].z < z) i++;
  const a = info[i - 1];
  const b = info[i];
  const u = Math.max(0, Math.min(1, (z - a.z) / Math.max(1e-6, b.z - a.z)));
  const mix = (k) => a[k] + (b[k] - a[k]) * u;
  return { z, w: mix('w'), center: mix('center'), fender: mix('fender'), floor: mix('floor'), mid: mix('mid') };
}

/** Half-width of the flank at height y on a body station. */
function flankX(st, y) {
  const top = Math.max(st.fender, st.center);
  const shoulder = Math.max(st.mid + 0.05, top - 0.07);
  const skirt = Math.min(st.floor + 0.08, st.mid - 0.05);
  const pts = [
    [st.floor, st.w * 0.93],
    [skirt, st.w * 0.95],
    [skirt + 0.03, st.w],
    [st.mid, st.w],
    [shoulder, st.w * 0.985],
    [st.fender, st.w * 0.86],
  ];
  if (y <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [y0, x0] = pts[i];
    const [y1, x1] = pts[i + 1];
    if (y <= y1) return x0 + (x1 - x0) * ((y - y0) / Math.max(1e-6, y1 - y0));
  }
  return pts[pts.length - 1][1];
}

/** Height of the painted top surface at x on a body station. */
function topYAt(st, x) {
  const ax = Math.abs(x);
  const c = st.center;
  const f = st.fender;
  const p1 = st.w * 0.36;
  const p2 = st.w * 0.62;
  const y1 = c + 0.008;
  const y2 = (f + c) / 2 + 0.01;
  if (ax <= p1) return c + (y1 - c) * (ax / Math.max(1e-6, p1));
  if (ax <= p2) return y1 + (y2 - y1) * ((ax - p1) / Math.max(1e-6, p2 - p1));
  if (ax <= st.w * 0.86) return y2 + (f - y2) * ((ax - p2) / (st.w * 0.86 - p2));
  return f;
}

/** Flat polygon on the rear face, normal pointing rearward (-z). */
function rearPlate(parent, mat, pts, z) {
  let poly = pts.map(([x, y]) => [x, y]);
  // Shoelace: positive area means the winding faces +z, so reverse it.
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    area += x0 * y1 - x1 * y0;
  }
  if (area > 0) poly = poly.reverse();
  const pos = [];
  for (const [x, y] of poly) pos.push(x, y, z);
  const idx = [];
  for (let i = 1; i < poly.length - 1; i++) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  parent.add(new THREE.Mesh(geo, mat));
}

/** Dark shut line running up the curved flank at a fixed z. */
function flankSeam(parent, mat, info, z, side, y0, y1, inset = 0.002, width = 0.005) {
  if (y1 - y0 < 0.03) return;
  const st = stationAt(info, z);
  const steps = 12;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= steps; i++) {
    const y = y0 + (y1 - y0) * (i / steps);
    const x = side * (flankX(st, y) + inset);
    pos.push(x, y, z - width / 2, x, y, z + width / 2);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  parent.add(new THREE.Mesh(geo, mat));
}

/** Shut line across the bonnet or deck at z. */
function panelSeam(parent, mat, info, z, frac = 0.62, inset = 0.0025, width = 0.006) {
  const st = stationAt(info, z);
  const hw = st.w * frac;
  const steps = 22;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= steps; i++) {
    const x = -hw + 2 * hw * (i / steps);
    const y = topYAt(st, x) + inset;
    pos.push(x, y, z - width / 2, x, y, z + width / 2);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  parent.add(new THREE.Mesh(geo, mat));
}

/** Longitudinal shut line (bonnet side) at x = xFrac * half-width. */
function panelRibbon(parent, mat, info, xFrac, z0, z1, inset = 0.0025, width = 0.005) {
  if (Math.abs(z1 - z0) < 0.05) return;
  const steps = 30;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= steps; i++) {
    const z = z0 + (z1 - z0) * (i / steps);
    const st = stationAt(info, z);
    const x = st.w * xFrac;
    const y = topYAt(st, x) + inset;
    pos.push(x - width / 2, y, z, x + width / 2, y, z);
  }
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  parent.add(new THREE.Mesh(geo, mat));
}

function buildSides(model, def, fam, info, g, prof) {
  const b = def.body;
  const L = b.length;
  const black = model.trimMat;
  const fourDoor = fam.roof === 'notch' || fam.roof === 'hatch' || fam.roof === 'boxy';
  // Greenhouse geometry, so window pillars sit on the glass instead of
  // stopping in mid-air inside it.
  const z0 = -L / 2 + prof.tCabR * L;
  const z1 = -L / 2 + prof.tCabF * L;
  const shape = curve(ROOF_SHAPES[fam.roof] || ROOF_SHAPES.fast);
  const glassAt = (z) => {
    const s = Math.max(0, Math.min(1, (z - z0) / Math.max(0.01, z1 - z0)));
    const st = nearest(info, z);
    const base = st.center - 0.015;
    const top = Math.max(base + 0.015, prof.belt + prof.glassH * shape(s));
    const wb = Math.min(b.cabinWidth / 2, st.w - 0.05);
    const taper = fam.roof === 'canopy' || fam.roof === 'fast' ? Math.min(1, 0.5 + Math.sin(Math.PI * s) * 0.75) : 1;
    const wt = Math.max(0.1, Math.min(wb - 0.04, (b.roofWidth / 2) * taper));
    return { base, top, wb, wt };
  };
  for (const sx of [-1, 1]) {
    if (fam.scoops) {
      const zs = b.cabinZ - b.cabinLength * 0.4;
      const st = nearest(info, zs);
      // Side intake: a slim dark slot along the flank with a carbon blade.
      const scoop = mesh(new THREE.BoxGeometry(0.014, 0.08, 0.5), black, g, false);
      scoop.position.set(sx * (flankX(st, st.mid) + 0.002), st.mid + 0.02, zs);
      scoop.rotation.x = 0.12;
      const blade = mesh(new THREE.BoxGeometry(0.024, 0.02, 0.44), model.carbonMat, g, false);
      blade.position.set(sx * (flankX(st, st.mid) + 0.008), st.mid + 0.06, zs);
    }
    // Mirror: black base, painted shell, glass facing the driver.
    const mz = b.cabinZ + b.cabinLength / 2 - 0.24;
    const ms = nearest(info, mz);
    const mx = sx * Math.min(b.cabinWidth / 2 + 0.005, ms.w - 0.025);
    const my = ms.center + 0.025;
    const base = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1), black, g, false);
    base.position.set(mx, my - 0.022, mz);
    const arm = mesh(new THREE.BoxGeometry(0.07, 0.024, 0.045), model.paintMat, g, false);
    arm.position.set(mx + sx * 0.045, my, mz - 0.008);
    const cap = mesh(softBox(0.13, 0.062, 0.088, 0.018), model.paintMat, g, false);
    cap.position.set(mx + sx * 0.1, my + 0.014, mz - 0.03);
    cap.rotation.y = -sx * 0.1;
    const glass = mesh(new THREE.BoxGeometry(0.112, 0.05, 0.005), model.reflectorMat, g, false);
    glass.position.set(mx + sx * 0.1, my + 0.014, mz - 0.075);
    const tip = mesh(softBox(0.018, 0.02, 0.065, 0.007), model.signalMats[sx > 0 ? 'left' : 'right'], g, false);
    tip.position.set(mx + sx * 0.168, my + 0.014, mz - 0.06);
    // Window line: black belt trim, a chrome bead, pillars and shut lines.
    if (fam.roof !== 'open') {
      const zw0 = b.cabinZ - b.cabinLength / 2 + 0.08;
      const zw1 = b.cabinZ + b.cabinLength / 2 - 0.08;
      const bt = nearest(info, (zw0 + zw1) / 2);
      const beltX = sx * Math.min(b.cabinWidth / 2 + 0.002, bt.w - 0.01);
      const belt = mesh(new THREE.BoxGeometry(0.02, 0.022, zw1 - zw0), black, g, false);
      belt.position.set(beltX, bt.center - 0.008, (zw0 + zw1) / 2);
      const bead = mesh(new THREE.BoxGeometry(0.013, 0.008, zw1 - zw0 - 0.02), model.chromeMat, g, false);
      bead.position.set(beltX + sx * 0.004, bt.center + 0.006, (zw0 + zw1) / 2);
      // B-pillar: painted and wide on family cars, black and slim on coupes.
      const pillar = (pz, wide) => {
        const ga = glassAt(pz);
        strip(g, wide ? model.paintMat : black,
          [sx * (ga.wb + 0.002), ga.base + 0.006, pz],
          [sx * (ga.wt + 0.002), ga.top - 0.02, pz - 0.015],
          wide ? 0.055 : 0.032, 0.045);
      };
      if (fourDoor) {
        pillar(b.cabinZ + 0.06, true);
        pillar(b.cabinZ - b.cabinLength * 0.3, true);
      } else {
        pillar(b.cabinZ + 0.14, false);
      }
      // Door seams follow the curved flank from rocker to window line.
      const ds = nearest(info, zw1);
      const y0 = ds.floor + 0.09;
      const y1 = ds.center - 0.025;
      flankSeam(g, model.seamMat, info, zw1, sx, y0, y1);
      flankSeam(g, model.seamMat, info, zw0 + 0.02, sx, y0, y1);
      // Rear-quarter panel seam on family cars.
      if (fourDoor) flankSeam(g, model.seamMat, info, b.cabinZ - b.cabinLength * 0.34, sx, y0, y1);
    }
    // Flush door handles just below the window line.
    const handles = fourDoor ? [b.cabinZ + 0.1, b.cabinZ - b.cabinLength * 0.28] : [b.cabinZ - 0.12];
    for (const hz of handles) {
      const hs = nearest(info, hz);
      const hy = hs.center - 0.15;
      const hx = sx * (flankX(hs, hy) + 0.004);
      const handle = mesh(new THREE.BoxGeometry(0.014, 0.026, 0.15), model.chromeMat, g, false);
      handle.position.set(hx, hy, hz);
      const pocket = mesh(new THREE.BoxGeometry(0.004, 0.032, 0.16), black, g, false);
      pocket.position.set(hx - sx * 0.004, hy, hz);
    }
    // Fender vent behind the front wheel on the quick cars.
    if (fam.scoops || ['sports', 'gt', 'super', 'hyper'].includes(b.style)) {
      const vz = b.wheelbase - (b.wheelRadius + 0.26);
      const vs = nearest(info, vz);
      const vent = mesh(new THREE.BoxGeometry(0.012, 0.035, 0.2), black, g, false);
      vent.position.set(sx * (flankX(vs, vs.mid) + 0.002), vs.mid + 0.06, vz);
      const blade = mesh(new THREE.BoxGeometry(0.018, 0.012, 0.18), model.chromeMat, g, false);
      blade.position.set(sx * (flankX(vs, vs.mid) + 0.006), vs.mid + 0.06, vz);
    }
  }
}

/** Shut lines, badges and the fuel filler: the small cues that sell a car. */
function buildPanelGaps(model, def, fam, info, g) {
  const b = def.body;
  const L = b.length;
  const zF = L / 2 - 0.3;
  const zC = b.cabinZ + b.cabinLength / 2 + 0.02;
  panelSeam(g, model.seamMat, info, zF, 0.68);
  panelRibbon(g, model.seamMat, info, 0.64, zC, zF - 0.01);
  panelRibbon(g, model.seamMat, info, -0.64, zC, zF - 0.01);
  if (fam.roof === 'notch') panelSeam(g, model.seamMat, info, -L / 2 + 0.3, 0.68);
  // Fuel filler on the right rear quarter.
  const z = -L / 2 + 0.62;
  const st = nearest(info, z);
  const y = st.mid + 0.13;
  const x = flankX(st, y) + 0.002;
  const ring = mesh(new THREE.TorusGeometry(0.044, 0.006, 6, 22), model.chromeMat, g, false);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(x, y, z);
  const cap = mesh(new THREE.CircleGeometry(0.038, 20), model.paintMat, g, false);
  cap.rotation.y = Math.PI / 2;
  cap.position.set(x + 0.002, y, z);
  // Shoulder badge behind the front wheel.
  const bs = nearest(info, b.wheelbase - 0.55);
  const by = bs.mid + 0.1;
  for (const sx of [-1, 1]) {
    const badge = mesh(new THREE.BoxGeometry(0.01, 0.022, 0.09), model.chromeMat, g, false);
    badge.position.set(sx * (flankX(bs, by) + 0.003), by, b.wheelbase - 0.55);
  }
}

/* ───────────────────────── wheels ───────────────────────── */

const caliperMat = new THREE.MeshStandardMaterial({ color: 0xd8262f, metalness: 0.3, roughness: 0.4 });

function taperedSpoke(len, rootW, tipW, depth) {
  // A spoke along +y from the hub (y=0) to the rim (y=len), narrowing outward.
  const geo = new THREE.BoxGeometry(depth, len, rootW, 1, 2, 1);
  geo.translate(0, len / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getY(i) / len;
    pos.setZ(i, pos.getZ(i) * (1 - k * (1 - tipW / rootW)));
    pos.setX(i, pos.getX(i) - k * k * 0.02); // dished: the rim end sits deeper
  }
  geo.computeVertexNormals();
  return geo;
}

function buildWheel(model, def, fam, front) {
  const r = def.body.wheelRadius;
  const rugged = !!fam.clad;
  const width = rugged ? 0.32 : front ? 0.27 : 0.31;
  const g = new THREE.Group();
  const rimR = r * (rugged ? 0.7 : 0.78);
  const hw = width / 2;
  // Tyre: bead at the rim, bulging sidewall, rounded shoulders, flat tread.
  const prof = [
    [rimR - 0.01, -hw * 0.86], [rimR + 0.015, -hw * 0.98], [r * 0.9, -hw], [r * 0.975, -hw * 0.9],
    [r, -hw * 0.68], [r, hw * 0.68], [r * 0.975, hw * 0.9], [r * 0.9, hw], [rimR + 0.015, hw * 0.98], [rimR - 0.01, hw * 0.86],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const tyre = new THREE.LatheGeometry(prof, 48);
  tyre.rotateZ(Math.PI / 2);
  mesh(tyre, model.rubberMat, g);
  // Dark inner barrel gives the wheel depth behind the spokes.
  const barrel = new THREE.CylinderGeometry(rimR - 0.005, rimR - 0.005, width * 0.86, 36, 1, true);
  barrel.rotateZ(Math.PI / 2);
  mesh(barrel, model.trimMat, g, false);
  const outer = hw * 0.86;
  // Polished rim lip.
  const lip = mesh(new THREE.TorusGeometry(rimR - 0.006, 0.014, 6, 40), model.rimMat, g, false);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = outer;
  // Brake disc behind the spokes.
  const disc = mesh(new THREE.CylinderGeometry(rimR * 0.8, rimR * 0.8, 0.025, 32), model.discMat || model.trimMat, g, false);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = outer - 0.1;
  // Spokes: twin spokes on sporty cars, chunky single ones on rugged ones.
  const n = rugged ? 6 : fam.spokes >= 10 ? 5 : fam.spokes;
  const twin = !rugged && fam.spokes >= 10;
  const len = rimR - 0.07;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    for (const off of twin ? [-0.11, 0.11] : [0]) {
      const spoke = mesh(taperedSpoke(len, rugged ? 0.09 : twin ? 0.05 : 0.075, rugged ? 0.07 : twin ? 0.035 : 0.045, 0.035), model.rimMat, g, false);
      spoke.position.set(outer - 0.005, 0, 0);
      spoke.rotation.x = a + off;
      spoke.translateY(0.06);
    }
  }
  // Hub, centre cap and wheel nuts.
  const hub = mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.05, 24), model.rimMat, g, false);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = outer - 0.01;
  const cap = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 20), model.trimMat, g, false);
  cap.rotation.z = Math.PI / 2;
  cap.position.x = outer + 0.022;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const nut = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.02, 6), model.chromeMat, g, false);
    nut.rotation.z = Math.PI / 2;
    nut.position.set(outer + 0.018, Math.cos(a) * 0.058, Math.sin(a) * 0.058);
  }
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
    // Textured materials (the licence plate) keep their UVs; everything else
    // is flat-coloured, so only position and normal need to merge.
    const keep = o.material.map ? ['position', 'normal', 'uv'] : ['position', 'normal'];
    for (const name of Object.keys(geo.attributes)) if (!keep.includes(name)) geo.deleteAttribute(name);
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
  buildSides(model, def, fam, info, details, prof);
  buildPanelGaps(model, def, fam, info, details);
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
      pivot.position.set(sx * Math.min(st.w - built.width / 2 - 0.05, W / 2 - built.width / 2 - 0.03), def.body.wheelRadius, za);
      model.root.add(pivot);
      const spin = new THREE.Group();
      pivot.add(spin);
      // Turn (never mirror) the left wheels: a negative scale flips the
      // triangles inside out once merged.
      if (sx < 0) built.g.rotation.y = Math.PI;
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
