import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createTrack } from './track.js';
import { createEnvironment, populateScenery } from './scenery.js';
import { GarageScene } from './garageScene.js';
import { Car } from './car.js';
import { CarModel } from './carModel.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { HUD, fmtTime } from './hud.js';
import { UI } from './ui.js';
import {
  CARS, BEST_KEY, STORAGE_KEY, getCar, defaultLook, normalizeLook,
} from './data/cars.js';

const TOTAL_LAPS = 3;
const FIXED = 1 / 120;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
const dpr = Math.min(window.devicePixelRatio || 1, 2);

/* ───────────────────────── renderer / world ───────────────────────── */

const webgl = document.getElementById('webgl');
const stageCanvas = document.getElementById('stageCanvas');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.outputColorSpace = THREE.SRGBColorSpace;
webgl.appendChild(renderer.domElement);
webgl.classList.add('hidden');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1600);

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(dpr, 1.75));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.58, 0.55, 0.82);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const env = createEnvironment(scene, renderer);
const track = createTrack(scene);
const scenery = populateScenery(scene, track);
const effects = new Effects(scene);
const input = new Input();
const audio = new AudioEngine();
const hud = new HUD(track);

/* ───────────────────────── profile ───────────────────────── */

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.name !== 'string' || !parsed.name.trim()) return null;
    const carId = CARS.some((c) => c.id === parsed.carId) ? parsed.carId : CARS[0].id;
    const looks = {};
    for (const car of CARS) {
      if (parsed.looks && parsed.looks[car.id]) looks[car.id] = normalizeLook(car, parsed.looks[car.id]);
    }
    return { name: parsed.name.slice(0, 14), carId, looks };
  } catch {
    return null;
  }
}

function saveProfile() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch { /* storage may be unavailable */ }
}

let profile = loadProfile();
let bestLap = Number(localStorage.getItem(BEST_KEY)) || null;
let state = 'boot';
let garage = null;
let garageCar = null;

const ui = new UI(track, {
  onProfile: handleProfile,
  onSelectCar: selectCar,
  onLookChange: changeLook,
  onRace: startRace,
  onEditDriver: () => {
    state = 'profile';
    garage?.setActive(false);
    ui.showProfile(profile);
  },
  onSound: toggleSound,
  onPause: pauseGame,
  onCamera: toggleCamera,
  onResume: resumeGame,
  onRestart: startRace,
  onQuit: enterGarage,
  onAgain: startRace,
});

ui.setMuted(audio.muted);

/* ───────────────────────── garage ───────────────────────── */

function disposeModel(model) {
  model.root.traverse((obj) => {
    if (obj.isMesh) obj.geometry?.dispose();
  });
}

function ensureGarageCar() {
  if (!profile || !garage) return;
  const def = getCar(profile.carId);
  if (!profile.looks[def.id]) {
    profile.looks[def.id] = { ...defaultLook(def), plate: profile.name.toUpperCase().slice(0, 9) };
  }
  const look = normalizeLook(def, profile.looks[def.id]);
  profile.looks[def.id] = look;

  if (!garageCar || garageCar.def.id !== def.id) {
    const old = garageCar;
    garageCar = new CarModel(def, look);
    garage.setCar(garageCar);
    if (old) disposeModel(old);
  } else {
    garageCar.applyLook(look);
  }
  ui.currentLook = look;
  return { def, look };
}

function enterGarage() {
  if (!profile) {
    ui.showProfile(null);
    return;
  }
  state = 'garage';
  ui.setRaceMode(false);
  webgl.classList.add('hidden');
  if (!garage) {
    garage = new GarageScene(stageCanvas);
  }
  garage.setActive(true);
  ensureGarageCar();
  ui.setGarageBest(bestLap);
  ui.renderGarage(profile, bestLap);
  if (raceCar) {
    effects.setCar(null);
    raceCar.dispose();
    raceCar = null;
  }
}

