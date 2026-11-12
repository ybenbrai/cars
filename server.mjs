import http from 'node:http';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { Lobby } from './server/rooms.mjs';
import { upgrade as upgradeWebSocket, reject as rejectUpgrade } from './server/ws.mjs';

const scrypt = promisify(scryptCallback);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

const SESSION_COOKIE = 'sd_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BODY_LIMIT = 1024 * 1024; // 1 MB
const SAVE_LIMIT = 512 * 1024; // 512 KB
const AUTH_WINDOW_MS = 60 * 1000;
const AUTH_ATTEMPTS = 30;

const MP_PATH = '/api/mp';
const MP_PER_IP = 8; // simultaneous online connections per address
const MP_MSG_RATE = 80; // messages per second before a client is dropped

const USERNAME_RE = /^[A-Za-z0-9_.-]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* ───────────────────────── small helpers ───────────────────────── */

function sendJson(req, res, status, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...extraHeaders,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.byteLength,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') res.end();
  else res.end(body);
}

function readJsonBody(req, limit = BODY_LIMIT) {
  return new Promise((resolveBody, rejectBody) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      rejectBody(Object.assign(new Error('Body too large.'), { code: 413 }));
      return;
    }
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', rejectBody);
    req.on('end', () => {
      if (tooLarge) {
        rejectBody(Object.assign(new Error('Body too large.'), { code: 413 }));
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) {
        resolveBody({});
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          rejectBody(Object.assign(new Error('Body must be a JSON object.'), { code: 400 }));
          return;
        }
        resolveBody(parsed);
      } catch {
        rejectBody(Object.assign(new Error('Invalid JSON.'), { code: 400 }));
      }
    });
  });
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    const raw = part.slice(index + 1).trim();
    // A single malformed cookie from another app on the same host must not
    // break every API call, so keep undecodable values as-is.
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, createdAt: user.createdAt };
}

async function hashPassword(password, salt) {
  const derived = await scrypt(password, salt, 64);
  return Buffer.from(derived).toString('base64');
}

/* ───────────────────────── server ───────────────────────── */

/**
 * Create the game server used by `npm start` and the test suite.
 *
 * Static files are served from `root`. A small real-auth backend lives under
 * `/api`: scrypt password hashes on disk, opaque HttpOnly session cookies and a
 * per-account save file. Nothing sensitive is ever sent to the browser.
 *
 * @param {{ root?: string, cacheControl?: string, dataDir?: string, sessionTtlMs?: number }} [options]
 * @returns {import('node:http').Server}
 */
