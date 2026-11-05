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
import { SaveStore } from './save.js';
import { AuthService } from './auth.js';
import { CloudSync } from './cloudSync.js';
import { AIDriver, AI_NAMES } from './ai.js';
import {
  CARS, PAINTS, RANK_LABELS, getCar, defaultLook, normalizeLook, formatCredits,
} from './data/cars.js';
import { CIRCUITS, getCircuit } from './data/circuits.js';
import { getCareerEvent } from './data/career.js';
import { getDifficulty, getMode, computeRewards } from './economy.js';

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

const effects = new Effects(scene);
const input = new Input();
const audio = new AudioEngine();
const hud = new HUD();
const auth = new AuthService();

/* ───────────────────────── progression state ───────────────────────── */

let store = null;
let garage = null;
let garageCar = null;
let world = null;
let race = null;
let lastRaceConfig = null;
let state = 'boot';
let pausedFrom = 'racing';

const ui = new UI({
  onProfile: handleProfile,
  onSelectCar: selectCar,
  onPreviewCar: previewCar,
  onBuyCar: buyCar,
  onLookChange: changeLook,
  onRace: startRace,
  onEditDriver: () => {
    state = 'profile';
    garage?.setActive(false);
    ui.showProfile(store?.profile || null);
  },
  onOpenAccount: () => ui.openAccount(auth, store),
  onLogin: handleLogin,
  onRegister: handleRegister,
  onLogout: handleLogout,
  onSound: toggleSound,
  onPause: pauseGame,
  onCamera: toggleCamera,
  onResume: resumeGame,
  onRestart: () => startRace(lastRaceConfig),
  onQuit: enterGarage,
  onEndSession: () => endSession(),
  onAgain: () => startRace(lastRaceConfig),
});

/* ───────────────────────── saving / accounts ───────────────────────── */

const cloud = new CloudSync({
  auth,
  getStore: () => store,
  onImported: () => {
    ui.setAuthState(auth, store);
    if (state === 'garage') {
      ensureGarageCar();
      ui.renderGarage(store, auth);
    }
  },
});

function attachStore(next) {
  store = next;
  store.onChange = () => cloud.schedule();
  ui.setAuthState(auth, store);
  return store;
}

async function adoptAccount() {
  cloud.reset();
  const next = new SaveStore(`user-${auth.user.id}`);
  next.load();
  const remote = await auth.loadCloudSave();
  if (remote.ok) {
    const imported = cloud.apply(next, remote);
    if (!imported && !remote.save && !next.data.profile) {
      // First sign-in: carry the guest garage into the new account.
      const guest = new SaveStore('guest');
      guest.load();
      if (guest.data.profile) next.import(guest.data);
    }
  }
  // Only a successful read allows this session to write to the cloud.
  cloud.synced = remote.ok;
  if (!next.data.profile) next.createProfile(auth.user.username);
  attachStore(next);
  store.save();
  if (state === 'garage') {
    ensureGarageCar();
    ui.renderGarage(store, auth);
  } else if (state === 'profile') {
    ui.setAuthState(auth, store);
  }
  return { ok: true };
}

async function handleLogin(payload) {
  const result = await auth.login(payload);
  if (!result.ok) return result;
  return adoptAccount();
}

async function handleRegister(payload) {
  const result = await auth.register(payload);
  if (!result.ok) return result;
  return adoptAccount();
}

async function handleLogout() {
  // Flush a pending push so the last second of progress is not lost.
  await cloud.flush();
  cloud.reset();
  await auth.logout();
  const next = new SaveStore('guest');
  next.load();
  attachStore(next);
  ui.setAuthState(auth, store);
  if (state === 'garage') {
    ensureGarageCar();
    ui.renderGarage(store, auth);
  }
}

/* ───────────────────────── profile / garage ───────────────────────── */

function handleProfile(name) {
  if (!store) return;
  const wasGarage = state === 'garage';
  const oldPlate = (store.name || '').toUpperCase().slice(0, 9);
  store.createProfile(name);
  const newPlate = name.toUpperCase().slice(0, 9);
  for (const id of store.data.ownedCars) {
    const look = store.lookFor(id);
    if (!store.data.looks[id] || look.plate === oldPlate) {
      store.setLook(id, { ...look, plate: newPlate });
    }
  }
  if (wasGarage) enterGarage();
  else enterGarage();
}

