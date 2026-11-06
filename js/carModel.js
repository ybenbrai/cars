import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FINISHES, RIM_STYLES, SPOILERS, STRIPES, TINTS, UNDERGLOWS } from './data/cars.js';

const CARBON = 0x17171d;
const TRIM = 0x101116;

function rbox(w, h, d, r = 0.08) {
  return new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2.05));
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
    this.rimMat = new THREE.MeshStandardMaterial({ color: look.rim, metalness: 0.95, roughness: 0.24 });
    this.discMat = new THREE.MeshStandardMaterial({ color: 0x4a4d55, metalness: 0.9, roughness: 0.45 });
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
    const bodyTop = b.rideHeight + 0.35;

    // main tub + underbody
    this.add(new THREE.Mesh(rbox(W * 0.94, 0.5, L * 0.92, 0.16), this.paintMat))
      .position.set(0, b.rideHeight + 0.1, 0);
    this.add(new THREE.Mesh(rbox(W * 0.99, 0.2, L * 0.9, 0.08), this.trimMat))
      .position.set(0, b.rideHeight - 0.07, 0);

    // hood + rear deck
    this.hoodMesh = this.add(new THREE.Mesh(rbox(W * 0.82, 0.24, L * 0.34, 0.1), this.paintMat));
    this.hoodMesh.position.set(0, b.noseDrop, L * 0.255);
    this.deckMesh = this.add(new THREE.Mesh(rbox(W * 0.84, 0.24, L * 0.26, 0.1), this.paintMat));
    this.deckMesh.position.set(0, b.tailHeight, -L * 0.31);

    // cabin glass + painted roof (roadsters get an open cockpit instead)
    const cabinY = bodyTop - 0.06 + b.cabinHeight / 2;
    this.openTop = b.style === 'roadster';
    if (this.openTop) {
      this.buildCockpit(bodyTop);
      this.roofMesh = null;
      this.roofY = bodyTop + 0.2;
    } else {
      this.add(new THREE.Mesh(rbox(b.cabinWidth, b.cabinHeight, b.cabinLength, 0.14), this.glassMat))
        .position.set(0, cabinY, b.cabinZ);
      const roofY = cabinY + b.cabinHeight / 2 + 0.015;
      this.roofMesh = this.add(new THREE.Mesh(rbox(b.roofWidth, 0.09, b.roofLength, 0.04), this.paintMat));
      this.roofMesh.position.set(0, roofY, b.cabinZ - 0.12);
      this.roofY = roofY + 0.045;

      // A / C pillars hint
      for (const sz of [-1, 1]) {
        const pillar = this.add(new THREE.Mesh(rbox(0.06, b.cabinHeight * 0.92, 0.1, 0.02), this.trimMat));
        pillar.position.set(sz * b.cabinWidth * 0.46, cabinY, b.cabinZ + b.cabinLength * 0.42);
        pillar.rotation.z = sz * 0.22;
      }
    }

    // fender bulges
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const fender = this.add(new THREE.Mesh(rbox(0.2, 0.36, 1.02, 0.09), this.paintMat));
        fender.position.set(sx * (W / 2 - 0.02), b.wheelRadius + 0.14, sz * b.wheelbase);
      }
      const skirt = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, L * 0.5), this.trimMat));
      skirt.position.set(sx * (W / 2 - 0.02), 0.34, 0);
    }

    // splitter, diffuser, grille
    this.add(new THREE.Mesh(rbox(W * 1.01, 0.07, 0.52, 0.03), this.carbonMat))
      .position.set(0, 0.32, L / 2 - 0.1);
    this.add(new THREE.Mesh(rbox(W * 0.9, 0.26, 0.42, 0.05), this.carbonMat))
      .position.set(0, 0.4, -L / 2 + 0.1);
    this.add(new THREE.Mesh(rbox(W * 0.36, 0.15, 0.06, 0.02), this.trimMat))
      .position.set(0, 0.54, L / 2 + 0.005);

    // headlights
    for (const sx of [-1, 1]) {
      const light = this.add(new THREE.Mesh(rbox(0.42, 0.1, 0.06, 0.03), this.headMat));
      light.position.set(sx * W * 0.29, b.noseDrop + 0.02, L / 2 - 0.012);
      const brow = this.add(new THREE.Mesh(rbox(0.48, 0.05, 0.04, 0.02), this.trimMat));
      brow.position.set(sx * W * 0.29, b.noseDrop + 0.1, L / 2 - 0.005);
    }

    // full-width tail bar + twin pipes
    const tail = this.add(new THREE.Mesh(rbox(W * 0.72, 0.075, 0.05, 0.02), this.tailMat));
    tail.position.set(0, b.tailHeight + 0.02, -L / 2 + 0.005);
    // Exhaust tips (local positions) for the smoke effect.
    this.exhausts = [];
    const pipeBore = new THREE.MeshStandardMaterial({ color: 0x0b0a0d, roughness: 0.9 });
    this.pipeBore = pipeBore;
    for (const sx of [-1, 1]) {
      const pipe = this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.2, 14), this.chromeMat));
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(sx * W * 0.3, 0.42, -L / 2 - 0.09);
      // Dark bore so the tip reads as a pipe, not a chrome button.
      const bore = this.add(new THREE.Mesh(new THREE.CircleGeometry(0.05, 14), pipeBore));
      bore.rotation.y = Math.PI;
      bore.position.set(sx * W * 0.3, 0.42, -L / 2 - 0.192);
      this.exhausts.push(new THREE.Vector3(sx * W * 0.3, 0.42, -L / 2 - 0.2));
    }

    // mirrors
    for (const sx of [-1, 1]) {
      const mirror = this.add(new THREE.Mesh(rbox(0.24, 0.1, 0.13, 0.035), this.paintMat));
      mirror.position.set(sx * (b.cabinWidth / 2 + 0.12), cabinY + 0.02, b.cabinZ + b.cabinLength * 0.36);
      mirror.rotation.z = sx * -0.1;
      const stalk = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.04), this.trimMat));
      stalk.position.set(sx * (b.cabinWidth / 2 + 0.04), cabinY + 0.01, b.cabinZ + b.cabinLength * 0.36);
    }

    // plates: mounted on the rear diffuser face (it used to sit inside the
    // diffuser) and on the nose
    const plateGeo = new THREE.PlaneGeometry(0.58, 0.163);
    const plate = this.add(new THREE.Mesh(plateGeo, this.plateMat));
    plate.position.set(0, 0.405, -L / 2 - 0.116);
    plate.rotation.y = Math.PI;
    plate.castShadow = false;
    const frontPlate = this.add(new THREE.Mesh(plateGeo, this.plateMat));
    frontPlate.position.set(0, 0.47, L / 2 + 0.058); // just ahead of the grille trim
    frontPlate.castShadow = false;

    // model-specific garnish
    if (b.vents) {
      for (const sx of [-1, 1]) {
        const vent = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.16, 0.5), this.trimMat));
        vent.position.set(sx * (W / 2 + 0.085), 0.66, 0.15);
      }
    }
    if (b.scoop) {
      const scoop = this.add(new THREE.Mesh(rbox(0.5, 0.12, 0.55, 0.04), this.trimMat));
      scoop.position.set(0, this.roofY + 0.04, b.cabinZ + 0.35);
    }
    if (b.ducktail) {
      const duck = this.add(new THREE.Mesh(rbox(W * 0.72, 0.06, 0.3, 0.02), this.paintMat));
      duck.position.set(0, b.tailHeight + 0.16, -L / 2 + 0.14);
      duck.rotation.x = -0.16;
    }

    this.bodyTop = bodyTop;
    this.cabinY = cabinY;
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
    const tireGeo = new THREE.CylinderGeometry(r, r, 0.32, 28);
    tireGeo.rotateZ(Math.PI / 2);
    const hubGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.36, 16);
    hubGeo.rotateZ(Math.PI / 2);
    const discGeo = new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.34, 24);
    discGeo.rotateZ(Math.PI / 2);

    const positions = [
      [-1, 1], [1, 1], [-1, -1], [1, -1],
    ];

    for (const [sx, sz] of positions) {
      const x = sx * (W / 2 - 0.03);
      const z = sz * b.wheelbase;
      const pivot = new THREE.Group();
      pivot.position.set(x, r, z);
      this.root.add(pivot);

      const spin = new THREE.Group();
      pivot.add(spin);

      const tire = new THREE.Mesh(tireGeo, this.rubberMat);
      tire.castShadow = true;
      spin.add(tire);

      const disc = new THREE.Mesh(discGeo, this.discMat);
      disc.castShadow = false;
      spin.add(disc);

      const hub = new THREE.Mesh(hubGeo, this.rimMat);
      hub.castShadow = true;
      spin.add(hub);

      const outerX = sx * 0.168;

      const spokeGroup = new THREE.Group();
      const spokeGeo = new THREE.BoxGeometry(0.04, 0.07, r * 0.92);
      spokeGeo.translate(0, 0, r * 0.48);
      for (let i = 0; i < 6; i++) {
        const spoke = new THREE.Mesh(spokeGeo, this.rimMat);
        spoke.position.x = outerX;
        spoke.rotation.x = (i * Math.PI) / 3;
        spoke.castShadow = false;
        spokeGroup.add(spoke);
      }
      const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.63, 0.024, 8, 26), this.rimMat);
      lip.rotation.y = Math.PI / 2;
      lip.position.x = outerX;
      spokeGroup.add(lip);
      spin.add(spokeGroup);
      this.rimStyleGroups.get('spoke').push(spokeGroup);

      const aeroGroup = new THREE.Group();
      const face = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.64, r * 0.64, 0.03, 26), this.rimMat);
      face.rotation.z = Math.PI / 2;
      face.position.x = outerX;
      aeroGroup.add(face);
      const aeroRing = new THREE.Mesh(new THREE.TorusGeometry(r * 0.6, 0.03, 8, 26), this.trimMat);
      aeroRing.rotation.y = Math.PI / 2;
      aeroRing.position.x = outerX + sx * 0.005;
      aeroGroup.add(aeroRing);
      spin.add(aeroGroup);
      this.rimStyleGroups.get('aero').push(aeroGroup);

      const deepGroup = new THREE.Group();
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.4, r * 0.6, 0.12, 24), this.discMat);
      dish.rotation.z = Math.PI / 2;
      dish.position.x = outerX - sx * 0.06;
      deepGroup.add(dish);
      const deepLip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.035, 8, 26), this.rimMat);
      deepLip.rotation.y = Math.PI / 2;
      deepLip.position.x = outerX;
      deepGroup.add(deepLip);
      const deepSpokeGeo = new THREE.BoxGeometry(0.035, 0.06, r * 0.6);
      deepSpokeGeo.translate(0, 0, r * 0.3);
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
    const baseY = b.tailHeight + 0.1;
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
    const hoodY = b.noseDrop + 0.13;
    const deckY = b.tailHeight + 0.13;

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
      const hood = new THREE.Mesh(new THREE.PlaneGeometry(0.15, L * 0.3), this.stripeMat);
      hood.rotation.x = -Math.PI / 2;
      hood.position.set(x, hoodY, L * 0.255);
      twin.add(hood);
      if (!this.openTop) {
        const roof = new THREE.Mesh(new THREE.PlaneGeometry(0.14, b.roofLength * 0.92), this.stripeMat);
        roof.rotation.x = -Math.PI / 2;
        roof.position.set(x, this.roofY + 0.005, b.cabinZ - 0.12);
        twin.add(roof);
      }
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(0.15, L * 0.22), this.stripeMat);
      deck.rotation.x = -Math.PI / 2;
      deck.position.set(x, deckY, -L * 0.31);
      twin.add(deck);
    }

    const side = make('side');
    for (const sx of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.52, 0.16), this.stripeMat);
      stripe.rotation.y = (Math.PI / 2) * -sx;
      stripe.position.set(sx * (W / 2 + 0.002), this.bodyTop - 0.24, 0.1);
      side.add(stripe);
    }

    const roof = make('roof');
    const hood = new THREE.Mesh(new THREE.PlaneGeometry(0.42, L * 0.3), this.stripeMat);
    hood.rotation.x = -Math.PI / 2;
    hood.position.set(0, hoodY, L * 0.255);
    roof.add(hood);
    if (!this.openTop) {
      const roofPanel = new THREE.Mesh(new THREE.PlaneGeometry(0.4, b.roofLength * 0.92), this.stripeMat);
      roofPanel.rotation.x = -Math.PI / 2;
      roofPanel.position.set(0, this.roofY + 0.005, b.cabinZ - 0.12);
      roof.add(roofPanel);
    }
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(0.42, L * 0.22), this.stripeMat);
    deck.rotation.x = -Math.PI / 2;
    deck.position.set(0, deckY, -L * 0.31);
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
    const rail = (x, y, z, len, th = 0.06) => add(
      new THREE.BoxGeometry(th, th, len), this.trimMat, x, y, z,
    );

    if (style === 'hatch') {
      // Roof spoiler, fog lamps, aerial and black arch trim.
      add(rbox(W * 0.78, 0.06, 0.34, 0.02), this.paintMat, 0, this.roofY + 0.05, b.cabinZ - b.roofLength * 0.55);
      for (const sx of [-1, 1]) {
        add(rbox(0.16, 0.08, 0.05, 0.02), this.headMat, sx * W * 0.31, b.noseDrop - 0.06, L / 2 - 0.01);
        add(new THREE.BoxGeometry(0.12, 0.12, 0.9), this.trimMat, sx * (W / 2 + 0.03), b.wheelRadius + 0.12, b.wheelbase);
        add(new THREE.BoxGeometry(0.12, 0.12, 0.9), this.trimMat, sx * (W / 2 + 0.03), b.wheelRadius + 0.12, -b.wheelbase);
      }
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 5), this.trimMat, 0, this.roofY + 0.3, b.cabinZ - 0.2, 0.16);
      add(new THREE.BoxGeometry(W * 0.5, 0.03, 0.16), this.trimMat, 0, this.roofY + 0.01, b.cabinZ + b.roofLength * 0.45);
    } else if (style === 'sedan') {
      // Chrome beltline, formal grille, trunk lip and door handles.
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.025, 0.025, b.cabinLength * 1.02), this.chromeMat, sx * (b.cabinWidth / 2 + 0.01), this.cabinY + b.cabinHeight * 0.34, b.cabinZ);
        for (const sz of [-0.62, 0.55]) {
          add(rbox(0.14, 0.035, 0.04, 0.015), this.chromeMat, sx * (W / 2 + 0.005), b.rideHeight + 0.26, sz * L * 0.34);
        }
      }
      for (let i = -2; i <= 2; i++) {
        add(new THREE.BoxGeometry(0.04, 0.16, 0.02), this.chromeMat, i * W * 0.075, b.noseDrop - 0.02, L / 2 + 0.01);
      }
      add(rbox(W * 0.72, 0.05, 0.2, 0.02), this.paintMat, 0, b.tailHeight + 0.17, -L / 2 + 0.12, -0.12);
    } else if (style === 'suv') {
      // Roof rails, side steps, skid plates and chunkier arch flares.
      for (const sx of [-1, 1]) {
        rail(sx * b.roofWidth * 0.42, this.roofY + 0.09, b.cabinZ - 0.05, b.roofLength * 0.9, 0.07);
        add(new THREE.BoxGeometry(0.16, 0.1, L * 0.42), this.trimMat, sx * (W / 2 + 0.02), b.rideHeight - 0.06, 0);
        add(rbox(0.24, 0.34, 1.15, 0.06), this.trimMat, sx * (W / 2 + 0.01), b.wheelRadius + 0.1, b.wheelbase);
        add(rbox(0.24, 0.34, 1.15, 0.06), this.trimMat, sx * (W / 2 + 0.01), b.wheelRadius + 0.1, -b.wheelbase);
      }
      add(rbox(W * 0.78, 0.06, 0.4, 0.03), this.chromeMat, 0, 0.36, L / 2 - 0.16);
      add(rbox(W * 0.72, 0.06, 0.34, 0.03), this.chromeMat, 0, 0.38, -L / 2 + 0.18);
      add(rbox(W * 0.42, 0.16, 0.04, 0.02), this.chromeMat, 0, b.noseDrop + 0.03, L / 2 + 0.005);
    } else if (style === 'offroad') {
      // Roof rack + light bar, snorkel, mud flaps, tow hooks and a spare wheel.
      for (const sx of [-1, 1]) {
        rail(sx * b.roofWidth * 0.42, this.roofY + 0.12, b.cabinZ, b.roofLength * 0.95, 0.05);
        add(new THREE.BoxGeometry(0.11, 0.26, 0.2), this.trimMat, sx * W * 0.3, 0.34, L / 2 - 0.03);
        add(new THREE.PlaneGeometry(0.32, 0.34), this.trimMat, sx * (W / 2 - 0.05), 0.24, b.wheelbase - 0.55);
      }
      for (let i = -2; i <= 2; i++) {
        add(new THREE.CylinderGeometry(0.075, 0.075, 0.09, 10), this.headMat, i * W * 0.16, this.roofY + 0.27, b.cabinZ + b.roofLength * 0.44, Math.PI / 2);
      }
      add(new THREE.BoxGeometry(W * 0.8, 0.045, 0.12), this.carbonMat, 0, this.roofY + 0.22, b.cabinZ + b.roofLength * 0.44);
      add(new THREE.CylinderGeometry(0.07, 0.06, b.cabinHeight + 0.5, 8), this.trimMat, W / 2 + 0.02, this.cabinY + 0.14, b.cabinZ + b.cabinLength * 0.42);
      add(new THREE.CylinderGeometry(b.wheelRadius * 0.62, b.wheelRadius * 0.62, 0.18, 20), this.rubberMat, 0, b.tailHeight + 0.3, -L / 2 - 0.08, Math.PI / 2);
      add(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 10), this.chromeMat, 0, b.tailHeight + 0.3, -L / 2 - 0.02, Math.PI / 2);
    } else if (style === 'muscle') {
      // Hood bulge, pins, side pipes and wide rear quarters.
      add(rbox(W * 0.46, 0.1, L * 0.26, 0.03), this.paintMat, 0, b.noseDrop + 0.08, L * 0.26);
      for (const sx of [-1, 1]) {
        add(new THREE.CylinderGeometry(0.025, 0.025, 0.09, 6), this.chromeMat, sx * W * 0.2, b.noseDrop + 0.17, L * 0.12);
        add(new THREE.BoxGeometry(0.06, 0.06, L * 0.34), this.chromeMat, sx * (W / 2 + 0.05), 0.3, 0);
        add(rbox(0.3, 0.34, 1.25, 0.07), this.paintMat, sx * (W / 2 - 0.01), b.wheelRadius + 0.12, -b.wheelbase);
      }
      add(rbox(W * 0.9, 0.05, 0.28, 0.02), this.carbonMat, 0, b.tailHeight + 0.13, -L / 2 + 0.1, -0.1);
    } else if (style === 'super') {
      // Side intakes, canards, diffuser fins and a low front splitter.
      for (const sx of [-1, 1]) {
        add(rbox(0.07, 0.2, 0.52, 0.02), this.carbonMat, sx * (W / 2 + 0.04), 0.62, -L * 0.05);
        add(rbox(0.1, 0.18, 0.1, 0.02), this.carbonMat, sx * (W / 2 + 0.02), 0.42, b.cabinZ + b.cabinLength * 0.44, 0, 0, sx * 0.28);
        add(rbox(0.42, 0.035, 0.24, 0.01), this.carbonMat, sx * W * 0.34, 0.3, L / 2 + 0.12);
      }
      add(rbox(W * 0.94, 0.04, 0.34, 0.02), this.carbonMat, 0, 0.285, L / 2 - 0.02);
      // Outer fins only: the middle of the diffuser carries the plate.
      for (const i of [-2, 2]) {
        add(new THREE.BoxGeometry(0.035, 0.16, 0.5), this.carbonMat, i * W * 0.15, 0.34, -L / 2 + 0.1);
      }
      add(rbox(W * 0.5, 0.09, 0.34, 0.03), this.paintMat, 0, b.noseDrop + 0.02, L * 0.3);
    } else if (style === 'hyper') {
      // Canards, roof snorkel, dorsal fin and the biggest diffuser in the shop.
      for (const sx of [-1, 1]) {
        add(rbox(0.5, 0.035, 0.2, 0.01), this.carbonMat, sx * W * 0.36, 0.29, L / 2 + 0.14);
        add(rbox(0.08, 0.24, 0.6, 0.02), this.carbonMat, sx * (W / 2 + 0.03), 0.6, -L * 0.08);
        add(rbox(0.16, 0.1, 0.34, 0.02), this.carbonMat, sx * W * 0.36, 0.5, b.cabinZ - b.cabinLength * 0.48);
      }
      add(rbox(0.3, 0.07, 0.5, 0.02), this.carbonMat, 0, this.roofY + 0.06, b.cabinZ + b.roofLength * 0.2);
      add(rbox(0.06, 0.24, 1.15, 0.02), this.carbonMat, 0, this.roofY - 0.05, -b.roofLength * 0.35);
      add(rbox(W * 0.96, 0.04, 0.32, 0.02), this.carbonMat, 0, 0.28, L / 2 + 0.02);
      for (const i of [-3, -2, 2, 3]) {
        add(new THREE.BoxGeometry(0.03, 0.22, 0.6), this.carbonMat, i * W * 0.12, 0.35, -L / 2 + 0.08);
      }
      add(new THREE.BoxGeometry(W * 0.92, 0.16, 0.05), this.carbonMat, 0, b.rideHeight + 0.34, L / 2 + 0.005);
    } else if (style === 'roadster') {
      // Pop-up-style lamp pods, a low splitter, side gills and a single tail pipe.
      for (const sx of [-1, 1]) {
        add(rbox(0.3, 0.07, 0.24, 0.03), this.trimMat, sx * W * 0.29, b.noseDrop + 0.1, L / 2 - 0.2);
        add(rbox(0.05, 0.1, 0.3, 0.02), this.trimMat, sx * (W / 2 + 0.03), 0.58, b.wheelbase * 0.45);
      }
      add(rbox(W * 0.86, 0.035, 0.24, 0.02), this.carbonMat, 0, 0.29, L / 2 - 0.03);
      add(rbox(W * 0.5, 0.05, 0.22, 0.02), this.paintMat, 0, b.tailHeight + 0.15, -L / 2 + 0.14, -0.18);
    } else if (style === 'gt') {
      // Long-bonnet louvres, chrome window surround, fender gills and quad pipes.
      for (let i = 0; i < 6; i++) {
        add(new THREE.BoxGeometry(W * 0.3, 0.02, 0.05), this.trimMat, 0, b.noseDrop + 0.135, L * 0.2 + i * 0.11);
      }
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.025, 0.025, b.cabinLength * 0.98), this.chromeMat, sx * (b.cabinWidth / 2 + 0.01), this.cabinY + b.cabinHeight * 0.4, b.cabinZ);
        for (let i = 0; i < 3; i++) {
          add(rbox(0.03, 0.05, 0.28, 0.01), this.chromeMat, sx * (W / 2 + 0.01), 0.56 + i * 0.08, b.wheelbase - 0.72);
        }
        for (const off of [0.2, 0.34]) {
          add(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), this.chromeMat, sx * W * off, 0.4, -L / 2 - 0.06, Math.PI / 2);
          this.exhausts.push(new THREE.Vector3(sx * W * off, 0.4, -L / 2 - 0.14));
        }
      }
      add(rbox(W * 0.44, 0.14, 0.05, 0.03), this.chromeMat, 0, b.noseDrop - 0.08, L / 2 + 0.01);
      add(rbox(W * 0.76, 0.05, 0.2, 0.02), this.paintMat, 0, b.tailHeight + 0.16, -L / 2 + 0.12, -0.14);
    } else {
      // Sports: fog lights, a subtle splitter and side gills.
      for (const sx of [-1, 1]) {
        add(rbox(0.14, 0.07, 0.05, 0.02), this.headMat, sx * W * 0.34, b.noseDrop - 0.07, L / 2 - 0.005);
        add(rbox(0.05, 0.12, 0.38, 0.02), this.trimMat, sx * (W / 2 + 0.03), 0.6, 0.06);
      }
      add(rbox(W * 0.9, 0.035, 0.26, 0.02), this.carbonMat, 0, 0.3, L / 2 - 0.03);
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

  dispose() {
    this.plateTex?.dispose();
    for (const light of this.headlights || []) {
      light.removeFromParent();
      light.target.removeFromParent();
      light.dispose?.();
    }
    for (const mat of [
      this.paintMat, this.trimMat, this.carbonMat, this.chromeMat, this.glassMat,
      this.headMat, this.tailMat, this.rubberMat, this.rimMat, this.discMat,
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