export function createStaticServer({
  root = process.cwd(),
  cacheControl = 'no-cache',
  dataDir = process.env.SD_DATA_DIR || '',
  sessionTtlMs = SESSION_TTL_MS,
} = {}) {
  const rootDir = resolve(root);
  const dataRoot = resolve(dataDir || join(rootDir, '.data'));
  const usersFile = join(dataRoot, 'users.json');
  const savesDir = join(dataRoot, 'saves');

  const sessions = new Map(); // token -> { userId, expires }
  const buckets = new Map(); // ip -> { start, count }
  let usersCache = null;
  let dbChain = Promise.resolve();

  function withDb(fn) {
    const run = dbChain.then(fn, fn);
    dbChain = run.then(() => {}, () => {});
    return run;
  }

  async function loadUsers() {
    try {
      const raw = await readFile(usersFile, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.users) ? parsed : { users: [] };
    } catch (error) {
      if (error.code === 'ENOENT') return { users: [] };
      throw error;
    }
  }

  async function getUsers() {
    if (!usersCache) usersCache = await loadUsers();
    return usersCache;
  }

  async function writeUsers(db) {
    await mkdir(dataRoot, { recursive: true });
    const tmp = `${usersFile}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
    await rename(tmp, usersFile);
  }

  async function writeSave(userId, save) {
    await mkdir(savesDir, { recursive: true });
    const file = join(savesDir, `${userId}.json`);
    const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
    const updatedAt = new Date().toISOString();
    await writeFile(tmp, JSON.stringify({ save, updatedAt }), 'utf8');
    await rename(tmp, file);
    return updatedAt;
  }

  /** @returns {Promise<{ save: object | null, updatedAt: string | null }>} */
  async function readSave(userId) {
    try {
      const raw = await readFile(join(savesDir, `${userId}.json`), 'utf8');
      const parsed = JSON.parse(raw);
      return { save: parsed?.save ?? null, updatedAt: parsed?.updatedAt ?? null };
    } catch (error) {
      if (error.code === 'ENOENT') return { save: null, updatedAt: null };
      // A corrupt or unreadable save must not look like "no save": the client
      // would then push its local copy over the player's real progress.
      throw error;
    }
  }

  function pruneSessions() {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expires <= now) sessions.delete(token);
    }
  }

  function sessionFor(req) {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expires <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  }

  async function currentUser(req) {
    const session = sessionFor(req);
    if (!session) return null;
    const db = await getUsers();
    const user = db.users.find((candidate) => candidate.id === session.userId);
    return user ? publicUser(user) : null;
  }

  function startSession(req, res, userId) {
    pruneSessions();
    if (sessions.size > 10_000) {
      // Extremely unlikely; drop the oldest session rather than grow forever.
      const oldest = sessions.keys().next().value;
      if (oldest) sessions.delete(oldest);
    }
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { userId, expires: Date.now() + sessionTtlMs });
    const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
    const cookie = [
      `${SESSION_COOKIE}=${token}`,
      'HttpOnly',
      'SameSite=Strict',
      'Path=/',
      `Max-Age=${Math.floor(sessionTtlMs / 1000)}`,
      secure ? 'Secure' : '',
    ].filter(Boolean).join('; ');
    res.setHeader('Set-Cookie', cookie);
  }

  function rateLimited(req) {
    const key = req.socket.remoteAddress || 'local';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > AUTH_WINDOW_MS) {
      bucket = { start: now, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (buckets.size > 5_000) {
      for (const [ip, value] of buckets) {
        if (now - value.start > AUTH_WINDOW_MS) buckets.delete(ip);
      }
    }
    return bucket.count > AUTH_ATTEMPTS;
  }

  async function handleApi(req, res, pathname, method) {
    const isRead = method === 'GET' || method === 'HEAD';
    const isWrite = method === 'POST' || method === 'PUT';

    if (pathname === '/api/health') {
      if (!isRead) {
        sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
        return true;
      }
      sendJson(req, res, 200, {
        ok: true,
        service: 'sunset-drift',
        auth: true,
        multiplayer: true,
        time: new Date().toISOString(),
      });
      return true;
    }

    if (pathname === '/api/auth/session') {
      if (!isRead) {
        sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
        return true;
      }
      const user = await currentUser(req);
      sendJson(req, res, 200, { user });
      return true;
    }

    if (pathname === '/api/auth/register') {
      if (method !== 'POST') {
        sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
        return true;
      }
      if (rateLimited(req)) {
        sendJson(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' }, { 'Retry-After': '60' });
        return true;
      }
      const body = await readJsonBody(req);
      const username = String(body.username || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      if (!USERNAME_RE.test(username)) {
        sendJson(req, res, 400, {
          error: 'Username must be 3–16 letters, numbers, dots, dashes or underscores.',
          field: 'username',
        });
        return true;
      }
      if (!EMAIL_RE.test(email) || email.length > 254) {
        sendJson(req, res, 400, { error: 'Enter a valid email address.', field: 'email' });
        return true;
      }
      if (password.length < 8 || password.length > 128) {
        sendJson(req, res, 400, { error: 'Password must be between 8 and 128 characters.', field: 'password' });
        return true;
      }

      const created = await withDb(async () => {
        // Reload from disk so concurrent writes never clobber an account.
        const db = await loadUsers();
        const takenName = db.users.some((user) => user.username.toLowerCase() === username.toLowerCase());
        const takenEmail = db.users.some((user) => user.email === email);
        if (takenName) return { error: 'That username is already taken.', field: 'username', status: 409 };
        if (takenEmail) return { error: 'An account with that email already exists.', field: 'email', status: 409 };

        const salt = randomBytes(16).toString('hex');
        const passwordHash = await hashPassword(password, salt);
        const user = {
          id: `u_${randomBytes(8).toString('hex')}`,
          username,
          email,
          salt,
          passwordHash,
          createdAt: new Date().toISOString(),
        };
        db.users.push(user);
        await writeUsers(db);
        usersCache = db;
        return { user };
      });

      if (created.error) {
        sendJson(req, res, created.status, { error: created.error, field: created.field });
        return true;
      }
      startSession(req, res, created.user.id);
      sendJson(req, res, 201, { user: publicUser(created.user) });
      return true;
    }

    if (pathname === '/api/auth/login') {
      if (method !== 'POST') {
        sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
        return true;
      }
      if (rateLimited(req)) {
        sendJson(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' }, { 'Retry-After': '60' });
        return true;
      }
      const body = await readJsonBody(req);
      const identifier = String(body.email || body.username || '').trim().toLowerCase();
      const password = String(body.password || '');
      const db = await getUsers();
      const user = db.users.find(
        (candidate) => candidate.email === identifier || candidate.username.toLowerCase() === identifier,
      );

      if (!user) {
        // Spend roughly the same time as a real check to blunt user probing.
        await hashPassword(password || 'invalid-password', 'not-a-real-salt');
        sendJson(req, res, 401, { error: 'Email or password is incorrect.' });
        return true;
      }

      const derived = await hashPassword(password, user.salt);
      const expected = Buffer.from(user.passwordHash, 'base64');
      const actual = Buffer.from(derived, 'base64');
      const valid = expected.length === actual.length && timingSafeEqual(expected, actual);
      if (!valid) {
        sendJson(req, res, 401, { error: 'Email or password is incorrect.' });
        return true;
      }

      startSession(req, res, user.id);
      sendJson(req, res, 200, { user: publicUser(user) });
      return true;
    }

    if (pathname === '/api/auth/delete') {
      if (method !== 'POST') {
        sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
        return true;
      }
      if (rateLimited(req)) {
        sendJson(req, res, 429, { error: 'Too many attempts. Wait a minute and try again.' });
        return true;
      }
      const session = sessionFor(req);
      if (!session) {
        sendJson(req, res, 401, { error: 'Sign in first.' });
        return true;
      }
      const body = await readJsonBody(req);
      const result = await withDb(async () => {
        const db = await loadUsers();
        const user = db.users.find((u) => u.id === session.userId);
        if (!user) return { status: 401, error: 'Sign in first.' };
        const derived = Buffer.from(await hashPassword(String(body.password || ''), user.salt), 'base64');
        const expected = Buffer.from(user.passwordHash, 'base64');
        if (derived.length !== expected.length || !timingSafeEqual(derived, expected)) {
          return { status: 401, error: 'Password is incorrect.' };
        }
        db.users = db.users.filter((u) => u.id !== user.id);
        await writeUsers(db);
        usersCache = db;
        try { await rm(join(savesDir, `${user.id}.json`), { force: true }); } catch { /* no save */ }
        for (const [token, s] of sessions) if (s.userId === user.id) sessions.delete(token);
        return { ok: true };
      });
      if (!result.ok) {
        sendJson(req, res, result.status, { error: result.error, field: 'password' });
        return true;
      }
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
      sendJson(req, res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/auth/logout') {
      if (method !== 'POST') {
        sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
        return true;
      }
      const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (token) sessions.delete(token);
      const secure = req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https';
      res.setHeader('Set-Cookie', [
        `${SESSION_COOKIE}=`,
        'HttpOnly',
        'SameSite=Strict',
        'Path=/',
        'Max-Age=0',
        secure ? 'Secure' : '',
      ].filter(Boolean).join('; '));
      sendJson(req, res, 200, { ok: true });
      return true;
    }

    if (pathname === '/api/save') {
      const user = await currentUser(req);
      if (!user) {
        sendJson(req, res, 401, { error: 'Sign in to use cloud saves.' });
        return true;
      }
      if (isRead) {
        const stored = await readSave(user.id);
        sendJson(req, res, 200, stored);
        return true;
      }
      if (method !== 'PUT') {
        sendJson(req, res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD, PUT' });
        return true;
      }
      const body = await readJsonBody(req, SAVE_LIMIT + 4096);
      if (!body.save || typeof body.save !== 'object' || Array.isArray(body.save)) {
        sendJson(req, res, 400, { error: 'A save object is required.' });
        return true;
      }
      const serialized = JSON.stringify(body.save);
      if (Buffer.byteLength(serialized) > SAVE_LIMIT) {
        sendJson(req, res, 413, { error: 'Save data is too large.' });
        return true;
      }
      // Optimistic concurrency: when the client says which cloud version its
      // copy is based on, refuse the write if another device saved since.
      // Clients that omit `baseUpdatedAt` keep the old last-writer-wins rule.
      const hasBase = Object.prototype.hasOwnProperty.call(body, 'baseUpdatedAt');
      const result = await withDb(async () => {
        if (hasBase) {
          const current = await readSave(user.id);
          if ((current.updatedAt ?? null) !== (body.baseUpdatedAt ?? null)) {
            return { conflict: true, updatedAt: current.updatedAt };
          }
        }
        return { updatedAt: await writeSave(user.id, body.save) };
      });
      if (result.conflict) {
        sendJson(req, res, 409, {
          error: 'Your cloud save changed on another device.',
          updatedAt: result.updatedAt,
        });
        return true;
      }
      sendJson(req, res, 200, { ok: true, updatedAt: result.updatedAt });
      return true;
    }

    sendJson(req, res, 404, { error: 'Unknown API endpoint.' });
    return true;
  }

  const server = http.createServer(async (req, res) => {
    const method = req.method || 'GET';

    let pathname;
    try {
      pathname = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]);
    } catch {
      sendJson(req, res, 400, { error: 'Malformed URL.' });
      return;
    }

    if (!pathname) pathname = '/';
    if (pathname.includes('\0')) {
      sendJson(req, res, 400, { error: 'Bad request.' });
      return;
    }

    /* ── API ─────────────────────────────────────────────────────── */
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      try {
        await handleApi(req, res, pathname, method);
      } catch (error) {
        const status = error?.code === 413 ? 413 : error?.code === 400 ? 400 : 500;
        if (!res.headersSent) {
          sendJson(req, res, status, {
            error: status === 413
              ? 'Request body is too large.'
              : status === 400
                ? error.message || 'Bad request.'
                : 'Server error. Try again.',
          });
        } else {
          res.end();
        }
      }
      return;
    }

    /* ── static files ────────────────────────────────────────────── */
    if (method !== 'GET' && method !== 'HEAD') {
      res.writeHead(405, {
        ...SECURITY_HEADERS,
        Allow: 'GET, HEAD',
        'Content-Type': 'text/plain; charset=utf-8',
      }).end('Method not allowed');
      return;
    }

    if (pathname === '/') pathname = '/index.html';

    const file = resolve(join(rootDir, pathname));
    const rel = relative(rootDir, file);

    // Never serve dot-files or dot-directories (.data with password hashes and
    // saves, .git, .env, ...) or anything inside the account data directory.
    const relToData = relative(dataRoot, file);
    const insideData = !relToData.startsWith('..') && !isAbsolute(relToData);
    const hasDotSegment = rel.split(sep).some((segment) => segment.startsWith('.'));
    if (rel.startsWith('..') || isAbsolute(rel) || hasDotSegment || insideData) {
      res.writeHead(403, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
      return;
    }

    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');

      const data = await readFile(file);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME_TYPES[extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': data.byteLength,
        'Cache-Control': cacheControl,
      });

      if (method === 'HEAD') res.end();
      else res.end(data);
    } catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });

  /* ── online multiplayer (WebSocket) ────────────────────────────── */
  const lobby = new Lobby();
  const sockets = new Set();
  const perIp = new Map();

  server.on('upgrade', async (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    let pathname = '';
    try { pathname = new URL(req.url || '/', 'http://x').pathname; } catch { /* handled below */ }
    if (pathname !== MP_PATH) {
      rejectUpgrade(socket, 404, 'Not Found');
      return;
    }
    // Browsers send cookies with WebSocket handshakes regardless of CORS, so
    // refuse pages from other origins (cross-site WebSocket hijacking).
    const origin = req.headers.origin;
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { /* rejected below */ }
      if (originHost !== req.headers.host) {
        rejectUpgrade(socket, 403, 'Forbidden');
        return;
      }
    }
    let user = null;
    try { user = await currentUser(req); } catch { /* treated as signed out */ }
    if (!user) {
      rejectUpgrade(socket, 401, 'Unauthorized');
      return;
    }
    const ip = req.socket.remoteAddress || 'local';
    if ((perIp.get(ip) || 0) >= MP_PER_IP) {
      rejectUpgrade(socket, 429, 'Too Many Requests');
      return;
    }

    const lobbyConn = {
      id: `p_${randomBytes(6).toString('hex')}`,
      userId: user.id,
      username: user.username,
      send: (message) => ws?.send(JSON.stringify(message)),
      close: (code, reason) => ws?.close(code, reason),
    };
    const rate = { start: Date.now(), count: 0 };
    let joined = false;
    const ws = upgradeWebSocket(req, socket, head, {
      onMessage(text) {
        const now = Date.now();
        if (now - rate.start >= 1000) {
          rate.start = now;
          rate.count = 0;
        }
        if (++rate.count > MP_MSG_RATE) {
          ws.close(1008, 'Too many messages.');
          return;
        }
        let message;
        try { message = JSON.parse(text); } catch { return; }
        lobby.handle(lobbyConn, message);
      },
      onClose() {
        sockets.delete(ws);
        if (joined) {
          perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
          if (!perIp.get(ip)) perIp.delete(ip);
          lobby.disconnect(lobbyConn);
        }
      },
    });
    if (!ws || !ws.open) return;
    joined = true;
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    sockets.add(ws);
    lobby.connect(lobbyConn);
  });

  // Upgraded sockets are detached from the HTTP server, so close them too.
  const closeHttp = server.close.bind(server);
  server.close = (callback) => {
    for (const ws of sockets) ws.terminate();
    sockets.clear();
    return closeHttp(callback);
  };
  server.lobby = lobby;
  return server;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const rootFlag = args.indexOf('--root');
  const positional = args.find((arg, index) => !arg.startsWith('-') && args[index - 1] !== '--root');
  const root = rootFlag !== -1 ? args[rootFlag + 1] : positional || process.cwd();
  const port = Number(process.env.PORT) || 5173;
  const server = createStaticServer({ root });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\n  Port ${port} is already in use. Try: PORT=5174 npm start\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  });

  server.listen(port, () => {
    console.log(`\n  Sunset Drift → http://localhost:${port}\n  Serving ${resolve(root)}\n`);
  });
}
