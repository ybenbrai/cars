import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Lobby, COUNTDOWN_MS, FINISH_GRACE_MS, ROOM_SIZE } from '../server/rooms.mjs';
import { CARS } from '../js/data/cars.js';
import { CIRCUITS } from '../js/data/circuits.js';

function harness() {
  let clock = 1_000_000;
  const timers = [];
  const lobby = new Lobby({
    now: () => clock,
    setTimer: (fn, ms) => {
      const t = { fn, at: clock + ms, done: false };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => { if (t) t.done = true; },
  });
  const advance = (ms) => {
    clock += ms;
    for (const t of [...timers]) {
      if (!t.done && t.at <= clock) {
        t.done = true;
        t.fn();
      }
    }
  };
  let n = 0;
  const connect = (name = `p${n}`) => {
    n += 1;
    const conn = {
      id: `c${n}`,
      userId: `u_${name}`,
      username: name,
      inbox: [],
      closed: null,
      send(m) { this.inbox.push(m); },
      close(code, reason) { this.closed = { code, reason }; },
      last(type) { return [...this.inbox].reverse().find((m) => m.type === type); },
      all(type) { return this.inbox.filter((m) => m.type === type); },
    };
    lobby.connect(conn);
    return conn;
  };
  const send = (conn, msg) => lobby.handle(conn, msg);
  return { lobby, connect, send, advance };
}

function raceReady(h, count = 2) {
  const conns = Array.from({ length: count }, (_, i) => h.connect(`d${i}`));
  h.send(conns[0], { type: 'create', public: false, circuitId: 'neon-city' });
  const code = conns[0].last('room').room.code;
  for (const c of conns.slice(1)) {
    h.send(c, { type: 'join', code });
    h.send(c, { type: 'ready', ready: true });
  }
  return { conns, code };
}

test('welcome, private room creation and joining by code', () => {
  const h = harness();
  const a = h.connect('alice');
  assert.equal(a.last('welcome').name, 'alice');
  h.send(a, { type: 'create', public: false, circuitId: 'neon-city' });
  const room = a.last('room').room;
  assert.match(room.code, /^[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(room.circuitId, 'neon-city');
  assert.equal(room.hostId, a.id);

  const b = h.connect('bob');
  h.send(b, { type: 'join', code: room.code.toLowerCase() });
  assert.equal(b.last('room').room.players.length, 2);
  assert.equal(a.last('room').room.players.length, 2);

  const c = h.connect('carol');
  h.send(c, { type: 'join', code: 'ZZZZZ' });
  assert.equal(c.last('error').message, 'No room with that code.');
});

test('quick match fills open public rooms and never private ones', () => {
  const h = harness();
  const host = h.connect('host');
  h.send(host, { type: 'create', public: false });
  const a = h.connect('a');
  h.send(a, { type: 'quick' });
  const pub = a.last('room').room;
  assert.equal(pub.public, true);
  assert.notEqual(pub.code, host.last('room').room.code);
  const b = h.connect('b');
  h.send(b, { type: 'quick' });
  assert.equal(b.last('room').room.code, pub.code);
});

test('rooms are capped at ROOM_SIZE players', () => {
  const h = harness();
  const host = h.connect('host');
  h.send(host, { type: 'create' });
  const { code } = host.last('room').room;
  for (let i = 1; i < ROOM_SIZE; i++) h.send(h.connect(), { type: 'join', code });
  const late = h.connect('late');
  h.send(late, { type: 'join', code });
  assert.equal(late.last('error').message, 'That room is full.');
});

test('only the host configures and starts; everyone must be ready', () => {
  const h = harness();
  const a = h.connect('a');
  const b = h.connect('b');
  h.send(a, { type: 'create' });
  const { code } = a.last('room').room;
  h.send(b, { type: 'join', code });

  h.send(b, { type: 'config', circuitId: 'dockyard' });
  assert.equal(b.last('error').message, 'Only the host can change the race.');
  h.send(a, { type: 'config', circuitId: 'nope' });
  assert.equal(a.last('error').message, 'Unknown circuit.');
  h.send(a, { type: 'config', circuitId: 'dockyard', laps: 2 });
  assert.equal(b.last('room').room.circuitId, 'dockyard');
  assert.equal(b.last('room').room.laps, 2);

  h.send(a, { type: 'start' });
  assert.equal(a.last('error').message, 'Every driver must be ready.');
  h.send(b, { type: 'ready', ready: true });
  assert.equal(a.last('room').room.canStart, true);
  // Changing the race resets readiness.
  h.send(a, { type: 'config', laps: 3 });
  assert.equal(a.last('room').room.canStart, false);
});

test('a full race: countdown, relayed positions, finish order by server clock', () => {
  const h = harness();
  const { conns: [a, b, c] } = raceReady(h, 3);
  h.send(a, { type: 'start' });
  const start = b.last('start');
  assert.equal(start.startIn, COUNTDOWN_MS);
  assert.deepEqual(start.players.map((p) => p.grid).sort(), [0, 1, 2]);
  assert.equal(a.last('room').room.state, 'countdown');

  h.advance(COUNTDOWN_MS);
  assert.equal(a.last('room').room.state, 'racing');

  h.send(a, { type: 'state', x: 1, z: 2, h: 0.5, s: 30, d: 100, c: 1, f: 3 });
  assert.deepEqual(b.last('state'), { type: 'state', id: a.id, x: 1, z: 2, h: 0.5, s: 30, d: 100, c: 1, f: 3 });
  assert.equal(a.last('state'), undefined, 'own state is not echoed');
  h.send(a, { type: 'state', x: 'evil', z: 2, h: 0, s: 0, d: 0, c: 0 });
  assert.equal(b.all('state').length, 1, 'malformed state is dropped');

  // Too fast to be real: rejected.
  h.advance(1000);
  h.send(c, { type: 'finish', bestLap: 1 });
  assert.equal(c.last('error').message, 'Finish rejected.');

  h.advance(120_000);
  h.send(c, { type: 'finish', bestLap: 40 });
  assert.equal(a.last('grace').ms, FINISH_GRACE_MS);
  h.advance(5_000);
  h.send(a, { type: 'finish', bestLap: 39 });
  // b never finishes: the grace timer ends the race.
  h.advance(FINISH_GRACE_MS);
  const { results } = b.last('results');
  assert.deepEqual(results.map((r) => r.id), [c.id, a.id, b.id]);
  assert.deepEqual(results.map((r) => r.finished), [true, true, false]);
  assert.equal(results[0].timeMs, 121_000);
  assert.equal(b.last('room').room.state, 'lobby', 'room returns to the lobby for a rematch');
});

test('the race ends as soon as every remaining driver finished or forfeited', () => {
  const h = harness();
  const { conns: [a, b] } = raceReady(h, 2);
  h.send(a, { type: 'start' });
  h.advance(COUNTDOWN_MS + 200_000);
  h.send(b, { type: 'forfeit' });
  assert.equal(a.last('left').id, b.id);
  h.send(a, { type: 'finish', bestLap: 50 });
  assert.deepEqual(a.last('results').results.map((r) => [r.id, r.finished]), [[a.id, true], [b.id, false]]);
});

test('host leaving hands the room over; the last player closes it', () => {
  const h = harness();
  const { conns: [a, b] } = raceReady(h, 2);
  const { code } = a.last('room').room;
  h.lobby.disconnect(a);
  assert.equal(b.last('room').room.hostId, b.id);
  h.send(b, { type: 'leave' });
  assert.equal(b.last('room').room, null);
  assert.equal(h.lobby.rooms.has(code), false);
});

test('a disconnect mid-race does not stall the others', () => {
  const h = harness();
  const { conns: [a, b] } = raceReady(h, 2);
  h.send(a, { type: 'start' });
  h.advance(COUNTDOWN_MS + 200_000);
  h.lobby.disconnect(b);
  assert.equal(a.last('left').id, b.id);
  h.send(a, { type: 'finish', bestLap: 50 });
  assert.equal(a.last('results').results.length, 1);
});

test('cars are validated and locked once racing', () => {
  const h = harness();
  const { conns: [a] } = raceReady(h, 2);
  const car = CARS.find((c) => !c.starter);
  h.send(a, { type: 'car', carId: car.id, look: { paint: 'javascript:alert(1)', plate: '<b>' } });
  const me = a.last('room').room.players.find((p) => p.id === a.id);
  assert.equal(me.carId, car.id);
  assert.match(me.look.paint, /^#[0-9a-f]{6}$/i);
  assert.equal(me.look.plate, 'B');
  h.send(a, { type: 'car', carId: 'not-a-car' });
  assert.equal(a.last('error').message, 'Unknown car.');
  h.send(a, { type: 'start' });
  h.send(a, { type: 'car', carId: CARS[0].id });
  assert.equal(a.last('error').message, 'Cars are locked once a race starts.');
});

test('a second connection for the same account replaces the first', () => {
  const h = harness();
  const first = h.connect('same');
  h.send(first, { type: 'create' });
  const second = h.connect('same');
  assert.equal(first.closed.code, 4000);
  assert.equal(h.lobby.players.has(first.id), false);
  assert.equal(h.lobby.rooms.size, 0, 'the abandoned room was closed');
  assert.ok(h.lobby.players.has(second.id));
});

test('position relay is rate limited per player', () => {
  const h = harness();
  const { conns: [a, b] } = raceReady(h, 2);
  h.send(a, { type: 'start' });
  h.advance(COUNTDOWN_MS);
  for (let i = 0; i < 100; i++) h.send(a, { type: 'state', x: 0, z: 0, h: 0, s: 0, d: 0, c: 0 });
  assert.equal(b.all('state').length, 40);
});

test('every circuit is a valid online venue', () => {
  const h = harness();
  const a = h.connect();
  for (const circuit of CIRCUITS.filter((c) => !c.practiceOnly)) {
    h.send(a, { type: 'create', circuitId: circuit.id });
    assert.equal(a.last('room').room.circuitId, circuit.id);
  }
  assert.equal(h.lobby.rooms.size, 1, 'creating again leaves the previous room');
});

test('practice-only venues are not online venues', () => {
  const h = harness();
  const a = h.connect();
  // Creating with the runway falls back to the first real circuit...
  h.send(a, { type: 'create', circuitId: 'runway-01' });
  const room = a.last('room').room;
  assert.notEqual(room.circuitId, 'runway-01');
  // ...and the host cannot configure the room onto it later.
  h.send(a, { type: 'config', circuitId: 'runway-01' });
  assert.equal(a.last('error').message, 'Unknown circuit.');
  assert.equal(h.lobby.rooms.get(room.code).circuitId, room.circuitId);
});