function handleProfile(name) {
  const isNew = !profile;
  if (!profile) {
    profile = { name, carId: CARS[0].id, looks: {} };
    profile.looks[CARS[0].id] = { ...defaultLook(CARS[0]), plate: name.toUpperCase().slice(0, 9) };
  } else {
    const oldPlate = profile.name.toUpperCase().slice(0, 9);
    const newPlate = name.toUpperCase().slice(0, 9);
    profile.name = name;
    for (const look of Object.values(profile.looks)) {
      if (look && look.plate === oldPlate) look.plate = newPlate;
    }
  }
  saveProfile();
  if (isNew && garageCar) {
    disposeModel(garageCar);
    garageCar = null;
  }
  enterGarage();
}

function selectCar(carId) {
  if (!profile || profile.carId === carId) return;
  const car = getCar(carId);
  profile.carId = carId;
  if (!profile.looks[carId]) {
    profile.looks[carId] = { ...defaultLook(car), plate: profile.name.toUpperCase().slice(0, 9) };
  }
  saveProfile();
  ensureGarageCar();
  ui.renderGarage(profile, bestLap);
}

function changeLook(look) {
  if (!profile) return;
  const car = getCar(profile.carId);
  const normalized = normalizeLook(car, look);
  profile.looks[car.id] = normalized;
  saveProfile();
  if (garageCar && garageCar.def.id === car.id) garageCar.applyLook(normalized);
  ui.syncCustom(normalized);
}

/* ───────────────────────── race state ───────────────────────── */

let raceCar = null;
let physicsAcc = 0;
let raceTime = 0;
let lapStart = 0;
let lap = 1;
let nextGate = 1;
let totalScore = 0;
let driftTime = 0;
let driftBank = 0;
let wrongTime = 0;
let countdown = 0;
let lastCount = 4;
let goTimer = 0;
let camMode = 0;
let shake = 0;
let impactCooldown = 0;
let finishTimer = 0;
let finishOrbit = 0;
let resultsShown = false;
let pausedFrom = 'racing';
let mapAccum = 0;
let trackTime = 0;
let cameraInit = false;

const camLook = new THREE.Vector3();
const desired = new THREE.Vector3();
const tmpVec = new THREE.Vector3();

function toggleSound() {
  if (!audio.ready) audio.init();
  const muted = audio.toggleMuted();
  ui.setMuted(muted);
}

function toggleCamera() {
  if (!raceCar) return;
  camMode = (camMode + 1) % 2;
  if (camMode === 1) camera.near = 0.05;
  else camera.near = 0.1;
  camera.updateProjectionMatrix();
}

function snapCamera() {
  if (!raceCar) return;
  const f = raceCar.forward;
  camera.position.copy(raceCar.pos).addScaledVector(f, -9.2);
  camera.position.y = 3.4;
  camLook.copy(raceCar.pos).addScaledVector(f, 6).setY(1.15);
  camera.lookAt(camLook);
  camera.fov = 62;
  camera.updateProjectionMatrix();
  cameraInit = true;
}

function startRace() {
  if (!profile) {
    ui.showProfile(null);
    return;
  }
  audio.init();
  const def = getCar(profile.carId);
  if (!profile.looks[def.id]) {
    profile.looks[def.id] = { ...defaultLook(def), plate: profile.name.toUpperCase().slice(0, 9) };
  }
  const look = normalizeLook(def, profile.looks[def.id]);
  if (raceCar) {
    effects.setCar(null);
    raceCar.dispose();
  }
  raceCar = new Car(scene, def, look);
  effects.reset();
  effects.setCar(raceCar);
  raceCar.reset(track.startGrid.point, track.startGrid.tangent);

  garage?.setActive(false);
  webgl.classList.remove('hidden');
  ui.show(null);
  ui.setRaceMode(true);
  ui.setHudVisible(true);

  state = 'countdown';
  countdown = 3;
  lastCount = 4;
  goTimer = 0;
  raceTime = 0;
  lapStart = 0;
  lap = 1;
  nextGate = 1;
  totalScore = 0;
  driftTime = 0;
  driftBank = 0;
  wrongTime = 0;
  physicsAcc = 0;
  shake = 0;
  impactCooldown = 0;
  finishTimer = 0;
  finishOrbit = 0;
  resultsShown = false;
  camMode = 0;
  camera.near = 0.1;
  mapAccum = 0;
  trackTime = 0;

  hud.setDriver(profile.name);
  hud.setLap(1, TOTAL_LAPS);
  hud.setLapTime(0);
  hud.setBest(bestLap);
  hud.setScore(0);
  hud.setSpeed(0, 'N');
  hud.setBoost(raceCar.boost);
  hud.setDrift(false);
  hud.setWrongWay(false);
  hud.clearCountdown();
  input.releaseAll();
  snapCamera();
  hud.drawMap(raceCar, nextGate, 0);
}

