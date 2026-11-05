// Online multiplayer client: a thin WebSocket wrapper around the lobby
// protocol served by `server.mjs` at /api/mp.
//
// Online play needs the bundled Node server and a signed-in account; on a
// static host (GitHub Pages) the ONLINE tab explains that instead.

export const FLAG_BOOST = 1;
export const FLAG_DRIFT = 2;
export const FLAG_BRAKE = 4;

const SEND_HZ = 15;

export class OnlineClient {
  constructor({ url } = {}) {
    this.url = url || (typeof location !== 'undefined'
      ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/mp`
      : '');
    this.ws = null;
    this.id = null;
    this.room = null;
    this.status = 'offline'; // offline | connecting | online
    this.lastError = '';
    this.listeners = new Map();
    this.lastSend = 0;
    this.rtt = 0;
    this.pingTimer = null;
    this.pendingCar = null;
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners.get(type) || []) {
      try { fn(data); } catch (error) { console.error(error); }
    }
  }

  get connected() { return this.status === 'online'; }
  get isHost() { return !!this.room && this.room.hostId === this.id; }

  connect() {
    if (this.ws && this.status !== 'offline') return Promise.resolve(this.connected);
    if (typeof WebSocket === 'undefined' || !this.url) return Promise.resolve(false);
    this.status = 'connecting';
    this.lastError = '';
    this.emit('status', this.status);
    return new Promise((resolve) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.type === 'welcome') {
          this.id = msg.id;
          this.status = 'online';
          this.emit('status', this.status);
          if (this.pendingCar) this.send(this.pendingCar);
          this.startPing();
          if (!settled) { settled = true; resolve(true); }
        }
        this.receive(msg);
      };
      ws.onclose = (event) => {
        if (this.ws !== ws) return;
        this.ws = null;
        this.id = null;
        this.room = null;
        this.status = 'offline';
        this.stopPing();
        if (event.code === 4000) this.lastError = event.reason || 'Connected from another tab.';
        else if (!settled) this.lastError = 'Could not reach the online lobby. Sign in and make sure you are on the game server.';
        else if (event.code !== 1000) this.lastError = 'Lost connection to the online lobby.';
        this.emit('room', null);
        this.emit('status', this.status);
        if (!settled) { settled = true; resolve(false); }
      };
      ws.onerror = () => { /* onclose follows with the details */ };
    });
  }

  disconnect() {
    const ws = this.ws;
    this.ws = null;
    this.stopPing();
    this.status = 'offline';
    this.id = null;
    this.room = null;
    try { ws?.close(1000, 'bye'); } catch { /* already closed */ }
    this.emit('room', null);
    this.emit('status', this.status);
  }

  startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => this.send({ type: 'ping', t: Date.now() }), 5000);
  }

  stopPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  receive(msg) {
    switch (msg.type) {
      case 'room':
        this.room = msg.room;
        this.emit('room', msg.room);
        break;
      case 'pong':
        if (Number.isFinite(msg.t)) this.rtt = Date.now() - msg.t;
        break;
      case 'error':
        this.lastError = msg.message;
        this.emit('error', msg.message);
        break;
      default:
        this.emit(msg.type, msg);
    }
  }

  send(message) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  setCar(carId, look) {
    this.pendingCar = { type: 'car', carId, look };
    if (this.connected) this.send(this.pendingCar);
  }

  quickMatch() { return this.send({ type: 'quick' }); }
  createRoom(circuitId, isPublic = false) { return this.send({ type: 'create', circuitId, public: isPublic }); }
  joinRoom(code) { return this.send({ type: 'join', code }); }
  leaveRoom() { return this.send({ type: 'leave' }); }
  configure(changes) { return this.send({ type: 'config', ...changes }); }
  setReady(ready) { return this.send({ type: 'ready', ready }); }
  startRace() { return this.send({ type: 'start' }); }
  finish(bestLap) { return this.send({ type: 'finish', bestLap }); }
  forfeit() { return this.send({ type: 'forfeit' }); }

  /** Throttled position update for the local car. */
  sendState(car, crossings, now = performance.now(), force = false) {
    if (!force && now - this.lastSend < 1000 / SEND_HZ) return;
    this.lastSend = now;
    const round = (v, p = 100) => Math.round(v * p) / p;
    let f = 0;
    if (car.boosting) f |= FLAG_BOOST;
    if (car.drifting) f |= FLAG_DRIFT;
    if (car.braking) f |= FLAG_BRAKE;
    this.send({
      type: 'state',
      x: round(car.pos.x),
      z: round(car.pos.z),
      h: round(car.heading, 1000),
      s: round(car.speed, 10),
      d: round(car.trackInfo?.dist ?? 0, 10),
      c: crossings,
      f,
    });
  }
}

/**
 * Interpolates a remote car between network snapshots, rendering slightly in
 * the past so movement stays smooth despite jitter.
 */
export class RemoteTrack {
  constructor(delayMs = 110) {
    this.delay = delayMs;
    this.buffer = [];
  }

  push(state, at = performance.now()) {
    this.buffer.push({ ...state, at });
    if (this.buffer.length > 30) this.buffer.shift();
  }

  /** Returns the interpolated state for `now`, or null before any update. */
  sample(now = performance.now()) {
    const b = this.buffer;
    if (!b.length) return null;
    const t = now - this.delay;
    while (b.length > 2 && b[1].at <= t) b.shift();
    const a = b[0];
    const c = b[1];
    if (!c || t <= a.at) return { ...a };
    const k = Math.min(1, Math.max(0, (t - a.at) / Math.max(1, c.at - a.at)));
    // Shortest path between headings.
    let dh = c.h - a.h;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    return {
      x: a.x + (c.x - a.x) * k,
      z: a.z + (c.z - a.z) * k,
      h: a.h + dh * k,
      s: a.s + (c.s - a.s) * k,
      d: k < 0.5 ? a.d : c.d,
      c: k < 0.5 ? a.c : c.c,
      f: c.f,
    };
  }
}
