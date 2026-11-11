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
import { Input, keyLabel } from './input.js';
import { AudioEngine } from './audio.js';
import { HUD, fmtTime } from './hud.js';
import { UI } from './ui.js';
import { SaveStore } from './save.js';
import { AuthService } from './auth.js';
import { CloudSync } from './cloudSync.js';
import { OnlineClient, RemoteTrack, FLAG_BOOST, FLAG_DRIFT, FLAG_BRAKE } from './online.js';
import { AI_NAMES, createAiDriver } from './ai.js';
import { upgradeValue } from './data/upgrades.js';
import { Cockpit } from './cockpit.js';
import { QualityManager } from './quality.js';
import { TurnSignals } from './signals.js';
import { dailyChallenge, tierFor } from './daily.js';
import { normalizeConditions, conditionsKey, paletteFor, RAIN_GRIP } from './conditions.js';
import { Rain } from './rain.js';
import { PhotoMode } from './photoMode.js';
import { Tutorial } from './tutorial.js';
import {
  GhostRecorder, GhostCar, loadGhost, saveGhostIfFaster,
} from './ghost.js';
import {
  CARS, PAINTS, RANK_LABELS, getCar, defaultLook, normalizeLook, formatCredits,
} from './data/cars.js';
import { CIRCUITS, getCircuit } from './data/circuits.js';
import { getCareerEvent } from './data/career.js';
import { getDifficulty, getMode, computeRewards } from './economy.js';
import { bodyCircles, deepestContact } from './collisionMath.js';

const FIXED = 1 / 120;
// Release id stamped on module URLs by the build (`?v=…`); "dev" locally.
const BUILD = new URL(import.meta.url).searchParams.get('v') || 'dev';
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// Rivals farther than this from the camera hide their small parts.
const LOD_DISTANCE_SQ = 50 * 50;
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
// The cockpit view clips the car's own bodywork inside the cabin (cockpit.js).
renderer.localClippingEnabled = true;
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
// Graphics quality (AUTO steps down on slow devices; see quality.js).
const quality = new QualityManager({ renderer, composer, bloom, scene, dpr });
const photo = new PhotoMode(camera, renderer.domElement);

const effects = new Effects(scene);
const input = new Input();
const portrait = window.matchMedia('(orientation: portrait)');
const audio = new AudioEngine();
const hud = new HUD();
const auth = new AuthService();
const online = new OnlineClient();

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
  onBuyUpgrade: buyUpgrade,
  onSellCar: sellCar,
  onRemap: (action) => input.captureNext((code) => {
    if (code && store) {
      store.data.settings.keys = { ...(store.data.settings.keys || {}), [action]: code };
      store.save();
      input.setBindings(store.data.settings.keys);
      ui.notice(`${action.toUpperCase()} → ${keyLabel(code)}`, 'ok');
    }
    ui.renderProfile();
  }),
  onResetKeys: () => {
    if (!store) return;
    store.data.settings.keys = {};
    store.save();
    input.setBindings({});
    ui.renderProfile();
  },
  onSetting: changeSetting,
  onLookChange: changeLook,
  onRace: (config) => safeStartRace(config),
  onEditDriver: () => {
    state = 'profile';
    audio.setMusic(true);
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
  onPhoto: enterPhoto,
  onPhotoSave: () => photo.requestShot(),
  onPhotoExit: exitPhoto,
  onRestart: () => (race?.online ? backToOnlineLobby() : safeStartRace(lastRaceConfig, { chargeRental: false })),
  onQuit: () => {
    leaveOnlineRace();
    enterGarage();
  },
  onEndSession: () => endSession(),
  onAgain: () => (race?.online ? backToOnlineLobby() : safeStartRace(lastRaceConfig, { chargeRental: false })),
  onOnline: (action, payload) => handleOnline(action, payload),
});

function backToOnlineLobby() {
  leaveOnlineRace();
  enterGarage();
  ui.setTab('online');
}

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
  quality.setMode(store.data.settings.quality || 'auto');
  audio.setVolumes(store.data.settings.volume ?? 1, store.data.settings.musicVolume ?? 1);
  input.setBindings(store.data.settings.keys);
  store.onChange = () => {
    cloud.schedule();
    syncOnlineCar();
  };
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
  if (ui.tab === 'online') handleOnline('connect');
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
  online.disconnect();
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
    audio.setMusic(true);
    ui.showProfile(null);
    return;
  }
  state = 'garage';
  audio.setMusic(true);
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
  announceAchievements();
}

/** Award any achievements now met and toast them (garage actions). */
function announceAchievements(ctx = {}) {
  if (!store) return;
  const earned = store.awardAchievements(ctx);
  for (const a of earned) ui.notice(`ACHIEVEMENT · ${a.name} · +${formatCredits(a.reward)} CR`, 'ok');
  if (earned.length && state === 'garage') ui.renderGarage(store, auth);
}

function sellCar(carId) {
  if (!store) return;
  const result = store.sellCar(carId);
  if (!result.ok) {
    ui.notice(result.error, 'error');
    return;
  }
  ensureGarageCar();
  ui.renderGarage(store, auth);
  ui.notice(`SOLD ${result.car.name} · +${formatCredits(result.value)} CR`, 'ok');
}

function changeSetting(key, value) {
  if (!store) return;
  if (key === 'quality') {
    store.data.settings.quality = value;
    quality.setMode(value);
  } else if (key === 'volume' || key === 'musicVolume') {
    store.data.settings[key] = Number(value) / 100;
    audio.setVolumes(store.data.settings.volume ?? 1, store.data.settings.musicVolume ?? 1);
  } else if (key === 'signals') {
    store.data.settings.signals = value !== 'off';
    if (value === 'off' && race) {
      race.player.car.model.setSignal(null, false);
      race.player.car.model.cockpit?.setSignal(null, false);
    }
  }
  store.save();
  ui.renderSettings();
}

