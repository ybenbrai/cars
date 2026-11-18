// Realistic cars from glTF models. A car whose definition has
// `model: { url }` is first built procedurally (so it is never invisible),
// then the real model is loaded and swapped in:
//  - body parts go under the model's `body` group, so lean/pitch still work;
//  - each wheel is re-pivoted at its centre so spin and steering still work;
//  - paint, glass, rims and lights use the game's own materials, so the
//    paint shop, tint, rim colour and brake lights keep working.
// Expected node naming (see docs/CAR_ART_BRIEF.md): wheels named like
// "WheelFrontL", "WheelRearR"; materials named "Paint 1…", "Glass",
// "Rim…", "Brakelight", "Headlight", "Signallight". The shipped concept car
// actually exports its default look as a palette of unnamed materials, so
// those palette slots are mapped too (see materialRole below).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

/** Load (once) and return the parsed glTF scene for a URL. */
export function loadCarScene(url) {
  if (!cache.has(url)) {
    cache.set(url, new Promise((resolve, reject) => loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject)));
  }
  return cache.get(url);
}

/** Start downloading every real car model in the background. */
export function preloadCarModels(cars) {
  for (const car of cars) if (car.model?.url) loadCarScene(car.model.url).catch(() => {});
}

const WHEEL_RE = /^wheel(front|rear)(l|r)$/i;
const tmp = new THREE.Vector3();
const box = new THREE.Box3();

function materialRole(mat) {
  const name = String(mat?.name || '').toLowerCase().replace(/\s+/g, '');
  // Palette slots in the shipped Car Concept GLB. The original variant
  // materials survive in the file but three.js does not select variants, so
  // the palette slots are what actually render and must be remapped.
  if (name === 'palettematerial001' || name === 'glass' || name.includes('window')) return 'glass';
  if (name.startsWith('paint1') || name.startsWith('paint2')
    || name === 'palettematerial006' || name === 'palettematerial007') return 'paint';
  if (name.startsWith('rim')) return 'rim';
  // "Brake" is the caliper material in this asset, not a tail lamp — only
  // match the explicit tail/brake-light names and the lamp palette slot.
  if (name === 'palettematerial009' || name.includes('brakelight') || name.includes('taillight')) return 'brake';
  if (name === 'palettematerial010' || name.includes('headlight')) return 'head';
  if (name === 'palettematerial008' || name.includes('signal')) return 'signal';
  return null;
}

/**
 * Swap the real model into a procedural CarModel. Returns a promise that
 * resolves when done (or rejects, leaving the procedural car in place).
 */
