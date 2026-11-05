// Local save store + progression. One save per browser / signed-in account.
//
// The save never contains credentials. Passwords only ever travel to the
// backend over HTTPS and are stored there as scrypt hashes.

import {
  CARS, RANK_LABELS, STARTING_MONEY, STORAGE_KEY, LEGACY_STORAGE_KEY, LEGACY_BEST_KEY,
  defaultLook, normalizeLook, getCar, rankForWins,
} from './data/cars.js';
import { CIRCUITS, getCircuit } from './data/circuits.js';
import { CAREER_EVENTS } from './data/career.js';

const SCHEMA = 2;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function blankSave(displayName = '') {
  const starter = CARS.find((c) => c.starter) || CARS[0];
  return {
    schema: SCHEMA,
    profile: displayName
      ? { name: displayName, createdAt: Date.now(), lastSeen: Date.now() }
      : null,
    wallet: STARTING_MONEY,
    ownedCars: [starter.id],
    selectedCarId: starter.id,
    looks: {
      [starter.id]: { ...defaultLook(starter), plate: (displayName || 'SUNSET').toUpperCase().slice(0, 9) },
    },
    career: {
      completed: [],       // event ids cleared at least once
      bestPositions: {},   // eventId -> best finishing position
    },
    circuits: ['sunset-coast'],
    records: {},           // circuitId -> { bestLap, bestTotal, bestTotals: { [laps]: time }, bestLaps: [] }
    history: [],           // recent races, newest first
    stats: {
      races: 0, wins: 0, podiums: 0, laps: 0,
      creditsEarned: 0, creditsSpent: 0, driftScore: 0, distanceKm: 0, sessions: 0,
    },
    settings: { muted: false, camera: 0 },
  };
}

function mergeSave(raw) {
  const base = blankSave();
  if (!raw || typeof raw !== 'object') return base;
  const save = { ...base, ...raw };
  save.profile = raw.profile && typeof raw.profile.name === 'string'
    ? { ...base.profile, ...raw.profile, name: raw.profile.name.slice(0, 14) }
    : null;
  save.wallet = Number.isFinite(raw.wallet) ? Math.max(0, Math.round(raw.wallet)) : base.wallet;
  save.ownedCars = Array.isArray(raw.ownedCars)
    ? [...new Set(raw.ownedCars.filter((id) => CARS.some((c) => c.id === id)))]
    : base.ownedCars;
  const starter = CARS.find((c) => c.starter) || CARS[0];
  if (!save.ownedCars.includes(starter.id)) save.ownedCars.unshift(starter.id);
  save.selectedCarId = save.ownedCars.includes(raw.selectedCarId) ? raw.selectedCarId : save.ownedCars[0];
  save.looks = {};
  for (const car of CARS) {
    if (raw.looks?.[car.id]) save.looks[car.id] = normalizeLook(car, raw.looks[car.id]);
  }
  if (!save.looks[save.selectedCarId]) save.looks[save.selectedCarId] = defaultLook(getCar(save.selectedCarId));
  save.career = {
    completed: Array.isArray(raw.career?.completed)
      ? raw.career.completed.filter((id) => CAREER_EVENTS.some((e) => e.id === id)) : [],
    bestPositions: raw.career?.bestPositions && typeof raw.career.bestPositions === 'object'
      ? raw.career.bestPositions : {},
  };
  save.circuits = Array.isArray(raw.circuits)
    ? [...new Set(raw.circuits.filter((id) => CIRCUITS.some((c) => c.id === id)))] : base.circuits;
  if (!save.circuits.includes('sunset-coast')) save.circuits.unshift('sunset-coast');
  save.records = {};
  if (raw.records && typeof raw.records === 'object') {
    for (const [id, rec] of Object.entries(raw.records)) {
      if (!CIRCUITS.some((c) => c.id === id) || !rec || typeof rec !== 'object') continue;
      const bestTotals = {};
      if (rec.bestTotals && typeof rec.bestTotals === 'object') {
        for (const [laps, time] of Object.entries(rec.bestTotals)) {
          if (Number.isFinite(time) && time > 0) bestTotals[laps] = time;
        }
      }
      save.records[id] = {
        bestLap: Number.isFinite(rec.bestLap) && rec.bestLap > 0 ? rec.bestLap : null,
        bestLaps: Array.isArray(rec.bestLaps) ? rec.bestLaps.filter((t) => Number.isFinite(t) && t > 0).slice(0, 10) : [],
        bestTotals,
        // Older builds stored one mixed-distance total (practice sessions
        // included), so only a total recorded per lap count is trusted.
        bestTotal: bestTotals[3] ?? null,
      };
    }
  }
  save.history = Array.isArray(raw.history) ? raw.history.slice(0, 40) : [];
  save.stats = { ...base.stats, ...(raw.stats || {}) };
  save.settings = { ...base.settings, ...(raw.settings || {}) };
  return save;
}

export class SaveStore {
  constructor(accountId = 'guest') {
    this.accountId = accountId;
    this.key = `${STORAGE_KEY}:${accountId}`;
    this.data = blankSave();
  }

