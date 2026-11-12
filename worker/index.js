// Cloudflare Worker for Sunset Drift: serves the static game from dist/ and
// runs the backend (accounts, cloud saves, online lobby) in one Durable
// Object. Everything lives in a single "game" object: it keeps strong
// consistency for accounts and saves, and holds the live lobby in memory
// while players are connected. Free plan friendly: SQLite-backed Durable
// Object storage, no KV or D1 needed.
//
// Same HTTP/WebSocket API as server.mjs, so the browser code is unchanged.

import { Lobby } from '../server/rooms.mjs';
import { Admin, summarize, activeEvent, bump, markActive, leaderboard, dayKey } from './admin.js';
import { CIRCUITS } from '../js/data/circuits.js';
import { rateRace, divisionFor, START_RATING } from '../server/ranked.mjs';

const SESSION_COOKIE = 'sd_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SAVE_LIMIT = 512 * 1024;
const AUTH_WINDOW_MS = 60 * 1000;
const AUTH_ATTEMPTS = 30;
const MP_PER_IP = 8;
const MP_MSG_RATE = 80;
const PBKDF2_ITERATIONS = 100_000; // Workers' WebCrypto maximum
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // The dashboard page itself is static (dist/admin.html); its data is
    // behind the admin API.
    // Android app (Trusted Web Activity) verification. Set ANDROID_PACKAGE
    // and ANDROID_CERT_SHA256 (comma-separated for several keys) in the
    // Worker's variables once Google Play gives you the signing key.
    if (url.pathname === '/.well-known/assetlinks.json') {
      const fingerprints = String(env.ANDROID_CERT_SHA256 || '').split(',').map((f) => f.trim()).filter(Boolean);
      const body = env.ANDROID_PACKAGE && fingerprints.length ? [{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: env.ANDROID_PACKAGE, sha256_cert_fingerprints: fingerprints },
      }] : [];
      return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' } });
    }
    if (url.pathname === '/admin' || url.pathname === '/admin/') {
      return env.ASSETS.fetch(new Request(new URL('/admin.html', url), request));
    }
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      // Hashing and the lobby run inside the Durable Object (its CPU limit is
      // far above the free Worker's 10 ms).
      const stub = env.GAME.get(env.GAME.idFromName('game'));
      return stub.fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

/* ───────────────────────── helpers ───────────────────────── */

const enc = new TextEncoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

function json(status, payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const raw = part.slice(i + 1).trim();
    try { out[key] = decodeURIComponent(raw); } catch { out[key] = raw; }
  }
  return out;
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS }, key, 256,
  );
  return b64(bits);
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, createdAt: u.createdAt });

async function readBody(request, limit = 1024 * 1024) {
  const text = await request.text();
  if (text.length > limit) throw Object.assign(new Error('Request body is too large.'), { status: 413 });
  if (!text) return {};
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('Body must be a JSON object.'), { status: 400 });
  }
  return parsed;
}

/* ───────────────────────── Durable Object ───────────────────────── */

