import * as THREE from 'three';

// Air between the tyre and its wheel arch. Body lean is limited so the arch
// lip never drops into this gap (see setBodyTilt), otherwise the black tyre
// shows through the paint in fast corners.
const ARCH_GAP = 0.065;
// Shell thickness above the arch, including the drop of the rolled edge.
const FENDER_COVER = 0.08;
// Highest the wing crowns may rise above the bonnet line.
const MAX_WING_LIFT = 0.1;
// Length (m) over which a wing crown eases back into the bonnet or deck.
const WING_FADE = 0.4;
// Length over which a wing line blends into the beltline inside the cabin.
const CABIN_FADE = 0.3;
const _tiltPivot = new THREE.Vector3();
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FINISHES, RIM_STYLES, SPOILERS, STRIPES, TINTS, UNDERGLOWS } from './data/cars.js';

const CARBON = 0x17171d;
const TRIM = 0x101116;

// Per-style proportions shared by the shell and the greenhouse. The fender
// value widens the body over each axle, tumble controls how much the glass
// leans in, and roof selects the greenhouse profile.
const STYLE_SHAPE = {
  hatch: { fender: 1.035, tumble: 0.975, hood: 1.0, roof: 'hatch' },
  sedan: { fender: 1.038, tumble: 0.972, hood: 1.0, roof: 'notch' },
  sports: { fender: 1.045, tumble: 0.965, hood: 0.94, roof: 'fast' },
  muscle: { fender: 1.052, tumble: 0.975, hood: 1.0, roof: 'fast' },
  super: { fender: 1.05, tumble: 0.955, hood: 0.84, roof: 'fast' },
  hyper: { fender: 1.055, tumble: 0.95, hood: 0.8, roof: 'fast' },
  suv: { fender: 1.022, tumble: 0.992, hood: 1.0, roof: 'boxy' },
  offroad: { fender: 1.028, tumble: 0.99, hood: 1.0, roof: 'boxy' },
  roadster: { fender: 1.04, tumble: 0.965, hood: 0.92, roof: 'none' },
  gt: { fender: 1.045, tumble: 0.97, hood: 0.96, roof: 'fast' },
};

function rbox(w, h, d, r = 0.08) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.05));
}

/**
 * Smooth interpolation through [t, value] keys, clamped at both ends.
 * Monotone cubic (Fritsch–Carlson): the curve passes through every key with
 * a continuous slope and never overshoots, so long panels stay fair instead
 * of flattening out (and rippling) at each key like a per-segment ease.
 */