function disposeGarageCar() {
  if (!garageCar) return;
  garageCar.root.removeFromParent();
  garageCar.dispose?.();
  garageCar = null;
}

function showStageCar(carId, look) {
  if (!garage) return;
  const car = getCar(carId);
  const nextLook = look || normalizeLook(car, {});
  if (garageCar && garageCar.def.id === car.id) {
    garageCar.applyLook(nextLook);
    return;
  }
  disposeGarageCar();
  garageCar = new CarModel(car, nextLook);
  garage.setCar(garageCar);
}

function ensureGarageCar() {
  if (!garage || !store) return;
  showStageCar(store.selectedCarId, store.lookFor(store.selectedCarId));
}

function enterGarage() {
  disposeRace();
  if (!store?.profile) {
    state = 'profile';
    ui.showProfile(null);
    return;
  }
  state = 'garage';
  ui.setRaceMode(false);
  webgl.classList.add('hidden');
  if (!garage) garage = new GarageScene(stageCanvas);
  garage.setActive(true);
  ensureGarageCar();
  ui.setMuted(audio.muted);
  ui.renderGarage(store, auth);
  ui.setGarageBest(store.bestLapFor(store.data.circuits[0]) || store.bestLapFor(world?.circuit.id));
}

function selectCar(carId) {
  if (!store) return;
  const result = store.selectCar(carId);
  if (!result.ok) {
    ui.notice(result.error, 'error');
    return;
  }
  ensureGarageCar();
  ui.renderGarage(store, auth);
  ui.notice(`${getCar(carId).name} equipped`, 'ok');
}

function previewCar(carId) {
  if (!store) return;
  const car = getCar(carId);
  ui.renderStage(carId);
  showStageCar(carId, ui.currentLook);
  if (!store.owns(carId)) {
    ui.notice(`${car.name} · ${formatCredits(car.price)} CR`, '');
  }
}

function buyCar(carId) {
  if (!store) return;
  const result = store.buyCar(carId);
  if (!result.ok) {
    ui.notice(result.error, 'error');
    return;
  }
  ensureGarageCar();
  ui.renderGarage(store, auth);
  ui.notice(`PURCHASED ${result.car.name}`, 'ok');
}

function changeLook(look) {
  if (!store) return;
  const carId = ui.stageCarId;
  if (!store.owns(carId)) return;
  const normalized = store.setLook(carId, look);
  ui.syncCustom(normalized);
  if (garageCar && garageCar.def.id === carId) garageCar.applyLook(normalized);
}

/* ───────────────────────── world ───────────────────────── */

function disposeWorld() {
  if (!world) return;
  world.scenery?.dispose?.();
  world.track?.dispose?.();
  world.env?.dispose?.();
  world = null;
}

function ensureWorld(circuit) {
  if (world?.circuit.id === circuit.id) return world;
  disposeWorld();
  const env = createEnvironment(scene, renderer, circuit.palette);
  const track = createTrack(scene, circuit);
  const scenery = populateScenery(scene, track, circuit);
  world = { circuit, env, track, scenery };
  return world;
}

/* ───────────────────────── race setup ───────────────────────── */

function resolveRaceConfig(config = {}) {
  const fallbackCircuit = CIRCUITS.find((c) => store.circuitUnlocked(c.id)) || CIRCUITS[0];
  const event = config.eventId ? getCareerEvent(config.eventId) : null;
  const modeId = config.mode || (event ? 'career' : 'quick');
  const mode = getMode(modeId);
  let circuitId = config.circuitId || event?.circuitId || store.data.circuits[0] || fallbackCircuit.id;
  if (!store.circuitUnlocked(circuitId)) circuitId = fallbackCircuit.id;
  const circuit = getCircuit(circuitId);
  const difficulty = getDifficulty(config.difficulty || event?.difficulty || 'normal');
  const solo = mode.id === 'time-trial' || mode.id === 'practice';
  const opponents = solo ? 0 : clamp(Math.round(config.opponents ?? event?.opponents ?? 3), 1, 7);
  const laps = solo ? (mode.id === 'practice' ? Infinity : 3) : (config.laps || event?.laps || circuit.laps || 3);
  return {
    mode: mode.id,
    modeLabel: mode.label,
    circuit,
    laps,
    difficulty,
    opponents,
    event: event || null,
    eventId: event?.id || null,
  };
}