function buyUpgrade(carId, partId) {
  if (!store) return;
  const result = store.buyUpgrade(carId, partId);
  if (!result.ok) {
    ui.notice(result.error, 'error');
    return;
  }
  audio.uiClick?.();
  ui.refreshPerformance();
  ui.notice(`${result.part.name} · ${result.part.levels[result.level]} INSTALLED`, 'ok');
  announceAchievements();
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

function ensureWorld(circuit, conditions = normalizeConditions()) {
  const key = `${circuit.id}|${conditionsKey(conditions)}`;
  if (world?.key === key) return world;
  disposeWorld();
  // Night and rain re-tint the circuit's own palette (see conditions.js).
  const lit = { ...circuit, palette: paletteFor(circuit.palette, conditions) };
  const env = createEnvironment(scene, renderer, lit.palette);
  const track = createTrack(scene, lit);
  const scenery = populateScenery(scene, track, lit);
  world = { circuit, key, env, track, scenery };
  return world;
}

/* ───────────────────────── race setup ───────────────────────── */

function resolveRaceConfig(config = {}) {
  const fallbackCircuit = CIRCUITS.find((c) => !c.practiceOnly && store.circuitUnlocked(c.id)) || CIRCUITS[0];
  const event = config.eventId ? getCareerEvent(config.eventId) : null;
  const modeId = config.mode || (event ? 'career' : 'quick');
  const mode = getMode(modeId);
  let circuitId = config.circuitId || event?.circuitId || store.data.circuits[0] || fallbackCircuit.id;
  // Practice opens every circuit: locked ones are rented per session (see
  // `startRace`). Every other mode still requires the circuit to be unlocked
  // and cannot use a practice-only venue such as the test runway.
  const requested = getCircuit(circuitId);
  if (mode.id !== 'practice' && !config.dailyChallenge && (requested.practiceOnly || !store.circuitUnlocked(circuitId))) {
    circuitId = fallbackCircuit.id;
  }
  const circuit = getCircuit(circuitId);
  const difficulty = getDifficulty(config.difficulty || event?.difficulty || 'normal');
  const solo = mode.id === 'time-trial' || mode.id === 'practice';
  const opponents = solo ? 0 : clamp(Math.round(config.opponents ?? event?.opponents ?? 3), 1, 7);
  const laps = solo ? (mode.id === 'practice' ? Infinity : 3) : (config.laps || event?.laps || circuit.laps || 3);
  // Career and daily events run in their own (default) conditions.
  const conditions = normalizeConditions(event || config.dailyChallenge ? {} : config);
  return {
    mode: mode.id,
    modeLabel: mode.label,
    conditions,
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
    spoiler: defaultLook(def).spoiler,
    plate: AI_NAMES[(seed + index) % AI_NAMES.length].replace(/[^A-Z]/g, '').slice(0, 7) || 'RIVAL',
  });
}

function pickAiCars(count, playerDef, seed, investedValue = playerDef.price) {
  // Rivals are the cars closest in price to the player's (so a hypercar races
  // supercars, not hatchbacks), shuffled by seed so every grid is different.
  // Upgrades count toward that value, so a fully tuned hatch meets faster
  // rivals instead of walking away from stock ones.
  const floor = 14000;
  const ref = Math.max(investedValue, floor);
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

/**
 * Start a race from a menu button. A failure used to be silent ("nothing
 * happens"); now the player sees why and lands back in the garage.
 */
function safeStartRace(config, options) {
  try {
    startRace(config, options);
  } catch (error) {
    console.error('Could not start the race', error);
    try { disposeRace(); } catch { /* best effort */ }
    try { enterGarage(); } catch { /* best effort */ }
    ui.notice(`Could not start the race: ${error.message} (build ${BUILD})`, 'error', 9000);
  }
}

function startRace(config = {}, { chargeRental = true } = {}) {
  if (!store?.profile) {
    state = 'profile';
    audio.setMusic(true);
    ui.showProfile(store?.profile || null);
    return;
  }
  lockLandscape();
  // Daily challenge: today's circuit (even if locked) in today's loan car.
  const daily = config.daily === true ? dailyChallenge() : null;
  if (daily) config = { ...config, mode: 'time-trial', circuitId: daily.circuitId, dailyChallenge: daily };
  const setup = resolveRaceConfig({ ...lastRaceConfig, ...config });
  setup.daily = daily;
  lastRaceConfig = { ...config, ...(config.eventId ? { eventId: config.eventId } : {}) };
  if (!lastRaceConfig.mode) lastRaceConfig.mode = setup.mode;
  if (!config.circuitId) lastRaceConfig.circuitId = setup.circuit.id;

  // Joining a solo race leaves any online room.
  if (online.room) online.leaveRoom();

  const playerDef = daily ? getCar(daily.carId) : store.selectedCar;
  const playerLook = daily
    ? normalizeLook(playerDef, { plate: store.name.toUpperCase().slice(0, 9) })
    : store.lookFor(playerDef.id);
  const seed = Math.floor(Math.random() * 1000);
  const playerUpgrades = daily ? null : store.upgradesFor(playerDef.id);
  const aiDefs = pickAiCars(
    setup.opponents, playerDef, seed, playerDef.price + upgradeValue(playerDef, playerUpgrades),
  );
  // Grid: AI fills the front and middle, the player starts at the back.
  const entrants = [{
    def: playerDef, look: playerLook, upgrades: playerUpgrades, name: store.name, slot: setup.opponents, isPlayer: true,
  }];
  for (let i = 0; i < setup.opponents; i++) {
    const def = aiDefs[i];
    entrants.push({
      def,
      look: aiLook(def, i, seed),
      name: AI_NAMES[(seed + i * 3) % AI_NAMES.length],
      slot: i,
      driverSeed: seed + i * 7,
    });
  }

  // Practice rents a circuit the player has not unlocked. The fee is charged
  // once per session: restarting or driving again reuses the same rental.
  let rental = null;
  let paidFee = 0;
  if (chargeRental) {
    const payment = setup.mode === 'practice'
      ? store.payPracticeFee(setup.circuit.id)
      : { ok: true, fee: 0 };
    if (!payment.ok) {
      ui.notice(payment.error, 'error');
      return;
    }
    paidFee = payment.fee;
    if (paidFee) {
      rental = { circuitId: setup.circuit.id, circuit: setup.circuit.name, fee: paidFee };
    }
  } else {
    // A restart or "drive again" keeps the rental bought for this session.
    rental = race?.rental || null;
  }

  try {
    launchRace(setup, entrants, { rental });
  } catch (error) {
    if (paidFee) store.refundPracticeFee(paidFee);
    throw error;
  }

  // Phones play sideways. If the device is still upright, pause under the
  // rotate hint so the race does not run on unseen.
  if (input.touchCapable && portrait.matches) pauseGame();
}

/** Best-effort fullscreen + landscape lock on touch devices. */
function lockLandscape() {
  if (!input.touchCapable) return;
  const lock = () => {
    try {
      screen.orientation?.lock?.('landscape')?.catch?.(() => {});
    } catch {
      // Not supported (notably iOS Safari); the rotate hint handles it.
    }
  };
  try {
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) {
      root.requestFullscreen({ navigationUI: 'hide' }).then(lock, lock);
    } else {
      lock();
    }
  } catch {
    lock();
  }
}