function profile(keys, t) {
  const k = [];
  for (const key of keys.slice().sort((a, b) => a[0] - b[0])) {
    if (k.length && key[0] - k[k.length - 1][0] < 1e-6) k[k.length - 1] = key;
    else k.push(key);
  }
  const n = k.length;
  if (t <= k[0][0]) return k[0][1];
  if (t >= k[n - 1][0]) return k[n - 1][1];
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
    if (h > 9) {
      const tau = 3 / Math.sqrt(h);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  let i = 0;
  while (i < n - 2 && t > k[i + 1][0]) i++;
  const h = k[i + 1][0] - k[i][0];
  const u = (t - k[i][0]) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k[i][1] + (u3 - 2 * u2 + u) * h * m[i]
    + (-2 * u3 + 3 * u2) * k[i + 1][1] + (u3 - u2) * h * m[i + 1];
}

/** Corner radius of a station's rounded-rectangle section. */
function cornerRadius(st) {
  const hy = Math.max(0.001, (st.yTop - st.yBottom) / 2);
  const hw = Math.max(0.001, (st.halfWidthBottom + st.halfWidthTop) / 2);
  return Math.min(0.13, hy * 0.48, hw * 0.45);
}

/**
 * Wing crown: how much higher the top surface sits at |x| than on the
 * bonnet centreline. Real cars carry their wings over the wheels at or above
 * bonnet height, so only the outer part of the section rises.
 */
function topLiftAt(st, ax) {
  const lift = st.lift || 0;
  if (lift <= 0) return 0;
  const w = st.halfWidthTop;
  const u = Math.min(1, Math.max(0, (ax - w * 0.42) / (w * 0.34)));
  return lift * u * u * (3 - 2 * u);
}

/** Half width of a station's section at height y. */
function sectionHalfWidth(st, y) {
  const lift = st.lift || 0;
  if (lift > 0) st = { ...st, yTop: st.yTop + lift };
  if (y < st.yBottom || y > st.yTop) return 0;
  const rc = cornerRadius(st);
  if (y < st.yBottom + rc) {
    const dy = y - (st.yBottom + rc);
    return Math.max(0, st.halfWidthBottom - rc + Math.sqrt(Math.max(0, rc * rc - dy * dy)));
  }
  if (y > st.yTop - rc) {
    const dy = y - (st.yTop - rc);
    return Math.max(0, st.halfWidthTop - rc + Math.sqrt(Math.max(0, rc * rc - dy * dy)));
  }
  const u = (y - st.yBottom) / Math.max(0.001, st.yTop - st.yBottom);
  return st.halfWidthBottom + (st.halfWidthTop - st.halfWidthBottom) * u;
}

/** Height of the top surface of a station at horizontal offset x. */
function surfaceTopAt(st, x) {
  const rc = cornerRadius(st);
  const ax = Math.abs(x);
  if (ax <= st.halfWidthTop - rc) return st.yTop + topLiftAt(st, ax);
  const top = st.yTop + (st.lift || 0);
  if (ax >= st.halfWidthTop) return top - rc;
  const d = ax - (st.halfWidthTop - rc);
  return top - rc + Math.sqrt(Math.max(0, rc * rc - d * d));
}

/**
 * Trace a station's rounded-rectangle section: flat floor, near-vertical
 * flanks and a flat top with rolled corners. Keeping the flanks full to the
 * bottom means a wheel arch cut into the lower edge still leaves a fender
 * that wraps over the tyre instead of a knife edge.
 */
function sectionRing(st) {
  const { yBottom: yB, yTop: yT, halfWidthBottom: wB, halfWidthTop: wT } = st;
  const rc = cornerRadius(st);
  const lift = st.lift || 0;
  const yE = yT + lift; // top of the wing at the outer edge
  // Every station gets the same number of points in each part (floor,
  // corners, flanks, top), so point j means the same feature all along the
  // car. Resampling by arc length instead made points slide between
  // stations where the shape changes, twisting the surface into wrinkles.
  const C = 6;
  const F = 6;
  const B = 8;
  const T = 20;
  const pts = [];
  const put = (x, y) => pts.push([x, y]);
  const corner = (cx, cy, a0) => {
    for (let i = 0; i < C; i++) {
      const a = a0 + (Math.PI / 2) * (i / C);
      put(cx + rc * Math.cos(a), cy + rc * Math.sin(a));
    }
  };
  for (let i = 0; i < B; i++) put(-(wB - rc) + 2 * (wB - rc) * (i / B), yB);
  corner(wB - rc, yB + rc, -Math.PI / 2);
  for (let i = 0; i < F; i++) {
    const u = i / F;
    put(wB + (wT - wB) * u, yB + rc + (yE - yB - 2 * rc) * u);
  }
  corner(wT - rc, yE - rc, 0);
  // Top: flat bonnet in the middle rising into the wing crowns.
  for (let i = 0; i < T; i++) {
    const x = (wT - rc) * (1 - (2 * i) / T);
    put(x, yT + topLiftAt(st, Math.abs(x)));
  }
  corner(-(wT - rc), yE - rc, Math.PI / 2);
  for (let i = 0; i < F; i++) {
    const u = i / F;
    put(-wT + (wT - wB) * u, yE - rc - (yE - yB - 2 * rc) * u);
  }
  corner(-(wB - rc), yB + rc, Math.PI);
  return pts;
}


/** Loft a smooth closed shell through rounded-rectangle sections. */
function loftGeometry(stations) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const segments = sectionRing(stations[0]).length;

  for (let i = 0; i < stations.length; i++) {
    const ring = sectionRing(stations[i]);
    for (let j = 0; j < segments; j++) {
      positions.push(ring[j][0], ring[j][1], stations[i].z);
      uvs.push(j / segments, i / (stations.length - 1));
    }
  }

  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j;
      const b = i * segments + ((j + 1) % segments);
      const c = (i + 1) * segments + ((j + 1) % segments);
      const d = (i + 1) * segments + j;
      indices.push(a, b, c, a, c, d);
    }
  }

  // Close both ends with a small fan so the shell is watertight.
  const addCap = (stationIndex, front) => {
    const st = stations[stationIndex];
    const cy = (st.yBottom + st.yTop) / 2;
    const center = positions.length / 3;
    positions.push(0, cy, st.z + (front ? 0.0005 : -0.0005));
    uvs.push(0.5, front ? 1 : 0);
    for (let j = 0; j < segments; j++) {
      const a = stationIndex * segments + j;
      const b = stationIndex * segments + ((j + 1) % segments);
      if (front) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  };
  addCap(0, false);
  addCap(stations.length - 1, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** A strip that sits on the flat top of a set of stations (roof skin). */
function loftTopStrip(stations, widthScale = 0.99, lift = 0.006, columns = 5) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const w = st.halfWidthTop * widthScale;
    for (let j = 0; j < columns; j++) {
      const x = -w + (2 * w) * (j / (columns - 1));
      positions.push(x, surfaceTopAt(st, x) + lift, st.z);
      uvs.push(j / (columns - 1), i / (stations.length - 1));
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < columns - 1; j++) {
      const a = i * columns + j;
      const b = i * columns + j + 1;
      const c = (i + 1) * columns + j + 1;
      const d = (i + 1) * columns + j;
      indices.push(a, c, b, a, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Interpolate station fields at a given z. */
function stationAt(stations, z) {
  if (!stations?.length) return null;
  if (z <= stations[0].z) return stations[0];
  const last = stations[stations.length - 1];
  if (z >= last.z) return last;
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const c = stations[i + 1];
    if (z <= c.z) {
      const t = (z - a.z) / Math.max(1e-6, c.z - a.z);
      return {
        z,
        yBottom: a.yBottom + (c.yBottom - a.yBottom) * t,
        yTop: a.yTop + (c.yTop - a.yTop) * t,
        halfWidthBottom: a.halfWidthBottom + (c.halfWidthBottom - a.halfWidthBottom) * t,
        halfWidthTop: a.halfWidthTop + (c.halfWidthTop - a.halfWidthTop) * t,
        lift: (a.lift || 0) + ((c.lift || 0) - (a.lift || 0)) * t,
      };
    }
  }
  return last;
}

function treadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  // Dark sidewall over the whole lathe profile.
  ctx.fillStyle = '#0a0a0d';
  ctx.fillRect(0, 0, 256, 128);
  // The tread is the narrow band between profile points 3 and 4, roughly
  // the middle sixth of the texture; everything outside it is sidewall.
  const top = 48;
  const bottom = 80;
  ctx.fillStyle = '#16161c';
  ctx.fillRect(0, top, 256, bottom - top);
  // Circumferential grooves.
  ctx.fillStyle = '#060609';
  for (const y of [56, 64, 72, 78]) ctx.fillRect(0, y, 256, 2.5);
  // Lateral tread blocks.
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  for (let x = 0; x < 256; x += 12) ctx.fillRect(x, top, 4, bottom - top);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  for (let x = 6; x < 256; x += 12) ctx.fillRect(x, top, 1.5, bottom - top);
  // Sidewall shoulder rings.
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  for (const y of [26, 34, 96, 104]) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2.4, 1);
  tex.anisotropy = 4;
  return tex;
}

function grilleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#08080b';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = 'rgba(150,160,180,0.32)';
  ctx.lineWidth = 2;
  for (let y = 10; y < 128; y += 14) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth = 3;
  for (let x = 0; x < 256; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 128);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function tyreProfile(radius, halfWidth) {
  const points = [];
  const r = radius;
  const w = halfWidth;
  points.push(new THREE.Vector2(r * 0.63, -w * 0.92));
  points.push(new THREE.Vector2(r * 0.84, -w));
  points.push(new THREE.Vector2(r * 0.95, -w * 0.9));
  points.push(new THREE.Vector2(r, -w * 0.72));
  points.push(new THREE.Vector2(r, w * 0.72));
  points.push(new THREE.Vector2(r * 0.95, w * 0.9));
  points.push(new THREE.Vector2(r * 0.84, w));
  points.push(new THREE.Vector2(r * 0.63, w * 0.92));
  return points;
}

function plateTexture(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext('2d');
  // Light plate, dark characters: readable from the chase camera even in the
  // car's own shadow (the material also adds a faint plate light).
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(0, 0, 512, 144);
  ctx.fillStyle = '#ff7a45';
  ctx.fillRect(0, 0, 44, 144); // side band
  ctx.strokeStyle = '#17121e';
  ctx.lineWidth = 7;
  ctx.strokeRect(5, 5, 502, 134);
  const label = (text || 'SUNSET').toUpperCase().slice(0, 9);
  ctx.fillStyle = '#17121e';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let size = 104;
  ctx.font = `800 ${size}px Inter, Arial, sans-serif`;
  while (ctx.measureText(label).width > 430 && size > 50) {
    size -= 4;
    ctx.font = `800 ${size}px Inter, Arial, sans-serif`;
  }
  ctx.fillText(label, 278, 78);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

let sharedGlow = null;

export class CarModel {
  constructor(carDef, look) {
    this.def = carDef;
    this.bodyDef = carDef.body;
    this.look = look;
    this.root = new THREE.Group();
    this.root.name = `car-${carDef.id}`;
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.wheels = [];
    this.frontWheels = [];
    this.wheelSpin = 0;
    this.steerVisual = 0;
    this.rimStyleGroups = new Map(RIM_STYLES.map((s) => [s.id, []]));
    this.spoilerGroups = new Map(SPOILERS.map((s) => [s.id, null]));
    this.stripeGroups = new Map(STRIPES.map((s) => [s.id, null]));
    this.buildMaterials(look);
    this.buildBase();
    this.buildWheels();
    this.buildSpoilers();
    this.buildStripes();
    this.buildExtras();
    this.buildStyleDetails();
    this.applyLook(look, true);
    this.mergeStaticParts();
    this.collectDetail();
  }

  buildMaterials(look) {
    this.paintMat = new THREE.MeshPhysicalMaterial({
      color: look.paint, metalness: 0.45, roughness: 0.24,
      clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1,
    });
    this.trimMat = new THREE.MeshStandardMaterial({ color: TRIM, metalness: 0.5, roughness: 0.55 });
    this.carbonMat = new THREE.MeshStandardMaterial({ color: CARBON, metalness: 0.45, roughness: 0.38 });
    this.chromeMat = new THREE.MeshStandardMaterial({ color: 0xc9cfda, metalness: 1, roughness: 0.16 });
    this.glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x1b2b40, metalness: 0.55, roughness: 0.045,
      clearcoat: 1, clearcoatRoughness: 0.04,
      transparent: true, opacity: 0.74, envMapIntensity: 1.9,
    });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xffe4ab, emissiveIntensity: 2.6, roughness: 0.2 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x3a0307, emissive: 0xff1735, emissiveIntensity: 1.4, roughness: 0.3 });
    this.rubberMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, metalness: 0.04, roughness: 0.92 });
    this.treadMat = new THREE.MeshStandardMaterial({
      map: treadTexture(), color: 0xffffff, metalness: 0.04, roughness: 0.88,
    });
    this.rimMat = new THREE.MeshStandardMaterial({ color: look.rim, metalness: 0.95, roughness: 0.24 });
    this.discMat = new THREE.MeshStandardMaterial({ color: 0x4a4d55, metalness: 0.9, roughness: 0.45 });
    this.archMat = new THREE.MeshStandardMaterial({ color: 0x07060a, metalness: 0.1, roughness: 0.95, side: THREE.DoubleSide });
    this.caliperMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, metalness: 0.45, roughness: 0.34 });
    this.grilleMat = new THREE.MeshStandardMaterial({ map: grilleTexture(), color: 0xffffff, metalness: 0.6, roughness: 0.42 });
    this.seamMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0e, side: THREE.DoubleSide });
    this.plateTex = plateTexture(look.plate);
    this.plateMat = new THREE.MeshStandardMaterial({
      map: this.plateTex,
      emissive: 0xffffff,
      emissiveMap: this.plateTex,
      emissiveIntensity: 0.32,
      roughness: 0.5,
      metalness: 0,
    });
    this.stripeMat = new THREE.MeshStandardMaterial({ color: look.stripeColor, metalness: 0.25, roughness: 0.3 });
    this.glowMat = new THREE.MeshBasicMaterial({
      map: sharedGlow || (sharedGlow = glowTexture()),
      color: 0x5ce1e6, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
  }

  add(mesh, parent = this.body) {
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  buildBase() {
    const b = this.bodyDef;
    const L = b.length;
    const W = b.width;
    const shape = STYLE_SHAPE[b.style] || STYLE_SHAPE.sports;
    // Keep the fender line above the tyre even on cars with big wheels.
    const bodyTop = Math.max(b.rideHeight + 0.33, b.wheelRadius * 2 + 0.11);
    const cabinY = bodyTop - 0.06 + b.cabinHeight / 2;
    this.bodyTop = bodyTop;
    this.cabinY = cabinY;

    const zToT = (z) => THREE.MathUtils.clamp((z + L / 2) / L, 0, 1);
    const tCabinRear = zToT(b.cabinZ - b.cabinLength / 2);
    const tCabinFront = zToT(b.cabinZ + b.cabinLength / 2);
    const tWheelRear = zToT(-b.wheelbase);
    const tWheelFront = zToT(b.wheelbase);
    const cabinMid = (tCabinRear + tCabinFront) / 2;
    const hyp = (v) => Math.max(0.02, v);

    // Side silhouette: low nose, rising hood, beltline, deck, tail. Width
    // bulges slightly over each axle so the shell reads as four fenders.
    // The bonnet is nearly level: it starts just under the beltline at the
    // windscreen and falls only a few centimetres before rolling over the
    // nose (more on wedge-shaped supercars), instead of a long ramp.
    const wedge = b.style === 'super' || b.style === 'hyper' ? 0.16 : 0.07;
    const hoodRear = bodyTop - 0.08;
    const hoodFront = Math.max(b.noseDrop + 0.07 * shape.hood, hoodRear - wedge);
    const topKeys = [
      [0, b.tailHeight - 0.02],
      [0.03, b.tailHeight + 0.01],
      [hyp(tCabinRear - 0.07), b.tailHeight + 0.04],
      [tCabinRear, bodyTop - 0.05],
      [hyp(tCabinRear + 0.02), bodyTop - 0.02],
      [hyp(tCabinFront - 0.02), bodyTop - 0.02],
      [tCabinFront, bodyTop - 0.06],
      [hyp(tCabinFront + 0.03), hoodRear],
      [0.93, hoodFront],
      [0.975, hoodFront - 0.035],
      [1, hoodFront - 0.09],
    ];
    const bottomKeys = [
      [0, b.rideHeight - 0.10],
      [0.04, b.rideHeight - 0.17],
      [0.12, b.rideHeight - 0.17],
      [0.88, b.rideHeight - 0.17],
      [0.96, b.rideHeight - 0.16],
      [1, b.rideHeight - 0.12],
    ];
    const fender = shape.fender;
    const widthKeys = [
      [0, 0.77],
      [0.03, 0.88],
      [0.1, 0.94],
      [hyp(tWheelRear - 0.09), fender - 0.05],
      [tWheelRear, fender],
      [hyp(tWheelRear + 0.08), fender - 0.045],
      [cabinMid, fender - 0.05],
      [hyp(tWheelFront - 0.08), fender - 0.045],
      [tWheelFront, fender],
      [hyp(tWheelFront + 0.09), fender - 0.05],
      [0.9, 0.93],
      [0.97, 0.82],
      [1, 0.72],
    ];

    const stations = [];
    const STATIONS = 112;
    const archR = b.wheelRadius + ARCH_GAP;
    // Wing crown needed over each axle: enough to clear the arch at the
    // outer edge of the bonnet line there.
    const zCabinFront = b.cabinZ + b.cabinLength / 2;
    const zCabinRear = b.cabinZ - b.cabinLength / 2;
    const axles = [-b.wheelbase, b.wheelbase].map((z) => ({
      z,
      lift: Math.max(0, b.wheelRadius + archR + FENDER_COVER - profile(topKeys, zToT(z))),
    }));
    for (let i = 0; i < STATIONS; i++) {
      const t = i / (STATIONS - 1);
      const z = -L / 2 + t * L;
      let yTop = profile(topKeys, t);
      let yBottom = profile(bottomKeys, t);
      // Fender bulges: low noses (supercars, hypercars) would otherwise sit
      // below the wheel arch, letting the tyre and arch liner poke through
      // the bonnet. Raise the shell over each axle so its rolled outer edge
      // clears the arch, easing back to the base line on either side.
      // One wing line per axle: level over the arch and all the way to the
      // cabin (like a real wing running back to the windscreen pillar), and
      // easing out only towards the bumper and into the cabin, so there is
      // no dip between the wheel and the windscreen.
      let lift = 0;
      for (const axle of axles) {
        const towardCabin = Math.sign(axle.z) * (axle.z - z); // > 0 between axle and cabin
        let u;
        if (towardCabin > 0) {
          const cabinEdge = axle.z > 0 ? zCabinFront : zCabinRear;
          const past = Math.sign(axle.z) * (cabinEdge - z); // > 0 once inside the cabin
          u = past <= 0 ? 0 : Math.min(1, past / CABIN_FADE);
        } else {
          const d = -towardCabin;
          u = d <= archR ? 0 : Math.min(1, (d - archR) / WING_FADE);
        }
        lift = Math.max(lift, axle.lift * (1 - u * u * (3 - 2 * u)));
      }
      // Crown the wings up to MAX_WING_LIFT above the bonnet; only cars whose
      // wheels are bigger than that still raise the whole section.
      if (lift > MAX_WING_LIFT) {
        yTop += lift - MAX_WING_LIFT;
        lift = MAX_WING_LIFT;
      }
      // Cut a circular wheel arch into the lower edge of the shell. Raising
      // the bottom of each section traces the arch in side view, so the tyre
      // sits in a real opening instead of behind a painted-on black disc.
      for (const zw of [-b.wheelbase, b.wheelbase]) {
        const dz = z - zw;
        if (Math.abs(dz) < archR) {
          yBottom = Math.max(yBottom, b.wheelRadius + Math.sqrt(archR * archR - dz * dz));
        }
      }
      const hw = (W / 2) * profile(widthKeys, t);
      stations.push({
        z, yBottom: Math.min(yBottom, yTop - 0.045), yTop: Math.max(yTop, yBottom + 0.03),
        halfWidthBottom: hw, halfWidthTop: hw * shape.tumble, lift: Math.max(0, lift),
      });
    }

    this.profileStations = stations;

    // One smooth painted shell instead of stacked boxes.
    const shell = new THREE.Mesh(loftGeometry(stations), this.paintMat);
    this.shellMesh = this.add(shell);
    this.hoodMesh = shell;
    this.deckMesh = shell;

    // Flat-ish underbody and side skirts.
    this.add(new THREE.Mesh(rbox(W * 0.9, 0.1, L * 0.86, 0.04), this.trimMat))
      .position.set(0, b.rideHeight - 0.13, 0);
    for (const sx of [-1, 1]) {
      const skirtY = b.rideHeight - 0.13;
      const skirt = this.add(new THREE.Mesh(rbox(0.04, 0.09, L * 0.46, 0.02), this.trimMat));
      skirt.position.set(sx * (this.sideX(skirtY, 0) + 0.002), skirtY, 0);
    }

    // Dark arch liners close the openings cut into the shell and give the
    // wheels a deep well to sit in. They are inside the tyre, so only the
    // shadowed upper half is visible.
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const z = sz * b.wheelbase;
      const st = stationAt(stations, z);
      const hw = st.halfWidthBottom;
      // The liner stays inside the shell: its outer end stops 1.5 cm short
      // of the body side and its crown just under the shell's underside.
      const linerW = 0.42;
      const liner = new THREE.Mesh(
        new THREE.CylinderGeometry(archR * 0.99, archR * 0.99, linerW, 26, 1, true, 0, Math.PI),
        this.archMat,
      );
      liner.rotation.z = Math.PI / 2;
      // Crown just under the wing (the wing rises above the bonnet over the wheel).
      liner.scale.x = Math.min(1, (st.yTop + (st.lift || 0) - 0.03 - b.wheelRadius) / (archR * 0.99));
      liner.position.set(sx * (hw - 0.015 - linerW / 2), b.wheelRadius, z);
      liner.castShadow = false;
      this.body.add(liner);

      // Body-colour lip around the opening so the fender reads as a rolled
      // edge instead of the section simply ending above the tyre.
      const lip = new THREE.Mesh(
        new THREE.TorusGeometry(archR + 0.004, 0.014, 6, 26, Math.PI),
        this.paintMat,
      );
      lip.rotation.y = Math.PI / 2;
      lip.position.set(sx * (hw - 0.014), b.wheelRadius, z);
      lip.castShadow = false;
      this.body.add(lip);
    }

    // Cabin glass: a lofted greenhouse with tumblehome, plus painted roof.
    this.openTop = b.style === 'roadster';
    if (this.openTop) {
      this.buildCockpit(bodyTop);
      this.roofMesh = null;
      this.roofY = bodyTop + 0.2;
    } else {
      const roofTop = bodyTop + b.cabinHeight * 0.94;
      const zr = b.cabinZ - b.cabinLength / 2;
      const zf = b.cabinZ + b.cabinLength / 2;
      const roofKeys = shape.roof === 'boxy'
        ? [
            [0, bodyTop + 0.02],
            [0.05, roofTop - 0.025],
            [0.14, roofTop - 0.004],
            [0.9, roofTop - 0.004],
            [0.98, roofTop - 0.02],
            [1, bodyTop + 0.02],
          ]
        : shape.roof === 'notch'
          ? [
              [0, bodyTop + 0.02],
              [0.1, roofTop - 0.075],
              [0.26, roofTop - 0.008],
              [0.78, roofTop - 0.008],
              [0.94, roofTop - 0.025],
              [1, bodyTop + 0.02],
            ]
          : shape.roof === 'hatch'
            ? [
                [0, bodyTop + 0.02],
                [0.08, roofTop - 0.05],
                [0.2, roofTop - 0.005],
                [0.86, roofTop - 0.005],
                [0.97, roofTop - 0.03],
                [1, bodyTop + 0.02],
              ]
            : [
                [0, bodyTop + 0.02],
                [0.16, roofTop - 0.1],
                [0.32, roofTop - 0.005],
                [0.68, roofTop - 0.005],
                [0.88, roofTop - 0.045],
                [1, bodyTop + 0.02],
              ];
      const ghStations = [];
      const GH = 18;
      for (let i = 0; i < GH; i++) {
        const s = i / (GH - 1);
        ghStations.push({
          z: zr + s * (zf - zr),
          yBottom: bodyTop - 0.045,
          yTop: Math.max(profile(roofKeys, s), bodyTop + 0.02),
          halfWidthBottom: b.cabinWidth * 0.485,
          halfWidthTop: b.roofWidth * (shape.roof === 'boxy' ? 0.49 : 0.47),
        });
      }
      this.roofStations = ghStations;
      const glass = new THREE.Mesh(loftGeometry(ghStations), this.glassMat);
      glass.castShadow = false;
      this.body.add(glass);

      // Painted roof skin over the flat part of the greenhouse only, so the
      // raked front and rear surfaces stay glass (windshield / rear window).
      const roofPanelStations = ghStations.slice(3, GH - 3);
      const roofSkin = new THREE.Mesh(loftTopStrip(roofPanelStations, 0.99, 0.004, 5), this.paintMat);
      roofSkin.castShadow = true;
      this.body.add(roofSkin);
      this.roofMesh = null;
      this.roofY = roofTop + 0.008;

      const interior = this.add(new THREE.Mesh(
        rbox(b.cabinWidth * 0.84, b.cabinHeight * 0.68, b.cabinLength * 0.86, 0.08),
        this.trimMat,
      ));
      interior.position.set(0, bodyTop + b.cabinHeight * 0.3, b.cabinZ);
      // Seen from outside only: the cockpit view hides it (see cockpit.js).
      this.interiorBlock = interior;
      interior.userData.noMerge = true;

      // B-pillar splitting the side glass. The A/C posts are implied by the
      // glass meeting the painted body and roof skin.
      for (const sx of [-1, 1]) {
        const pillar = this.add(new THREE.Mesh(
          rbox(0.045, b.cabinHeight * 0.82, 0.07, 0.015), this.trimMat,
        ));
        pillar.position.set(sx * b.cabinWidth * 0.487, bodyTop + b.cabinHeight * 0.4, b.cabinZ - 0.12);
      }
      // Seal along the base of the windows.
      for (const sx of [-1, 1]) {
        const seal = this.add(new THREE.Mesh(
          new THREE.BoxGeometry(0.022, 0.022, b.cabinLength * 0.98), this.trimMat,
        ));
        seal.position.set(sx * (b.cabinWidth * 0.49), bodyTop + 0.005, b.cabinZ);
      }

      // Body-colour A/C pillars and a dark roof rail trace the real glass
      // silhouette, so they frame the windows instead of floating across
      // them like a roll cage.
      const flatY = roofTop - 0.03;
      let iFront = GH - 1;
      while (iFront > 0 && ghStations[iFront].yTop < flatY) iFront--;
      let iRear = 0;
      while (iRear < GH - 1 && ghStations[iRear].yTop < flatY) iRear++;
      const edgeX = (st) => {
        const u = THREE.MathUtils.clamp((st.yTop - bodyTop) / Math.max(0.001, roofTop - bodyTop), 0, 1);
        return st.halfWidthBottom + (st.halfWidthTop - st.halfWidthBottom) * u;
      };
      const tube = (pts, radius, mat) => {
        const curve = new THREE.CatmullRomCurve3(pts);
        const geo = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 2), radius, 6, false);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = false;
        this.body.add(mesh);
      };
      for (const sx of [-1, 1]) {
        const aPts = [];
        for (let i = iFront; i < GH; i++) {
          const st = ghStations[i];
          aPts.push(new THREE.Vector3(sx * (edgeX(st) - 0.008), st.yTop - 0.006, st.z));
        }
        tube(aPts, 0.023, this.paintMat);
        const cPts = [];
        for (let i = 0; i <= iRear; i++) {
          const st = ghStations[i];
          cPts.push(new THREE.Vector3(sx * (edgeX(st) - 0.008), st.yTop - 0.006, st.z));
        }
        tube(cPts, 0.026, this.paintMat);
        const railPts = [];
        for (let i = iRear; i <= iFront; i++) {
          const st = ghStations[i];
          railPts.push(new THREE.Vector3(sx * (st.halfWidthTop - 0.01), roofTop + 0.001, st.z));
        }
        tube(railPts, 0.014, this.trimMat);
      }
    }

    // Splitter, diffuser and style-specific lighting.
    const splitterY = b.rideHeight - 0.155;
    this.add(new THREE.Mesh(rbox(W * 0.86, 0.05, 0.32, 0.025), this.carbonMat))
      .position.set(0, splitterY, L / 2 - 0.16);
    this.add(new THREE.Mesh(rbox(W * 0.92, 0.2, 0.4, 0.04), this.carbonMat))
      .position.set(0, this.bottomYAt(-L / 2) + 0.06, -L / 2 + 0.12);
    this.buildFrontEnd();
    this.buildTailEnd();
    this.buildSignals();

    this.exhausts = [];
    // Tips stay separate meshes so exhaust upgrades can enlarge them.
    this.exhaustTips = [];
    const exhaustY = this.bottomYAt(-L / 2) + 0.075;
    for (const sx of [-1, 1]) {
      this.add(new THREE.Mesh(rbox(0.19, 0.13, 0.05, 0.02), this.trimMat))
        .position.set(sx * W * 0.3, exhaustY, -L / 2 - 0.05);
      const pipe = this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.2, 14), this.chromeMat));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx * W * 0.3, exhaustY, -L / 2 - 0.09);
      pipe.userData.noMerge = true;
      const bore = this.add(new THREE.Mesh(new THREE.CircleGeometry(0.046, 14), this.archMat));
      bore.rotation.y = Math.PI;
      bore.position.set(sx * W * 0.3, exhaustY, -L / 2 - 0.192);
      bore.userData.noMerge = true;
      this.exhaustTips.push(pipe, bore);
      this.exhausts.push(new THREE.Vector3(sx * W * 0.3, exhaustY, -L / 2 - 0.2));
    }

    // Mirrors sit on the beltline at the base of the A-pillar, with a stalk
    // that actually meets the body.
    for (const sx of [-1, 1]) {
      const mirrorZ = b.cabinZ + b.cabinLength * 0.36;
      const mirrorY = bodyTop + 0.025;
      const inX = this.sideX(mirrorY, mirrorZ);
      const outX = b.cabinWidth / 2 + 0.09;
      const mirror = this.add(new THREE.Mesh(rbox(0.2, 0.075, 0.11, 0.03), this.paintMat));
      mirror.position.set(sx * outX, mirrorY, mirrorZ);
      mirror.rotation.z = sx * -0.08;
      const face = this.add(new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.055), this.glassMat));
      face.position.set(sx * outX, mirrorY + 0.002, mirrorZ - 0.058);
      face.rotation.y = Math.PI;
      face.castShadow = false;
      const stalkLen = Math.max(0.04, outX - inX + 0.04);
      const stalk = this.add(new THREE.Mesh(new THREE.BoxGeometry(stalkLen, 0.024, 0.035), this.trimMat));
      stalk.position.set(sx * (inX + stalkLen / 2 - 0.02), mirrorY - 0.012, mirrorZ + 0.01);
    }

    // Door shut lines follow the curved flank as thin dark ribbons, with a
    // chrome handle on each door. They start at the shell's real lower edge,
    // so they never hang across a wheel opening.
    const doorSeam = (z, side) => {
      const y0 = Math.max(b.rideHeight - 0.02, this.bottomYAt(z) + 0.01);
      const y1 = bodyTop - 0.055;
      if (y1 - y0 < 0.05) return;
      const steps = 12;
      const pos = [];
      const idx = [];
      for (let i = 0; i <= steps; i++) {
        const y = y0 + (y1 - y0) * (i / steps);
        const x = side * (this.sideX(y, z) + 0.0015);
        pos.push(x, y, z - 0.006, x, y, z + 0.006);
      }
      for (let i = 0; i < steps; i++) {
        const a = i * 2;
        if (side > 0) idx.push(a, a + 3, a + 1, a, a + 2, a + 3);
        else idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.seamMat);
      mesh.castShadow = false;
      this.body.add(mesh);
    };
    for (const sx of [-1, 1]) {
      doorSeam(b.cabinZ + b.cabinLength * 0.42, sx);
      doorSeam(b.cabinZ - b.cabinLength * 0.42, sx);
      const hz = b.cabinZ + b.cabinLength * 0.1;
      const hy = bodyTop - 0.15;
      this.body.add(new THREE.Mesh(
        this.sidePatch(sx, hy, hz - 0.075, hz + 0.075, 0.055, 0.0015), this.seamMat,
      ));
      const handle = this.add(new THREE.Mesh(rbox(0.018, 0.028, 0.11, 0.01), this.chromeMat));
      handle.position.set(sx * (this.sideX(hy, hz) + 0.004), hy, hz);
      handle.castShadow = false;
    }

    // Plates sit in dark recesses low on the actual bumper faces, clear of
    // the grille and lamps.
    const plateGeo = new THREE.PlaneGeometry(0.44, 0.115);
    const tailBottom = this.bottomYAt(-L / 2);
    const tailTop = this.topYAt(0, -L / 2);
    const rearPlateY = tailBottom + (tailTop - tailBottom) * 0.16;
    this.add(new THREE.Mesh(rbox(0.5, 0.16, 0.03, 0.02), this.trimMat))
      .position.set(0, rearPlateY, -L / 2 - 0.018);
    const plate = this.add(new THREE.Mesh(plateGeo, this.plateMat));
    // 6 mm proud of the backing panel's face (-0.033) so the two never z-fight.
    plate.position.set(0, rearPlateY, -L / 2 - 0.039);
    plate.rotation.y = Math.PI;
    plate.castShadow = false;
    const noseBottom = this.bottomYAt(L / 2);
    const noseTop = this.topYAt(0, L / 2);
    const frontPlateY = noseBottom + (noseTop - noseBottom) * 0.13;
    this.add(new THREE.Mesh(rbox(0.5, 0.16, 0.03, 0.02), this.trimMat))
      .position.set(0, frontPlateY, L / 2 + 0.012);
    const frontPlate = this.add(new THREE.Mesh(plateGeo, this.plateMat));
    frontPlate.position.set(0, frontPlateY, L / 2 + 0.033);
    frontPlate.castShadow = false;

    // Hood and boot shut lines follow the curved top surface.
    const seam = (z) => {
      const line = new THREE.Mesh(this.crossRibbon(z, W * 0.39), this.seamMat);
      line.castShadow = false;
      this.body.add(line);
    };
    seam(b.cabinZ + b.cabinLength / 2 + 0.06);
    seam(-L / 2 + L * 0.22);

    // Model-specific garnish.
    if (b.vents) {
      const ventY = bodyTop - 0.18;
      const ventZ = b.cabinZ - b.cabinLength * 0.08;
      for (const sx of [-1, 1]) {
        for (const off of [-0.045, 0.045]) {
          this.body.add(new THREE.Mesh(
            this.sidePatch(sx, ventY + off, ventZ - 0.18, ventZ + 0.18, 0.04, 0.0015), this.seamMat,
          ));
        }
      }
    }
    if (b.scoop) {
      const scoop = this.add(new THREE.Mesh(rbox(0.5, 0.12, 0.55, 0.04), this.trimMat));
      scoop.position.set(0, this.roofY - 0.01, b.cabinZ + 0.35);
    }
    if (b.ducktail) {
      const duck = this.add(new THREE.Mesh(rbox(W * 0.72, 0.06, 0.3, 0.02), this.paintMat));
      duck.position.set(0, this.topYAt(0, -L / 2 + 0.16) + 0.022, -L / 2 + 0.16);
      duck.rotation.x = -0.16;
    }
  }

  /** Front fascia: headlights, grille and intakes shaped for each style. */
  buildFrontEnd() {
    const b = this.bodyDef;
    const W = b.width;
    const style = b.style;
    const z = b.length / 2;
    const bottom = this.bottomYAt(z);
    const top = this.topYAt(0, z);
    const fh = Math.max(0.09, top - bottom);
    const at = (f) => bottom + fh * f;
    const s = W / 1.95;

    const housing = (x, y, w, h, r = 0.02) => {
      this.add(new THREE.Mesh(rbox(w, h, 0.04, Math.min(r, h / 2.2)), this.trimMat))
        .position.set(x, y, z + 0.004);
    };
    const lens = (x, y, w, h, mat = this.headMat, depth = 0.016) => {
      const m = this.add(new THREE.Mesh(rbox(w, h, depth, Math.min(0.012, h / 2.2)), mat));
      m.position.set(x, y, z + 0.028);
      m.castShadow = false;
      return m;
    };
    const lamp = (x, y, r, mat = this.headMat) => {
      const m = this.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.018, 18), mat));
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z + 0.03);
      m.castShadow = false;
      return m;
    };
    const bezel = (x, y, r) => {
      const m = this.add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.12, 0.014, 6, 18), this.chromeMat));
      m.position.set(x, y, z + 0.03);
      m.castShadow = false;
    };
    const grille = (x, y, w, h, chrome = false) => {
      this.add(new THREE.Mesh(rbox(w + 0.035, h + 0.035, 0.03, 0.012), chrome ? this.chromeMat : this.trimMat))
        .position.set(x, y, z + 0.008);
      const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.grilleMat);
      g.position.set(x, y, z + 0.026);
      g.castShadow = false;
      this.body.add(g);
    };
    const lightY = top - Math.min(0.11, fh * 0.28);
    const lightH = Math.min(0.11, Math.max(0.035, fh * 0.22));
    const lightW = Math.min(0.46, W * 0.23);
    const grilleY = at(0.37);
    const grilleH = Math.min(0.085, Math.max(0.04, fh * 0.18));

    if (style === 'hatch') {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.3, lightY, lightW, lightH);
        lens(sx * W * 0.3, lightY, lightW * 0.9, lightH * 0.82);
        lens(sx * W * 0.3 - sx * lightW * 0.42, lightY, lightW * 0.16, lightH * 0.7, this.tailMat);
      }
      grille(0, grilleY, W * 0.46, grilleH);
      this.add(new THREE.Mesh(rbox(W * 0.66, 0.045, 0.03, 0.015), this.trimMat))
        .position.set(0, at(0.08), z + 0.008);
    } else if (style === 'sedan' && b.flagship) {
      // Flagship saloon: slim swept lamps with a light strip, and a tall,
      // upright chrome-framed grille with horizontal slats.
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.31, lightY, lightW * 1.25, lightH * 0.85, 0.03);
        lens(sx * W * 0.31, lightY + lightH * 0.12, lightW * 1.15, lightH * 0.32);
        lens(sx * W * 0.31, lightY - lightH * 0.2, lightW * 1.05, 0.016, this.headMat);
      }
      const gw = W * 0.34;
      const gh = Math.min(fh * 0.5, grilleH * 1.6);
      const gy = grilleY + gh * 0.12;
      grille(0, gy, gw, gh, true);
      for (let i = 0; i < 5; i++) {
        this.add(new THREE.Mesh(rbox(gw * 0.9, 0.014, 0.02, 0.006), this.chromeMat))
          .position.set(0, gy - gh * 0.38 + i * gh * 0.19, z + 0.03);
      }
      this.add(new THREE.Mesh(rbox(W * 0.8, 0.03, 0.03, 0.01), this.chromeMat))
        .position.set(0, at(0.07), z + 0.008);
    } else if (style === 'sedan') {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.29, lightY, lightW * 1.12, lightH * 1.25, 0.025);
        for (const dx of [-0.075, 0.075]) {
          lamp(sx * W * 0.29 + dx * s, lightY, Math.min(0.048, lightH * 0.5));
        }
      }
      grille(0, grilleY, W * 0.5, grilleH * 1.15, true);
      for (let i = -2; i <= 2; i++) {
        this.add(new THREE.Mesh(new THREE.BoxGeometry(0.022, grilleH * 0.9, 0.02), this.chromeMat))
          .position.set(i * W * 0.05, grilleY, z + 0.03);
      }
      this.add(new THREE.Mesh(rbox(W * 0.74, 0.035, 0.03, 0.01), this.chromeMat))
        .position.set(0, at(0.07), z + 0.008);
    } else if (style === 'sports') {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.3, lightY, lightW * 1.04, lightH * 0.9);
        lens(sx * W * 0.3, lightY, lightW * 0.92, lightH * 0.45);
        lens(sx * W * 0.3, lightY - lightH * 0.32, lightW * 0.7, 0.018);
      }
      grille(0, grilleY, W * 0.48, grilleH * 1.1);
      this.add(new THREE.Mesh(rbox(W * 0.82, 0.035, 0.03, 0.012), this.trimMat))
        .position.set(0, at(0.09), z + 0.008);
    } else if (style === 'muscle') {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.31, lightY, lightW * 0.72, lightH * 1.15);
        lamp(sx * W * 0.31, lightY, Math.min(0.072, lightH * 0.62));
        bezel(sx * W * 0.31, lightY, Math.min(0.072, lightH * 0.62));
      }
      for (const sx of [-1, 1]) {
        grille(sx * W * 0.15, grilleY, W * 0.24, grilleH, true);
      }
      this.add(new THREE.Mesh(rbox(W * 0.1, grilleH * 1.05, 0.035, 0.012), this.paintMat))
        .position.set(0, grilleY, z + 0.01);
    } else if (style === 'super' || style === 'hyper') {
      if (style === 'hyper') {
        housing(0, lightY, W * 0.72, lightH * 0.55, 0.012);
        lens(0, lightY, W * 0.68, lightH * 0.22, this.headMat, 0.02);
        for (const sx of [-1, 1]) {
          this.add(new THREE.Mesh(rbox(0.05, Math.max(0.05, fh * 0.35), 0.03, 0.012), this.trimMat))
            .position.set(sx * W * 0.36, lightY - fh * 0.16, z + 0.008);
        }
      } else {
        for (const sx of [-1, 1]) {
          const m = lens(sx * W * 0.3, lightY, lightW * 0.95, lightH * 0.5);
          m.rotation.z = sx * 0.06;
          housing(sx * W * 0.3, lightY, lightW, lightH * 0.72, 0.012);
        }
      }
      for (const sx of [-1, 1]) {
        grille(sx * W * 0.3, at(0.16), W * 0.22, grilleH * 1.1);
      }
    } else if (style === 'suv') {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.3, lightY, lightW * 0.9, lightH * 1.5, 0.02);
        for (const dx of [-0.06, 0.06]) {
          lamp(sx * W * 0.3 + dx * s, lightY, Math.min(0.046, lightH * 0.55));
        }
      }
      grille(0, grilleY, W * 0.56, grilleH * 1.4, true);
      for (let i = -2; i <= 2; i++) {
        this.add(new THREE.Mesh(new THREE.BoxGeometry(0.025, grilleH * 1.2, 0.02), this.chromeMat))
          .position.set(i * W * 0.06, grilleY, z + 0.03);
      }
      this.add(new THREE.Mesh(rbox(W * 0.5, 0.05, 0.04, 0.02), this.chromeMat))
        .position.set(0, at(0.06), z + 0.008);
    } else if (style === 'offroad') {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.31, lightY, lightW * 0.9, lightH * 1.4, 0.02);
        lamp(sx * W * 0.31 - 0.07 * s, lightY, Math.min(0.06, lightH * 0.62));
        lamp(sx * W * 0.31 + 0.07 * s, lightY, Math.min(0.06, lightH * 0.62));
      }
      grille(0, grilleY, W * 0.5, grilleH * 1.5);
      this.add(new THREE.Mesh(rbox(W * 0.78, 0.06, 0.05, 0.02), this.trimMat))
        .position.set(0, at(0.05), z + 0.01);
      for (const sx of [-1, 1]) {
        this.add(new THREE.Mesh(rbox(0.08, 0.05, 0.05, 0.015), this.caliperMat))
          .position.set(sx * W * 0.22, at(0.06), z + 0.02);
      }
    } else if (style === 'roadster') {
      for (const sx of [-1, 1]) {
        lamp(sx * W * 0.31, lightY, Math.min(0.07, lightH * 0.7));
        bezel(sx * W * 0.31, lightY, Math.min(0.07, lightH * 0.7));
        housing(sx * W * 0.31, lightY, lightW * 0.72, lightH * 1.1, 0.02);
      }
      grille(0, grilleY, W * 0.42, grilleH * 0.9, true);
      this.add(new THREE.Mesh(rbox(W * 0.74, 0.03, 0.03, 0.01), this.chromeMat))
        .position.set(0, at(0.07), z + 0.008);
    } else {
      // GT: quad round lamps and a wide chrome grille.
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.3, lightY, lightW * 1.1, lightH * 1.2, 0.02);
        for (const dx of [-0.08, 0.08]) {
          lamp(sx * W * 0.3 + dx * s, lightY, Math.min(0.045, lightH * 0.52));
          bezel(sx * W * 0.3 + dx * s, lightY, Math.min(0.045, lightH * 0.52));
        }
      }
      grille(0, grilleY, W * 0.52, grilleH * 1.15, true);
      for (let i = -2; i <= 2; i++) {
        this.add(new THREE.Mesh(new THREE.BoxGeometry(0.022, grilleH * 0.95, 0.02), this.chromeMat))
          .position.set(i * W * 0.055, grilleY, z + 0.03);
      }
      this.add(new THREE.Mesh(rbox(W * 0.76, 0.03, 0.03, 0.01), this.chromeMat))
        .position.set(0, at(0.07), z + 0.008);
    }
  }

  /** Rear fascia: style-specific tail lamps and a matching bumper. */
  buildTailEnd() {
    const b = this.bodyDef;
    const W = b.width;
    const style = b.style;
    const z = -b.length / 2;
    const bottom = this.bottomYAt(z);
    const top = this.topYAt(0, z);
    const fh = Math.max(0.09, top - bottom);
    const at = (f) => bottom + fh * f;
    const lightY = top - Math.min(0.12, fh * 0.32);
    const lightH = Math.min(0.12, Math.max(0.035, fh * 0.24));
    const lightW = Math.min(0.42, W * 0.2);
    const s = W / 1.95;

    const housing = (x, y, w, h, r = 0.02) => {
      this.add(new THREE.Mesh(rbox(w, h, 0.035, Math.min(r, h / 2.2)), this.trimMat))
        .position.set(x, y, z - 0.006);
    };
    const lens = (x, y, w, h, mat = this.tailMat, depth = 0.014) => {
      const m = this.add(new THREE.Mesh(rbox(w, h, depth, Math.min(0.01, h / 2.2)), mat));
      m.position.set(x, y, z - 0.026);
      m.castShadow = false;
      return m;
    };
    const lamp = (x, y, r) => {
      const m = this.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.016, 16), this.tailMat));
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z - 0.03);
      m.castShadow = false;
    };
    const bezel = (x, y, r) => {
      const m = this.add(new THREE.Mesh(new THREE.TorusGeometry(r * 1.14, 0.012, 6, 16), this.chromeMat));
      m.position.set(x, y, z - 0.03);
      m.castShadow = false;
    };

    if (style === 'hatch' || style === 'suv' || style === 'offroad') {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.34, lightY, lightW * 0.5, lightH * 1.8, 0.02);
        lens(sx * W * 0.34, lightY + lightH * 0.52, lightW * 0.42, lightH * 0.7);
        lens(sx * W * 0.34, lightY - lightH * 0.52, lightW * 0.42, lightH * 0.5);
      }
      if (style === 'hatch') {
        lens(0, lightY, W * 0.4, 0.026);
      }
    } else if (style === 'sedan' && b.flagship) {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.33, lightY, W * 0.26, lightH * 1.1, 0.03);
        lens(sx * W * 0.33, lightY, W * 0.24, lightH * 0.7, this.tailMat);
      }
      this.add(new THREE.Mesh(rbox(W * 0.42, 0.02, 0.02, 0.008), this.chromeMat))
        .position.set(0, lightY, z - 0.03);
      this.add(new THREE.Mesh(rbox(W * 0.76, 0.02, 0.02, 0.008), this.chromeMat))
        .position.set(0, at(0.2), z - 0.03);
    } else if (style === 'sedan') {
      housing(0, lightY, W * 0.74, lightH * 1.35, 0.02);
      lens(0, lightY, W * 0.7, lightH * 0.6);
      for (const sx of [-1, 1]) lens(sx * W * 0.33, lightY, W * 0.06, lightH * 0.8);
      this.add(new THREE.Mesh(rbox(W * 0.7, 0.02, 0.02, 0.008), this.chromeMat))
        .position.set(0, lightY - lightH * 0.5, z - 0.03);
    } else if (style === 'muscle') {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.32, lightY, lightW * 0.62, lightH * 1.9, 0.02);
        for (let i = 0; i < 3; i++) {
          lens(sx * W * 0.32 + (i - 1) * 0.07 * s, lightY, 0.035, lightH * 1.5);
        }
      }
      this.add(new THREE.Mesh(rbox(W * 0.76, 0.03, 0.02, 0.01), this.tailMat))
        .position.set(0, lightY, z - 0.028);
    } else if (style === 'super' || style === 'hyper') {
      housing(0, lightY, W * 0.74, lightH * 0.9, 0.015);
      lens(0, lightY, W * 0.7, lightH * 0.35);
      for (const sx of [-1, 1]) {
        lens(sx * W * 0.35, lightY, 0.035, lightH * 0.75);
        this.add(new THREE.Mesh(rbox(0.05, 0.04, 0.02, 0.01), this.archMat))
          .position.set(sx * W * 0.3, at(0.14), z - 0.026);
      }
    } else if (style === 'roadster' || style === 'gt') {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.31, lightY, lightW * 0.9, lightH * 1.35, 0.02);
        if (style === 'gt') {
          for (const dx of [-0.075, 0.075]) {
            lamp(sx * W * 0.31 + dx * s, lightY, Math.min(0.05, lightH * 0.45));
            bezel(sx * W * 0.31 + dx * s, lightY, Math.min(0.05, lightH * 0.45));
          }
        } else {
          lamp(sx * W * 0.31, lightY, Math.min(0.062, lightH * 0.55));
          bezel(sx * W * 0.31, lightY, Math.min(0.062, lightH * 0.55));
        }
      }
      if (style === 'gt') {
        this.add(new THREE.Mesh(rbox(W * 0.8, 0.025, 0.02, 0.01), this.chromeMat))
          .position.set(0, lightY, z - 0.03);
      }
    } else {
      for (const sx of [-1, 1]) {
        housing(sx * W * 0.31, lightY, lightW * 0.95, lightH * 1.1, 0.02);
        lens(sx * W * 0.31, lightY, lightW * 0.82, lightH * 0.55);
        lens(sx * W * 0.31, lightY - lightH * 0.36, lightW * 0.62, 0.02);
      }
    }
    // Body-colour bumper cap between the lamps.
    this.add(new THREE.Mesh(rbox(W * 0.56, 0.045, 0.03, 0.015), this.trimMat))
      .position.set(0, at(0.08), z - 0.012);
  }

  /** Outer x of the painted shell at a given height and z (for flush details). */
  sideX(y, z) {
    const st = stationAt(this.profileStations, z);
    if (!st) return this.bodyDef.width / 2;
    return sectionHalfWidth(st, y);
  }

  /** Centreline top of the painted shell at a given z. */
  topY(z) {
    const st = stationAt(this.profileStations, z);
    return st ? st.yTop : (this.bodyTop ?? this.bodyDef.rideHeight);
  }

  /** Height of the painted shell top at a horizontal offset x and z. */
  topYAt(x, z) {
    const st = stationAt(this.profileStations, z);
    return st ? surfaceTopAt(st, x) : (this.bodyTop ?? this.bodyDef.rideHeight);
  }

  /** Lower edge of the painted shell at a given z (arch openings included). */
  bottomYAt(z) {
    const st = stationAt(this.profileStations, z);
    return st ? st.yBottom : this.bodyDef.rideHeight;
  }

  /** Top of the greenhouse (roof / rear glass) at a given z. */
  roofYAt(z) {
    const st = stationAt(this.roofStations, z);
    return st ? st.yTop : (this.roofY ?? this.bodyTop);
  }

  /** Height of the roof skin at a horizontal offset x and z. */
  roofTopYAt(x, z) {
    const st = stationAt(this.roofStations, z);
    return st ? surfaceTopAt(st, x) : (this.roofY ?? this.bodyTop);
  }

  /** Ribbon that lies on the painted top surface along z. */
  topRibbon(xc, width, z0, z1, lift = 0.005, roof = false) {
    const nz = 14;
    const nx = 3;
    const pos = [];
    const uvs = [];
    const idx = [];
    for (let i = 0; i <= nz; i++) {
      const z = z0 + (z1 - z0) * (i / nz);
      for (let j = 0; j < nx; j++) {
        const x = xc - width / 2 + width * (j / (nx - 1));
        const y = (roof ? this.roofTopYAt(x, z) : this.topYAt(x, z)) + lift;
        pos.push(x, y, z);
        uvs.push(j / (nx - 1), i / nz);
      }
    }
    for (let i = 0; i < nz; i++) {
      for (let j = 0; j < nx - 1; j++) {
        const a = i * nx + j;
        const b = i * nx + j + 1;
        const c = (i + 1) * nx + j + 1;
        const d = (i + 1) * nx + j;
        idx.push(a, c, b, a, d, c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /** Ribbon across the painted top surface (bonnet / boot shut line). */
  crossRibbon(z, halfWidth, lift = 0.004, thickness = 0.007) {
    const n = 12;
    const pos = [];
    const idx = [];
    for (let side = 0; side < 2; side++) {
      const zz = z + (side === 0 ? -thickness : thickness);
      for (let i = 0; i <= n; i++) {
        const x = -halfWidth + (2 * halfWidth) * (i / n);
        pos.push(x, this.topYAt(x, zz) + lift, zz);
      }
    }
    for (let i = 0; i < n; i++) {
      const a = i;
      const b = i + 1;
      const c = n + 1 + i + 1;
      const d = n + 1 + i;
      idx.push(a, c, b, a, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /** Flat patch that follows the painted flank (vents, gills, handles). */
  sidePatch(sx, y, z0, z1, height, inset = 0.002) {
    const pos = [];
    const idx = [];
    const ys = [y - height / 2, y + height / 2];
    for (const yy of ys) {
      for (const z of [z0, z1]) {
        pos.push(sx * (this.sideX(yy, z) + inset), yy, z);
      }
    }
    if (sx > 0) idx.push(0, 2, 3, 0, 3, 1);
    else idx.push(0, 3, 2, 0, 1, 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /** Open two-seat cockpit: raked screen, seats, roll hoops and fairings. */
  buildCockpit(bodyTop) {
    const b = this.bodyDef;
    const front = b.cabinZ + b.cabinLength * 0.46;
    const rear = b.cabinZ - b.cabinLength * 0.38;

    const screen = this.add(new THREE.Mesh(rbox(b.cabinWidth, b.cabinHeight, 0.05, 0.03), this.glassMat));
    screen.position.set(0, bodyTop + b.cabinHeight * 0.42, front);
    screen.rotation.x = -0.62;
    const header = this.add(new THREE.Mesh(rbox(b.cabinWidth * 1.02, 0.05, 0.07, 0.02), this.chromeMat));
    header.position.set(0, bodyTop + b.cabinHeight * 0.8, front - b.cabinHeight * 0.48);
    header.rotation.x = -0.62;

    const tub = this.add(new THREE.Mesh(rbox(b.cabinWidth * 0.9, 0.08, b.cabinLength * 0.86, 0.03), this.rubberMat));
    tub.position.set(0, bodyTop - 0.01, b.cabinZ);

    for (const sx of [-1, 1]) {
      const x = sx * b.cabinWidth * 0.24;
      const cushion = this.add(new THREE.Mesh(rbox(0.44, 0.1, 0.44, 0.04), this.trimMat));
      cushion.position.set(x, bodyTop + 0.06, b.cabinZ + 0.02);
      const back = this.add(new THREE.Mesh(rbox(0.4, 0.34, 0.09, 0.04), this.trimMat));
      back.position.set(x, bodyTop + 0.2, rear + 0.12);
      back.rotation.x = -0.22;
      const hoop = this.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.028, 8, 18, Math.PI), this.chromeMat));
      hoop.position.set(x, bodyTop + 0.26, rear - 0.02);
      // Speedster fairing: a low, half-sunk teardrop that tapers into the
      // rear deck instead of a full block sitting on top of it.
      const fairing = this.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.5, 6, 14), this.paintMat));
      fairing.rotation.x = Math.PI / 2 - 0.08;
      fairing.scale.set(1, 1, 0.5);
      const fz = rear - 0.36;
      fairing.position.set(x, this.topYAt(x, fz) + 0.005, fz);
    }
  }

  buildWheels() {
    const b = this.bodyDef;
    const r = b.wheelRadius;
    const W = b.width;
    const tireGeo = new THREE.LatheGeometry(tyreProfile(r, 0.145), 40);
    tireGeo.rotateZ(Math.PI / 2);
    const discGeo = new THREE.CylinderGeometry(r * 0.50, r * 0.50, 0.035, 26);
    discGeo.rotateZ(Math.PI / 2);
    const capGeo = new THREE.CylinderGeometry(r * 0.17, r * 0.17, 0.045, 18);
    capGeo.rotateZ(Math.PI / 2);
    const barrelGeo = new THREE.CylinderGeometry(r * 0.66, r * 0.66, 0.26, 24, 1, true);
    barrelGeo.rotateZ(Math.PI / 2);

    const positions = [
      [-1, 1], [1, 1], [-1, -1], [1, -1],
    ];

    for (const [sx, sz] of positions) {
      // The outer tyre sidewall sits flush with the fender edge (the lathe
      // profile bulges to 0.92 × half width), so the wheel fills its arch.
      const z = sz * b.wheelbase;
      const hw = stationAt(this.profileStations, z).halfWidthBottom;
      const x = sx * (hw - 0.162);
      const pivot = new THREE.Group();
      pivot.position.set(x, r, z);
      this.root.add(pivot);

      const spin = new THREE.Group();
      pivot.add(spin);

      const tire = new THREE.Mesh(tireGeo, this.treadMat);
      tire.castShadow = true;
      spin.add(tire);

      // Open rim barrel: gives the wheel depth and hides the far side.
      const barrel = new THREE.Mesh(barrelGeo, this.archMat);
      barrel.position.x = -sx * 0.02;
      barrel.castShadow = false;
      spin.add(barrel);

      // Brake disc and a fixed caliper (the caliper must not spin).
      const disc = new THREE.Mesh(discGeo, this.discMat);
      disc.castShadow = false;
      disc.position.x = sx * 0.045;
      spin.add(disc);
      const caliper = new THREE.Mesh(rbox(0.075, 0.18, 0.1, 0.02), this.caliperMat);
      caliper.position.set(sx * 0.09, r * 0.46, r * 0.3);
      caliper.castShadow = false;
      pivot.add(caliper);

      const outerX = sx * 0.118;
      const cap = new THREE.Mesh(capGeo, this.rimMat);
      cap.position.x = outerX + sx * 0.006;
      spin.add(cap);

      const spokeGroup = new THREE.Group();
      const spokeGeo = rbox(0.05, 0.07, r * 0.60, 0.02);
      spokeGeo.translate(0, 0, r * 0.30);
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(spokeGeo, this.rimMat);
        spoke.position.x = outerX - sx * 0.018;
        spoke.rotation.x = (i * Math.PI) / 3;
        spoke.castShadow = false;
        spokeGroup.add(spoke);
      }
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.61, 0.02, 8, 26), this.rimMat);
      lip.rotation.y = Math.PI / 2;
      lip.position.x = outerX;
      spokeGroup.add(lip);
      spin.add(spokeGroup);
      this.rimStyleGroups.get('spoke').push(spokeGroup);

      const aeroGroup = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.60, r * 0.60, 0.03, 26), this.rimMat);
      face.rotation.z = Math.PI / 2;
      face.position.x = outerX;
      aeroGroup.add(face);
      const aeroRing = new THREE.Mesh(new THREE.TorusGeometry(r * 0.585, 0.026, 8, 26), this.trimMat);
      aeroRing.rotation.y = Math.PI / 2;
      aeroRing.position.x = outerX + sx * 0.005;
      aeroGroup.add(aeroRing);
      for (let i = 0; i < 5; i++) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, r * 0.24), this.archMat);
        slot.position.set(outerX + sx * 0.018, 0, r * 0.40);
        slot.rotation.x = (i * Math.PI * 2) / 5;
        aeroGroup.add(slot);
      }
      spin.add(aeroGroup);
      this.rimStyleGroups.get('aero').push(aeroGroup);

      const deepGroup = new THREE.Group();
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.36, r * 0.56, 0.12, 24), this.discMat);
      dish.rotation.z = Math.PI / 2;
      dish.position.x = outerX - sx * 0.06;
      deepGroup.add(dish);
      const deepLip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.60, 0.03, 8, 26), this.rimMat);
      deepLip.rotation.y = Math.PI / 2;
      deepLip.position.x = outerX;
      deepGroup.add(deepLip);
      const deepSpokeGeo = rbox(0.04, 0.06, r * 0.54, 0.018);
      deepSpokeGeo.translate(0, 0, r * 0.27);
      for (let i = 0; i < 5; i++) {
        const spoke = new THREE.Mesh(deepSpokeGeo, this.rimMat);
        spoke.position.x = outerX - sx * 0.02;
        spoke.rotation.x = (i * Math.PI * 2) / 5;
        deepGroup.add(spoke);
      }
      spin.add(deepGroup);
      this.rimStyleGroups.get('deep').push(deepGroup);

      const wheel = { pivot, spin, side: sx, front: sz > 0 };
      this.wheels.push(wheel);
      if (sz > 0) this.frontWheels.push(wheel);
    }
  }

  buildSpoilers() {
    const b = this.bodyDef;
    const L = b.length;
    const W = b.width;
    const baseY = b.tailHeight - 0.02;
    const z = -L / 2 + 0.02;

    const group = (id) => {
      const g = new THREE.Group();
      g.visible = false;
      this.body.add(g);
      this.spoilerGroups.set(id, g);
      return g;
    };

    const lip = group('lip');
    const lipMesh = new THREE.Mesh(rbox(W * 0.68, 0.05, 0.3, 0.02), this.carbonMat);
    lipMesh.position.set(0, baseY + 0.04, z);
    lipMesh.castShadow = true;
    lip.add(lipMesh);

    const gt = group('gt');
    const gtWing = new THREE.Mesh(rbox(W * 0.78, 0.055, 0.42, 0.02), this.carbonMat);
    gtWing.position.set(0, baseY + 0.28, z - 0.04);
    gtWing.castShadow = true;
    gt.add(gtWing);
    for (const sx of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.14, 0.42), this.paintMat);
      end.position.set(sx * W * 0.39, baseY + 0.28, z - 0.04);
      gt.add(end);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.12), this.trimMat);
      strut.position.set(sx * W * 0.28, baseY + 0.13, z - 0.02);
      gt.add(strut);
    }

    const big = group('big');
    const bigWing = new THREE.Mesh(rbox(W * 0.94, 0.06, 0.52, 0.02), this.carbonMat);
    bigWing.position.set(0, baseY + 0.44, z - 0.1);
    bigWing.rotation.x = -0.05;
    bigWing.castShadow = true;
    big.add(bigWing);
    for (const sx of [-1, 1]) {
      const end = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.52), this.paintMat);
      end.position.set(sx * W * 0.47, baseY + 0.44, z - 0.1);
      big.add(end);
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.14), this.trimMat);
      strut.position.set(sx * W * 0.3, baseY + 0.21, z - 0.04);
      big.add(strut);
    }
  }

  buildStripes() {
    const b = this.bodyDef;
    const L = b.length;
    const W = b.width;

    const make = (id) => {
      const g = new THREE.Group();
      g.visible = false;
      this.body.add(g);
      this.stripeGroups.set(id, g);
      return g;
    };

    // Stripes are ribbons that follow the actual shell, not flat planes; a
    // plane at the centreline height floats above the curved bonnet/deck.
    const hoodZ0 = b.cabinZ + b.cabinLength / 2 + 0.05;
    const hoodZ1 = L / 2 - 0.14;
    const deckZ0 = -L / 2 + 0.14;
    const deckZ1 = b.cabinZ - b.cabinLength / 2 - 0.05;
    const roofZ0 = b.cabinZ - b.cabinLength * 0.22;
    const roofZ1 = b.cabinZ + b.cabinLength * 0.22;

    const topStripe = (group, xc, width) => {
      if (hoodZ1 > hoodZ0 + 0.08) group.add(new THREE.Mesh(this.topRibbon(xc, width, hoodZ0, hoodZ1), this.stripeMat));
      if (!this.openTop && roofZ1 > roofZ0 + 0.05) {
        group.add(new THREE.Mesh(this.topRibbon(xc, width, roofZ0, roofZ1, 0.006, true), this.stripeMat));
      }
    };

    const twin = make('twin');
    for (const sx of [-1, 1]) {
      const x = sx * 0.17;
      topStripe(twin, x, 0.14);
      if (deckZ1 > deckZ0 + 0.08) {
        twin.add(new THREE.Mesh(this.topRibbon(x, 0.14, deckZ0, deckZ1), this.stripeMat));
      }
    }

    const side = make('side');
    const stripeY = this.bodyTop - 0.22;
    const sideZ0 = -(b.wheelbase - b.wheelRadius - 0.08);
    const sideZ1 = b.wheelbase - b.wheelRadius - 0.08;
    for (const sx of [-1, 1]) {
      const pos = [];
      const idx = [];
      const n = 14;
      for (let i = 0; i <= n; i++) {
        const z = sideZ0 + (sideZ1 - sideZ0) * (i / n);
        const x = sx * (this.sideX(stripeY, z) + 0.004);
        pos.push(x, stripeY - 0.08, z, x, stripeY + 0.08, z);
      }
      for (let i = 0; i < n; i++) {
        const a = i * 2;
        if (sx > 0) idx.push(a, a + 3, a + 2, a, a + 1, a + 3);
        else idx.push(a, a + 2, a + 3, a, a + 3, a + 1);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      side.add(new THREE.Mesh(geo, this.stripeMat));
    }

    const roof = make('roof');
    topStripe(roof, 0, 0.4);
    if (deckZ1 > deckZ0 + 0.08) {
      roof.add(new THREE.Mesh(this.topRibbon(0, 0.4, deckZ0, deckZ1), this.stripeMat));
    }
  }

  buildExtras() {
    const b = this.bodyDef;
    const W = b.width;
    const L = b.length;

    this.glowMesh = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.65, L * 1.18), this.glowMat);
    this.glowMesh.rotation.x = -Math.PI / 2;
    this.glowMesh.position.y = 0.035;
    this.glowMesh.renderOrder = 2;
    this.root.add(this.glowMesh);
  }

  /**
   * Category-specific body language. The shared tub gives every car its
   * proportions, while these details make a hatchback read as a hatchback and
   * a hypercar read as something that costs half a million credits.
   */
  buildStyleDetails() {
    const b = this.bodyDef;
    const W = b.width;
    const L = b.length;
    const style = b.style;
    const group = new THREE.Group();
    group.name = `style-${style}`;
    this.body.add(group);
    this.detailGroup = group;

    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = true;
      group.add(mesh);
      return mesh;
    };
    const rail = (x, y, z, len, th = 0.055) => add(
      new THREE.BoxGeometry(th, th, len), this.trimMat, x, y, z,
    );
    const archR = b.wheelRadius + ARCH_GAP;
    const archX = (W / 2) * 1.02;
    // A black (or painted) lip that follows the opening cut into the shell.
    const flare = (sx, z, mat = this.trimMat, tube = 0.05) => add(
      new THREE.TorusGeometry(archR + 0.008, tube, 7, 18, Math.PI),
      mat, sx * archX, b.wheelRadius, z, 0, Math.PI / 2, 0,
    );
    const roofRail = (sx, z = b.cabinZ, len = b.roofLength * 0.84) => {
      const x = sx * b.roofWidth * 0.34;
      const y = this.roofY - 0.03;
      rail(x, y, z, len);
      for (const fz of [-0.34, 0.34]) {
        add(new THREE.BoxGeometry(0.04, 0.07, 0.05), this.trimMat, x, y - 0.03, z + fz * len);
      }
    };

    if (style === 'hatch') {
      // Roof-edge spoiler sitting on the rear of the greenhouse, plus aerial.
      const spZ = b.cabinZ - b.cabinLength * 0.36;
      add(
        rbox(b.roofWidth * 0.78, 0.045, 0.22, 0.02), this.paintMat,
        0, this.roofYAt(spZ) + 0.015, spZ,
      );
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 5), this.trimMat, 0, this.roofY + 0.14, b.cabinZ - 0.2, 0.16);
    } else if (style === 'sedan') {
      // Chrome beltline, formal grille, trunk lip and door handles.
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.025, 0.025, b.cabinLength * 0.98), this.chromeMat,
          sx * (b.cabinWidth * 0.49), this.bodyTop - 0.012, b.cabinZ);
        for (const sz of [-0.62, 0.55]) {
          const z = sz * L * 0.34;
          const y = b.rideHeight + 0.24;
          add(rbox(0.14, 0.035, 0.04, 0.015), this.chromeMat, sx * (this.sideX(y, z) + 0.005), y, z);
        }
      }
      if (!b.flagship) {
        for (let i = -2; i <= 2; i++) {
          add(new THREE.BoxGeometry(0.04, 0.14, 0.02), this.chromeMat, i * W * 0.075, b.noseDrop - 0.02, L / 2 + 0.032);
        }
      }
      add(rbox(W * 0.72, 0.05, 0.2, 0.02), this.paintMat, 0, b.tailHeight + 0.02, -L / 2 + 0.16, -0.1);
      if (b.flagship) {
        // Chrome lower sill strip and roofline trim.
        for (const sx of [-1, 1]) {
          const y = b.rideHeight - 0.05;
          add(new THREE.BoxGeometry(0.02, 0.03, b.wheelbase * 1.25), this.chromeMat,
            sx * (this.sideX(y, 0) + 0.006), y, 0);
          add(new THREE.BoxGeometry(0.02, 0.02, b.roofLength * 0.95), this.chromeMat,
            sx * (b.roofWidth * 0.5 + 0.005), this.roofY - 0.02, b.cabinZ);
        }
      }
    } else if (style === 'suv') {
      // Roof rails, running boards, skid plates and black arch flares.
      for (const sx of [-1, 1]) {
        roofRail(sx);
        add(rbox(0.16, 0.055, L * 0.44, 0.025), this.trimMat,
          sx * (W / 2 * 0.96), b.rideHeight - 0.26, 0);
        flare(sx, b.wheelbase, this.trimMat, 0.055);
        flare(sx, -b.wheelbase, this.trimMat, 0.055);
      }
      add(rbox(W * 0.6, 0.05, 0.26, 0.02), this.chromeMat, 0, b.rideHeight - 0.17, L / 2 - 0.16);
      add(rbox(W * 0.56, 0.05, 0.22, 0.02), this.chromeMat, 0, b.rideHeight - 0.14, -L / 2 + 0.18);
      add(rbox(W * 0.34, 0.05, 0.03, 0.015), this.chromeMat, 0, b.noseDrop + 0.05, L / 2 + 0.02);
    } else if (style === 'offroad') {
      // Roof rack + light bar, snorkel, mud flaps, tow hooks and spare wheel.
      for (const sx of [-1, 1]) {
        roofRail(sx);
        add(new THREE.BoxGeometry(0.11, 0.26, 0.2), this.trimMat, sx * W * 0.3, 0.34, L / 2 - 0.03);
        add(new THREE.PlaneGeometry(0.34, 0.42), this.trimMat,
          sx * (W / 2 - 0.05), b.wheelRadius * 0.62, b.wheelbase - b.wheelRadius - 0.05);
      }
      const lbZ = b.cabinZ + b.roofLength * 0.28;
      const lbY = this.roofY - 0.005;
      for (const cz of [-0.28, 0.28]) {
        add(new THREE.BoxGeometry(b.roofWidth * 0.62, 0.045, 0.05), this.trimMat,
          0, lbY, b.cabinZ + cz * b.roofLength);
      }
      for (let i = -2; i <= 2; i++) {
        add(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), this.headMat,
          i * b.roofWidth * 0.16, lbY + 0.07, lbZ, Math.PI / 2);
      }
      add(new THREE.BoxGeometry(b.roofWidth * 0.9, 0.045, 0.12), this.carbonMat, 0, lbY, lbZ);
      const snZ = b.cabinZ + b.cabinLength * 0.38;
      const snTop = this.roofY + 0.01;
      const snBottom = this.bodyTop - 0.12;
      add(new THREE.CylinderGeometry(0.06, 0.065, snTop - snBottom, 8), this.trimMat,
        W / 2 * 0.985 + 0.025, (snTop + snBottom) / 2, snZ);
      add(rbox(0.15, 0.12, 0.24, 0.03), this.trimMat,
        W / 2 * 0.985 + 0.025, snTop, snZ + 0.04);
      for (const sx of [-1, 1]) {
        add(rbox(0.11, 0.06, 0.08, 0.02), this.caliperMat,
          sx * W * 0.18, b.rideHeight - 0.18, L / 2 + 0.03);
      }
      if (this.def.id !== 'kaze') {
        const spareR = b.wheelRadius * 0.6;
        add(new THREE.CylinderGeometry(spareR, spareR, 0.18, 20), this.rubberMat,
          0, b.tailHeight - 0.02, -L / 2 - 0.12, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 10), this.chromeMat,
          0, b.tailHeight - 0.02, -L / 2 - 0.14, Math.PI / 2);
      }
    } else if (style === 'muscle') {
      // Hood bulge, pins, side pipes and wide rear quarters.
      const bulgeZ = L * 0.26;
      add(rbox(W * 0.46, 0.09, L * 0.26, 0.03), this.paintMat, 0, this.topY(bulgeZ) + 0.035, bulgeZ);
      for (const sx of [-1, 1]) {
        const pinZ = L * 0.12;
        add(new THREE.CylinderGeometry(0.025, 0.025, 0.08, 6), this.chromeMat,
          sx * W * 0.2, this.topY(pinZ) + 0.055, pinZ);
        add(new THREE.CylinderGeometry(0.045, 0.045, L * 0.32, 12), this.chromeMat,
          sx * (W / 2 * 0.93 + 0.04), b.rideHeight - 0.2, 0, Math.PI / 2);
        flare(sx, -b.wheelbase, this.paintMat, 0.045);
      }
    } else if (style === 'super') {
      // Side intakes, canards, diffuser fins and a low front splitter.
      const intakeY = b.rideHeight + 0.2;
      const intakeZ = -L * 0.12;
      const canardY = b.rideHeight + 0.07;
      const canardZ = L / 2 - 0.36;
      for (const sx of [-1, 1]) {
        add(rbox(0.035, 0.16, 0.46, 0.015), this.carbonMat,
          sx * (this.sideX(intakeY, intakeZ) + 0.004), intakeY, intakeZ);
        add(rbox(0.32, 0.03, 0.2, 0.01), this.carbonMat,
          sx * (this.sideX(canardY, canardZ) + 0.04), canardY, canardZ, 0, 0, sx * 0.15);
      }
      add(rbox(W * 0.95, 0.04, 0.36, 0.02), this.carbonMat, 0, b.rideHeight - 0.155, L / 2 - 0.02);
      for (const i of [-2, 2]) {
        add(new THREE.BoxGeometry(0.035, 0.16, 0.5), this.carbonMat, i * W * 0.15, b.rideHeight - 0.03, -L / 2 + 0.1);
      }
      const scoopZ = L * 0.3;
      add(rbox(W * 0.46, 0.07, 0.34, 0.03), this.paintMat, 0, this.topY(scoopZ) + 0.035, scoopZ);
    } else if (style === 'hyper') {
      // Canards, roof snorkel, dorsal fin and the biggest diffuser in the shop.
      const intakeY = b.rideHeight + 0.24;
      const intakeZ = -L * 0.14;
      const canardY = b.rideHeight + 0.07;
      const canardZ = L / 2 - 0.36;
      for (const sx of [-1, 1]) {
        add(rbox(0.36, 0.03, 0.22, 0.01), this.carbonMat,
          sx * (this.sideX(canardY, canardZ) + 0.045), canardY, canardZ, 0, 0, sx * 0.15);
        add(rbox(0.04, 0.24, 0.6, 0.02), this.carbonMat,
          sx * (this.sideX(intakeY, intakeZ) + 0.004), intakeY, intakeZ);
        const haunchZ = -L * 0.28;
        const haunchY = this.bodyTop - 0.2;
        add(rbox(0.03, 0.14, 0.4, 0.015), this.carbonMat,
          sx * (this.sideX(haunchY, haunchZ) + 0.004), haunchY, haunchZ);
      }
      if (!b.scoop) {
        const scoopZ = b.cabinZ + b.roofLength * 0.2;
        add(rbox(0.3, 0.08, 0.5, 0.02), this.carbonMat, 0, this.roofYAt(scoopZ) + 0.03, scoopZ);
      }
      add(rbox(0.06, 0.24, 1.15, 0.02), this.carbonMat, 0, this.roofY + 0.08, -b.roofLength * 0.35);
      add(rbox(W * 0.96, 0.04, 0.32, 0.02), this.carbonMat, 0, b.rideHeight - 0.14, L / 2 + 0.02);
      for (const i of [-3, -2, 2, 3]) {
        add(new THREE.BoxGeometry(0.03, 0.22, 0.6), this.carbonMat, i * W * 0.12, b.rideHeight - 0.02, -L / 2 + 0.08);
      }
    } else if (style === 'roadster') {
      // Pop-up-style lamp pods, a low splitter, side gills and a single tail pipe.
      for (const sx of [-1, 1]) {
        const podZ = L / 2 - 0.2;
        add(rbox(0.28, 0.06, 0.24, 0.03), this.trimMat,
          sx * W * 0.29, this.topY(podZ) + 0.015, podZ);
        const gillY = b.rideHeight + 0.2;
        const gillZ = b.wheelbase * 0.45;
        add(rbox(0.03, 0.1, 0.3, 0.015), this.trimMat,
          sx * (this.sideX(gillY, gillZ) + 0.004), gillY, gillZ);
      }
      add(rbox(W * 0.86, 0.035, 0.24, 0.02), this.carbonMat, 0, b.rideHeight - 0.14, L / 2 - 0.03);
      add(rbox(W * 0.5, 0.05, 0.22, 0.02), this.paintMat, 0, b.tailHeight + 0.02, -L / 2 + 0.14, -0.14);
    } else if (style === 'gt') {
      // Long-bonnet louvres, chrome window surround, fender gills and quad pipes.
      for (let i = 0; i < 6; i++) {
        const z = L * 0.2 + i * 0.11;
        add(new THREE.BoxGeometry(W * 0.3, 0.02, 0.05), this.trimMat, 0, this.topY(z) + 0.012, z);
      }
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.025, 0.025, b.cabinLength * 0.98), this.chromeMat,
          sx * (b.cabinWidth * 0.49), this.bodyTop - 0.012, b.cabinZ);
        const gillY = b.rideHeight + 0.18;
        const gillZ = b.wheelbase - 0.72;
        for (let i = 0; i < 3; i++) {
          add(rbox(0.03, 0.05, 0.28, 0.01), this.chromeMat,
            sx * (this.sideX(gillY, gillZ) + 0.004), gillY + i * 0.075, gillZ);
        }
        add(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), this.chromeMat,
          sx * W * 0.4, b.rideHeight - 0.055, -L / 2 - 0.06, Math.PI / 2);
        this.exhausts.push(new THREE.Vector3(sx * W * 0.4, b.rideHeight - 0.055, -L / 2 - 0.14));
      }
      add(rbox(W * 0.12, 0.07, 0.04, 0.02), this.chromeMat, 0, b.noseDrop - 0.02, L / 2 + 0.04);
      add(rbox(W * 0.76, 0.05, 0.2, 0.02), this.paintMat, 0, b.tailHeight + 0.02, -L / 2 + 0.16, -0.12);
    } else {
      // Sports: fog lights, a subtle splitter and side gills.
      for (const sx of [-1, 1]) {
        add(rbox(0.14, 0.07, 0.05, 0.02), this.headMat, sx * W * 0.34, b.noseDrop - 0.08, L / 2 + 0.005);
        const gillY = b.rideHeight + 0.18;
        const gillZ = b.wheelbase - b.wheelRadius - 0.08;
        add(rbox(0.03, 0.12, 0.34, 0.015), this.trimMat,
          sx * (this.sideX(gillY, gillZ) + 0.004), gillY, gillZ);
      }
      add(rbox(W * 0.9, 0.035, 0.26, 0.02), this.carbonMat, 0, b.rideHeight - 0.15, L / 2 - 0.03);
    }
  }

  enableHeadlights() {
    if (this.headlights) return;
    const b = this.bodyDef;
    const W = b.width;
    const L = b.length;
    this.headlights = [];
    for (const sx of [-1, 1]) {
      const lamp = new THREE.SpotLight(0xfff1d4, 22, 65, 0.42, 0.55, 1.1);
      lamp.position.set(sx * W * 0.29, b.noseDrop + 0.06, L / 2 - 0.05);
      lamp.target.position.set(sx * W * 0.24, 0.1, L / 2 + 22);
      this.root.add(lamp);
      this.root.add(lamp.target);
      this.headlights.push(lamp);
    }
  }

  /**
   * Collapse the static body panels into one mesh per material. This keeps
   * the extra realism details from turning into hundreds of draw calls on a
   * phone; wheels, lights and toggleable groups stay separate.
   */
  /**
   * Small parts (lamps, trim, badges, handles, calipers...) that can be
   * hidden when the car is far from the camera: invisible at that size but
   * each still costs a draw call (and a shadow-pass draw).
   */
  collectDetail() {
    this.detailMeshes = [];
    this.detailShown = true;
    this.root.traverse((obj) => {
      if (!obj.isMesh || obj === this.shellMesh || !obj.visible) return;
      obj.geometry.computeBoundingSphere?.();
      const r = obj.geometry.boundingSphere?.radius ?? 1;
      if (r < 0.32) this.detailMeshes.push(obj);
    });
  }

  /** Show or hide the small parts (distance level of detail). */
  setDetail(show) {
    if (show === this.detailShown) return;
    this.detailShown = show;
    for (const mesh of this.detailMeshes) mesh.visible = show;
  }

  mergeStaticParts() {
    const mergeGroup = (group) => {
      if (!group) return;
      const buckets = new Map();
      for (const child of [...group.children]) {
        if (!child.isMesh || child === this.glowMesh || child.userData.noMerge) continue;
        const key = child.material.uuid;
        if (!buckets.has(key)) buckets.set(key, { mat: child.material, meshes: [] });
        buckets.get(key).meshes.push(child);
      }
      for (const { mat, meshes } of buckets.values()) {
        if (meshes.length < 2) continue;
        const geos = [];
        for (const mesh of meshes) {
          mesh.updateMatrix();
          let geo = mesh.geometry.clone();
          if (geo.index) {
            const nonIndexed = geo.toNonIndexed();
            geo.dispose();
            geo = nonIndexed;
          }
          geo.applyMatrix4(mesh.matrix);
          geos.push(geo);
        }
        let merged = null;
        try {
          merged = mergeGeometries(geos, false);
        } catch {
          merged = null;
        }
        for (const geo of geos) geo.dispose();
        if (!merged) continue;
        const casts = meshes.some((mesh) => mesh.castShadow);
        for (const mesh of meshes) {
          group.remove(mesh);
          mesh.geometry.dispose();
        }
        const out = new THREE.Mesh(merged, mat);
        out.castShadow = casts;
        out.receiveShadow = false;
        group.add(out);
      }
    };

    mergeGroup(this.body);
    for (const group of this.spoilerGroups.values()) mergeGroup(group);
    for (const group of this.stripeGroups.values()) mergeGroup(group);
    mergeGroup(this.detailGroup);
    // Wheels were ~25 tiny meshes each (spokes, nuts, tread, caliper): merge
    // every wheel's spinning parts, its steering-only parts and each rim
    // style (styles stay separate groups so the garage can still swap them).
    for (const wheel of this.wheels) {
      mergeGroup(wheel.spin);
      mergeGroup(wheel.pivot);
    }
    for (const groups of this.rimStyleGroups.values()) for (const group of groups) mergeGroup(group);
  }

  dispose() {
    this.cockpit?.dispose();
    this.plateTex?.dispose();
    this.treadMat?.map?.dispose();
    this.grilleMat?.map?.dispose();
    for (const light of this.headlights || []) {
      light.removeFromParent();
      light.target.removeFromParent();
      light.dispose?.();
    }
    for (const mat of [
      this.paintMat, this.trimMat, this.carbonMat, this.chromeMat, this.glassMat,
      this.headMat, this.tailMat, this.rubberMat, this.treadMat, this.rimMat,
      this.discMat, this.archMat, this.caliperMat, this.grilleMat, this.seamMat,
      this.plateMat, this.stripeMat, this.glowMat,
    ]) {
      mat?.dispose();
    }
  }

  applyLook(look, initial = false) {
    this.look = look;
    const finish = FINISHES.find((f) => f.id === look.finish) || FINISHES[0];
    this.paintMat.color.set(look.paint);
    this.basePaint = new THREE.Color(look.paint);
    this.lookFinishRoughness = finish.roughness;
    this.lookFinishClearcoat = finish.clearcoat;
    this.paintMat.metalness = finish.metalness;
    this.paintMat.roughness = finish.roughness;
    this.paintMat.clearcoat = finish.clearcoat;
    this.paintMat.clearcoatRoughness = finish.clearcoatRoughness;
    this.paintMat.envMapIntensity = finish.env;

    this.rimMat.color.set(look.rim);
    this.stripeMat.color.set(look.stripeColor);

    const tint = TINTS.find((t) => t.id === look.tint) || TINTS[1];
    this.glassMat.color.set(tint.color);
    this.glassMat.opacity = tint.opacity;
    this.glassMat.metalness = tint.metalness;

    for (const [id, groups] of this.rimStyleGroups) {
      const visible = id === look.rimStyle;
      for (const g of groups) g.visible = visible;
    }

    for (const [id, group] of this.spoilerGroups) {
      if (group) group.visible = id === look.spoiler;
    }

    for (const [id, group] of this.stripeGroups) {
      if (group) group.visible = id === look.stripe;
    }

    const under = UNDERGLOWS.find((u) => u.id === look.underglow) || UNDERGLOWS[0];
    if (under.hex) {
      this.glowMat.color.set(under.hex);
      this.glowMat.opacity = 0.42;
      this.glowMesh.visible = true;
    } else {
      this.glowMesh.visible = false;
    }

    if (look.plate !== this.lastPlate) {
      this.lastPlate = look.plate;
      const newTex = plateTexture(look.plate);
      this.plateTex.dispose();
      this.plateTex = newTex;
      this.plateMat.map = newTex;
      this.plateMat.emissiveMap = newTex;
      this.plateMat.needsUpdate = true;
    }

    this.setDamage(this.damageAmount || 0);
  }

  setDamage(amount) {
    const v = Math.max(0, Math.min(1, amount || 0));
    this.damageAmount = v;
    const base = this.basePaint || this.paintMat.color;
    const dark = new THREE.Color(0x120f12);
    this.paintMat.color.copy(base).lerp(dark, v * 0.58);
    this.paintMat.roughness = Math.min(0.9, (this.lookFinishRoughness ?? 0.24) + v * 0.35);
    this.paintMat.clearcoat = Math.max(0.05, (this.lookFinishClearcoat ?? 1) - v * 0.7);
  }

  setSteer(angle) {
    this.steerVisual = angle;
    // About 18° at full lock: enough to read, without the tyre's leading
    // edge swinging out through the side of the arch.
    for (const wheel of this.frontWheels) {
      wheel.pivot.rotation.y = -angle * 0.32;
    }
  }

  setSpin(angle) {
    this.wheelSpin = angle;
    for (const wheel of this.wheels) {
      wheel.spin.rotation.x = angle;
    }
  }

  /** Amber indicators at the four corners; each side has its own material. */
  buildSignals() {
    const b = this.bodyDef;
    const L = b.length;
    const make = () => new THREE.MeshStandardMaterial({
      color: 0x5a3200, emissive: 0xffa21a, emissiveIntensity: 0.12, roughness: 0.3,
    });
    // Driver's left is +x.
    this.signalMats = { left: make(), right: make() };
    for (const [side, sx] of [['left', 1], ['right', -1]]) {
      for (const front of [true, false]) {
        const z = front ? L / 2 : -L / 2;
        const st = stationAt(this.profileStations, z);
        const bottom = this.bottomYAt(z);
        const fh = Math.max(0.09, this.topYAt(0, z) - bottom);
        const y = bottom + fh * (front ? 0.32 : 0.42);
        const x = sx * Math.max(0.2, sectionHalfWidth(st, y) - 0.07);
        const lamp = this.add(new THREE.Mesh(rbox(0.1, 0.04, 0.025, 0.01), this.signalMats[side]));
        lamp.position.set(x, y, z + (front ? 0.02 : -0.02));
        lamp.castShadow = false;
      }
    }
  }

  /** Light one side's indicators (side: 'left' | 'right' | null). */
  setSignal(side, on) {
    for (const key of ['left', 'right']) {
      this.signalMats[key].emissiveIntensity = on && key === side ? 5 : 0.12;
    }
  }

  setBraking(on) {
    this.tailMat.emissiveIntensity = on ? 4.5 : 1.4;
  }

  /**
   * Show tuning on the car: suspension stages lower the body (up to 4 cm,
   * still clear of the tyres) and intake/exhaust stages fit bigger tips.
   */
  setTuning(levels) {
    const suspension = levels?.suspension || 0;
    const intake = levels?.intake || 0;
    this.lowered = 0.008 * suspension;
    const tip = 1 + 0.08 * intake;
    for (const mesh of this.exhaustTips || []) mesh.scale.set(tip, mesh.geometry.type === 'CircleGeometry' ? tip : 1, tip);

    // Turbo stage 3+: bonnet scoop. Weight reduction stage 3+: carbon
    // bonnet. Tyres stage 4+: wider rubber. Built on first use.
    const turbo = levels?.turbo || 0;
    const weight = levels?.weight || 0;
    const tyres = levels?.tyres || 0;
    if ((turbo >= 3 || weight >= 3) && !this.tuneParts) this.buildTuneParts();
    if (this.tuneParts) {
      this.tuneParts.scoop.visible = turbo >= 3;
      this.tuneParts.bonnet.visible = weight >= 3;
    }
    const wide = tyres >= 4 ? 1 + 0.06 * (tyres - 3) : 1;
    for (const wheel of this.wheels || []) wheel.spin.scale.x = wide;
    this.setBodyTilt(this.body.rotation.z, this.body.rotation.x);
  }

  /** Bonnet scoop and carbon bonnet shown by tuning (see setTuning). */
  buildTuneParts() {
    const b = this.bodyDef;
    const L = b.length;
    const W = b.width;
    const z0 = b.cabinZ + b.cabinLength / 2 + 0.06;
    const z1 = L / 2 - 0.16;
    const bonnet = new THREE.Mesh(this.topRibbon(0, W * 0.62, z0, z1, 0.004), this.carbonMat);
    bonnet.castShadow = false;
    this.body.add(bonnet);
    const zs = z0 + (z1 - z0) * 0.38;
    const scoop = new THREE.Group();
    const shell = new THREE.Mesh(rbox(W * 0.26, 0.075, 0.46, 0.03), this.carbonMat);
    const mouth = new THREE.Mesh(rbox(W * 0.22, 0.045, 0.02, 0.01), this.archMat);
    mouth.position.set(0, 0.006, 0.231);
    scoop.add(shell, mouth);
    scoop.position.set(0, this.topYAt(0, zs) + 0.025, zs);
    scoop.rotation.x = -0.05;
    this.body.add(scoop);
    this.tuneParts = { scoop, bonnet };
  }

  setBodyTilt(roll, pitch) {
    const b = this.bodyDef;
    const lowered = this.lowered || 0;
    // How far the arch lip above each wheel moves down: roll across the
    // track plus pitch along the wheelbase. Keep it inside the arch gap,
    // which a lowered car has less of.
    const drop = Math.abs(roll) * b.width * 0.5 + Math.abs(pitch) * b.wheelbase;
    const limit = Math.max(0.01, ARCH_GAP - 0.012 - lowered);
    if (drop > limit) {
      const k = limit / drop;
      roll *= k;
      pitch *= k;
    }
    this.body.rotation.z = roll;
    this.body.rotation.x = pitch;
    // Lean around the axle line, not the ground, so the arches stay centred
    // over the wheels instead of sliding sideways off them.
    _tiltPivot.set(0, b.wheelRadius, 0).applyEuler(this.body.rotation);
    this.body.position.set(-_tiltPivot.x, b.wheelRadius - _tiltPivot.y - lowered, -_tiltPivot.z);
  }
}