function aiLook(def, index, seed) {
  const paint = PAINTS[(seed * 3 + index * 5 + 2) % PAINTS.length].hex;
  return normalizeLook(def, {
    ...defaultLook(def),
    paint,
    rim: PAINTS[(seed + index * 2) % PAINTS.length].hex,
    stripe: index % 3 === 0 ? 'twin' : 'none',
    stripeColor: PAINTS[(index * 3 + 4) % PAINTS.length].hex,
    spoiler: def.category === 'hyper' || def.category === 'super' ? 'big' : 'gt',
    plate: AI_NAMES[(seed + index) % AI_NAMES.length].replace(/[^A-Z]/g, '').slice(0, 7) || 'RIVAL',
  });
}

function pickAiCars(count, playerDef, seed) {
  // Rivals are the cars closest in price to the player's (so a hypercar races
  // supercars, not hatchbacks), shuffled by seed so every grid is different.
  const floor = 14000;
  const ref = Math.max(playerDef.price, floor);
  const gap = (car) => Math.abs(Math.log(Math.max(car.price, floor) / ref));
  const rivals = CARS.filter((car) => car.id !== playerDef.id).sort((a, b) => gap(a) - gap(b));
  // Stay within a 2.4x price band; a thin band repeats models in new liveries.
  let pool = rivals.filter((car) => gap(car) <= Math.log(2.4));
  if (pool.length < 3) pool = rivals.slice(0, 3);
  pool = pool.slice(0, count + 2);
  let state = (seed * 2654435761) >>> 0;
  const rnd = () => (state = (state * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, count);
  while (picked.length < count) picked.push(pool[picked.length % pool.length]);
  return picked;
}

function startRace(config = {}) {
  if (!store?.profile) {
    state = 'profile';
    ui.showProfile(store?.profile || null);
    return;
  }
  const setup = resolveRaceConfig({ ...lastRaceConfig, ...config });
  lastRaceConfig = { ...config, ...(config.eventId ? { eventId: config.eventId } : {}) };
  if (!lastRaceConfig.mode) lastRaceConfig.mode = setup.mode;
  if (!config.circuitId) lastRaceConfig.circuitId = setup.circuit.id;

  audio.init();
  audio.setProfile(store.selectedCar.category);
  const playerDef = store.selectedCar;
  const playerLook = store.lookFor(playerDef.id);

  disposeRace();
  const raceWorld = ensureWorld(setup.circuit);
  const track = raceWorld.track;
  hud.setTrack(track);
  track.update(0, 1);

  const totalRacers = setup.opponents + 1;
  const racers = [];

  const makeRacer = (car, options) => {
    const racer = {
      car,
      isPlayer: !!options.isPlayer,
      name: options.name,
      color: options.color,
      driver: options.driver || null,
      crossings: 0,
      prevDist: 0,
      finished: false,
      finishTime: null,
      bestLap: null,
      lastLapStart: 0,
      position: totalRacers,
    };
    racers.push(racer);
    car.isPlayer = !!options.isPlayer;
    if (options.isPlayer) {
      car.enableHeadlights();
    }
    return racer;
  };

  // Grid: AI fills the front and middle, the player starts at the back.
  const playerSlot = track.gridSlot(totalRacers - 1);
  const playerCar = new Car(scene, playerDef, playerLook);
  playerCar.reset(playerSlot.point, playerSlot.tangent);
  const player = makeRacer(playerCar, {
    isPlayer: true,
    name: store.name,
    color: playerLook.paint,
  });
  player.prevDist = playerSlot.dist;
  player.lastLapStart = 0;

  const seed = Math.floor(Math.random() * 1000);
  const aiDefs = pickAiCars(setup.opponents, playerDef, seed);
  for (let i = 0; i < setup.opponents; i++) {
    const def = aiDefs[i];
    const look = aiLook(def, i, seed);
    const car = new Car(scene, def, look);
    const slot = track.gridSlot(i);
    car.reset(slot.point, slot.tangent);
    const name = AI_NAMES[(seed + i * 3) % AI_NAMES.length];
    const driver = new AIDriver(car, track, setup.difficulty, seed + i * 7, name);
    const racer = makeRacer(car, {
      name,
      color: look.paint,
      driver,
    });
    racer.prevDist = slot.dist;
    racer.lastLapStart = 0;
    driver.input.car = car;
  }

  race = {
    mode: setup.mode,
    modeLabel: setup.modeLabel,
    circuit: setup.circuit,
    track,
    laps: setup.laps,
    difficulty: setup.difficulty,
    event: setup.event,
    eventId: setup.eventId,
    totalRacers,
    racers,
    player,
    ai: racers.filter((r) => r.driver),
    time: 0,
    countdown: 3,
    lastCount: 4,
    goTimer: 0,
    lapStart: 0,
    score: 0,
    driftTime: 0,
    driftBank: 0,
    wrongTime: 0,
    physicsAcc: 0,
    camMode: 0,
    shake: 0,
    impactCooldown: 0,
    mapAccum: 0,
    finishTimer: 0,
    finishOrbit: 0,
    resultsShown: false,
    result: null,
    contactCooldown: 0,
    nextGate: 1,
  };

  effects.reset();
  effects.setCar(playerCar);

  garage?.setActive(false);
  webgl.classList.remove('hidden');
  ui.show(null);
  ui.setRaceMode(true);
  ui.setHudVisible(true);

  state = 'countdown';
  race.countdown = 3;
  race.lastCount = 4;

  hud.setDriver(store.name, setup.mode === 'career' ? setup.event?.name || 'CAREER' : setup.modeLabel);
  hud.setLap(1, race.laps, race.mode === 'practice');
  hud.setLapTime(0);
  hud.setBest(store.bestLapFor(setup.circuit.id));
  hud.setPosition(totalRacers, totalRacers);
  hud.setScore(0);
  hud.setSpeed(0, 'N', playerCar.maxSpeedKmh);
  hud.setRpm(0.06);
  hud.setDamage(0);
  hud.setBoost(playerCar.boost);
  hud.setDrift(false);
  hud.setWrongWay(false);
  hud.clearCountdown();
  hud.countdown('3');
  input.releaseAll();
  snapCamera();

  audio.beep('count');
}

function disposeRace() {
  if (!race) {
    effects.setCar(null);
    return;
  }
  effects.setCar(null);
  for (const racer of race.racers) racer.car.dispose();
  race = null;
  input.releaseAll();
  hud.clearCountdown();
  hud.setWrongWay(false);
  hud.setDrift(false);
}

/* ───────────────────────── race simulation ───────────────────────── */

const camLook = new THREE.Vector3();
const desired = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
let cameraInit = false;

function snapCamera() {
  if (!race) return;
  const car = race.player.car;
  const f = car.forward;
  camera.position.copy(car.pos).addScaledVector(f, -9.2);
  camera.position.y = 3.4;
  camLook.copy(car.pos).addScaledVector(f, 6).setY(1.15);
  camera.lookAt(camLook);
  camera.fov = 62;
  camera.updateProjectionMatrix();
  cameraInit = true;
}

function toggleCamera() {
  if (!race) return;
  race.camMode = (race.camMode + 1) % 2;
  camera.near = race.camMode === 1 ? 0.05 : 0.1;
  camera.updateProjectionMatrix();
}

function progressOf(racer) {
  const dist = racer.car.trackInfo?.dist ?? racer.prevDist ?? 0;
  return racer.crossings * race.track.length + dist;
}

function standings() {
  return [...race.racers].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return progressOf(b) - progressOf(a);
  });
}