/**
 * Build the world, cars and race state for a set of entrants and start the
 * countdown. Entrants are the local player, AI drivers (`driverSeed`) or
 * remote online players (`remoteId`).
 */
function launchRace(setup, entrants, { countdown = 3, online: onlineState = null, rental = null } = {}) {
  const playerEntrant = entrants.find((e) => e.isPlayer);
  audio.init();
  audio.setMusic(false);
  audio.setProfile(playerEntrant.def.category);

  disposeRace();
  const raceWorld = ensureWorld(setup.circuit, setup.conditions);
  const track = raceWorld.track;
  hud.setTrack(track);
  // The track is reused between races: every bottle starts available.
  for (const pad of track.pads) {
    pad.readyAt = 0;
    pad.active = true;
  }
  track.update(0, 1);

  const totalRacers = entrants.length;
  const racers = [];
  let player = null;

  for (const entrant of entrants) {
    // Online entrants have no `upgrades`: every online race is stock vs stock.
    const car = new Car(scene, entrant.def, entrant.look, entrant.upgrades || null);
    const slot = track.gridSlot(entrant.slot);
    car.reset(slot.point, slot.tangent);
    car.isPlayer = !!entrant.isPlayer;
    const racer = {
      car,
      isPlayer: !!entrant.isPlayer,
      name: entrant.name,
      color: entrant.look.paint,
      driver: null,
      remote: null,
      crossings: 0,
      prevDist: slot.dist,
      finished: false,
      finishTime: null,
      bestLap: null,
      lastLapStart: 0,
      position: totalRacers,
    };
    if (setup.conditions?.weather === 'rain') {
      // Wet tarmac: every car on the grid loses the same grip and braking.
      car.grip *= RAIN_GRIP;
      car.brakeDecel *= RAIN_GRIP;
      car.launch *= RAIN_GRIP;
    }
    if (entrant.isPlayer) {
      car.enableHeadlights();
      car.driftAssist = true;
      car.canLock = true;
      player = racer;
    } else if (entrant.remoteId) {
      car.isRemote = true;
      racer.remote = {
        id: entrant.remoteId, track: new RemoteTrack(), crossings: 0, dist: slot.dist, left: false,
      };
    } else {
      // Same brakes as the player: the planner looks far enough ahead and
      // leans on its safety margin, so no hidden deceleration cheat is needed.
      racer.driver = createAiDriver(car, track, setup.difficulty, entrant.driverSeed, entrant.name);
    }
    racers.push(racer);
  }
  const playerCar = player.car;

  race = {
    mode: setup.mode,
    modeLabel: setup.modeLabel,
    circuit: setup.circuit,
    rental,
    track,
    laps: setup.laps,
    difficulty: setup.difficulty,
    event: setup.event,
    eventId: setup.eventId,
    totalRacers,
    racers,
    player,
    ai: racers.filter((r) => r.driver),
    remotes: racers.filter((r) => r.remote),
    online: onlineState,
    time: 0,
    countdown,
    lastCount: Math.ceil(countdown) + 1,
    launchRev: 0.06,
    launchClock: 0,
    lastGear: 'N',
    lastShiftAt: -1,
    goTimer: 0,
    lapStart: 0,
    score: 0,
    driftTime: 0,
    driftBank: 0,
    wrongTime: 0,
    physicsAcc: 0,
    camMode: savedCameraMode(),
    shake: 0,
    impactCooldown: 0,
    mapAccum: 0,
    finishTimer: 0,
    finishOrbit: 0,
    resultsShown: false,
    result: null,
    contactCooldown: 0,
    nextGate: 1,
    ghostRec: null,
    ghostCar: null,
    signals: new TurnSignals(),
    daily: setup.daily || null,
    conditions: setup.conditions || normalizeConditions(),
    rain: setup.conditions?.weather === 'rain' ? new Rain(scene) : null,
    // A brand-new driver's first race coaches the controls once.
    tutorial: !store.data.settings.tutorialDone && !onlineState
      && store.data.stats.races === 0 && !(store.data.stats.sessions > 0)
      ? new Tutorial(ui.touchCapable) : null,
  };
  ui.hideCoach();

  // Time Trial races your own best lap on this circuit as a see-through car.
  if (setup.mode === 'time-trial') {
    race.ghostRec = new GhostRecorder();
    const ghost = loadGhost(store.accountId, setup.circuit.id);
    if (ghost) setGhost(ghost);
  }

  effects.reset();
  effects.setCar(playerCar);
  // Rivals show nitro flames too, so you can see them use it.
  for (const racer of racers) if (!racer.isPlayer) effects.attachFlames(racer.car);

  hud.setRental(rental);

  garage?.setActive(false);
  webgl.classList.remove('hidden');
  ui.show(null);
  ui.setRaceMode(true);
  ui.setHudVisible(true);

  state = 'countdown';

  const label = setup.mode === 'career' ? setup.event?.name || 'CAREER' : setup.modeLabel;
  hud.setDriver(store.name, label);
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
  race.lastCount = Math.ceil(countdown);
  hud.countdown(String(race.lastCount));
  input.releaseAll();
  applyCameraNear();
  snapCamera();

  audio.beep('count');
}

function setGhost(ghost) {
  race.ghostCar?.dispose();
  const def = getCar(ghost.carId) || race.player.car.def;
  race.ghostCar = new GhostCar(scene, def, normalizeLook(def, { paint: ghost.paint }), ghost);
}

/** Record the player's lap for the ghost and replay the stored best lap. */
function updateGhost() {
  if (!race.ghostRec) return;
  const player = race.player;
  const onLap = player.crossings >= 1 && !player.finished;
  const lapTime = race.time - race.lapStart;
  if (onLap) race.ghostRec.sample(lapTime, player.car);
  race.ghostCar?.update(lapTime, onLap);
}

function disposeRace() {
  ui.hideCoach();
  if (!race) {
    effects.setCar(null);
    return;
  }
  effects.setCar(null);
  race.ghostCar?.dispose();
  race.rain?.dispose();
  for (const racer of race.racers) racer.car.dispose();
  race = null;
  input.releaseAll();
  hud.clearCountdown();
  hud.setWrongWay(false);
  hud.setDrift(false);
  hud.setRental(null);
}