export class GameServer {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.storage = ctx.storage;
    this.buckets = new Map();
    this.perIp = new Map();
    this.lobby = new Lobby();
    this.admin = new Admin(this);
    this.lobby.onRaceStart = () => { bump(this.storage, 'onlineRaces').catch(() => {}); };
    this.lobby.onRaceResults = (room, finishers) => { this.rateRace(finishers).catch(() => {}); };
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      return await this.route(request, url.pathname, request.method);
    } catch (error) {
      const status = error.status || 500;
      return json(status, { error: status === 500 ? 'Server error.' : error.message });
    }
  }

  rateLimited(request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    const now = Date.now();
    let b = this.buckets.get(ip);
    if (!b || now - b.start > AUTH_WINDOW_MS) {
      b = { start: now, count: 0 };
      this.buckets.set(ip, b);
    }
    b.count += 1;
    if (this.buckets.size > 5000) this.buckets.clear();
    return b.count > AUTH_ATTEMPTS;
  }

  async currentUser(request) {
    const token = cookies(request)[SESSION_COOKIE];
    if (!token) return null;
    const session = await this.storage.get(`session:${token}`);
    if (!session) return null;
    if (session.expires <= Date.now()) {
      await this.storage.delete(`session:${token}`);
      return null;
    }
    const user = await this.storage.get(`user:${session.userId}`);
    if (!user || user.banned) return null;
    await markActive(this.storage, user.id);
    return publicUser(user);
  }

  async startSession(request, userId) {
    const token = randomHex(32);
    await this.storage.put(`session:${token}`, { userId, expires: Date.now() + SESSION_TTL_MS });
    const secure = new URL(request.url).protocol === 'https:';
    return [
      `${SESSION_COOKIE}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/',
      `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`, secure ? 'Secure' : '',
    ].filter(Boolean).join('; ');
  }

  async route(request, path, method) {
    const isRead = method === 'GET' || method === 'HEAD';

    if (path === '/api/health') {
      const settings = await this.admin.settings();
      return json(200, {
        ok: true, service: 'sunset-drift', auth: true, multiplayer: settings.onlineOpen, host: 'cloudflare',
        announcement: settings.announcement || '', event: activeEvent(settings), time: new Date().toISOString(),
      });
    }

    if (path.startsWith('/api/admin/')) {
      return this.admin.route(request, path, method, json, readBody, cookies(request));
    }

    if (path === '/api/auth/session') {
      return json(200, { user: await this.currentUser(request) });
    }

    if (path === '/api/auth/register') {
      if (method !== 'POST') return json(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      if (this.rateLimited(request)) return json(429, { error: 'Too many attempts. Wait a minute and try again.' }, { 'Retry-After': '60' });
      if (!(await this.admin.settings()).signupsOpen) return json(403, { error: 'New sign-ups are paused right now. Try again later.' });
      const body = await readBody(request);
      const username = String(body.username || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!USERNAME_RE.test(username)) {
        return json(400, { error: 'Username must be 3–16 letters, numbers, dots, dashes or underscores.', field: 'username' });
      }
      if (!EMAIL_RE.test(email) || email.length > 254) return json(400, { error: 'Enter a valid email address.', field: 'email' });
      if (password.length < 8 || password.length > 128) {
        return json(400, { error: 'Password must be between 8 and 128 characters.', field: 'password' });
      }
      // The object handles one request at a time per storage operation, and
      // these lookups and writes run without awaiting anything else between
      // them, so two sign-ups cannot claim the same name.
      if (await this.storage.get(`name:${username.toLowerCase()}`)) {
        return json(409, { error: 'That username is already taken.', field: 'username' });
      }
      if (await this.storage.get(`email:${email}`)) {
        return json(409, { error: 'An account with that email already exists.', field: 'email' });
      }
      const salt = randomHex(16);
      const passwordHash = await hashPassword(password, salt);
      const user = {
        id: `u_${randomHex(8)}`, username, email, salt, passwordHash,
        algo: 'pbkdf2-sha256', createdAt: new Date().toISOString(),
      };
      if (await this.storage.get(`name:${username.toLowerCase()}`) || await this.storage.get(`email:${email}`)) {
        return json(409, { error: 'That username or email was just taken.', field: 'username' });
      }
      await bump(this.storage, 'signups');
      await this.storage.put({
        [`user:${user.id}`]: user,
        [`name:${username.toLowerCase()}`]: user.id,
        [`email:${email}`]: user.id,
      });
      const cookie = await this.startSession(request, user.id);
      return json(201, { user: publicUser(user) }, { 'Set-Cookie': cookie });
    }

    if (path === '/api/auth/login') {
      if (method !== 'POST') return json(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      if (this.rateLimited(request)) return json(429, { error: 'Too many attempts. Wait a minute and try again.' }, { 'Retry-After': '60' });
      const body = await readBody(request);
      const id = String(body.email || body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      const userId = (await this.storage.get(`email:${id}`)) || (await this.storage.get(`name:${id}`));
      const user = userId ? await this.storage.get(`user:${userId}`) : null;
      if (!user) {
        await hashPassword(password || 'invalid', 'not-a-real-salt');
        return json(401, { error: 'Email or password is incorrect.' });
      }
      if (!safeEqual(await hashPassword(password, user.salt), user.passwordHash)) {
        return json(401, { error: 'Email or password is incorrect.' });
      }
      if (user.banned) return json(403, { error: 'This account has been suspended.' });
      await bump(this.storage, 'logins');
      const cookie = await this.startSession(request, user.id);
      return json(200, { user: publicUser(user) }, { 'Set-Cookie': cookie });
    }

    if (path === '/api/auth/delete') {
      // Players can delete their own account (app-store requirement). The
      // password is asked again so a borrowed device cannot do it silently.
      if (method !== 'POST') return json(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      if (this.rateLimited(request)) return json(429, { error: 'Too many attempts. Wait a minute and try again.' });
      const me = await this.currentUser(request);
      if (!me) return json(401, { error: 'Sign in first.' });
      const user = await this.storage.get(`user:${me.id}`);
      const body = await readBody(request);
      if (!safeEqual(await hashPassword(String(body.password || ''), user.salt), user.passwordHash)) {
        return json(401, { error: 'Password is incorrect.', field: 'password' });
      }
      await this.admin.endSessions(user.id);
      this.admin.kick(user.id, 'Account deleted.');
      await this.storage.delete([`user:${user.id}`, `save:${user.id}`, `summary:${user.id}`,
        `name:${user.username.toLowerCase()}`, `email:${user.email}`]);
      await this.admin.audit('user.self-delete', { user: user.username });
      const cookie = `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
      return json(200, { ok: true }, { 'Set-Cookie': cookie });
    }

    if (path === '/api/auth/logout') {
      if (method !== 'POST') return json(405, { error: 'Method not allowed.' }, { Allow: 'POST' });
      const token = cookies(request)[SESSION_COOKIE];
      if (token) await this.storage.delete(`session:${token}`);
      const secure = new URL(request.url).protocol === 'https:';
      const cookie = [`${SESSION_COOKIE}=`, 'HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=0', secure ? 'Secure' : '']
        .filter(Boolean).join('; ');
      return json(200, { ok: true }, { 'Set-Cookie': cookie });
    }

    if (path === '/api/save') {
      const user = await this.currentUser(request);
      if (!user) return json(401, { error: 'Sign in to use cloud saves.' });
      const stored = (await this.storage.get(`save:${user.id}`)) || { save: null, updatedAt: null };
      if (isRead) return json(200, stored);
      if (method !== 'PUT') return json(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, PUT' });
      const body = await readBody(request, SAVE_LIMIT + 4096);
      if (!body.save || typeof body.save !== 'object' || Array.isArray(body.save)) {
        return json(400, { error: 'A save object is required.' });
      }
      const previousSummary = await this.storage.get(`summary:${user.id}`);
      if (JSON.stringify(body.save).length > SAVE_LIMIT) return json(413, { error: 'Save data is too large.' });
      if (Object.prototype.hasOwnProperty.call(body, 'baseUpdatedAt')
        && (stored.updatedAt ?? null) !== (body.baseUpdatedAt ?? null)) {
        return json(409, { error: 'Your cloud save changed on another device.', updatedAt: stored.updatedAt });
      }
      const updatedAt = new Date().toISOString();
      await this.storage.put({
        [`save:${user.id}`]: { save: body.save, updatedAt },
        [`summary:${user.id}`]: summarize(body.save, updatedAt),
      });
      await bump(this.storage, 'saves');
      await this.countCommunityLaps(user.id, previousSummary, body.save);
      return json(200, { ok: true, updatedAt });
    }

    if (path === '/api/mp') return this.openSocket(request);

    if (path === '/api/leaderboard') {
      const circuit = new URL(request.url).searchParams.get('circuit') || CIRCUITS[0].id;
      if (!CIRCUITS.some((c) => c.id === circuit)) return json(400, { error: 'Unknown circuit.' });
      const rows = (await leaderboard(this.admin, circuit, 20)).map(({ username, time, car }) => ({ username, time, car }));
      return json(200, { circuit, rows });
    }

    if (path === '/api/ranked') {
      const me = await this.currentUser(request);
      const users = (await this.admin.list('user:')).map(([, u]) => u)
        .filter((u) => !u.banned && (u.rankedRaces || 0) > 0)
        .sort((a, b) => (b.rating ?? START_RATING) - (a.rating ?? START_RATING));
      const top = users.slice(0, 20).map((u) => ({ username: u.username, rating: u.rating, division: divisionFor(u.rating).name, races: u.rankedRaces }));
      let mine = null;
      if (me) {
        const u = await this.storage.get(`user:${me.id}`);
        const rating = u.rating ?? START_RATING;
        mine = { rating, division: divisionFor(rating).name, races: u.rankedRaces || 0, best: u.bestRating || rating,
          position: users.findIndex((x) => x.id === me.id) + 1 || null };
      }
      const settings = await this.admin.settings();
      const number = settings.season?.number || 1;
      const last = number > 1 ? await this.storage.get(`hall:${number - 1}`) : null;
      return json(200, { top, me: mine, season: number, lastChampions: last?.top?.slice(0, 3) || [] });
    }

    if (path === '/api/community') {
      const c = await this.community();
      if (!c) return json(200, { challenge: null });
      const me = await this.currentUser(request);
      let mine = null;
      if (me) {
        const contributed = (await this.storage.get(`contrib:${c.id}:${me.id}`)) || 0;
        const claimed = !!(await this.storage.get(`claimed:${c.id}:${me.id}`));
        mine = { contributed, claimed, canClaim: c.done && contributed > 0 && !claimed };
        if (method === 'POST') {
          if (!mine.canClaim) return json(409, { error: c.done ? 'Nothing to claim.' : 'The goal is not reached yet.' });
          await this.storage.put(`claimed:${c.id}:${me.id}`, 1);
          return json(200, { ok: true, reward: c.reward });
        }
      }
      return json(200, { challenge: { id: c.id, name: c.name, target: c.target, progress: c.progress, reward: c.reward, endsAt: c.endsAt, done: c.done, open: c.open }, me: mine });
    }

    if (path === '/api/friends' || path === '/api/friends/invite') {
      const me = await this.currentUser(request);
      if (!me) return json(401, { error: 'Sign in first.' });
      const user = await this.storage.get(`user:${me.id}`);
      const connOf = (userId) => [...this.lobby.players.values()].find((p) => p.conn.userId === userId);
      if (path === '/api/friends/invite') {
        if (method !== 'POST') return json(405, { error: 'Method not allowed.' });
        const body = await readBody(request);
        const friendId = await this.storage.get(`name:${String(body.username || '').toLowerCase()}`);
        if (!friendId || !(user.friends || []).includes(friendId)) return json(404, { error: 'Add them as a friend first.' });
        const mine = connOf(me.id);
        if (!mine?.room) return json(409, { error: 'Open or join a room first, then invite.' });
        const theirs = connOf(friendId);
        if (!theirs) return json(409, { error: 'Your friend is not online right now. Share your invite link instead.' });
        theirs.conn.send({ type: 'invite', from: me.username, code: mine.room.code });
        return json(200, { ok: true });
      }
      if (method === 'POST') {
        const body = await readBody(request);
        const name = String(body.username || '').trim().toLowerCase();
        const friendId = await this.storage.get(`name:${name}`);
        if (body.action === 'remove') {
          user.friends = (user.friends || []).filter((id) => id !== friendId);
        } else {
          if (!friendId) return json(404, { error: 'No driver with that username.' });
          if (friendId === me.id) return json(400, { error: "That's you!" });
          user.friends = [...new Set([...(user.friends || []), friendId])].slice(0, 100);
        }
        await this.storage.put(`user:${me.id}`, user);
      }
      const friends = [];
      for (const id of user.friends || []) {
        const f = await this.storage.get(`user:${id}`);
        if (!f || f.banned) continue;
        const live = connOf(id);
        friends.push({
          username: f.username, online: !!live, racing: !!live?.room && live.room.state !== 'lobby',
          rating: f.rating ?? START_RATING, division: divisionFor(f.rating ?? START_RATING).name,
        });
      }
      friends.sort((a, b) => Number(b.online) - Number(a.online) || a.username.localeCompare(b.username));
      return json(200, { friends });
    }

    if (path === '/api/inbox') {
      const me = await this.currentUser(request);
      if (!me) return json(401, { error: 'Sign in first.' });
      const user = await this.storage.get(`user:${me.id}`);
      const messages = user.inbox || [];
      if (messages.length && method === 'POST') {
        user.inbox = [];
        await this.storage.put(`user:${me.id}`, user);
      }
      return json(200, { messages });
    }

    if (path === '/api/report') {
      if (method !== 'POST') return json(405, { error: 'Method not allowed.' });
      const me = await this.currentUser(request);
      if (!me) return json(401, { error: 'Sign in first.' });
      if (this.rateLimited(request)) return json(429, { error: 'Too many reports. Wait a minute.' });
      const body = await readBody(request);
      const target = String(body.username || '').trim().slice(0, 20);
      const reason = String(body.reason || '').trim().slice(0, 200);
      if (!target || target.toLowerCase() === me.username.toLowerCase()) return json(400, { error: 'Choose a player to report.' });
      await this.storage.put(`report:${Date.now()}-${randomHex(3)}`, {
        reporter: me.username, target, reason: reason || 'No reason given', at: new Date().toISOString(),
        targetId: (await this.storage.get(`name:${target.toLowerCase()}`)) || null,
      });
      await bump(this.storage, 'reports');
      return json(200, { ok: true });
    }

    return json(404, { error: 'Unknown API endpoint.' });
  }

  /* ── community challenge ── */
  async community() {
    const c = (await this.admin.settings()).community;
    if (!c) return null;
    const progress = (await this.storage.get(`community:${c.id}`)) || 0;
    return { ...c, progress, done: progress >= c.target, open: !c.endsAt || Date.parse(c.endsAt) > Date.now() };
  }

  /** Laps added since the last cloud save count toward the challenge. */
  async countCommunityLaps(userId, previous, save) {
    const c = await this.community();
    if (!c || !c.open || !previous) return;
    const added = (Number(save?.stats?.laps) || 0) - (previous.laps || 0);
    // A single save can't plausibly add more than a long session of laps.
    if (!(added > 0) || added > 300) return;
    await this.storage.put(`community:${c.id}`, Math.min(c.target * 10, c.progress + added));
    const key = `contrib:${c.id}:${userId}`;
    await this.storage.put(key, ((await this.storage.get(key)) || 0) + added);
  }

  /* ── ranked ratings ── */
  async rateRace(finishers) {
    const users = [];
    for (const m of finishers) users.push(await this.storage.get(`user:${m.conn.userId}`));
    if (users.some((u) => !u)) return;
    const before = users.map((u) => u.rating ?? START_RATING);
    const after = rateRace(before);
    const put = {};
    users.forEach((u, i) => {
      u.rating = after[i];
      u.rankedRaces = (u.rankedRaces || 0) + 1;
      u.bestRating = Math.max(u.bestRating || START_RATING, after[i]);
      put[`user:${u.id}`] = u;
      const div = divisionFor(after[i]);
      finishers[i].conn.send({ type: 'rating', rating: after[i], delta: after[i] - before[i], division: div.name, position: i + 1 });
    });
    await this.storage.put(put);
  }

  /* ── online lobby over WebSockets ── */
  async openSocket(request) {
    if (request.headers.get('Upgrade') !== 'websocket') return json(426, { error: 'Expected a WebSocket.' });
    // Cookies ride along with WebSocket handshakes, so refuse other sites.
    const origin = request.headers.get('Origin');
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { /* rejected below */ }
      if (originHost !== new URL(request.url).host) return new Response('Forbidden', { status: 403 });
    }
    const user = await this.currentUser(request);
    if (!user) return new Response('Unauthorized', { status: 401 });
    if (!(await this.admin.settings()).onlineOpen) return new Response('Online play is paused', { status: 503 });
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    if ((this.perIp.get(ip) || 0) >= MP_PER_IP) return new Response('Too Many Requests', { status: 429 });

    const pair = new WebSocketPair();
    const [client, ws] = Object.values(pair);
    ws.accept();
    const conn = {
      id: `p_${randomHex(6)}`,
      userId: user.id,
      username: user.username,
      send: (message) => { try { ws.send(JSON.stringify(message)); } catch { /* closed */ } },
      close: (code, reason) => { try { ws.close(code, reason); } catch { /* closed */ } },
    };
    const rate = { start: Date.now(), count: 0 };
    this.perIp.set(ip, (this.perIp.get(ip) || 0) + 1);
    let gone = false;
    const leave = () => {
      if (gone) return;
      gone = true;
      const n = (this.perIp.get(ip) || 1) - 1;
      if (n > 0) this.perIp.set(ip, n); else this.perIp.delete(ip);
      this.lobby.disconnect(conn);
    };
    ws.addEventListener('message', (event) => {
      const now = Date.now();
      if (now - rate.start >= 1000) { rate.start = now; rate.count = 0; }
      if (++rate.count > MP_MSG_RATE) { conn.close(1008, 'Too many messages.'); return; }
      let message;
      try { message = JSON.parse(typeof event.data === 'string' ? event.data : ''); } catch { return; }
      this.lobby.handle(conn, message);
    });
    ws.addEventListener('close', leave);
    ws.addEventListener('error', leave);
    this.lobby.connect(conn);
    return new Response(null, { status: 101, webSocket: client });
  }
}
