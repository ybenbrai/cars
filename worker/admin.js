// Admin API for the dashboard at /admin. Every route except login needs an
// admin session cookie, issued only for the ADMIN_TOKEN secret (set it in
// Cloudflare: Settings → Variables and Secrets, or `wrangler secret put`).
// Without the secret the admin API stays switched off.

import { CARS, rankForWins, RANK_LABELS } from '../js/data/cars.js';
import { CIRCUITS } from '../js/data/circuits.js';
import { plausibleLap } from '../js/lapCheck.js';
import { divisionFor, seasonReset, SEASON_REWARDS, START_RATING } from '../server/ranked.mjs';

const ADMIN_COOKIE = 'sd_admin';
const ADMIN_TTL_MS = 12 * 60 * 60 * 1000;
const AUDIT_MAX = 300;

export const DEFAULT_SETTINGS = {
  announcement: '', signupsOpen: true, onlineOpen: true,
  // Live event, e.g. a double-credits weekend: { name, multiplier, endsAt }.
  event: null,
  // Community challenge: { id, name, target, reward, endsAt } (laps driven).
  community: null,
};

export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

/** The live event if one is running now, else null. */
export function activeEvent(settings) {
  const e = settings?.event;
  if (!e || !(e.multiplier > 1) || (e.endsAt && Date.parse(e.endsAt) <= Date.now())) return null;
  return { name: String(e.name || 'LIVE EVENT'), multiplier: Math.min(3, e.multiplier), endsAt: e.endsAt || null };
}

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
    // Best lap per circuit, for the global leaderboards.
    bestLaps: Object.fromEntries(Object.entries(save?.records || {})
      .map(([id, r]) => [id, Number(r?.bestLap)])
      .filter(([, t]) => Number.isFinite(t) && t > 5 && t < 3600)),
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
      const daily = [];
      for (const s of signups) {
        const m = (await this.storage.get(`metrics:${s.day}`)) || {};
        daily.push({ day: s.day, active: m.active || 0, logins: m.logins || 0, onlineRaces: m.onlineRaces || 0, saves: m.saves || 0 });
      }
      const reports = (await this.list('report:')).length;
      return json(200, {
        daily,
        reports,
        dauToday: daily[13].active,
        dauWeek: daily.slice(7).reduce((a, d) => a + d.active, 0),
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
        popularCars: Object.entries(carCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([id, n]) => [CARS.find((c) => c.id === id)?.name || id, n]),
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
        return json(200, {
          user: safe, save: stored.save, updatedAt: stored.updatedAt, summary: await this.summaryFor(id),
          cars: CARS.map((c) => ({ id: c.id, name: c.name })),
        });
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
      if (body.community === null) next.community = null;
      else if (body.community && typeof body.community === 'object') {
        const target = Math.min(10_000_000, Math.max(10, Math.round(Number(body.community.target) || 0)));
        const reward = Math.min(100_000, Math.max(0, Math.round(Number(body.community.reward) || 0)));
        const endsAt = body.community.endsAt && !Number.isNaN(Date.parse(body.community.endsAt)) ? new Date(body.community.endsAt).toISOString() : null;
        next.community = {
          id: next.community?.id && body.community.keepProgress ? next.community.id : `c${Date.now().toString(36)}`,
          name: String(body.community.name || 'COMMUNITY LAPS').trim().slice(0, 40).toUpperCase(), target, reward, endsAt,
        };
      }
      if (body.event === null) next.event = null;
      else if (body.event && typeof body.event === 'object') {
        const multiplier = Math.min(3, Math.max(1, Number(body.event.multiplier) || 1));
        const endsAt = body.event.endsAt && !Number.isNaN(Date.parse(body.event.endsAt)) ? new Date(body.event.endsAt).toISOString() : null;
        next.event = { name: String(body.event.name || 'LIVE EVENT').trim().slice(0, 40).toUpperCase(), multiplier, endsAt };
      }
      await this.storage.put('settings', next);
      await this.audit('settings', next);
      return json(200, next);
    }

    if (path === '/api/admin/audit') return json(200, { log: (await this.storage.get('audit')) || [] });

    if (path === '/api/admin/leaderboard') {
      const circuit = new URL(request.url).searchParams.get('circuit') || CIRCUITS[0].id;
      const rows = [];
      for (const r of await leaderboard(this, circuit, 50, true)) {
        if (r.flagged) r.username = (await this.storage.get(`user:${r.userId}`))?.username || r.userId;
        rows.push({ ...r, car: CARS.find((c) => c.id === r.car)?.name || r.car });
      }
      return json(200, { circuit, rows, circuits: CIRCUITS.filter((c) => !c.practiceOnly).map((c) => ({ id: c.id, name: c.name })) });
    }

    if (path === '/api/admin/reports') {
      if (method === 'GET') {
        const rows = (await this.list('report:')).map(([key, r]) => ({ id: key.slice(7), ...r }));
        return json(200, { reports: rows.sort((a, b) => String(b.at).localeCompare(String(a.at))) });
      }
      if (method === 'POST') {
        const body = await readBody(request);
        if (typeof body.id !== 'string') return json(400, { error: 'Report id required.' });
        await this.storage.delete(`report:${body.id}`);
        await this.audit('report.resolve', { id: body.id, note: String(body.note || '').slice(0, 120) });
        return json(200, { ok: true });
      }
    }

    if (path === '/api/admin/season') {
      const settings = await this.settings();
      const season = settings.season || { number: 1, startedAt: null };
      if (method === 'GET') {
        const hall = [];
        for (let n = season.number - 1; n >= Math.max(1, season.number - 5); n--) {
          const h = await this.storage.get(`hall:${n}`);
          if (h) hall.push(h);
        }
        const ranked = (await this.list('user:')).map(([, u]) => u).filter((u) => (u.rankedRaces || 0) > 0 && !u.banned);
        const byDivision = {};
        for (const u of ranked) { const d = divisionFor(u.rating ?? START_RATING).name; byDivision[d] = (byDivision[d] || 0) + 1; }
        return json(200, { season, players: ranked.length, byDivision, rewards: SEASON_REWARDS, hall });
      }
      if (method !== 'POST') return json(405, { error: 'Method not allowed.' });
      const body = await readBody(request);
      if (body.confirm !== `END SEASON ${season.number}`) return json(400, { error: `Type END SEASON ${season.number} to confirm.` });
      const ranked = (await this.list('user:')).map(([, u]) => u).filter((u) => (u.rankedRaces || 0) > 0 && !u.banned)
        .sort((a, b) => (b.rating ?? START_RATING) - (a.rating ?? START_RATING));
      const hall = {
        number: season.number, endedAt: new Date().toISOString(), startedAt: season.startedAt,
        top: ranked.slice(0, 10).map((u) => ({ username: u.username, rating: u.rating, division: divisionFor(u.rating).name, races: u.rankedRaces })),
      };
      let paid = 0;
      for (const u of ranked) {
        const div = divisionFor(u.rating ?? START_RATING);
        const credits = SEASON_REWARDS[div.id] || 0;
        u.inbox = [...(u.inbox || []), {
          text: `Season ${season.number} is over! You finished in ${div.name} with ${u.rating}. Season reward: ${credits.toLocaleString('en-US')} CR.`,
          credits, at: new Date().toISOString(),
        }].slice(-10);
        u.seasons = [...(u.seasons || []), { number: season.number, rating: u.rating, division: div.name }].slice(-20);
        u.rating = seasonReset(u.rating ?? START_RATING);
        u.rankedRaces = 0;
        await this.storage.put(`user:${u.id}`, u);
        paid += credits;
      }
      await this.storage.put(`hall:${season.number}`, hall);
      settings.season = { number: season.number + 1, startedAt: new Date().toISOString() };
      await this.storage.put('settings', settings);
      await this.audit('season.end', { season: season.number, players: ranked.length, paid });
      return json(200, { ok: true, season: settings.season, players: ranked.length, paid });
    }

    if (path === '/api/admin/broadcast' && method === 'POST') {
      const body = await readBody(request);
      const message = String(body.message || '').trim().slice(0, 200);
      if (!message) return json(400, { error: 'Write a message.' });
      let sent = 0;
      for (const p of this.server.lobby.players.values()) { p.conn.send({ type: 'broadcast', message }); sent += 1; }
      await this.audit('broadcast', { message, sent });
      return json(200, { ok: true, sent });
    }

    if (path === '/api/admin/export') {
      const users = (await this.list('user:')).map(([, u]) => { const { salt, passwordHash, ...safe } = u; return safe; });
      const summaries = Object.fromEntries((await this.list('summary:')).map(([k, v]) => [k.slice(8), v]));
      await this.audit('export', { users: users.length });
      return json(200, { exportedAt: new Date().toISOString(), users, summaries, settings: await this.settings() },
        { 'Content-Disposition': `attachment; filename="sunset-drift-backup-${dayKey()}.json"` });
    }

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
    if (action === 'rename') {
      const name = String(body.username || '').trim();
      if (!/^[A-Za-z0-9_.-]{3,16}$/.test(name)) return json(400, { error: 'Usernames are 3–16 letters, numbers, dots, dashes or underscores.' });
      const taken = await this.storage.get(`name:${name.toLowerCase()}`);
      if (taken && taken !== id) return json(409, { error: 'That username is taken.' });
      await this.storage.delete(`name:${user.username.toLowerCase()}`);
      const old = user.username;
      user.username = name;
      await this.storage.put({ [`user:${id}`]: user, [`name:${name.toLowerCase()}`]: id });
      this.kick(id, 'Your username was changed by an admin. Reconnect to race online.');
      await this.audit('user.rename', { from: old, to: name });
      return json(200, { ok: true });
    }
    if (action === 'message') {
      const text = String(body.text || '').trim().slice(0, 300);
      if (!text) return json(400, { error: 'Write a message.' });
      user.inbox = [...(user.inbox || []), { text, at: new Date().toISOString() }].slice(-10);
      await this.storage.put(`user:${id}`, user);
      await this.audit('user.message', { user: user.username, text });
      return json(200, { ok: true });
    }
    if (action === 'givecar') {
      const car = CARS.find((c) => c.id === body.carId);
      if (!car) return json(400, { error: 'Unknown car.' });
      const stored = await this.storage.get(`save:${id}`);
      if (!stored?.save) return json(409, { error: 'This player has no cloud save yet.' });
      const owned = Array.isArray(stored.save.ownedCars) ? stored.save.ownedCars : [];
      if (!owned.includes(car.id)) owned.push(car.id);
      stored.save.ownedCars = owned;
      stored.updatedAt = new Date().toISOString();
      await this.storage.put({ [`save:${id}`]: stored, [`summary:${id}`]: summarize(stored.save, stored.updatedAt) });
      await this.audit('user.givecar', { user: user.username, car: car.name });
      return json(200, { ok: true });
    }
    if (action === 'lbhide' || action === 'lbshow') {
      user.lbHidden = action === 'lbhide';
      await this.storage.put(`user:${id}`, user);
      await this.audit(`user.${action}`, { user: user.username });
      return json(200, { ok: true });
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

/* ───────────────────── metrics, leaderboards, reports ───────────────────── */

/** Bump today's counters (signups, logins, saves, onlineRaces, reports). */
export async function bump(storage, field, by = 1) {
  const key = `metrics:${dayKey()}`;
  const m = (await storage.get(key)) || {};
  m[field] = (m[field] || 0) + by;
  await storage.put(key, m);
}

/** Record that a player was active today (daily active players). */
export async function markActive(storage, userId) {
  const key = `seen:${dayKey()}:${userId}`;
  if (await storage.get(key)) return;
  await storage.put(key, 1);
  await bump(storage, 'active');
}

/** Top laps on a circuit from player summaries (banned and hidden excluded). */
export async function leaderboard(admin, circuitId, limit = 20, includeFlagged = false) {
  const rows = [];
  for (const [key, summary] of await admin.list('summary:')) {
    const t = summary?.bestLaps?.[circuitId];
    if (!Number.isFinite(t)) continue;
    // Faster than any build in the game could drive: never shown publicly.
    if (!plausibleLap(circuitId, t)) {
      if (includeFlagged) rows.push({ userId: key.slice('summary:'.length), username: '', time: t, car: summary.selectedCar || '', flagged: true });
      continue;
    }
    const userId = key.slice('summary:'.length);
    const user = await admin.storage.get(`user:${userId}`);
    if (!user || user.banned || (user.lbHidden && !includeFlagged)) continue;
    rows.push({ userId, username: user.username, time: t, car: summary.selectedCar || '', hidden: !!user.lbHidden });
  }
  rows.sort((a, b) => a.time - b.time);
  return rows.slice(0, limit);
}