/* ───────────────────────── race simulation ───────────────────────── */

const camLook = new THREE.Vector3();
const desired = new THREE.Vector3();
const tmpVec = new THREE.Vector3();
const tmpBack = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
let cameraInit = false;

function snapCamera() {
  if (!race) return;
  const car = race.player.car;
  const f = car.forward;
  const dir = input.lookBack ? tmpBack.set(-f.x, 0, -f.z) : f;
  const near = CAMERA_VIEWS[race.camMode]?.id === 'near';
  camera.position.copy(car.pos).addScaledVector(dir, near ? -5.5 : -9.2);
  camera.position.y = near ? 2.45 : 3.4;
  camLook.copy(car.pos).addScaledVector(dir, 6).setY(1.15);
  camera.lookAt(camLook);
  camera.fov = 62;
  camera.updateProjectionMatrix();
  cameraInit = true;
}

// Camera views, cycled with C (or the ◉ button). The choice is remembered.
const CAMERA_VIEWS = [
  { id: 'near', label: 'CHASE · NEAR' },
  { id: 'far', label: 'CHASE · FAR' },
  { id: 'bumper', label: 'BUMPER' },
  { id: 'cockpit', label: 'COCKPIT' },
];

function savedCameraMode() {
  const saved = Number(store?.data.settings.camera);
  return Number.isInteger(saved) && saved >= 0 && saved < CAMERA_VIEWS.length ? saved : 0;
}

function applyCameraNear() {
  const view = CAMERA_VIEWS[race.camMode].id;
  camera.near = view === 'bumper' || view === 'cockpit' ? 0.05 : 0.1;
  camera.updateProjectionMatrix();
}

function toggleCamera() {
  if (!race) return;
  race.camMode = (race.camMode + 1) % CAMERA_VIEWS.length;
  applyCameraNear();
  cameraInit = false;
  if (store) {
    store.data.settings.camera = race.camMode;
    store.save();
  }
  hud.toast('CAMERA', CAMERA_VIEWS[race.camMode].label);
}

function progressOf(racer) {
  if (racer.remote) return racer.remote.crossings * race.track.length + racer.remote.dist;
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
    // Same lap nitro bonus as the player gets.
    if (racer.crossings > 1) racer.car.boost = Math.min(100, racer.car.boost + 18);
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
    race.ghostRec?.start();
    return;
  }

  const lapTime = race.time - race.lapStart;
  race.lapStart = race.time;
  let ghostBeaten = false;
  if (race.ghostRec) {
    const lap = race.ghostRec.finish(lapTime, racer.car.def.id, racer.color);
    if (saveGhostIfFaster(store.accountId, race.circuit.id, lap)) {
      ghostBeaten = !!race.ghostCar;
      setGhost(lap);
    }
    race.ghostRec.start();
  }
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

  const lapTitle = isRecord ? 'NEW BEST LAP' : ghostBeaten ? 'GHOST BEATEN' : `LAP ${completed} COMPLETE`;
  hud.toast(lapTitle, fmtTime(lapTime));
  hud.setLap(completed + 1, race.laps);
  race.player.car.boost = Math.min(100, race.player.car.boost + 18);
}