function updatePositions() {
  const ordered = standings();
  ordered.forEach((racer, index) => { racer.position = index + 1; });
  return ordered;
}

function onCross(racer) {
  racer.crossings += 1;
  const player = racer.isPlayer;

  if (!player) {
    if (racer.crossings > race.laps && !racer.finished) {
      racer.finished = true;
      racer.finishTime = race.time;
    }
    return;
  }

  if (race.mode === 'practice') {
    // Free drive still times every flying lap so it is useful for learning.
    if (racer.crossings > 1) {
      const lapTime = race.time - race.lapStart;
      if (!racer.bestLap || lapTime < racer.bestLap) racer.bestLap = lapTime;
      const record = store.bestLapFor(race.circuit.id);
      hud.setBest(record ? Math.min(record, racer.bestLap) : racer.bestLap);
      hud.toast(racer.bestLap === lapTime ? 'SESSION BEST' : `LAP ${racer.crossings - 1}`, fmtTime(lapTime));
    }
    race.lapStart = race.time;
    return;
  }

  // First crossing is the actual start of lap 1 (the grid is behind the line).
  if (racer.crossings === 1) {
    race.lapStart = race.time;
    hud.setLap(1, race.laps);
    return;
  }

  const lapTime = race.time - race.lapStart;
  race.lapStart = race.time;
  if (!racer.bestLap || lapTime < racer.bestLap) racer.bestLap = lapTime;

  const previousRecord = store.bestLapFor(race.circuit.id);
  const isRecord = !previousRecord || lapTime < previousRecord;
  hud.setBest(isRecord ? lapTime : Math.min(previousRecord, racer.bestLap));
  audio.lap(isRecord);

  const completed = racer.crossings - 1;
  if (completed >= race.laps) {
    finishRace();
    return;
  }

  hud.toast(isRecord ? 'NEW BEST LAP' : `LAP ${completed} COMPLETE`, fmtTime(lapTime));
  hud.setLap(completed + 1, race.laps);
  race.player.car.boost = Math.min(100, race.player.car.boost + 18);
}

