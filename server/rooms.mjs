// Online race lobby: rooms, matchmaking and race flow.
//
// Transport-agnostic so it can be unit tested: every connection is an object
// with `{ id, userId, username, send(message), close(code, reason) }`.
//
// The server is the authority on who is in a room, when a race starts and the
// finishing order (ranked by when the server received each finish). Car
// positions are relayed between clients but not simulated here: this is a
// casual arcade racer and the bundled server stays dependency-free.

import { randomBytes } from 'node:crypto';

import { CARS, normalizeLook } from '../js/data/cars.js';
import { CIRCUITS } from '../js/data/circuits.js';

export const ROOM_SIZE = 6;
export const MAX_ROOMS = 500;
export const COUNTDOWN_MS = 4000;
export const FINISH_GRACE_MS = 45_000;
export const RACE_TIMEOUT_MS = 15 * 60_000;
export const STATE_RATE = 40; // max position updates per second per player
export const MAX_AVG_SPEED = 110; // m/s, sanity bound for finish times
const LAP_CHOICES = [2, 3, 4, 5];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I

const finite = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;

function makeCode(taken) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const bytes = randomBytes(5);
    let code = '';
    for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    if (!taken.has(code)) return code;
  }
  throw new Error('Could not allocate a room code.');
}

export class Lobby {
  /**
   * @param {{ now?: () => number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout }} [options]
   */
  constructor({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.rooms = new Map(); // code -> room
    this.players = new Map(); // conn.id -> player
  }

  /* ───────────────────────── connections ───────────────────────── */

  connect(conn) {
    // One live connection per account: a second tab replaces the first.
    for (const other of this.players.values()) {
      if (other.conn.userId === conn.userId) {
        this.disconnect(other.conn);
        other.conn.close(4000, 'Signed in from another tab.');
      }
    }
    const def = CARS.find((c) => c.starter) || CARS[0];
    const player = {
      conn,
      id: conn.id,
      name: conn.username,
      carId: def.id,
      look: normalizeLook(def, {}),
      room: null,
      ready: false,
      grid: 0,
      finished: false,
      finishMs: null,
      bestLap: null,
      forfeit: false,
      rate: { start: 0, count: 0 },
    };
    this.players.set(conn.id, player);
    conn.send({ type: 'welcome', id: conn.id, name: player.name, roomSize: ROOM_SIZE });
    return player;
  }

  disconnect(conn) {
    const player = this.players.get(conn.id);
    if (!player) return;
    this.leaveRoom(player);
    this.players.delete(conn.id);
  }

  /** Handle one parsed client message. Unknown or malformed input is ignored. */
  handle(conn, message) {
    const player = this.players.get(conn.id);
    if (!player || !message || typeof message !== 'object') return;
    switch (message.type) {
      case 'car': return this.setCar(player, message);
      case 'quick': return this.quickMatch(player);
      case 'create': return this.createRoom(player, { isPublic: !!message.public, circuitId: message.circuitId });
      case 'join': return this.joinByCode(player, message.code);
      case 'leave': return this.leaveRoom(player, true);
      case 'config': return this.configure(player, message);
      case 'ready': return this.setReady(player, !!message.ready);
      case 'start': return this.startRace(player);
      case 'state': return this.relayState(player, message);
      case 'finish': return this.finish(player, message);
      case 'forfeit': return this.forfeit(player);
      case 'ping': return conn.send({ type: 'pong', t: message.t });
      default: return undefined;
    }
  }

  error(player, message) {
    player.conn.send({ type: 'error', message });
  }

  /* ───────────────────────── rooms ───────────────────────── */

  setCar(player, { carId, look }) {
    const def = CARS.find((c) => c.id === carId);
    if (!def) return this.error(player, 'Unknown car.');
    if (player.room && player.room.state !== 'lobby') return this.error(player, 'Cars are locked once a race starts.');
    player.carId = def.id;
    player.look = normalizeLook(def, look && typeof look === 'object' ? look : {});
    if (player.room) this.broadcastRoom(player.room);
  }

  createRoom(player, { isPublic = false, circuitId } = {}) {
    if (this.rooms.size >= MAX_ROOMS) return this.error(player, 'The server is full. Try again soon.');
    this.leaveRoom(player);
    const circuit = CIRCUITS.find((c) => c.id === circuitId) || CIRCUITS[0];
    const room = {
      code: makeCode(this.rooms),
      isPublic,
      hostId: player.id,
      circuitId: circuit.id,
      laps: LAP_CHOICES.includes(circuit.laps) ? circuit.laps : 3,
      state: 'lobby',
      members: [],
      startedAt: 0,
      firstFinishAt: 0,
      timer: null,
      results: null,
    };
    this.rooms.set(room.code, room);
    this.addToRoom(room, player);
    return room;
  }

  joinByCode(player, rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return this.error(player, 'No room with that code.');
    if (player.room === room) return this.broadcastRoom(room);
    if (room.state !== 'lobby') return this.error(player, 'That race has already started.');
    if (room.members.length >= ROOM_SIZE) return this.error(player, 'That room is full.');
    this.leaveRoom(player);
    this.addToRoom(room, player);
    return room;
  }

  quickMatch(player) {
    if (player.room?.isPublic && player.room.state === 'lobby') return this.broadcastRoom(player.room);
    // Fill the fullest open public room first so races actually start.
    let best = null;
    for (const room of this.rooms.values()) {
      if (!room.isPublic || room.state !== 'lobby' || room.members.length >= ROOM_SIZE) continue;
      if (room === player.room) continue;
      if (!best || room.members.length > best.members.length) best = room;
    }
    if (!best) return this.createRoom(player, { isPublic: true });
    this.leaveRoom(player);
    this.addToRoom(best, player);
    return best;
  }

  addToRoom(room, player) {
    player.room = room;
    player.ready = false;
    this.resetRaceFields(player);
    room.members.push(player);
    this.broadcastRoom(room);
  }

  leaveRoom(player, notify = false) {
    const room = player.room;
    if (!room) {
      if (notify) player.conn.send({ type: 'room', room: null });
      return;
    }
    room.members = room.members.filter((m) => m !== player);
    player.room = null;
    player.ready = false;
    if (notify) player.conn.send({ type: 'room', room: null });
    if (!room.members.length) {
      this.closeRoom(room);
      return;
    }
    if (room.hostId === player.id) room.hostId = room.members[0].id;
    if (room.state === 'countdown' || room.state === 'racing') {
      this.broadcast(room, { type: 'left', id: player.id });
      this.checkRaceOver(room);
    }
    if (this.rooms.has(room.code)) this.broadcastRoom(room);
  }

  closeRoom(room) {
    this.clearTimer(room.timer);
    room.timer = null;
    this.rooms.delete(room.code);
  }

  configure(player, { circuitId, laps, public: isPublic }) {
    const room = player.room;
    if (!room || room.hostId !== player.id) return this.error(player, 'Only the host can change the race.');
    if (room.state !== 'lobby') return undefined;
    if (circuitId !== undefined) {
      const circuit = CIRCUITS.find((c) => c.id === circuitId);
      if (!circuit) return this.error(player, 'Unknown circuit.');
      room.circuitId = circuit.id;
    }
    if (laps !== undefined) {
      if (!LAP_CHOICES.includes(laps)) return this.error(player, 'Unsupported lap count.');
      room.laps = laps;
    }
    if (isPublic !== undefined) room.isPublic = !!isPublic;
    // A changed race needs everyone to confirm again.
    for (const m of room.members) if (m.id !== room.hostId) m.ready = false;
    this.broadcastRoom(room);
    return undefined;
  }

  setReady(player, ready) {
    const room = player.room;
    if (!room || room.state !== 'lobby') return;
    player.ready = ready;
    this.broadcastRoom(room);
  }

  canStart(room) {
    return room.state === 'lobby'
      && room.members.length >= 2
      && room.members.every((m) => m.id === room.hostId || m.ready);
  }

  startRace(player) {
    const room = player.room;
    if (!room || room.hostId !== player.id) return this.error(player, 'Only the host can start the race.');
    if (room.state !== 'lobby') return undefined;
    if (room.members.length < 2) return this.error(player, 'Waiting for at least one more driver.');
    if (!this.canStart(room)) return this.error(player, 'Every driver must be ready.');

    room.state = 'countdown';
    room.results = null;
    room.firstFinishAt = 0;
    // Random grid so the host has no built-in advantage.
    const order = [...room.members];
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomBytes(1)[0] % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    order.forEach((m, index) => {
      m.grid = index;
      this.resetRaceFields(m);
    });
    room.startedAt = this.now() + COUNTDOWN_MS;
    this.broadcast(room, {
      type: 'start',
      startIn: COUNTDOWN_MS,
      circuitId: room.circuitId,
      laps: room.laps,
      players: order.map((m) => this.publicPlayer(m, room)),
    });
    this.broadcastRoom(room);
    room.timer = this.setTimer(() => {
      room.state = 'racing';
      this.broadcastRoom(room);
      // Hard stop so an abandoned race cannot hold a room forever.
      room.timer = this.setTimer(() => this.endRace(room), RACE_TIMEOUT_MS);
    }, COUNTDOWN_MS);
    return undefined;
  }

  resetRaceFields(player) {
    player.finished = false;
    player.finishMs = null;
    player.bestLap = null;
    player.forfeit = false;
  }

  relayState(player, msg) {
    const room = player.room;
    if (!room || (room.state !== 'racing' && room.state !== 'countdown') || player.finished || player.forfeit) return;
    const now = this.now();
    const rate = player.rate;
    if (now - rate.start >= 1000) {
      rate.start = now;
      rate.count = 0;
    }
    if (++rate.count > STATE_RATE) return;
    const { x, z, h, s, d, c, f } = msg;
    if (!finite(x, -1e4, 1e4) || !finite(z, -1e4, 1e4) || !finite(h, -1e3, 1e3)
      || !finite(s, -200, 200) || !finite(d, 0, 1e5) || !Number.isInteger(c) || c < 0 || c > 100) return;
    const flags = Number.isInteger(f) ? f & 0xff : 0;
    const out = {
      type: 'state', id: player.id, x, z, h, s, d, c, f: flags,
    };
    for (const m of room.members) if (m !== player) m.conn.send(out);
  }

  finish(player, { bestLap }) {
    const room = player.room;
    if (!room || room.state !== 'racing' || player.finished || player.forfeit) return;
    // Sanity floor: nothing in the game averages more than ~400 km/h, so a
    // faster finish is a bug or a forged message.
    const circuit = CIRCUITS.find((c) => c.id === room.circuitId);
    const minMs = (((circuit?.length || 500) * room.laps) / MAX_AVG_SPEED) * 1000;
    if (this.now() - room.startedAt < minMs) return this.error(player, 'Finish rejected.');
    player.finished = true;
    // Ranked by the server's clock, not the client's claim.
    player.finishMs = Math.max(0, this.now() - room.startedAt);
    player.bestLap = finite(bestLap, 1, 3600) ? bestLap : null;
    if (!room.firstFinishAt) {
      room.firstFinishAt = this.now();
      this.clearTimer(room.timer);
      room.timer = this.setTimer(() => this.endRace(room), FINISH_GRACE_MS);
      this.broadcast(room, { type: 'grace', ms: FINISH_GRACE_MS });
    }
    this.broadcast(room, { type: 'finished', id: player.id, timeMs: player.finishMs });
    this.checkRaceOver(room);
    return undefined;
  }

  forfeit(player) {
    const room = player.room;
    if (!room || (room.state !== 'racing' && room.state !== 'countdown') || player.finished) return;
    player.forfeit = true;
    this.broadcast(room, { type: 'left', id: player.id });
    this.checkRaceOver(room);
  }

  checkRaceOver(room) {
    if (room.state !== 'racing' && room.state !== 'countdown') return;
    const active = room.members.filter((m) => !m.forfeit);
    if (active.every((m) => m.finished)) this.endRace(room);
  }

  endRace(room) {
    if (!this.rooms.has(room.code) || (room.state !== 'racing' && room.state !== 'countdown')) return;
    this.clearTimer(room.timer);
    room.timer = null;
    const finishers = room.members.filter((m) => m.finished).sort((a, b) => a.finishMs - b.finishMs);
    const others = room.members.filter((m) => !m.finished);
    const order = [...finishers, ...others];
    room.results = order.map((m, index) => ({
      id: m.id,
      name: m.name,
      carId: m.carId,
      position: index + 1,
      finished: m.finished,
      timeMs: m.finishMs,
      bestLap: m.bestLap,
    }));
    room.state = 'lobby';
    for (const m of room.members) {
      m.ready = false;
      this.resetRaceFields(m);
    }
    this.broadcast(room, { type: 'results', results: room.results, total: order.length });
    this.broadcastRoom(room);
  }

  /* ───────────────────────── messages ───────────────────────── */

  publicPlayer(m, room) {
    return {
      id: m.id,
      name: m.name,
      carId: m.carId,
      look: m.look,
      ready: m.id === room.hostId || m.ready,
      host: m.id === room.hostId,
      grid: m.grid,
    };
  }

  snapshot(room) {
    return {
      code: room.code,
      public: room.isPublic,
      hostId: room.hostId,
      circuitId: room.circuitId,
      laps: room.laps,
      state: room.state,
      size: ROOM_SIZE,
      canStart: this.canStart(room),
      players: room.members.map((m) => this.publicPlayer(m, room)),
    };
  }

  broadcastRoom(room) {
    this.broadcast(room, { type: 'room', room: this.snapshot(room) });
  }

  broadcast(room, message) {
    for (const m of room.members) m.conn.send(message);
  }

  stats() {
    return { rooms: this.rooms.size, players: this.players.size };
  }
}