function trackCrossings() {
  const length = race.track.length;
  for (const racer of race.racers) {
    if (racer.finished || racer.remote) continue;
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

// Scratch circle arrays: every pair is rebuilt because an earlier contact in
// the same step may already have moved one of the cars.
const contactA = [];
const contactB = [];

function resolveCollisions() {
  const cars = race.racers.map((r) => r.car);
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      // Remote cars are driven by their owners' snapshots: they push the
      // local car but are never moved by it here.
      if (a.isRemote && b.isRemote) continue;
      // Three circles down each body beat the old single centre circle: a
      // long car's nose can no longer sink into the car ahead, while cars
      // running side by side are not shoved apart before their panels touch.
      const hit = deepestContact(bodyCircles(a, contactA), bodyCircles(b, contactB));
      if (!hit) continue;
      const { nx, nz, penetration } = hit;
      const shareA = a.isRemote ? 0 : b.isRemote ? 1 : 0.5;
      const shareB = 1 - shareA;
      a.pos.x -= nx * penetration * shareA;
      a.pos.z -= nz * penetration * shareA;
      b.pos.x += nx * penetration * shareB;
      b.pos.z += nz * penetration * shareB;
      const rel = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
      if (rel > 1.2) {
        const push = clamp(rel / 18, 0.06, 1);
        if (!a.isRemote) a.takeHit(push * (b.isRemote ? 0.8 : 0.55), -nx, -nz);
        if (!b.isRemote) b.takeHit(push * (a.isRemote ? 0.8 : 0.55), nx, nz);
        if (race.contactCooldown <= 0) {
          race.contactCooldown = 0.18;
          const mid = { x: hit.x, z: hit.z };
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
  const player = race.player.car;
  for (const pad of race.track.pads) {
    pad.active = race.time >= pad.readyAt;
    if (!pad.active) continue;
    // Everyone racing locally can grab a bottle (online rivals are simulated
    // on their own screens, so they are skipped here).
    for (const racer of race.racers) {
      if (racer.remote || racer.finished) continue;
      const car = racer.car;
      const dx = car.pos.x - pad.point.x;
      const dz = car.pos.z - pad.point.z;
      // A bottle is ~0.6 m wide; touching it with any part of the car counts.
      if (dx * dx + dz * dz >= 2.0 * 2.0) continue;
      pad.readyAt = race.time + 4;
      pad.active = false;
      car.boost = Math.min(100, car.boost + 34);
      car.vel.addScaledVector(car.forward, 3);
      effects.burst({ x: pad.point.x, z: pad.point.z }, 0.5, 0x5ce1e6);
      if (car === player) {
        race.shake = Math.max(race.shake, 0.18);
        audio.pickup();
        hud.toast('NITRO', '+34 BOOST');
      }
      break;
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
  finishTutorial();
  if (race.online) {
    finishOnlineRace();
    return;
  }
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
      if (circuit.practiceOnly) continue;
      if (circuit.unlockRank === store.rank && !unlocks.some((u) => u.id === circuit.id)) {
        unlocks.push({ kind: 'circuit', id: circuit.id, name: circuit.name });
      }
    }
  }

  if (race.daily) {
    const tier = tierFor(race.daily, bestLap);
    const paid = store.recordDaily(race.daily, bestLap, tier);
    if (paid.payout) {
      unlocks.push({
        kind: 'daily',
        name: `DAILY ${race.daily.targets[paid.tier].label} · +${formatCredits(paid.payout)} CR`,
      });
    }
  }

  // Achievements: stats-based ones plus how this race was run.
  for (const a of store.awardAchievements({
    mode: race.mode, position, totalRacers: race.totalRacers, conditions: race.conditions,
  })) {
    unlocks.push({ kind: 'achievement', name: `${a.name} · +${formatCredits(a.reward)} CR` });
  }

  race.result = {
    mode: race.mode,
    unlocks,
    rental: race.rental,
    event: race.event ? { name: race.event.name, cleared: !!eventCleared, objective: race.event.objective } : null,
    driver: store.name,
    total,
    best: bestLap,
    score,
    car: race.player.car.def.name,
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

/** Is the track turning noticeably in the next ~70 m? */
function cornerAhead(car, track) {
  const info = car.trackInfo;
  if (!info) return false;
  const a = track.sampleAt(info.dist + 15).tangent;
  const b = track.sampleAt(info.dist + 70).tangent;
  return a.x * b.x + a.z * b.z < 0.93;
}

function updateTutorial(dt) {
  const car = race.player.car;
  const tip = race.tutorial.update(dt, {
    time: race.time,
    speedKmh: car.speedKmh,
    braking: car.braking,
    drifting: car.drifting,
    boosting: car.boosting,
    boost: car.boost,
    cornerAhead: cornerAhead(car, race.track),
  });
  if (tip?.text) ui.showCoach(tip.text, tip.step, tip.total);
  else if (tip?.hide) ui.hideCoach();
  if (race.tutorial.finished) finishTutorial();
}

function finishTutorial() {
  if (!race?.tutorial) return;
  race.tutorial = null;
  ui.hideCoach();
  store.data.settings.tutorialDone = true;
  store.save();
}

/** Photo mode: the race stays frozen while a free camera orbits the car. */
function enterPhoto() {
  if (state !== 'paused' || !race) return;
  state = 'photo';
  ui.show(null);
  ui.setHudVisible(false);
  ui.setTouchVisible(false);
  ui.setPhotoBar(true);
  race.player.car.model.cockpit?.update(0, 0, false);
  photo.enter(race.player.car);
}

function exitPhoto() {
  if (state !== 'photo') return;
  photo.exit();
  ui.setPhotoBar(false);
  ui.setHudVisible(true);
  state = 'paused';
  ui.show('pause');
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
  // Follow the smoothly drawn car, not the raw 120 Hz physics position.
  const cpos = car.renderPos;

  if (state === 'finished') {
    race.finishOrbit += dt * 0.32;
    const r = 11;
    camera.position.set(
      cpos.x + Math.sin(race.finishOrbit + 0.8) * r,
      cpos.y + 4.2,
      cpos.z + Math.cos(race.finishOrbit + 0.8) * r,
    );
    camLook.set(cpos.x, cpos.y + 1, cpos.z);
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 56, 2, dt);
    camera.updateProjectionMatrix();
    car.model.cockpit?.update(dt, 0, false);
    return;
  }

  const speedN = clamp(car.speed / car.maxSpeed, 0, 1);
  const f = car.renderForward;
  // Hold B to swing the view around and look back down the road. The camera
  // keeps its normal chase spring, just on the other side of the car.
  const dir = input.lookBack ? tmpBack.set(-f.x, 0, -f.z) : f;

  const view = CAMERA_VIEWS[race.camMode]?.id || 'near';
  if (view === 'bumper') {
    // Low and just ahead of the nose: the fastest-feeling view.
    tmpVec.copy(cpos).addScaledVector(f, car.def.body.length / 2 + 0.15);
    tmpVec.y = 0.62;
    camera.position.copy(tmpVec);
    camLook.copy(cpos).addScaledVector(dir, 30).setY(0.9);
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 72 + speedN * 12 + (car.boosting ? 5 : 0), 4, dt);
    camera.updateProjectionMatrix();
  } else if (view === 'cockpit') {
    // Sit in the driver's seat: the interior is built once per race car the
    // first time this view is used, and leans with the body.
    const cockpit = car.model.cockpit || (car.model.cockpit = new Cockpit(car.def, car.model));
    cockpit.eyeWorld(tmpVec);
    camera.position.copy(tmpVec);
    camLook.copy(tmpVec).addScaledVector(dir, 24);
    camLook.y = tmpVec.y - 2.4; // a few degrees down: road, wheel and hands
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 68 + speedN * 12 + (car.boosting ? 4 : 0), 4, dt);
    camera.updateProjectionMatrix();
  } else {
    const near = view === 'near';
    if (!cameraInit) snapCamera();
    // The near view sits at half the far view's distance, lower down.
    const back = near ? 5.1 + speedN * 0.6 + car.def.body.length * 0.1 : 8.4 + speedN * 2.4;
    desired.copy(cpos).addScaledVector(dir, -back);
    desired.y = near ? 2.45 + speedN * 0.2 : 3.15 + speedN * 0.65;
    desired.addScaledVector(tmpRight.set(-f.z, 0, f.x), clamp(-car.lateral * 0.045, -1.1, 1.1));
    // A soft spring trails the car by roughly speed / rate metres; the near
    // view follows much more tightly so it really stays close.
    camera.position.lerp(desired, 1 - Math.exp(-(near ? 14 : 4.6) * dt));
    if (camera.position.y < 1.2) camera.position.y = 1.2;

    // The near view aims lower so the car sits above the speedometer.
    tmpVec.copy(cpos).addScaledVector(dir, near ? 2.6 + speedN * 3.4 : 6 + speedN * 4);
    tmpVec.y = near ? 0.05 : 1.2;
    camLook.lerp(tmpVec, 1 - Math.exp(-8 * dt));
    camera.lookAt(camLook);
    camera.fov = damp(camera.fov, 61 + speedN * 13 + (car.boosting ? 5 : 0), 3.2, dt);
    camera.updateProjectionMatrix();
  }

  // Gear changes send the cockpit's right hand to the shifter.
  // (Own field: race.lastGear belongs to the HUD's shift flash.)
  const gearNow = Number(car.gear);
  if (car.model.cockpit && Number.isFinite(gearNow) && Number.isFinite(race.cockpitGear) && gearNow !== race.cockpitGear) {
    car.model.cockpit.shift(gearNow > race.cockpitGear ? 1 : -1);
  }
  race.cockpitGear = gearNow;
  car.model.cockpit?.update(dt, car.steer, view === 'cockpit' && !input.lookBack);
  if (car.model.cockpit?.root.visible) {
    car.model.cockpit.updateGauges(car);
    // The mirror costs an extra (small) render; skip it on LOW quality.
    if (quality.current.id !== 'low') car.model.cockpit.renderMirror(renderer, scene);
  }

  if (race.shake > 0.002) {
    // Smooth, fast wobble rather than a new random offset every frame: a
    // per-frame random jump reads as the whole picture vibrating.
    const t = performance.now() / 1000;
    camera.position.x += (Math.sin(t * 31) * 0.6 + Math.sin(t * 17.3) * 0.4) * race.shake * 0.32;
    camera.position.y += (Math.sin(t * 27.1 + 1) * 0.6 + Math.sin(t * 13.7) * 0.4) * race.shake * 0.25;
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
  const rpm = car.rpmRatio;
  const limiter = state === 'racing' && car.revLimiter;
  hud.setRpm(rpm, limiter);

  // Gearbox feel: a tach/gear flash and a mechanical clack on every shift.
  if (car.gear !== race.lastGear) {
    const gearNumber = (gear) => (gear === 'R' ? -1 : gear === 'N' ? 0 : Number(gear) || 0);
    const up = gearNumber(car.gear) > gearNumber(race.lastGear);
    if (car.gear !== 'R' && race.time - race.lastShiftAt > 0.22) {
      race.lastShiftAt = race.time;
      hud.flashShift(car.gear);
      audio.shift(up);
    }
    race.lastGear = car.gear;
  }

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

  if (state === 'photo') {
    photo.update();
    composer.render();
    if (photo.captureIfRequested(renderer.domElement)) {
      ui.notice('PHOTO SAVED', 'ok');
      announceAchievements({ photo: true });
    }
    return;
  }

  if (state === 'paused') {
    // Online races do not stop for one player: rivals keep moving and this
    // car keeps reporting its (stationary) position.
    if (race.online) {
      if (race.remotes.length) updateRemotes(dt, now);
      if (!race.player.finished) online.sendState(race.player.car, race.player.crossings, now);
    }
    audio.idle();
    composer.render();
    return;
  }

  if (race.remotes.length) updateRemotes(dt, now);
  if (race.online && !race.player.finished && (state === 'countdown' || state === 'racing')) {
    online.sendState(race.player.car, race.player.crossings, now);
  }

  if (state === 'countdown') {
    race.countdown -= dt;
    race.launchClock += dt;
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
      audio.releaseLaunch();
      race.goTimer = 0.9;
    }

    // Start-line launch control: hold throttle to build revs against the
    // limiter. The tach shivers and the engine stutters until the lights go out.
    const revving = input.gas && !input.brake;
    race.launchRev = damp(race.launchRev, revving ? 0.94 : 0.06, revving ? 6.5 : 9, dt);
    const shiver = revving ? Math.sin(race.launchClock * 54) * 0.02 : 0;
    const launchRpm = clamp(race.launchRev + shiver, 0, 1);
    hud.setRpm(launchRpm);
    audio.launch(launchRpm, revving, dt);

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
    // Draw every locally simulated car between its last two physics steps.
    const alpha = race.physicsAcc / FIXED;
    for (const racer of race.racers) if (!racer.remote) racer.car.interpolate(alpha);
    // Distant rivals drop their small parts (they are a few pixels wide).
    for (const racer of race.racers) {
      if (racer.isPlayer) continue;
      racer.car.model.setDetail(racer.car.renderPos.distanceToSquared(camera.position) < LOD_DISTANCE_SQ);
    }
    if (state !== 'racing') {
      // finishRace() flipped the state mid-step.
    } else {
      checkGates();
      updateGhost();
      updatePads();
      updateDrift(dt);
      updateWrongWay(dt);
      updatePositions();

      const car = race.player.car;
      if (car.impact > 0.22 && race.impactCooldown <= 0) {
        audio.crash(car.impact);
        race.shake = Math.max(race.shake, car.impact * 0.9);
        race.impactCooldown = 0.55;
        if (car.wallHit > 0.1) {
          // Sparks where the body met the barrier, not at the car's centre.
          const point = {
            x: car.pos.x + car.wallNormal.x * 1.1,
            z: car.pos.z + car.wallNormal.z * 1.1,
          };
          effects.burst(point, car.wallHit, 0xffc46b);
        }
      }
      car.impact *= Math.exp(-4.5 * dt);
      if (car.backfired) {
        car.backfired = false;
        audio.backfire();
      }

      updateHud(dt);

      const rpm = car.rpmRatio;
      const limiter = car.revLimiter;
      audio.update({
        speed: car.speed,
        maxSpeed: car.maxSpeed,
        gear: car.gear,
        rpm,
        limiter,
        throttle: input.gas,
        // Locked wheels screech like a slide.
        slip: car.locked ? Math.max(car.slip, 7) : car.slip,
        handbrake: input.handbrake || car.locked,
        boosting: car.boosting,
      }, dt);
      if (car.boosting) race.shake = Math.max(race.shake, 0.025);
    }
  } else if (state === 'finished') {
    race.finishTimer -= dt;
    if (race.finishTimer <= 0 && !race.resultsShown) showResults();
    audio.idle();
    updateHud(dt);
  }

  // Keep the sun shadow centred on the action and the sky dome overhead (the
  // test runway is long enough to drive out from under a fixed dome).
  if (world) {
    world.env.sun.position.copy(race.player.car.pos).addScaledVector(world.env.sunDir, 130);
    world.env.sun.target.position.copy(race.player.car.pos);
    world.env.sun.target.updateMatrixWorld();
    world.env.sky.position.copy(camera.position);
    world.env.sky.material.uniforms?.uCenter?.value.copy(camera.position);
  }

  effects.update(dt);
  race.rain?.update(dt, camera);
  race.track.update(dt, race.nextGate ?? 1);
  updateCamera(dt);
  composer.render();
  if (state === 'racing') {
    quality.sample(dt);
    if (race.tutorial) updateTutorial(dt);
    // Indicators blink three times when the player commits to a turn.
    if (store?.data.settings.signals !== false) {
      const car = race.player.car;
      const blink = race.signals.update(dt, car.steer);
      if (blink) {
        car.model.setSignal(blink.side, blink.on);
        car.model.cockpit?.setSignal(blink.side, blink.on);
        audio.tick(blink.on);
      }
    }
  }
}

requestAnimationFrame(frame);

/* ───────────────────────── online multiplayer ───────────────────────── */

// Rewards for an online race the player finished, kept outside `race` so
// they are still paid if the player leaves the results screen early.
let onlineRun = null;

function updateRemotes(dt, now) {
  for (const racer of race.remotes) {
    const sample = racer.remote.track.sample(now);
    if (!sample) continue;
    const car = racer.car;
    car.pos.set(sample.x, 0, sample.z);
    car.heading = sample.h;
    car.forward.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    car.right.set(-Math.cos(car.heading), 0, Math.sin(car.heading));
    car.speed = Math.abs(sample.s);
    car.vel.copy(car.forward).multiplyScalar(sample.s);
    car.boosting = !!(sample.f & FLAG_BOOST);
    car.drifting = !!(sample.f & FLAG_DRIFT);
    car.braking = !!(sample.f & FLAG_BRAKE);
    car.trackInfo = race.track.nearest(car.pos, car.trackInfo?.index);
    car.wheelSpin += (sample.s * dt) / car.def.body.wheelRadius;
    car.model.setSpin(car.wheelSpin);
    car.model.setBraking(car.braking);
    car.syncTransform();
    racer.remote.crossings = sample.c;
    racer.remote.dist = sample.d;
  }
}

function startOnlineRace(msg) {
  if (!store?.profile || !online.id) return;
  const me = msg.players.find((p) => p.id === online.id);
  if (!me) return;
  const circuit = getCircuit(msg.circuitId);
  const entrants = msg.players.map((p) => {
    const def = getCar(p.carId);
    const isPlayer = p.id === online.id;
    return {
      def,
      look: isPlayer ? store.lookFor(def.id) : normalizeLook(def, p.look || {}),
      name: isPlayer ? store.name : p.name,
      slot: p.grid,
      isPlayer,
      remoteId: isPlayer ? null : p.id,
    };
  });
  const setup = {
    mode: 'online',
    modeLabel: 'ONLINE',
    circuit,
    laps: msg.laps,
    difficulty: getDifficulty('normal'),
    opponents: entrants.length - 1,
    event: null,
    eventId: null,
  };
  // Start on the server's beat: subtract half the measured round trip.
  const countdown = Math.max(1, (msg.startIn - online.rtt / 2) / 1000);
  onlineRun = null;
  ui.closeAccount?.();
  launchRace(setup, entrants, { countdown, online: { resolved: false } });
  hud.toast('ONLINE RACE', `${entrants.length} DRIVERS · ${msg.laps} LAPS`);
}

function finishOnlineRace() {
  const player = race.player;
  player.finished = true;
  player.finishTime = race.time;
  state = 'finished';
  race.finishTimer = 1.7;
  race.finishOrbit = 0;
  race.resultsShown = false;
  player.car.boosting = false;
  input.releaseAll();
  hud.setDrift(false);
  audio.finish();
  online.sendState(player.car, player.crossings, performance.now(), true);
  online.finish(player.bestLap);
  onlineRun = {
    circuit: race.circuit,
    laps: race.laps,
    bestLap: player.bestLap,
    totalTime: race.time,
    score: race.score + Math.round(race.driftBank),
    finished: true,
  };
  race.result = onlineResult(null);
}

/** Results-screen data: provisional until the server's results arrive. */
function onlineResult(final) {
  const ordered = updatePositions();
  const player = race.player;
  const standings = final
    ? final.results.map((r) => {
      const racer = r.id === online.id ? player : race.remotes.find((x) => x.remote.id === r.id);
      return {
        position: r.position,
        name: r.id === online.id ? store.name : r.name,
        isPlayer: r.id === online.id,
        color: racer?.color,
        finished: r.finished,
        time: r.finished ? r.timeMs / 1000 : null,
      };
    })
    : ordered.map((racer, index) => ({
      position: index + 1,
      name: racer.name,
      isPlayer: racer.isPlayer,
      color: racer.color,
      finished: racer.finished,
      time: racer.finished ? racer.finishTime : null,
    }));
  return {
    mode: 'online',
    unlocks: final?.unlocks || [],
    event: null,
    driver: store.name,
    // Final results use the server's clock so the total matches the standings.
    total: final
      ? (final.results.find((r) => r.id === online.id)?.timeMs ?? null) / 1000 || null
      : player.finished ? player.finishTime : null,
    best: player.bestLap,
    score: race.score + Math.round(race.driftBank),
    car: store.selectedCar.name,
    wallet: store.wallet,
    standings,
    rewards: final?.rewards || { total: 0, lines: [{ label: 'Waiting for the other drivers…', value: 0 }] },
    position: final?.position ?? player.position,
    pending: !final,
  };
}

function applyOnlineResults(msg) {
  const me = msg.results.find((r) => r.id === online.id);
  const liveRace = race?.online && !race.online.resolved ? race : null;
  if (!me || (!liveRace && !onlineRun)) return;
  if (liveRace) liveRace.online.resolved = true;

  // The finish grace period can end the race before this player finished.
  if (liveRace && !liveRace.player.finished) {
    state = 'finished';
    race.finishTimer = 0.8;
    race.resultsShown = false;
    input.releaseAll();
    hud.setDrift(false);
    onlineRun = {
      circuit: race.circuit, laps: race.laps, bestLap: race.player.bestLap,
      totalTime: null, score: race.score + Math.round(race.driftBank), finished: false,
    };
  }
  const run = onlineRun;
  onlineRun = null;
  if (!run) return;

  const finished = run.finished && me.finished;
  const position = finished ? me.position : null;
  const rankBefore = store.rank;
  const previousRecord = store.bestLapFor(run.circuit.id);
  const rewards = finished
    ? computeRewards({
      mode: 'online',
      circuit: run.circuit,
      laps: run.laps,
      difficulty: 'normal',
      position,
      totalRacers: msg.total,
      driftScore: run.score,
      newLapRecord: run.bestLap != null && (!previousRecord || run.bestLap < previousRecord),
    })
    : { total: 0, lines: [{ label: 'Did not finish', value: 0 }], position: null };
  store.completeRace({
    mode: 'online',
    circuitId: run.circuit.id,
    position,
    totalRacers: msg.total,
    totalTime: finished ? run.totalTime : null,
    bestLap: run.bestLap,
    laps: finished ? run.laps : 0,
    driftScore: run.score,
    reward: rewards.total,
    difficulty: 'normal',
    eventId: null,
  });
  const unlocks = [];
  if (store.rank > rankBefore) {
    unlocks.push({ kind: 'rank', name: `RANK UP · ${RANK_LABELS[store.rank].toUpperCase()}` });
  }

  if (liveRace && race === liveRace) {
    race.result = onlineResult({ ...msg, rewards, position, unlocks });
    if (race.resultsShown) ui.renderResults(race.result);
  } else {
    ui.notice(finished
      ? `Online race: P${position}/${msg.total} · +${rewards.total.toLocaleString('en-US')} CR`
      : 'Online race finished without you.', 'ok');
    if (state === 'garage') ui.renderGarage(store, auth);
  }
}

/** Leaving an online race before the flag counts as a forfeit. */
function leaveOnlineRace() {
  if (race?.online && !race.player.finished && !race.online.resolved) {
    online.forfeit();
    race.online.resolved = true;
  }
}

let lastOnlineCar = '';
/** Tell the lobby which car (and livery) this driver will race. */
function syncOnlineCar(force = false) {
  if (!store) return;
  // Cars are locked once a race starts; the server would refuse the change.
  if (online.room && online.room.state !== 'lobby') return;
  const look = store.lookFor(store.selectedCarId);
  const key = `${store.selectedCarId}:${JSON.stringify(look)}`;
  if (!force && key === lastOnlineCar) return;
  lastOnlineCar = key;
  online.setCar(store.selectedCarId, look);
}

async function handleOnline(action, payload = {}) {
  if (action === 'connect') {
    if (!auth.isAccount) {
      ui.renderOnline(online, auth, store);
      return;
    }
    syncOnlineCar(true);
    await online.connect();
    ui.renderOnline(online, auth, store);
    return;
  }
  if (!online.connected) {
    ui.notice('Not connected to the online lobby.', 'error');
    return;
  }
  if (action === 'quick') online.quickMatch();
  else if (action === 'create') online.createRoom(payload.circuitId, false);
  else if (action === 'join') online.joinRoom(payload.code);
  else if (action === 'leave') online.leaveRoom();
  else if (action === 'ready') online.setReady(payload.ready);
  else if (action === 'start') online.startRace();
  else if (action === 'config') online.configure(payload);
}

online.on('status', () => ui.renderOnline(online, auth, store));
online.on('room', () => ui.renderOnline(online, auth, store));
online.on('error', (message) => ui.notice(message, 'error'));
online.on('start', (msg) => startOnlineRace(msg));
online.on('state', (msg) => {
  const racer = race?.remotes.find((r) => r.remote.id === msg.id);
  racer?.remote.track.push(msg);
});
online.on('finished', (msg) => {
  const racer = race?.remotes.find((r) => r.remote.id === msg.id);
  if (!racer || racer.finished) return;
  racer.finished = true;
  racer.finishTime = msg.timeMs / 1000;
  if (state === 'racing') hud.toast(`${racer.name} FINISHED`, fmtTime(racer.finishTime));
});
online.on('grace', (msg) => {
  if (race?.online && !race.player.finished) {
    hud.toast('FINAL CALL', `${Math.round(msg.ms / 1000)}s TO FINISH`);
  }
});
online.on('left', (msg) => {
  if (!race) return;
  const racer = race.remotes.find((r) => r.remote.id === msg.id);
  if (!racer) return;
  racer.car.dispose();
  race.racers = race.racers.filter((r) => r !== racer);
  race.remotes = race.remotes.filter((r) => r !== racer);
  race.totalRacers = race.racers.length;
  if (state === 'racing') hud.toast(`${racer.name} LEFT`, '');
});
online.on('results', (msg) => applyOnlineResults(msg));

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

// Never fail silently: show unexpected errors (at most one every 5 s).
let lastErrorNotice = 0;
const reportError = (message) => {
  const now = Date.now();
  if (now - lastErrorNotice < 5000) return;
  lastErrorNotice = now;
  ui.notice(`Something went wrong: ${message} (build ${BUILD}). Try a hard refresh (Cmd/Ctrl+Shift+R).`, 'error', 9000);
};
window.addEventListener('error', (event) => reportError(event.message || 'unknown error'));
window.addEventListener('unhandledrejection', (event) => reportError(event.reason?.message || String(event.reason)));

document.addEventListener('visibilitychange', () => {
  if (document.hidden && (state === 'racing' || state === 'countdown')) pauseGame();
  // No menu music from a background tab.
  if (document.hidden) audio.setMusic(false);
  else if (state === 'garage' || state === 'profile') audio.setMusic(true);
});

// Browsers only allow audio after a user gesture: unlock it on the first one
// so the menu music can start.
const unlockAudio = () => {
  audio.init();
  window.removeEventListener('pointerdown', unlockAudio, true);
  window.removeEventListener('keydown', unlockAudio, true);
};
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);

input.onAction = (action) => {
  if (action === 'pause') {
    if (state === 'photo') exitPhoto();
    else if (state === 'paused') resumeGame();
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
  const tag = document.getElementById('buildTag');
  if (tag) tag.textContent = `BUILD ${BUILD.toUpperCase()}`;
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
    audio.setMusic(true);
    ui.showProfile(null);
  }

  setTimeout(() => document.getElementById('loader').classList.add('done'), 320);
}

// Turning the phone upright mid-race pauses it under the rotate hint; turning
// it back leaves the pause screen up so the player chooses when to resume.
portrait.addEventListener?.('change', (event) => {
  if (event.matches && input.touchCapable && (state === 'racing' || state === 'countdown')) {
    pauseGame();
  }
});

boot();

// Offline support (production only; dev servers serve fresh files anyway).
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

window.__sunsetDrift = {
  get state() { return state; },
  get car() { return race?.player.car || null; },
  get race() { return race; },
  get store() { return store; },
  get auth() { return auth; },
  get renderer() { return renderer; },
  get quality() { return quality; },
  get audio() { return audio; },
  build: BUILD,
  get lap() { return race ? clamp(race.player.crossings || 1, 1, race.laps) : 1; },
  get nextGate() { return race?.nextGate ?? 1; },
  get raceTime() { return race?.time ?? 0; },
  get track() { return world?.track || null; },
  get scene() { return scene; },
  get camera() { return camera; },
  get ui() { return ui; },
  get hud() { return hud; },
  startRace,
  enterGarage,
  save: () => store?.toJSON(),
  fmtTime,
};