function trackCrossings() {
  const length = race.track.length;
  for (const racer of race.racers) {
    if (racer.finished) continue;
    const info = racer.car.trackInfo;
    if (!info) continue;
    const prev = racer.prevDist;
    const now = info.dist;
    const wrapped = prev > length * 0.65 && now < length * 0.35;
    if (wrapped) {
      const dot = racer.car.forward.x * info.tangent.x + racer.car.forward.z * info.tangent.z;
      if (dot > 0.2) onCross(racer);
    }
    racer.prevDist = now;
  }
}

function resolveCollisions() {
  const cars = race.racers.map((r) => r.car);
  const min = 2.35;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > min * min || d2 < 1e-6) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      const overlap = (min - d) * 0.5;
      a.pos.x -= nx * overlap;
      a.pos.z -= nz * overlap;
      b.pos.x += nx * overlap;
      b.pos.z += nz * overlap;
      const rel = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
      if (rel > 1.2) {
        const push = clamp(rel / 18, 0.06, 1);
        a.takeHit(push * 0.55, -nx, -nz);
        b.takeHit(push * 0.55, nx, nz);
        if (race.contactCooldown <= 0) {
          race.contactCooldown = 0.18;
          const mid = { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 };
          effects.burst(mid, push, 0xffb23d);
          if (a.isPlayer || b.isPlayer) {
            audio.crash(push);
            race.shake = Math.max(race.shake, push * 0.55);
          }
        }
      }
    }
  }
}

function checkGates() {
  const car = race.player.car;
  const gate = race.track.gates[race.nextGate ?? 1];
  if (!gate) return;
  const dx = car.pos.x - gate.point.x;
  const dz = car.pos.z - gate.point.z;
  if (dx * dx + dz * dz < 11 * 11) {
    race.track.flashGate(gate);
    if (race.nextGate !== 0) car.boost = Math.min(100, car.boost + 5);
    race.nextGate = (race.nextGate + 1) % race.track.gates.length;
    audio.checkpoint();
  }
}

function updatePads() {
  const car = race.player.car;
  for (const pad of race.track.pads) {
    if (race.time < pad.readyAt) continue;
    const dx = car.pos.x - pad.point.x;
    const dz = car.pos.z - pad.point.z;
    if (dx * dx + dz * dz < 3.4 * 3.4) {
      pad.readyAt = race.time + 4;
      car.boost = Math.min(100, car.boost + 38);
      car.vel.addScaledVector(car.forward, 4.5);
      race.shake = Math.max(race.shake, 0.22);
      audio.pickup();
      hud.toast('NITRO PICKUP', '+38 BOOST');
    }
  }
}

function updateDrift(dt) {
  if (!race) return;
  const car = race.player.car;
  if (car.drifting && !car.offroad && state === 'racing') {
    race.driftTime += dt;
    const combo = 1 + Math.min(4, race.driftTime * 0.5);
    race.driftBank += car.slip * Math.max(car.speed, 8) * dt * 1.35 * combo;
    hud.setDrift(true, combo, race.driftBank);
  } else {
    if (race.driftTime > 0.3 && race.driftBank > 15) race.score += Math.round(race.driftBank);
    race.driftTime = 0;
    race.driftBank = 0;
    hud.setDrift(false);
  }
}

function updateWrongWay(dt) {
  const car = race.player.car;
  if (!car.trackInfo) return;
  const dot = car.forward.x * car.trackInfo.tangent.x + car.forward.z * car.trackInfo.tangent.z;
  if (car.speed > 6 && dot < -0.2) race.wrongTime += dt;
  else race.wrongTime = 0;
  hud.setWrongWay(race.wrongTime > 0.9);
}