function pauseGame() {
  if (state !== 'racing' && state !== 'countdown') return;
  pausedFrom = state;
  state = 'paused';
  ui.show('pause');
  ui.setTouchVisible(false);
  input.releaseAll();
  audio.idle();
}

function resumeGame() {
  if (state !== 'paused') return;
  state = pausedFrom;
  ui.show(null);
  ui.setRaceMode(true);
  ui.setTouchVisible(true);
}

function resetCar() {
  if (!raceCar || state !== 'racing') return;
  const near = track.nearest(raceCar.pos);
  raceCar.reset(near.point, near.tangent);
  physicsAcc = 0;
  shake = 0;
  audio.checkpoint();
  hud.toast('BACK ON TRACK');
}

function checkGates() {
  if (!raceCar) return;
  const gate = track.gates[nextGate];
  if (!gate) return;
  const dx = raceCar.pos.x - gate.point.x;
  const dz = raceCar.pos.z - gate.point.z;
  const radius = nextGate === 0 ? 12 : 11;
  if (dx * dx + dz * dz < radius * radius) {
    if (nextGate === 0) {
      completeLap();
    } else {
      nextGate = (nextGate + 1) % track.gates.length;
      track.flashGate(gate);
      raceCar.boost = Math.min(100, raceCar.boost + 5);
      audio.checkpoint();
    }
  }
}

function completeLap() {
  const lapTime = raceTime - lapStart;
  const isBest = bestLap == null || lapTime < bestLap;
  if (isBest) {
    bestLap = lapTime;
    try { localStorage.setItem(BEST_KEY, String(bestLap)); } catch { /* noop */ }
    ui.setGarageBest(bestLap);
  }
  hud.setBest(bestLap);
  audio.lap(isBest);

  if (lap >= TOTAL_LAPS) {
    finishRace();
    return;
  }

  hud.toast(isBest ? 'NEW BEST LAP' : `LAP ${lap} COMPLETE`, fmtTime(lapTime));
  lap += 1;
  lapStart = raceTime;
  nextGate = 1;
  hud.setLap(lap, TOTAL_LAPS);
  raceCar.boost = Math.min(100, raceCar.boost + 18);
}

function finishRace() {
  state = 'finished';
  finishTimer = 1.6;
  finishOrbit = 0;
  resultsShown = false;
  totalScore += Math.round(driftBank);
  driftBank = 0;
  driftTime = 0;
  hud.setDrift(false);
  raceCar.boosting = false;
  input.releaseAll();
  audio.finish();
}

function showResults() {
  resultsShown = true;
  ui.setRaceMode(false);
  ui.renderResults({
    driver: profile.name,
    total: raceTime,
    best: bestLap,
    score: totalScore,
    car: getCar(profile.carId).name,
  });
}

/* ───────────────────────── camera ───────────────────────── */