export async function attachRealModel(model, def) {
  const source = await loadCarScene(def.model.url);
  if (model.disposed) return;
  const scene = source.clone(true);

  // Hidden parts: trademarks (plate/emblem art in the source file) and
  // anything the definition lists.
  const hide = new Set((def.model.hide || []).map((n) => n.toLowerCase()));
  scene.traverse((o) => { if (o.name && hide.has(o.name.toLowerCase())) o.visible = false; });

  // Fit: long axis along +z (nose forward), length matching the definition,
  // tyres on the ground, centred.
  scene.updateMatrixWorld(true);
  box.setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const holder = new THREE.Group();
  holder.add(scene);
  if (size.x > size.z) holder.rotation.y = Math.PI / 2;
  if (def.model.flip) holder.rotation.y += Math.PI;
  holder.updateMatrixWorld(true);
  box.setFromObject(holder);
  const length = box.getSize(tmp).z;
  const scale = (def.body.length / length) * (def.model.scale || 1);
  holder.scale.setScalar(scale);
  holder.updateMatrixWorld(true);
  box.setFromObject(holder);
  const center = box.getCenter(new THREE.Vector3());
  holder.position.set(-center.x, -box.min.y, -center.z);
  holder.updateMatrixWorld(true);

  // Materials: reuse the game's paint, glass, rim and lamp materials so the
  // paint shop, window tint, rim colour and lighting all still work.
  holder.traverse((o) => {
    if (!o.isMesh) return;
    o.receiveShadow = false;
    const role = materialRole(o.material);
    if (role === 'paint') o.material = model.paintMat;
    else if (role === 'glass') o.material = model.glassMat;
    else if (role === 'rim') o.material = model.rimMat;
    else if (role === 'brake') o.material = model.tailMat;
    else if (role === 'head') o.material = model.headMat;
    else if (role === 'signal' && model.signalMats) o.material = model.signalMats.both;
    // Transparent glass must not cast an opaque shadow.
    o.castShadow = !o.material?.transparent && !(o.material?.transmission > 0);
  });

  // Hide every procedural part (body panels, lamps, wheels, stripes...).
  for (const child of model.body.children) child.visible = false;
  for (const wheel of model.wheels) wheel.pivot.visible = false;
  model.detailMeshes = [];

  // The real cabin is a handful of separate "Interior*" nodes. Group them so
  // the cockpit view can hide them instead of drawing two interiors at once.
  const interiorNodes = [];
  holder.traverse((o) => { if (/^interior/i.test(o.name || '')) interiorNodes.push(o); });
  if (interiorNodes.length) {
    const realInterior = new THREE.Group();
    holder.add(realInterior);
    for (const node of interiorNodes) {
      let p = node.parent;
      let nested = false;
      while (p && p !== holder) {
        if (/^interior/i.test(p.name || '')) { nested = true; break; }
        p = p.parent;
      }
      if (!nested) realInterior.attach(node);
    }
    model.interiorBlock = realInterior;
  }

  // Into the body group (so it leans with the suspension), then measure the
  // wheels in the car's own space.
  model.body.add(holder);
  model.root.updateMatrixWorld(true);

  // Wheels: new pivots at each real wheel's centre.
  const wheels = [];
  const wheelNodes = [];
  holder.traverse((o) => { if (WHEEL_RE.test(o.name || '')) wheelNodes.push(o); });

  // The source model ships its front wheels with a baked steering angle, so
  // they look turned at rest and spin about the wrong axis. Align each front
  // axle with the rear axle in world space; the roll (spoke angle) is kept.
  const axisX = new THREE.Vector3(1, 0, 0);
  const rearAxle = new THREE.Vector3();
  const axle = new THREE.Vector3();
  const worldQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const alignQ = new THREE.Quaternion();
  for (const node of wheelNodes) {
    if (!/rear/i.test(node.name)) continue;
    node.getWorldQuaternion(worldQ);
    rearAxle.copy(axisX).applyQuaternion(worldQ).normalize();
    break;
  }
  if (rearAxle.lengthSq() > 0) {
    for (const node of wheelNodes) {
      if (!/front/i.test(node.name)) continue;
      node.getWorldQuaternion(worldQ);
      axle.copy(axisX).applyQuaternion(worldQ).normalize();
      if (axle.distanceTo(rearAxle) < 0.01) continue;
      alignQ.setFromUnitVectors(axle, rearAxle);
      worldQ.premultiply(alignQ);
      node.parent.getWorldQuaternion(parentQ);
      node.quaternion.copy(parentQ.invert().multiply(worldQ));
      node.updateMatrixWorld(true);
    }
  }

  for (const node of wheelNodes) {
    box.setFromObject(node);
    const local = model.root.worldToLocal(box.getCenter(new THREE.Vector3()));
    const pivot = new THREE.Group();
    pivot.position.copy(local);
    model.root.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    pivot.updateMatrixWorld(true);
    spin.attach(node); // keeps the wheel exactly where it was
    const front = /front/i.test(node.name);
    const wheel = { pivot, spin, side: local.x >= 0 ? 1 : -1, front };
    wheels.push(wheel);
  }

  if (wheels.length === 4) {
    model.wheels = wheels;
    model.frontWheels = wheels.filter((w) => w.front);
  } else {
    // No named wheels: keep the procedural ones visible.
    for (const wheel of model.wheels) wheel.pivot.visible = true;
  }
  model.realModel = holder;
  model.onRealModel?.();
}
