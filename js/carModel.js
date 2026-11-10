import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FINISHES, RIM_STYLES, SPOILERS, STRIPES, TINTS, UNDERGLOWS } from './data/cars.js';

const CARBON = 0x17171d;
const TRIM = 0x101116;

function rbox(w, h, d, r = 0.08) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.05));
}

/** Smoothstep interpolation through [t, value] keys, clamped at both ends. */
function profile(keys, t) {
  const k = keys.slice().sort((a, b) => a[0] - b[0]);
  if (t <= k[0][0]) return k[0][1];
  if (t >= k[k.length - 1][0]) return k[k.length - 1][1];
  for (let i = 0; i < k.length - 1; i++) {
    const [t0, v0] = k[i];
    const [t1, v1] = k[i + 1];
    if (t <= t1) {
      if (t1 - t0 < 1e-6) return v1;
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return k[k.length - 1][1];
}

/**
 * Loft a smooth closed shell through a series of rounded-rectangle sections.
 * Each station is { z, halfWidthBottom, halfWidthTop, yBottom, yTop }; the
 * section is a superellipse, so the flanks are full but the corners roll off.
 */
function loftGeometry(stations, segments = 32) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const exp = 0.58;

  const ringPoint = (st, theta) => {
    const cy = (st.yBottom + st.yTop) / 2;
    const hy = Math.max(0.001, (st.yTop - st.yBottom) / 2);
    const sy = Math.sign(Math.sin(theta)) * Math.pow(Math.abs(Math.sin(theta)), exp);
    const y = cy + hy * sy;
    const u = Math.max(0, Math.min(1, (y - st.yBottom) / Math.max(0.001, st.yTop - st.yBottom)));
    const hw = st.halfWidthBottom + (st.halfWidthTop - st.halfWidthBottom) * u;
    const sx = Math.sign(Math.cos(theta)) * Math.pow(Math.abs(Math.cos(theta)), exp);
    return [hw * sx, y];
  };

  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    for (let j = 0; j < segments; j++) {
      const theta = (j / segments) * Math.PI * 2;
      const [x, y] = ringPoint(st, theta);
      positions.push(x, y, st.z);
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

function loftTopSurface(stations, arcSegments = 10, startAngle = Math.PI * 0.27, endAngle = Math.PI * 0.73) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const exp = 0.58;
  const point = (st, theta) => {
    const cy = (st.yBottom + st.yTop) / 2;
    const hy = Math.max(0.001, (st.yTop - st.yBottom) / 2);
    const sy = Math.sign(Math.sin(theta)) * Math.pow(Math.abs(Math.sin(theta)), exp);
    const y = cy + hy * sy;
    const u = Math.max(0, Math.min(1, (y - st.yBottom) / Math.max(0.001, st.yTop - st.yBottom)));
    const hw = st.halfWidthBottom + (st.halfWidthTop - st.halfWidthBottom) * u;
    const sx = Math.sign(Math.cos(theta)) * Math.pow(Math.abs(Math.cos(theta)), exp);
    return [hw * sx, y + 0.006];
  };
  for (let i = 0; i < stations.length; i++) {
    for (let j = 0; j < arcSegments; j++) {
      const theta = startAngle + (endAngle - startAngle) * (j / (arcSegments - 1));
      const [x, y] = point(stations[i], theta);
      positions.push(x, y, stations[i].z);
      uvs.push(j / (arcSegments - 1), i / (stations.length - 1));
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < arcSegments - 1; j++) {
      const a = i * arcSegments + j;
      const b = i * arcSegments + j + 1;
      const c = (i + 1) * arcSegments + j + 1;
      const d = (i + 1) * arcSegments + j;
      indices.push(a, b, c, a, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function treadTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#141419';
  ctx.fillRect(0, 0, 256, 128);
  // Circumferential grooves.
  ctx.fillStyle = '#07070a';
  for (const y of [42, 64, 86]) ctx.fillRect(0, y, 256, 3);
  // Lateral tread blocks around the circumference.
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let x = 0; x < 256; x += 16) ctx.fillRect(x, 34, 6, 60);
  ctx.fillStyle = 'rgba(255,255,255,0.045)';
  for (let x = 8; x < 256; x += 16) ctx.fillRect(x, 34, 2, 60);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
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
      color: 0x101827, metalness: 0.8, roughness: 0.07,
      transparent: true, opacity: 0.8, envMapIntensity: 1.4,
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
    // Keep the fender line above the tyre even on cars with big wheels.
    const bodyTop = Math.max(b.rideHeight + 0.31, b.wheelRadius * 2 + 0.1);
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
    const topKeys = [
      [0, b.tailHeight - 0.02],
      [0.03, b.tailHeight + 0.01],
      [hyp(tCabinRear - 0.07), b.tailHeight + 0.04],
      [tCabinRear, bodyTop - 0.05],
      [hyp(tCabinRear + 0.02), bodyTop - 0.02],
      [hyp(tCabinFront - 0.02), bodyTop - 0.02],
      [tCabinFront, bodyTop - 0.06],
      [hyp(tCabinFront + 0.05), b.noseDrop + 0.10],
      [0.76, b.noseDrop + 0.09],
      [0.89, b.noseDrop + 0.06],
      [0.97, b.noseDrop + 0.02],
      [1, b.noseDrop - 0.01],
    ];
    const bottomKeys = [
      [0, b.rideHeight + 0.02],
      [0.05, b.rideHeight - 0.12],
      [0.12, b.rideHeight - 0.16],
      [0.88, b.rideHeight - 0.16],
      [0.96, b.rideHeight - 0.10],
      [1, b.rideHeight + 0.02],
    ];
    const widthKeys = [
      [0, 0.77],
      [0.03, 0.89],
      [0.1, 0.95],
      [hyp(tWheelRear - 0.08), 0.965],
      [tWheelRear, 1.03],
      [hyp(tWheelRear + 0.08), 0.975],
      [cabinMid, 0.975],
      [hyp(tWheelFront - 0.08), 0.975],
      [tWheelFront, 1.03],
      [hyp(tWheelFront + 0.08), 0.965],
      [0.9, 0.94],
      [0.97, 0.83],
      [1, 0.73],
    ];

    const stations = [];
    const STATIONS = 44;
    const archR = b.wheelRadius + 0.05;
    for (let i = 0; i < STATIONS; i++) {
      const t = i / (STATIONS - 1);
      const z = -L / 2 + t * L;
      const yTop = profile(topKeys, t);
      let yBottom = profile(bottomKeys, t);
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
        halfWidthBottom: hw, halfWidthTop: hw * 0.965,
      });
    }

    this.profileStations = stations;

    // One smooth painted shell instead of stacked boxes.
    const shell = new THREE.Mesh(loftGeometry(stations, 34), this.paintMat);
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
    const archX = W / 2 - 0.15;
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
      const z = sz * b.wheelbase;
      const liner = new THREE.Mesh(
        new THREE.CylinderGeometry(archR * 0.99, archR * 0.99, 0.32, 20, 1, true, 0, Math.PI),
        this.archMat,
      );
      liner.rotation.z = Math.PI / 2;
      liner.position.set(sx * archX, b.wheelRadius, z);
      liner.castShadow = false;
      this.body.add(liner);
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
      const roofKeys = [
        [0, bodyTop + 0.02],
        [0.1, roofTop - 0.12],
        [0.2, roofTop - 0.03],
        [0.5, roofTop - 0.012],
        [0.8, roofTop - 0.03],
        [0.9, roofTop - 0.12],
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
          halfWidthTop: b.roofWidth * 0.475,
        });
      }
      this.roofStations = ghStations;
      const glass = new THREE.Mesh(loftGeometry(ghStations, 24), this.glassMat);
      glass.castShadow = false;
      this.body.add(glass);

      // Painted roof skin over the flat part of the greenhouse only, so the
      // raked front and rear surfaces stay glass (windshield / rear window).
      const roofPanelStations = ghStations.slice(3, GH - 3);
      const roofSkin = new THREE.Mesh(loftTopSurface(roofPanelStations, 12), this.paintMat);
      roofSkin.castShadow = true;
      this.body.add(roofSkin);
      this.roofMesh = null;
      this.roofY = roofTop + 0.012;

      const interior = this.add(new THREE.Mesh(
        rbox(b.cabinWidth * 0.84, b.cabinHeight * 0.68, b.cabinLength * 0.86, 0.08),
        this.trimMat,
      ));
      interior.position.set(0, bodyTop + b.cabinHeight * 0.3, b.cabinZ);

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
    }

    // Splitter, diffuser and grille.
    const splitterY = b.rideHeight - 0.13;
    this.add(new THREE.Mesh(rbox(W * 0.86, 0.055, 0.32, 0.025), this.carbonMat))
      .position.set(0, splitterY, L / 2 - 0.16);
    this.add(new THREE.Mesh(rbox(W * 0.92, 0.22, 0.4, 0.04), this.carbonMat))
      .position.set(0, b.rideHeight - 0.08, -L / 2 + 0.12);
    const grilleY = b.noseDrop - 0.02;
    this.add(new THREE.Mesh(rbox(W * 0.5, 0.2, 0.03, 0.02), this.trimMat))
      .position.set(0, grilleY, L / 2 + 0.005);
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.44, 0.15), this.grilleMat);
    grille.position.set(0, grilleY, L / 2 + 0.022);
    grille.castShadow = false;
    this.body.add(grille);

    // Headlights: dark housing, twin projectors and a thin DRL strip.
    for (const sx of [-1, 1]) {
      this.add(new THREE.Mesh(rbox(0.5, 0.15, 0.05, 0.025), this.trimMat))
        .position.set(sx * W * 0.29, b.noseDrop + 0.01, L / 2 + 0.008);
      const drl = this.add(new THREE.Mesh(rbox(0.44, 0.032, 0.02, 0.012), this.headMat));
      drl.position.set(sx * W * 0.29, b.noseDrop + 0.085, L / 2 + 0.04);
      for (const dx of [-0.09, 0.09]) {
        const lens = this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.012, 12), this.headMat));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(sx * W * 0.29 + dx, b.noseDrop + 0.012, L / 2 + 0.042);
      }
      const brow = this.add(new THREE.Mesh(rbox(0.52, 0.045, 0.04, 0.02), this.trimMat));
      brow.position.set(sx * W * 0.29, b.noseDrop + 0.115, L / 2 + 0.005);
    }

    // Full-width tail bar with vertical end caps and twin pipes.
    this.add(new THREE.Mesh(rbox(W * 0.78, 0.12, 0.045, 0.02), this.trimMat))
      .position.set(0, b.tailHeight + 0.02, -L / 2 - 0.004);
    const tail = this.add(new THREE.Mesh(rbox(W * 0.72, 0.045, 0.02, 0.01), this.tailMat));
    tail.position.set(0, b.tailHeight + 0.02, -L / 2 - 0.028);
    for (const sx of [-1, 1]) {
      const cap = this.add(new THREE.Mesh(rbox(0.05, 0.1, 0.02, 0.01), this.tailMat));
      cap.position.set(sx * W * 0.35, b.tailHeight + 0.02, -L / 2 - 0.029);
    }

    this.exhausts = [];
    const exhaustY = b.rideHeight - 0.055;
    for (const sx of [-1, 1]) {
      this.add(new THREE.Mesh(rbox(0.19, 0.13, 0.05, 0.02), this.trimMat))
        .position.set(sx * W * 0.3, exhaustY, -L / 2 - 0.05);
      const pipe = this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.2, 14), this.chromeMat));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx * W * 0.3, exhaustY, -L / 2 - 0.09);
      const bore = this.add(new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), this.archMat));
      bore.rotation.y = Math.PI;
      bore.position.set(sx * W * 0.3, exhaustY, -L / 2 - 0.192);
      this.exhausts.push(new THREE.Vector3(sx * W * 0.3, exhaustY, -L / 2 - 0.2));
    }

    // Mirrors with a dark glass face.
    for (const sx of [-1, 1]) {
      const mirrorZ = b.cabinZ + b.cabinLength * 0.38;
      const mirror = this.add(new THREE.Mesh(rbox(0.24, 0.1, 0.13, 0.035), this.paintMat));
      mirror.position.set(sx * (b.cabinWidth / 2 + 0.12), bodyTop + 0.06, mirrorZ);
      mirror.rotation.z = sx * -0.1;
      const face = this.add(new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), this.glassMat));
      face.position.set(sx * (b.cabinWidth / 2 + 0.12), bodyTop + 0.06, mirrorZ - 0.068);
      face.rotation.y = Math.PI;
      face.castShadow = false;
      const stalk = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.04), this.trimMat));
      stalk.position.set(sx * (b.cabinWidth / 2 + 0.04), bodyTop + 0.05, mirrorZ);
    }

    // Door shut lines follow the curved flank as thin dark ribbons, with a
    // chrome handle on each door.
    const doorSeam = (z, side) => {
      const y0 = b.rideHeight - 0.02;
      const y1 = bodyTop - 0.05;
      const steps = 10;
      const pos = [];
      const idx = [];
      for (let i = 0; i <= steps; i++) {
        const y = y0 + (y1 - y0) * (i / steps);
        const x = side * (this.sideX(y, z) + 0.003);
        pos.push(x, y, z - 0.006, x, y, z + 0.006);
      }
      for (let i = 0; i < steps; i++) {
        const a = i * 2;
        idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
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
      const handle = this.add(new THREE.Mesh(rbox(0.022, 0.032, 0.13, 0.012), this.chromeMat));
      handle.position.set(sx * (this.sideX(hy, hz) + 0.006), hy, hz);
      handle.castShadow = false;
    }

    // Plates sit in dark recesses front and rear.
    const plateGeo = new THREE.PlaneGeometry(0.5, 0.14);
    const rearPlateY = b.tailHeight - 0.12;
    this.add(new THREE.Mesh(rbox(0.58, 0.2, 0.03, 0.02), this.trimMat))
      .position.set(0, rearPlateY, -L / 2 - 0.10);
    const plate = this.add(new THREE.Mesh(plateGeo, this.plateMat));
    plate.position.set(0, rearPlateY, -L / 2 - 0.118);
    plate.rotation.y = Math.PI;
    plate.castShadow = false;
    const frontPlateY = Math.min(b.noseDrop - 0.07, b.rideHeight + 0.08);
    this.add(new THREE.Mesh(rbox(0.58, 0.2, 0.03, 0.02), this.trimMat))
      .position.set(0, frontPlateY, L / 2 + 0.042);
    const frontPlate = this.add(new THREE.Mesh(plateGeo, this.plateMat));
    frontPlate.position.set(0, frontPlateY, L / 2 + 0.06);
    frontPlate.castShadow = false;

    // Hood and boot shut lines.
    const seam = (z) => {
      const line = this.add(new THREE.Mesh(
        new THREE.BoxGeometry(W * 0.78, 0.012, 0.012), this.trimMat,
      ));
      line.position.set(0, profile(topKeys, zToT(z)) - 0.002, z);
      line.castShadow = false;
    };
    seam(b.cabinZ + b.cabinLength / 2 + 0.06);
    seam(-L / 2 + L * 0.22);

    // Model-specific garnish.
    if (b.vents) {
      const ventY = bodyTop - 0.16;
      const ventZ = b.cabinZ - 0.18;
      for (const sx of [-1, 1]) {
        const vent = this.add(new THREE.Mesh(rbox(0.03, 0.15, 0.46, 0.015), this.trimMat));
        vent.position.set(sx * (this.sideX(ventY, ventZ) + 0.001), ventY, ventZ);
      }
    }
    if (b.scoop) {
      const scoop = this.add(new THREE.Mesh(rbox(0.5, 0.12, 0.55, 0.04), this.trimMat));
      scoop.position.set(0, this.roofY - 0.01, b.cabinZ + 0.35);
    }
    if (b.ducktail) {
      const duck = this.add(new THREE.Mesh(rbox(W * 0.72, 0.06, 0.3, 0.02), this.paintMat));
      duck.position.set(0, b.tailHeight + 0.03, -L / 2 + 0.14);
      duck.rotation.x = -0.16;
    }

    this.hoodStripeY = this.topY(L * 0.285) + 0.006;
    this.deckStripeY = this.topY(-L * 0.34) + 0.006;
    this.roofStripeY = this.roofY + 0.004;
  }

  /** Outer x of the painted shell at a given height and z (for flush details). */
  sideX(y, z) {
    const stations = this.profileStations;
    if (!stations) return this.bodyDef.width / 2;
    let st = stations[0];
    let bd = Infinity;
    for (const s of stations) {
      const d = Math.abs(s.z - z);
      if (d < bd) { bd = d; st = s; }
    }
    const EXP = 0.58;
    const h = Math.max(0.001, st.yTop - st.yBottom);
    const u = THREE.MathUtils.clamp((y - st.yBottom) / h, 0, 1);
    const hw = st.halfWidthBottom + (st.halfWidthTop - st.halfWidthBottom) * u;
    const sy = u * 2 - 1;
    const sn = Math.sign(sy) * Math.pow(Math.abs(sy), 1 / EXP);
    const cx = Math.sqrt(Math.max(0, 1 - sn * sn));
    return hw * Math.pow(cx, EXP);
  }

  /** Centreline top of the painted shell at a given z. */
  topY(z) {
    const stations = this.profileStations;
    if (!stations?.length) return this.bodyTop ?? this.bodyDef.rideHeight;
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i];
      const c = stations[i + 1];
      if (z <= c.z) {
        const t = THREE.MathUtils.clamp((z - a.z) / Math.max(1e-6, c.z - a.z), 0, 1);
        return a.yTop + (c.yTop - a.yTop) * t;
      }
    }
    return stations[stations.length - 1].yTop;
  }

  /** Top of the greenhouse (roof / rear glass) at a given z. */
  roofYAt(z) {
    const st = this.roofStations;
    if (!st?.length) return this.roofY ?? this.bodyTop;
    for (let i = 0; i < st.length - 1; i++) {
      const a = st[i];
      const c = st[i + 1];
      if (z <= c.z) {
        const t = THREE.MathUtils.clamp((z - a.z) / Math.max(1e-6, c.z - a.z), 0, 1);
        return a.yTop + (c.yTop - a.yTop) * t;
      }
    }
    return st[st.length - 1].yTop;
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
      const fairing = this.add(new THREE.Mesh(rbox(0.34, 0.16, 0.8, 0.07), this.paintMat));
      fairing.position.set(x, bodyTop + 0.05, rear - 0.44);
      fairing.rotation.x = 0.1;
    }
  }

  buildWheels() {
    const b = this.bodyDef;
    const r = b.wheelRadius;
    const W = b.width;
    const tireGeo = new THREE.LatheGeometry(tyreProfile(r, 0.16), 40);
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
      // The outer tyre sidewall should sit just inside the fender, not hang
      // out beyond it; the lathe profile bulges to 0.92 × half width.
      const x = sx * (W / 2 - 0.15);
      const z = sz * b.wheelbase;
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
    const top = this.bodyTop + 0.014;
    const hoodY = this.hoodStripeY;
    const deckY = this.deckStripeY;
    const roofY = this.roofStripeY;

    const make = (id) => {
      const g = new THREE.Group();
      g.visible = false;
      this.body.add(g);
      this.stripeGroups.set(id, g);
      return g;
    };

    const twin = make('twin');
    for (const sx of [-1, 1]) {
      const x = sx * 0.17;
      const hood = new THREE.Mesh(new THREE.PlaneGeometry(0.15, L * 0.24), this.stripeMat);
      hood.rotation.x = -Math.PI / 2;
      hood.position.set(x, hoodY, L * 0.285);
      twin.add(hood);
      if (!this.openTop) {
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(0.14, b.roofLength * 0.62), this.stripeMat);
        roof.rotation.x = -Math.PI / 2;
        roof.position.set(x, roofY, b.cabinZ - 0.12);
        twin.add(roof);
      }
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(0.15, L * 0.18), this.stripeMat);
      deck.rotation.x = -Math.PI / 2;
      deck.position.set(x, deckY, -L * 0.34);
      twin.add(deck);
    }

    const side = make('side');
    for (const sx of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.44, 0.16), this.stripeMat);
      stripe.rotation.y = (Math.PI / 2) * -sx;
      stripe.position.set(sx * (W / 2 * 0.985 + 0.004), this.bodyTop - 0.22, 0.05);
      side.add(stripe);
    }

    const roof = make('roof');
    const hood = new THREE.Mesh(new THREE.PlaneGeometry(0.42, L * 0.24), this.stripeMat);
    hood.rotation.x = -Math.PI / 2;
    hood.position.set(0, hoodY, L * 0.285);
    roof.add(hood);
    if (!this.openTop) {
      const roofPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.4, b.roofLength * 0.62), this.stripeMat);
      roofPanel.rotation.x = -Math.PI / 2;
      roofPanel.position.set(0, roofY, b.cabinZ - 0.12);
      roof.add(roofPanel);
    }
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(0.42, L * 0.18), this.stripeMat);
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, deckY, -L * 0.34);
    roof.add(deck);
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
    const archR = b.wheelRadius + 0.05;
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
      for (let i = -2; i <= 2; i++) {
        add(new THREE.BoxGeometry(0.04, 0.14, 0.02), this.chromeMat, i * W * 0.075, b.noseDrop - 0.02, L / 2 + 0.032);
      }
      add(rbox(W * 0.72, 0.05, 0.2, 0.02), this.paintMat, 0, b.tailHeight + 0.02, -L / 2 + 0.16, -0.1);
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
  mergeStaticParts() {
    const mergeGroup = (group) => {
      if (!group) return;
      const buckets = new Map();
      for (const child of [...group.children]) {
        if (!child.isMesh || child === this.glowMesh) continue;
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
  }

  dispose() {
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
    for (const wheel of this.frontWheels) {
      wheel.pivot.rotation.y = -angle * 0.42;
    }
  }

  setSpin(angle) {
    this.wheelSpin = angle;
    for (const wheel of this.wheels) {
      wheel.spin.rotation.x = angle;
    }
  }

  setBraking(on) {
    this.tailMat.emissiveIntensity = on ? 4.5 : 1.4;
  }

  setBodyTilt(roll, pitch) {
    this.body.rotation.z = roll;
    this.body.rotation.x = pitch;
  }
}
