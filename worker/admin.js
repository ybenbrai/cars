// Admin API for the dashboard at /admin. Every route except login needs an
// admin session cookie, issued only for the ADMIN_TOKEN secret (set it in
// Cloudflare: Settings → Variables and Secrets, or `wrangler secret put`).
// Without the secret the admin API stays switched off.

import { rankForWins, RANK_LABELS } from '../js/data/cars.js';

const ADMIN_COOKIE = 'sd_admin';
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;
const AUDIT_MAX = 300;

export const DEFAULT_SETTINGS = { announcement: '', signupsOpen: true, onlineOpen: true };

const enc = new TextEncoder();
const randomHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sameSecret(a, b) {
  // Compare digests so length and content leak nothing through timing.
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', enc.encode(String(v)))));
  const ax = new Uint8Array(x);
  const by = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ by[i];
  return diff === 0;
}

/** Small per-player summary kept next to each cloud save. */
export function summarize(save, updatedAt) {
  const stats = save?.stats || {};
  return {
    name: String(save?.profile?.name || '').slice(0, 20),
    wallet: Number.isFinite(save?.wallet) ? save.wallet : 0,
    races: stats.races || 0,
    wins: stats.wins || 0,
    podiums: stats.podiums || 0,
    laps: stats.laps || 0,
    creditsEarned: stats.creditsEarned || 0,
    cars: Array.isArray(save?.ownedCars) ? save.ownedCars.length : 0,
    selectedCar: save?.selectedCarId || '',
    achievements: Array.isArray(save?.achievements) ? save.achievements.length : 0,
    rank: RANK_LABELS[rankForWins(stats.wins || 0, stats.races || 0)] || 'Rookie',
    updatedAt,
  };
}

export class Admin {
  constructor(server) {
    this.server = server;
    this.storage = server.storage;
  }

  get configured() {
    const token = this.server.env?.ADMIN_TOKEN;
    return typeof token === 'string' && token.length >= 16;
  }

  async settings() {
    return { ...DEFAULT_SETTINGS, ...((await this.storage.get('settings')) || {}) };
  }

  async audit(action, detail = {}) {
    const log = (await this.storage.get('audit')) || [];
    log.unshift({ at: new Date().toISOString(), action, ...detail });
    await this.storage.put('audit', log.slice(0, AUDIT_MAX));
  }

  async isAdmin(request, cookies) {
    if (!this.configured) return false;
    const token = cookies[ADMIN_COOKIE];
    if (!token) return false;
    const session = await this.storage.get(`admin:${token}`);
    if (!session || session.expires <= Date.now()) return false;
    return true;
  }

  async list(prefix) {
    const out = [];
    let start;
    for (;;) {
      const page = await this.storage.list({ prefix, start, limit: 512 });
      for (const [key, value] of page) {
        if (key === start) continue;
        out.push([key, value]);
      }
      if (page.size < 512) break;
      start = [...page.keys()].pop();
    }
    return out;
  }

  async summaryFor(userId) {
    let summary = await this.storage.get(`summary:${userId}`);
    if (!summary) {
      const stored = await this.storage.get(`save:${userId}`);
      if (stored?.save) {
        summary = summarize(stored.save, stored.updatedAt);
        await this.storage.put(`summary:${userId}`, summary);
      }
    }
    return summary || null;
  }