function updateCamera(dt) {
  if (!raceCar) return;

  if (state === 'finished') {
    finishOrbit += dt * 0.32;
    const r = 11;
    camera.position.set(
      raceCar.pos.x + Math.sin(finishOrbit + 0.8) * r,
      raceCar.pos.y + 4.2,
      raceCar.pos.z + Math.cos(finishOrbit + 0.8) * r,
    );
    camLook.set(raceCar.pos.x, raceCar.pos.y + 1, raceCar.pos.z);
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 56, 2, dt);
    camera.updateProjectionMatrix();
    return;
  }

  const speedN = clamp(raceCar.speed / raceCar.maxSpeed, 0, 1);
  const f = raceCar.forward;
  const speed = raceCar.speed;

  if (camMode === 1) {
    tmpVec.copy(raceCar.pos).addScaledVector(f, 0.55);
    tmpVec.y = 1.16;
    camera.position.lerp(tmpVec, 1 - Math.exp(-25 * dt));
    camLook.copy(raceCar.pos).addScaledVector(f, 24).setY(1.3);
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 68 + speedN * 12 + (raceCar.boosting ? 4 : 0), 4, dt);
    camera.updateProjectionMatrix();
  } else {
    const back = 8.4 + speedN * 2.4;
    desired.copy(raceCar.pos).addScaledVector(f, -back);
    desired.y = 3.15 + speedN * 0.65;
    desired.addScaledVector(raceCar.right, clamp(-raceCar.lateral * 0.045, -1.1, 1.1));
    camera.position.lerp(desired, 1 - Math.exp(-4.6 * dt));
    if (camera.position.y < 1.2) camera.position.y = 1.2;

    tmpVec.copy(raceCar.pos).addScaledVector(f, 6 + speedN * 4);
    tmpVec.y = 1.2;
    camLook.lerp(tmpVec, 1 - Math.exp(-8 * dt));
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 61 + speedN * 13 + (raceCar.boosting ? 5 : 0), 3.2, dt);
    camera.updateProjectionMatrix();
  }

  if (shake > 0.002) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.65;
    camera.position.y += (Math.random() - 0.5) * shake * 0.5;
    camera.lookAt(camLook);
    shake *= Math.exp(-5.5 * dt);
  }
}

/* ───────────────────────── gameplay step ───────────────────────── */

function updateDrift(dt) {
  if (!raceCar) return;
  const car = raceCar;
  if (car.drifting && !car.offroad && state === 'racing') {
    driftTime += dt;
    const combo = 1 + Math.min(4, driftTime * 0.5);
    driftBank += car.slip * Math.max(car.speed, 8) * dt * 1.35 * combo;
    hud.setDrift(true, combo, driftBank);
  } else {
    if (driftTime > 0.3 && driftBank > 15) {
      totalScore += Math.round(driftBank);
      if (driftBank > 550) {
        const combo = 1 + Math.min(4, driftTime * 0.5);
        hud.toast(`DRIFT +${Math.round(driftBank).toLocaleString('en-US')}`, `×${combo.toFixed(1)} CHAIN`);
      }
    }
    driftTime = 0;
    driftBank = 0;
    hud.setDrift(false);
  }
}

function updateWrongWay(dt) {
  if (!raceCar || !raceCar.trackInfo) return;
  const dot = raceCar.forward.x * raceCar.trackInfo.tangent.x + raceCar.forward.z * raceCar.trackInfo.tangent.z;
  if (raceCar.speed > 6 && dot < -0.2) wrongTime += dt;
  else wrongTime = 0;
  hud.setWrongWay(wrongTime > 0.9);
}

function updatePads() {
  for (const pad of track.pads) {
    if (raceTime < pad.readyAt) continue;
    const dx = raceCar.pos.x - pad.point.x;
    const dz = raceCar.pos.z - pad.point.z;
    if (dx * dx + dz * dz < 3.4 * 3.4) {
      pad.readyAt = raceTime + 4;
      raceCar.boost = Math.min(100, raceCar.boost + 38);
      raceCar.vel.addScaledVector(raceCar.forward, 4.5);
      shake = Math.max(shake, 0.22);
      audio.pickup();
      hud.toast('NITRO PICKUP', '+38 BOOST');
    }
  }
}

/* ───────────────────────── main loop ───────────────────────── */

