import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createStaticServer } from '../server.mjs';
import { acceptKey } from '../server/ws.mjs';

let root;
let server;
let port;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'sd-mp-'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>t</title>');
  server = createStaticServer({ root });
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
  port = server.address().port;
});

after(async () => {
  await new Promise((ok) => server.close(ok));
  await rm(root, { recursive: true, force: true });
});

async function register(username) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, email: `${username}@example.com`, password: 'correct-horse-1' }),
  });
  assert.equal(res.status, 201);
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

function frame(text, { masked = true, opcode = 1 } = {}) {
  const payload = Buffer.from(text);
  const len = payload.length;
  const head = len < 126 ? Buffer.from([0x80 | opcode, (masked ? 0x80 : 0) | len])
    : Buffer.from([0x80 | opcode, (masked ? 0x80 : 0) | 126, len >> 8, len & 255]);
  if (!masked) return Buffer.concat([head, payload]);
  const mask = randomBytes(4);
  const body = Buffer.from(payload.map((b, i) => b ^ mask[i & 3]));
  return Buffer.concat([head, mask, body]);
}

/** Open a raw WebSocket; resolves with a tiny client or the HTTP status. */
function connect({ cookie, origin = `http://127.0.0.1:${port}` } = {}) {
  return new Promise((resolve, rejectConn) => {
    const key = randomBytes(16).toString('base64');
    const headers = {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': key,
    };
    if (cookie) headers.Cookie = cookie;
    if (origin) headers.Origin = origin;
    const req = http.request({ host: '127.0.0.1', port, path: '/api/mp', headers });
    req.on('response', (res) => resolve({ status: res.statusCode }));
    req.on('error', rejectConn);
    req.on('upgrade', (res, socket, head) => {
      assert.equal(res.headers['sec-websocket-accept'], acceptKey(key));
      // Frames sent right after the handshake can arrive in `head`.
      if (head?.length) socket.unshift(head);
      const inbox = [];
      const waiters = [];
      let buf = Buffer.alloc(0);
      let closeCode = null;
      socket.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        while (buf.length >= 2) {
          const op = buf[0] & 0x0f;
          let len = buf[1] & 0x7f;
          let off = 2;
          if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
          if (buf.length < off + len) break;
          const payload = buf.subarray(off, off + len);
          buf = buf.subarray(off + len);
          if (op === 8) closeCode = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
          if (op !== 1) continue;
          const msg = JSON.parse(payload.toString());
          inbox.push(msg);
          for (const w of [...waiters]) {
            if (w.match(msg)) {
              waiters.splice(waiters.indexOf(w), 1);
              w.resolve(msg);
            }
          }
        }
      });
      const closed = new Promise((ok) => socket.on('close', () => ok(closeCode)));
      resolve({
        status: 101,
        socket,
        inbox,
        closed,
        send: (obj) => socket.write(frame(JSON.stringify(obj))),
        raw: (buffer) => socket.write(buffer),
        next(type, pred = () => true) {
          const found = inbox.find((m) => m.type === type && pred(m));
          if (found) {
            inbox.splice(inbox.indexOf(found), 1);
            return Promise.resolve(found);
          }
          return new Promise((ok) => waiters.push({
            match: (m) => m.type === type && pred(m) && (inbox.splice(inbox.indexOf(m), 1), true),
            resolve: ok,
          }));
        },
        end: () => socket.destroy(),
      });
    });
    req.end();
  });
}

test('health advertises multiplayer', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal((await res.json()).multiplayer, true);
});

test('the lobby refuses signed-out and cross-site connections', async () => {
  assert.equal((await connect()).status, 401);
  const cookie = await register('mpguard');
  assert.equal((await connect({ cookie, origin: 'https://evil.example' })).status, 403);
});

test('two signed-in players meet in a private room over real WebSockets', async () => {
  const alice = await connect({ cookie: await register('mpalice') });
  const bob = await connect({ cookie: await register('mpbob') });
  assert.equal(alice.status, 101);
  assert.equal((await alice.next('welcome')).name, 'mpalice');
  await bob.next('welcome');

  alice.send({ type: 'create', public: false, circuitId: 'alpine-pass' });
  const { room } = await alice.next('room');
  bob.send({ type: 'join', code: room.code });
  const joined = await bob.next('room', (m) => m.room?.players.length === 2);
  assert.deepEqual(joined.room.players.map((p) => p.name).sort(), ['mpalice', 'mpbob']);

  bob.send({ type: 'ready', ready: true });
  await alice.next('room', (m) => m.room?.canStart);
  alice.send({ type: 'start' });
  const start = await bob.next('start');
  assert.equal(start.circuitId, 'alpine-pass');
  assert.equal(start.players.length, 2);

  alice.send({ type: 'state', x: 3, z: 4, h: 1, s: 10, d: 5, c: 0, f: 0 });
  const relayed = await bob.next('state');
  assert.equal(relayed.x, 3);

  bob.end();
  // Bob dropping out mid-race is announced to Alice.
  await alice.next('left');
  alice.end();
});

test('protocol violations close the connection', async () => {
  const unmasked = await connect({ cookie: await register('mpraw1') });
  await unmasked.next('welcome');
  unmasked.raw(frame('{"type":"ping"}', { masked: false }));
  assert.equal(await unmasked.closed, 1002);

  const huge = await connect({ cookie: await register('mpraw2') });
  await huge.next('welcome');
  huge.raw(frame('x'.repeat(20_000)));
  assert.equal(await huge.closed, 1009);

  const pinger = await connect({ cookie: await register('mpraw3') });
  await pinger.next('welcome');
  pinger.send({ type: 'ping', t: 42 });
  assert.equal((await pinger.next('pong')).t, 42);
  pinger.end();
});