function finishRace() {
  if (!race || state === 'finished') return;
  const player = race.player;
  player.finished = true;
  player.finishTime = race.time;
  const ordered = updatePositions();
  const position = ordered.findIndex((r) => r.isPlayer) + 1;
  const bestLap = player.bestLap;
  const total = race.time;
  const score = race.score + Math.round(race.driftBank);

  state = 'finished';
  race.finishTimer = 1.7;
  race.finishOrbit = 0;
  race.resultsShown = false;
  player.car.boosting = false;
  input.releaseAll();
  hud.setDrift(false);
  audio.finish();

  const previousRecord = store.bestLapFor(race.circuit.id);
  const newLapRecord = race.mode !== 'practice'
    && bestLap != null && (!previousRecord || bestLap < previousRecord);
  const rankBefore = store.rank;
  const wasCleared = race.eventId ? store.data.career.completed.includes(race.eventId) : false;
  const eventCleared = race.event && position <= (race.event.targetPosition || 1);
  const firstClear = !!race.event && !wasCleared && eventCleared;
  const rewards = computeRewards({
    mode: race.mode,
    circuit: race.circuit,
    laps: race.laps,
    difficulty: race.difficulty.id,
    position,
    totalRacers: race.totalRacers,
    driftScore: score,
    newLapRecord,
    firstClear,
    eventCleared,
    eventReward: race.event?.reward || 0,
    firstWinBonus: race.event?.firstWinBonus || 0,
  });

  const outcome = store.completeRace({
    mode: race.mode,
    circuitId: race.circuit.id,
    position,
    totalRacers: race.totalRacers,
    totalTime: total,
    bestLap,
    laps: Number.isFinite(race.laps) ? race.laps : 0,
    driftScore: score,
    reward: rewards.total,
    difficulty: race.difficulty.id,
    eventId: race.eventId,
  });

  const rows = ordered.map((racer, index) => ({
    position: index + 1,
    name: racer.name,
    isPlayer: racer.isPlayer,
    color: racer.color,
    finished: racer.finished,
    time: racer.finished ? racer.finishTime : null,
  }));

  const unlocks = [...outcome.unlocks];
  if (store.rank > rankBefore) {
    unlocks.push({ kind: 'rank', name: `RANK UP · ${RANK_LABELS[store.rank].toUpperCase()}` });
    for (const car of CARS) {
      if (car.unlockRank === store.rank) unlocks.push({ kind: 'car', id: car.id, name: car.name });
    }
    for (const circuit of CIRCUITS) {
      if (circuit.unlockRank === store.rank && !unlocks.some((u) => u.id === circuit.id)) {
        unlocks.push({ kind: 'circuit', id: circuit.id, name: circuit.name });
      }
    }
  }

  race.result = {
    mode: race.mode,
    unlocks,
    event: race.event ? { name: race.event.name, cleared: !!eventCleared, objective: race.event.objective } : null,
    driver: store.name,
    total,
    best: bestLap,
    score,
    car: store.selectedCar.name,
    wallet: store.wallet,
    standings: rows,
    rewards,
    position,
  };

  setGarageBestLabel();
}

function showResults() {
  if (!race?.result || race.resultsShown) return;
  race.resultsShown = true;
  ui.setRaceMode(false);
  ui.renderResults(race.result);
}

function setGarageBestLabel() {
  if (!store) return;
  const circuit = race?.circuit || world?.circuit;
  if (circuit) ui.setGarageBest(store.bestLapFor(circuit.id));
}

function pauseGame() {
  if (state !== 'racing' && state !== 'countdown') return;
  pausedFrom = state;
  state = 'paused';
  ui.setPauseMode(race?.mode);
  ui.show('pause');
  ui.setTouchVisible(false);
  input.releaseAll();
  audio.idle();
}

function resumeGame() {
  if (state !== 'paused' || !race) return;
  state = pausedFrom;
  ui.show(null);
  ui.setRaceMode(true);
  ui.setTouchVisible(true);
}

/** Practice has no chequered flag: ending the session banks the drift score. */
function endSession() {
  if (state !== 'paused' || !race || race.mode !== 'practice') return;
  state = 'racing';
  ui.show(null);
  finishRace();
  // Skip the orbit shot: the player asked to leave.
  race.finishTimer = 0;
}