let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.25);
  last = now;
  input.update();

  if (state === 'garage') {
    garage?.update(dt);
    return;
  }
  if (state === 'profile' || state === 'boot') return;

  trackTime += dt;

  if (state === 'countdown') {
    countdown -= dt;
    const n = Math.ceil(countdown);
    if (n !== lastCount && n > 0) {
      lastCount = n;
      hud.countdown(String(n));
      audio.beep('count');
    }
    if (countdown <= 0) {
      state = 'racing';
      raceTime = 0;
      lapStart = 0;
      hud.countdown('GO!', true);
      audio.beep('go');
      goTimer = 0.9;
    }
    hud.setBoost(raceCar.boost);
    hud.drawMap(raceCar, nextGate, raceTime);
  }

  if (state === 'racing') {
    raceTime += dt;
    if (goTimer > 0) {
      goTimer -= dt;
      if (goTimer <= 0) hud.clearCountdown();
    }

    physicsAcc += dt;
    let steps = 0;
    while (physicsAcc >= FIXED && steps < 32) {
      raceCar.update(FIXED, input, track);
      physicsAcc -= FIXED;
      steps++;
    }
    if (steps === 32) physicsAcc = 0;

    impactCooldown -= dt;
    if (raceCar.impact > 0.22 && impactCooldown <= 0) {
      audio.crash(raceCar.impact);
      shake = Math.max(shake, raceCar.impact * 0.9);
      impactCooldown = 0.55;
    }
    raceCar.impact *= Math.exp(-4.5 * dt);

    checkGates();
    updateDrift(dt);
    updateWrongWay(dt);
    updatePads();

    hud.setLapTime(raceTime - lapStart);
    hud.setSpeed(raceCar.speedKmh, raceCar.gear);
    hud.setBoost(raceCar.boost);
    hud.setScore(totalScore + Math.round(driftBank));
    hud.drawMap(raceCar, nextGate, raceTime);

    audio.update({
      speed: raceCar.speed,
      maxSpeed: raceCar.maxSpeed,
      throttle: input.gas,
      slip: raceCar.slip,
      handbrake: input.handbrake,
      boosting: raceCar.boosting,
    });

    if (raceCar.boosting) shake = Math.max(shake, 0.06);
  } else if (state === 'finished') {
    finishTimer -= dt;
    if (finishTimer <= 0 && !resultsShown) showResults();
    audio.idle();
  } else if (state === 'paused') {
    audio.idle();
  }

  if (state !== 'racing' && state !== 'countdown' && state !== 'paused' && state !== 'finished') return;

  // sun shadow follows the player
  if (raceCar) {
    env.sun.position.copy(raceCar.pos).addScaledVector(env.sunDir, 130);
    env.sun.target.position.copy(raceCar.pos);
    env.sun.target.updateMatrixWorld();
  }

  effects.update(dt);
  track.update(dt, nextGate, raceTime);
  updateCamera(dt);
  composer.render();

  if (state === 'racing') {
    mapAccum += dt;
    if (mapAccum > 1 / 30) {
      mapAccum = 0;
      hud.drawMap(raceCar, nextGate, raceTime);
    }
  }
}

/* ───────────────────────── chrome ───────────────────────── */

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  garage?.resize();
});

if (typeof ResizeObserver !== 'undefined') {
  new ResizeObserver(() => {
    if (state === 'garage') garage?.resize();
  }).observe(stageCanvas);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state === 'racing' || state === 'countdown')) pauseGame();
});

input.onAction = (action) => {
  if (action === 'pause') {
    if (state === 'paused') resumeGame();
    else pauseGame();
  } else if (action === 'camera') {
    if (state === 'racing' || state === 'countdown') toggleCamera();
  } else if (action === 'reset') {
    resetCar();
  } else if (action === 'mute') {
    toggleSound();
  }
};

hud.setDriver(profile?.name || 'DRIVER');
hud.setBest(bestLap);

/* boot */
if (profile) {
  enterGarage();
} else {
  state = 'profile';
  ui.showProfile(null);
}

requestAnimationFrame(frame);
setTimeout(() => {
  document.getElementById('loader').classList.add('done');
}, 420);

window.__sunsetDrift = {
  get state() { return state; },
  get car() { return raceCar; },
  get lap() { return lap; },
  get nextGate() { return nextGate; },
  get raceTime() { return raceTime; },
  track,
  scene,
  camera,
  startRace,
};