  async userRows() {
    const users = (await this.list('user:')).map(([, u]) => u);
    const sessions = await this.list('session:');
    const now = Date.now();
    const active = new Map();
    for (const [, s] of sessions) if (s.expires > now) active.set(s.userId, (active.get(s.userId) || 0) + 1);
    const online = new Set([...this.server.lobby.players.values()].map((p) => p.conn.userId));
    const rows = [];
    for (const u of users) {
      rows.push({
        id: u.id, username: u.username, email: u.email, createdAt: u.createdAt,
        banned: !!u.banned, sessions: active.get(u.id) || 0, online: online.has(u.id),
        summary: await this.summaryFor(u.id),
      });
    }
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  rooms() {
    const out = [];
    for (const room of this.server.lobby.rooms.values()) {
      out.push({
        ...this.server.lobby.snapshot(room),
        players: room.members.map((m) => ({ id: m.id, name: m.name, userId: m.conn.userId, carId: m.carId, ready: !!m.ready, host: m.id === room.hostId })),
      });
    }
    return out;
  }

  async route(request, path, method, json, readBody, cookies) {
    if (path === '/api/admin/login') {
      if (method !== 'POST') return json(405, { error: 'Method not allowed.' });
      if (!this.configured) return json(503, { error: 'Admin is not set up. Add an ADMIN_TOKEN secret (16+ characters) in Cloudflare.' });
      if (this.server.rateLimited(request)) return json(429, { error: 'Too many attempts. Wait a minute.' });
      const body = await readBody(request);
      if (!(await sameSecret(body.token || '', this.server.env.ADMIN_TOKEN))) {
        await this.audit('admin.login.failed', { ip: request.headers.get('CF-Connecting-IP') || '' });
        return json(401, { error: 'Wrong admin token.' });
      }
      const token = randomHex(32);
      await this.storage.put(`admin:${token}`, { expires: Date.now() + ADMIN_TTL_MS });
      await this.audit('admin.login', { ip: request.headers.get('CF-Connecting-IP') || '' });
      const secure = new URL(request.url).protocol === 'https:';
      const cookie = [`${ADMIN_COOKIE}=${token}`, 'HttpOnly', 'SameSite=Strict', 'Path=/api/admin',
        `Max-Age=${ADMIN_TTL_MS / 1000}`, secure ? 'Secure' : ''].filter(Boolean).join('; ');
      return json(200, { ok: true }, { 'Set-Cookie': cookie });
    }

    if (!(await this.isAdmin(request, cookies))) {
      return json(this.configured ? 401 : 503, { error: this.configured ? 'Admin sign-in required.' : 'Admin is not set up.' });
    }

    if (path === '/api/admin/logout') {
      await this.storage.delete(`admin:${cookies[ADMIN_COOKIE]}`);
      return json(200, { ok: true }, { 'Set-Cookie': `${ADMIN_COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0` });
    }

    if (path === '/api/admin/overview') {
      const rows = await this.userRows();
      const now = Date.now();
      const day = 86_400_000;
      const signups = Array.from({ length: 14 }, (_, i) => {
        const start = new Date(now - (13 - i) * day);
        const key = start.toISOString().slice(0, 10);
        return { day: key, count: rows.filter((r) => String(r.createdAt).slice(0, 10) === key).length };
      });
      const sums = rows.map((r) => r.summary).filter(Boolean);
      const total = (k) => sums.reduce((a, s) => a + (s[k] || 0), 0);
      const carCounts = {};
      for (const s of sums) if (s.selectedCar) carCounts[s.selectedCar] = (carCounts[s.selectedCar] || 0) + 1;
      const rooms = this.rooms();
      return json(200, {
        users: rows.length,
        newToday: signups[13].count,
        newWeek: signups.slice(7).reduce((a, d) => a + d.count, 0),
        activeSessions: rows.reduce((a, r) => a + r.sessions, 0),
        signedIn: rows.filter((r) => r.sessions > 0).length,
        banned: rows.filter((r) => r.banned).length,
        saves: sums.length,
        onlineNow: this.server.lobby.players.size,
        rooms: rooms.length,
        racing: rooms.filter((r) => r.state !== 'lobby').length,
        races: total('races'),
        wins: total('wins'),
        laps: total('laps'),
        credits: total('wallet'),
        creditsEarned: total('creditsEarned'),
        signups,
        topPlayers: rows.filter((r) => r.summary).sort((a, b) => b.summary.wins - a.summary.wins || b.summary.races - a.summary.races)
          .slice(0, 8).map((r) => ({ id: r.id, username: r.username, ...r.summary })),
        popularCars: Object.entries(carCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
        settings: await this.settings(),
      });
    }

    if (path === '/api/admin/users') return json(200, { users: await this.userRows() });

    const userMatch = path.match(/^\/api\/admin\/users\/(u_[a-f0-9]+)(\/action)?$/);
    if (userMatch) {
      const id = userMatch[1];
      const user = await this.storage.get(`user:${id}`);
      if (!user) return json(404, { error: 'No such user.' });
      if (!userMatch[2]) {
        const stored = (await this.storage.get(`save:${id}`)) || { save: null, updatedAt: null };
        const { salt, passwordHash, ...safe } = user;
        return json(200, { user: safe, save: stored.save, updatedAt: stored.updatedAt, summary: await this.summaryFor(id) });
      }
      if (method !== 'POST') return json(405, { error: 'Method not allowed.' });
      const body = await readBody(request);
      return this.userAction(user, String(body.action || ''), body, json);
    }

    if (path === '/api/admin/rooms') return json(200, { rooms: this.rooms(), players: this.server.lobby.players.size });

    const roomMatch = path.match(/^\/api\/admin\/rooms\/([A-Z0-9]{5})\/close$/);
    if (roomMatch && method === 'POST') {
      const room = this.server.lobby.rooms.get(roomMatch[1]);
      if (!room) return json(404, { error: 'No such room.' });
      for (const m of [...room.members]) m.conn.send({ type: 'error', message: 'This room was closed by an admin.' });
      for (const m of [...room.members]) this.server.lobby.leaveRoom(m, true);
      this.server.lobby.closeRoom?.(room);
      await this.audit('room.close', { code: roomMatch[1] });
      return json(200, { ok: true });
    }

    if (path === '/api/admin/settings') {
      if (method === 'GET') return json(200, await this.settings());
      if (method !== 'POST') return json(405, { error: 'Method not allowed.' });
      const body = await readBody(request);
      const next = await this.settings();
      if (typeof body.announcement === 'string') next.announcement = body.announcement.trim().slice(0, 240);
      if (typeof body.signupsOpen === 'boolean') next.signupsOpen = body.signupsOpen;
      if (typeof body.onlineOpen === 'boolean') next.onlineOpen = body.onlineOpen;
      await this.storage.put('settings', next);
      await this.audit('settings', next);
      return json(200, next);
    }

    if (path === '/api/admin/audit') return json(200, { log: (await this.storage.get('audit')) || [] });

    return json(404, { error: 'Unknown admin endpoint.' });
  }

  kick(userId, reason) {
    for (const p of [...this.server.lobby.players.values()]) {
      if (p.conn.userId === userId) {
        p.conn.send({ type: 'error', message: reason });
        p.conn.close(4001, reason);
        this.server.lobby.disconnect(p.conn);
      }
    }
  }

  async endSessions(userId) {
    const sessions = await this.list('session:');
    const keys = sessions.filter(([, s]) => s.userId === userId).map(([k]) => k);
    for (let i = 0; i < keys.length; i += 128) await this.storage.delete(keys.slice(i, i + 128));
    return keys.length;
  }

  async userAction(user, action, body, json) {
    const id = user.id;
    if (action === 'grant') {
      const amount = Math.round(Number(body.amount));
      if (!Number.isFinite(amount) || Math.abs(amount) > 10_000_000) return json(400, { error: 'Enter an amount up to 10,000,000.' });
      const stored = await this.storage.get(`save:${id}`);
      if (!stored?.save) return json(409, { error: 'This player has no cloud save yet.' });
      stored.save.wallet = Math.max(0, (Number(stored.save.wallet) || 0) + amount);
      stored.updatedAt = new Date().toISOString();
      await this.storage.put(`save:${id}`, stored);
      await this.storage.put(`summary:${id}`, summarize(stored.save, stored.updatedAt));
      await this.audit('user.grant', { user: user.username, amount });
      return json(200, { ok: true, wallet: stored.save.wallet });
    }
    if (action === 'reset') {
      await this.storage.delete([`save:${id}`, `summary:${id}`]);
      await this.audit('user.reset', { user: user.username });
      return json(200, { ok: true });
    }
    if (action === 'logout') {
      const n = await this.endSessions(id);
      this.kick(id, 'Signed out by an admin.');
      await this.audit('user.logout', { user: user.username, sessions: n });
      return json(200, { ok: true, sessions: n });
    }
    if (action === 'ban' || action === 'unban') {
      user.banned = action === 'ban';
      await this.storage.put(`user:${id}`, user);
      if (user.banned) {
        await this.endSessions(id);
        this.kick(id, 'Your account has been suspended.');
      }
      await this.audit(`user.${action}`, { user: user.username });
      return json(200, { ok: true, banned: user.banned });
    }
    if (action === 'kick') {
      this.kick(id, 'Removed from online play by an admin.');
      await this.audit('user.kick', { user: user.username });
      return json(200, { ok: true });
    }
    if (action === 'delete') {
      if (body.confirm !== user.username) return json(400, { error: 'Type the username to confirm deletion.' });
      await this.endSessions(id);
      this.kick(id, 'Account deleted.');
      await this.storage.delete([`user:${id}`, `save:${id}`, `summary:${id}`,
        `name:${user.username.toLowerCase()}`, `email:${user.email}`]);
      await this.audit('user.delete', { user: user.username });
      return json(200, { ok: true });
    }
    return json(400, { error: 'Unknown action.' });
  }
}