function resetCar() {
  if (!race || state !== 'racing') return;
  const car = race.player.car;
  const near = race.track.nearest(car.pos, car.trackInfo?.index);
  car.reset(near.point, near.tangent);
  race.physicsAcc = 0;
  race.shake = 0;
  race.nextGate = 1;
  race.player.prevDist = near.dist;
  audio.checkpoint();
  hud.toast('BACK ON TRACK');
}

/* ───────────────────────── camera ───────────────────────── */

function updateCamera(dt) {
  if (!race) return;
  const car = race.player.car;

  if (state === 'finished') {
    race.finishOrbit += dt * 0.32;
    const r = 11;
    camera.position.set(
      car.pos.x + Math.sin(race.finishOrbit + 0.8) * r,
      car.pos.y + 4.2,
      car.pos.z + Math.cos(race.finishOrbit + 0.8) * r,
    );
    camLook.set(car.pos.x, car.pos.y + 1, car.pos.z);
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 56, 2, dt);
    camera.updateProjectionMatrix();
    return;
  }

  const speedN = clamp(car.speed / car.maxSpeed, 0, 1);
  const f = car.forward;

  if (race.camMode === 1) {
    tmpVec.copy(car.pos).addScaledVector(f, 0.55);
    tmpVec.y = 1.16;
    camera.position.lerp(tmpVec, 1 - Math.exp(-25 * dt));
    camLook.copy(car.pos).addScaledVector(f, 24).setY(1.3);
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 68 + speedN * 12 + (car.boosting ? 4 : 0), 4, dt);
    camera.updateProjectionMatrix();
  } else {
    if (!cameraInit) snapCamera();
    const back = 8.4 + speedN * 2.4;
    desired.copy(car.pos).addScaledVector(f, -back);
    desired.y = 3.15 + speedN * 0.65;
    desired.addScaledVector(car.right, clamp(-car.lateral * 0.045, -1.1, 1.1));
    camera.position.lerp(desired, 1 - Math.exp(-4.6 * dt));
    if (camera.position.y < 1.2) camera.position.y = 1.2;

    tmpVec.copy(car.pos).addScaledVector(f, 6 + speedN * 4);
    tmpVec.y = 1.2;
    camLook.lerp(tmpVec, 1 - Math.exp(-8 * dt));
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 61 + speedN * 13 + (car.boosting ? 5 : 0), 3.2, dt);
    camera.updateProjectionMatrix();
  }

  if (race.shake > 0.002) {
    camera.position.x += (Math.random() - 0.5) * race.shake * 0.65;
    camera.position.y += (Math.random() - 0.5) * race.shake * 0.5;
    camera.lookAt(camLook);
    race.shake *= Math.exp(-5.5 * dt);
  }
}

/* ───────────────────────── chrome ───────────────────────── */

function toggleSound() {
  if (!audio.ready) audio.init();
  const muted = audio.toggleMuted();
  ui.setMuted(muted);
  if (store) {
    store.data.settings.muted = muted;
    store.save();
  }
}