  get keyFor() { return this.key; }

  load() {
    let raw = null;
    try {
      const current = localStorage.getItem(this.key);
      if (current) raw = JSON.parse(current);
      // First run of the upgrade: migrate the old single-profile save.
      if (!raw && this.accountId === 'guest') raw = this.migrateLegacy();
    } catch { /* storage unavailable */ }
    this.data = mergeSave(raw);
    return this.data;
  }

  migrateLegacy() {
    try {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (!legacyRaw) return null;
      const legacy = JSON.parse(legacyRaw);
      if (!legacy?.name) return null;
      const save = blankSave(String(legacy.name).slice(0, 14));
      const oldCar = CARS.some((c) => c.id === legacy.carId) ? legacy.carId : save.selectedCarId;
      // The four original cars were all usable in v1.0.0; grant those the player used.
      if (legacy.carId && CARS.some((c) => c.id === legacy.carId)) {
        if (!save.ownedCars.includes(oldCar)) save.ownedCars.push(oldCar);
        save.selectedCarId = oldCar;
      }
      save.wallet = STARTING_MONEY;
      save.looks = {};
      for (const car of CARS) {
        if (legacy.looks?.[car.id]) save.looks[car.id] = normalizeLook(car, legacy.looks[car.id]);
      }
      save.looks[oldCar] = normalizeLook(getCar(oldCar), legacy.looks?.[oldCar] || {});
      const best = Number(localStorage.getItem(LEGACY_BEST_KEY)) || null;
      if (best) save.records['sunset-coast'] = { bestLap: best, bestTotal: null, bestLaps: [best] };
      return save;
    } catch {
      return null;
    }
  }

  save() {
    this.data.profile && (this.data.profile.lastSeen = Date.now());
    try {
      localStorage.setItem(this.key, JSON.stringify(this.data));
    } catch { /* storage may be full or blocked */ }
    this.onChange?.(this.data);
    return this.data;
  }

  reset() {
    this.data = blankSave(this.data.profile?.name || '');
    this.save();
    return this.data;
  }

  get profile() { return this.data.profile; }
  get name() { return this.data.profile?.name || 'DRIVER'; }
  get wallet() { return this.data.wallet; }
  get selectedCarId() { return this.data.selectedCarId; }
  get selectedCar() { return getCar(this.data.selectedCarId); }

  get rank() {
    return rankForWins(this.data.stats.wins, this.data.stats.races);
  }

  createProfile(name) {
    const clean = String(name).trim().replace(/[<>]/g, '').slice(0, 14) || 'DRIVER';
    if (!this.data.profile) {
      this.data.profile = { name: clean, createdAt: Date.now(), lastSeen: Date.now() };
    } else {
      this.data.profile.name = clean;
    }
    this.save();
    return this.data;
  }

  owns(carId) { return this.data.ownedCars.includes(carId); }

  selectCar(carId) {
    if (!this.owns(carId)) return { ok: false, error: 'You do not own this car.' };
    this.data.selectedCarId = carId;
    if (!this.data.looks[carId]) this.data.looks[carId] = defaultLook(getCar(carId));
    this.save();
    return { ok: true };
  }

  buyCar(carId) {
    const car = getCar(carId);
    if (this.owns(carId)) return { ok: false, error: 'Already in your garage.' };
    if (this.rank < (car.unlockRank || 0)) {
      return { ok: false, error: `Requires ${RANK_LABELS[car.unlockRank]} rank.` };
    }
    if (this.data.wallet < car.price) {
      return { ok: false, error: `Need ${(car.price - this.data.wallet).toLocaleString('en-US')} more credits.` };
    }
    this.data.wallet -= car.price;
    this.data.stats.creditsSpent += car.price;
    this.data.ownedCars.push(carId);
    this.data.selectedCarId = carId;
    this.data.looks[carId] = { ...defaultLook(car), plate: this.name.toUpperCase().slice(0, 9) };
    this.save();
    return { ok: true, car };
  }

  lookFor(carId) {
    const car = getCar(carId);
    return normalizeLook(car, this.data.looks[carId] || {});
  }

  setLook(carId, look) {
    const car = getCar(carId);
    this.data.looks[carId] = normalizeLook(car, look);
    this.save();
    return this.data.looks[carId];
  }

  unlockCircuit(circuitId) {
    if (!this.data.circuits.includes(circuitId)) {
      this.data.circuits.push(circuitId);
      this.save();
    }
  }

  circuitUnlocked(circuitId) {
    const circuit = getCircuit(circuitId);
    return !!circuit && (this.data.circuits.includes(circuitId) || this.rank >= (circuit.unlockRank || 0));
  }

  addCredits(amount, reason = 'race') {
    const value = Math.max(0, Math.round(amount));
    if (!value) return 0;
    this.data.wallet += value;
    this.data.stats.creditsEarned += value;
    this.data.history[0] && (this.data.history[0].reason = reason);
    this.save();
    return value;
  }

