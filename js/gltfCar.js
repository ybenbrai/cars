// Realistic cars from glTF models. A car whose definition has
// `model: { url }` is first built procedurally (so it is never invisible),
// then the real model is loaded and swapped in:
//  - body parts go under the model's `body` group, so lean/pitch still work;
//  - each wheel is re-pivoted at its centre so spin and steering still work;
//  - paint, glass, rims and lights use the game's own materials, so the
//    paint shop, tint, rim colour and brake lights keep working.
// Expected node naming (see docs/CAR_ART_BRIEF.md): wheels named like
// "WheelFrontL", "WheelRearR"; materials named "Paint 1…", "Glass",
// "Rim…", "Brakelight", "Headlight", "Signallight".

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
  const name = String(mat?.name || '').toLowerCase();
  if (name.startsWith('paint 1')) return 'paint';
  if (name === 'glass' || name.includes('window')) return 'glass';
  if (name.startsWith('rim')) return 'rim';
  if (name.includes('brakelight') || name.includes('taillight')) return 'brake';
  if (name.includes('headlight')) return 'head';
  if (name.includes('signal')) return 'signal';
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

  // Materials: reuse the game's paint, glass, rim and lamp materials.
  holder.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = false;
    const role = materialRole(o.material);
    if (role === 'paint') o.material = model.paintMat;
    else if (role === 'glass') o.material = model.glassMat;
    else if (role === 'rim') o.material = model.rimMat;
    else if (role === 'brake') o.material = model.tailMat;
    else if (role === 'head') o.material = model.headMat;
    else if (role === 'signal' && model.signalMats) o.material = model.signalMats.left;
  });

  // Hide every procedural part (body panels, lamps, wheels, stripes...).
  for (const child of model.body.children) child.visible = false;
  for (const wheel of model.wheels) wheel.pivot.visible = false;
  model.detailMeshes = [];

  // Into the body group (so it leans with the suspension), then measure the
  // wheels in the car's own space.
  model.body.add(holder);
  model.root.updateMatrixWorld(true);

  // Wheels: new pivots at each real wheel's centre.
  const wheels = [];
  const wheelNodes = [];
  holder.traverse((o) => { if (WHEEL_RE.test(o.name || '')) wheelNodes.push(o); });
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