function updateHud(dt) {
  if (!race) return;
  const car = race.player.car;
  const freeDrive = race.mode === 'practice';

  hud.setLapTime(race.time - (race.player.crossings === 0 ? 0 : race.lapStart));
  hud.setSpeed(car.speedKmh, car.gear, car.maxSpeedKmh);
  const gear = car.gear;
  const ratio = gear === 'N' || gear === 'R'
    ? 0.06
    : clamp((car.speed % (car.maxSpeed / 6)) / (car.maxSpeed / 6), 0, 1);
  hud.setRpm(ratio);
  hud.setDamage(car.damage);
  hud.setBoost(car.boost);
  hud.setScore(race.score + Math.round(race.driftBank));
  if (!freeDrive) {
    const displayLap = clamp(race.player.crossings || 1, 1, race.laps);
    hud.setLap(displayLap, race.laps);
  }
  hud.setPosition(race.player.position, race.totalRacers);

  race.mapAccum += dt;
  if (race.mapAccum > 1 / 40) {
    race.mapAccum = 0;
    const dots = race.racers.map((r) => ({
      pos: r.car.pos,
      isPlayer: r.isPlayer,
      color: r.color,
    }));
    hud.drawMap(car, dots, race.nextGate ?? 1, race.time);
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

  if (!race) return;

  if (state === 'paused') {
    audio.idle();
    composer.render();
    return;
  }

  if (state === 'countdown') {
    race.countdown -= dt;
    const n = Math.ceil(race.countdown);
    if (n !== race.lastCount && n > 0) {
      race.lastCount = n;
      hud.countdown(String(n));
      audio.beep('count');
    }
    if (race.countdown <= 0) {
      state = 'racing';
      race.time = 0;
      race.lapStart = 0;
      hud.countdown('GO!', true);
      audio.beep('go');
      race.goTimer = 0.9;
    }
    hud.setBoost(race.player.car.boost);
    hud.setDamage(race.player.car.damage);
    hud.drawMap(race.player.car, race.racers.map((r) => ({ pos: r.car.pos, isPlayer: r.isPlayer, color: r.color })), 1, 0);
  }

  if (state === 'racing') {
    race.time += dt;
    if (race.goTimer > 0) {
      race.goTimer -= dt;
      if (race.goTimer <= 0) hud.clearCountdown();
    }
    race.contactCooldown -= dt;
    race.impactCooldown -= dt;

    race.physicsAcc += dt;
    let steps = 0;
    while (race.physicsAcc >= FIXED && steps < 32 && state === 'racing') {
      const playerInput = {
        gas: input.gas,
        brake: input.brake,
        steer: input.steer,
        handbrake: input.handbrake,
        boost: input.boost,
      };
      race.player.car.update(FIXED, playerInput, race.track);
      for (const racer of race.ai) {
        const aiInput = racer.driver.update(FIXED, race.racers.map((r) => r.car));
        racer.car.update(FIXED, aiInput, race.track);
      }
      resolveCollisions();
      trackCrossings();
      race.physicsAcc -= FIXED;
      steps++;
    }
    if (steps === 32) race.physicsAcc = 0;
    if (state !== 'racing') {
      // finishRace() flipped the state mid-step.
    } else {
      checkGates();
      updatePads();
      updateDrift(dt);
      updateWrongWay(dt);
      updatePositions();

      const car = race.player.car;
      if (car.impact > 0.22 && race.impactCooldown <= 0) {
        audio.crash(car.impact);
        race.shake = Math.max(race.shake, car.impact * 0.9);
        race.impactCooldown = 0.55;
      }
      car.impact *= Math.exp(-4.5 * dt);

      updateHud(dt);

      audio.update({
        speed: car.speed,
        maxSpeed: car.maxSpeed,
        throttle: input.gas,
        slip: car.slip,
        handbrake: input.handbrake,
        boosting: car.boosting,
      });
      if (car.boosting) race.shake = Math.max(race.shake, 0.06);
    }
  } else if (state === 'finished') {
    race.finishTimer -= dt;
    if (race.finishTimer <= 0 && !race.resultsShown) showResults();
    audio.idle();
    updateHud(dt);
  }

  // Keep the sun shadow centred on the action.
  if (world) {
    world.env.sun.position.copy(race.player.car.pos).addScaledVector(world.env.sunDir, 130);
    world.env.sun.target.position.copy(race.player.car.pos);
    world.env.sun.target.updateMatrixWorld();
  }

  effects.update(dt);
  race.track.update(dt, race.nextGate ?? 1);
  updateCamera(dt);
  composer.render();
}

requestAnimationFrame(frame);

/* ───────────────────────── events / boot ───────────────────────── */

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

async function boot() {
  await auth.bootstrap();
  if (auth.isAccount) {
    // Returning session: the cloud copy wins if it is newer than this browser's.
    await adoptAccount();
  } else {
    const next = new SaveStore('guest');
    next.load();
    attachStore(next);
  }

  audio.setMuted(!!store.data.settings.muted);
  ui.setMuted(audio.muted);

  if (store.profile) enterGarage();
  else {
    state = 'profile';
    ui.showProfile(null);
  }

  setTimeout(() => document.getElementById('loader').classList.add('done'), 320);
}

boot();

window.__sunsetDrift = {
  get state() { return state; },
  get car() { return race?.player.car || null; },
  get race() { return race; },
  get store() { return store; },
  get auth() { return auth; },
  get lap() { return race ? clamp(race.player.crossings || 1, 1, race.laps) : 1; },
  get nextGate() { return race?.nextGate ?? 1; },
  get raceTime() { return race?.time ?? 0; },
  get track() { return world?.track || null; },
  get scene() { return scene; },
  get camera() { return camera; },
  get ui() { return ui; },
  startRace,
  enterGarage,
  save: () => store?.toJSON(),
  fmtTime,
};