  recordLap(circuitId, lapTime) {
    const rec = this.data.records[circuitId] || { bestLap: null, bestTotal: null, bestLaps: [] };
    const previous = rec.bestLap;
    const isRecord = previous == null || lapTime < previous;
    if (isRecord) rec.bestLap = lapTime;
    rec.bestLaps = [...(rec.bestLaps || []), lapTime].sort((a, b) => a - b).slice(0, 10);
    this.data.records[circuitId] = rec;
    this.save();
    return { isRecord, previous };
  }

  completeRace(result) {
    const {
      mode, circuitId, position, totalRacers, totalTime, bestLap, laps,
      driftScore, reward, difficulty, eventId,
    } = result;
    const stats = this.data.stats;
    const unlocks = [];
    // Practice is free driving: it never counts toward rank, otherwise starting
    // and quitting sessions would farm progression.
    if (mode === 'practice') stats.sessions = (stats.sessions || 0) + 1;
    else stats.races += 1;
    stats.laps += laps || 0;
    stats.driftScore += Math.round(driftScore || 0);
    if (mode !== 'time-trial' && mode !== 'practice') {
      // A DNF has no position (null), which must not count as a podium.
      if (position === 1) stats.wins += 1;
      if (Number.isInteger(position) && position >= 1 && position <= 3) stats.podiums += 1;
    }
    if (mode === 'career' && eventId) {
      const target = CAREER_EVENTS.find((e) => e.id === eventId);
      const previousBest = this.data.career.bestPositions[eventId] ?? 99;
      this.data.career.bestPositions[eventId] = Math.min(previousBest, position || 99);
      if (target && position <= (target.targetPosition || 1) && !this.data.career.completed.includes(eventId)) {
        this.data.career.completed.push(eventId);
        // Clearing an event opens the circuit the next event is held on, even
        // before the driver's rank would unlock it.
        const next = CAREER_EVENTS[CAREER_EVENTS.indexOf(target) + 1];
        if (next && !this.data.circuits.includes(next.circuitId)) {
          this.data.circuits.push(next.circuitId);
          unlocks.push({ kind: 'circuit', id: next.circuitId, name: getCircuit(next.circuitId).name });
        }
      }
    }
    // Practice is untimed free driving: it never sets circuit records (the
    // results screen also never pays a record bonus for it).
    if (bestLap && circuitId && mode !== 'practice') {
      const rec = this.data.records[circuitId] || { bestLap: null, bestTotal: null, bestLaps: [] };
      // Race totals are only comparable over the same distance, so they are
      // kept per lap count. `bestTotal` mirrors the standard 3-lap distance.
      if (totalTime && laps > 0) {
        const totals = rec.bestTotals && typeof rec.bestTotals === 'object' ? rec.bestTotals : {};
        if (totals[laps] == null || totalTime < totals[laps]) totals[laps] = totalTime;
        rec.bestTotals = totals;
        rec.bestTotal = totals[3] ?? null;
      }
      if (rec.bestLap == null || bestLap < rec.bestLap) rec.bestLap = bestLap;
      rec.bestLaps = [...(rec.bestLaps || []), bestLap].sort((a, b) => a - b).slice(0, 10);
      this.data.records[circuitId] = rec;
    }
    if (totalTime && mode !== 'practice') stats.distanceKm += (totalTime * 0.04);

    this.data.history.unshift({
      at: Date.now(), mode, circuitId, position, totalRacers,
      totalTime, bestLap, difficulty, reward, eventId: eventId || null,
    });
    this.data.history = this.data.history.slice(0, 40);
    if (reward) {
      this.data.wallet += reward;
      stats.creditsEarned += reward;
    }
    this.save();
    return { data: this.data, unlocks };
  }

  careerEventState(event) {
    const completed = this.data.career.completed.includes(event.id);
    const previous = CAREER_EVENTS[CAREER_EVENTS.findIndex((e) => e.id === event.id) - 1];
    const prevDone = !previous || this.data.career.completed.includes(previous.id);
    const rankOk = this.rank >= (event.rank || 0);
    const circuitOk = this.circuitUnlocked(event.circuitId);
    return {
      completed,
      locked: (!prevDone || !rankOk || !circuitOk) && !completed,
      reason: !prevDone ? 'Finish the previous event' : !rankOk ? `${RANK_LABELS[event.rank]} rank required` : !circuitOk ? 'Circuit locked' : '',
      bestPosition: this.data.career.bestPositions[event.id] ?? null,
    };
  }

  bestLapFor(circuitId) {
    return this.data.records[circuitId]?.bestLap ?? null;
  }

  /** Best race time on a circuit over `laps` laps (3 by default). */
  bestTotalFor(circuitId, laps = 3) {
    return this.data.records[circuitId]?.bestTotals?.[laps] ?? null;
  }

  toJSON() { return clone(this.data); }

  import(raw) {
    this.data = mergeSave(raw);
    this.save();
    return this.data;
  }
}

export { STARTING_MONEY };
