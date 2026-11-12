// Authentication client.
//
// Real accounts live on the backend (`server.mjs` in this repo) and passwords
// are hashed there with scrypt. The browser only ever receives an HttpOnly
// session cookie — no password, token or hash is written to localStorage.
//
// When the game is hosted as a static site (for example GitHub Pages) the
// backend is unavailable. In that case the game stays fully playable in a
// clearly-labelled local guest mode.

const JSON_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    throw new Error('BACKEND_UNAVAILABLE');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.status = response.status;
    error.field = data.field;
    throw error;
  }
  return data;
}

export class AuthService {
  constructor() {
    this.user = null;
    this.mode = 'guest';
    this.available = false;
    this.checked = false;
  }

  get isAccount() { return this.mode === 'account' && !!this.user; }
  get displayName() { return this.user?.username || 'GUEST'; }

  async bootstrap() {
    if (this.checked) return this.state();
    try {
      const data = await api('/api/auth/session', { headers: JSON_HEADERS });
      this.available = true;
      if (data.user) {
        this.user = data.user;
        this.mode = 'account';
      }
    } catch {
      this.available = false;
      this.mode = 'guest';
      this.user = null;
    }
    this.checked = true;
    return this.state();
  }

  state() {
    return { mode: this.mode, user: this.user, available: this.available, checked: this.checked };
  }

  async register({ username, email, password }) {
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ username, email, password }),
      });
      this.user = data.user;
      this.mode = 'account';
      this.available = true;
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: this.explain(err), code: err.message };
    }
  }

  async login({ email, password }) {
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, password }),
      });
      this.user = data.user;
      this.mode = 'account';
      this.available = true;
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: this.explain(err), code: err.message };
    }
  }

  /** Permanently delete this account and its cloud save (password required). */
  async deleteAccount(password) {
    await api('/api/auth/delete', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ password }) });
    this.user = null;
    this.mode = 'guest';
    return this.state();
  }

  async logout() {
    try {
      if (this.available) await api('/api/auth/logout', { method: 'POST', headers: JSON_HEADERS });
    } catch { /* already signed out / offline */ }
    this.user = null;
    this.mode = 'guest';
    return this.state();
  }

  /**
   * Fetch this account's cloud save.
   * Returns `{ ok: true, save, updatedAt }` (save is null when none exists yet)
   * or `{ ok: false }` when the request failed. Callers must not treat a failed
   * fetch as "no cloud save", or they would overwrite real progress.
   */
  async loadCloudSave() {
    if (!this.isAccount || !this.available) return { ok: false };
    try {
      const data = await api('/api/save', { headers: JSON_HEADERS });
      return { ok: true, save: data?.save || null, updatedAt: data?.updatedAt || null };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Upload a save that is based on cloud version `baseUpdatedAt` (null when
   * the cloud had no save). Returns `{ ok: true, updatedAt }`,
   * `{ ok: false, conflict: true }` when another device saved first, or
   * `{ ok: false }` on any other failure.
   */
  async pushCloudSave(save, baseUpdatedAt = null) {
    if (!this.isAccount || !this.available || !save) return { ok: false };
    try {
      const data = await api('/api/save', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ save, baseUpdatedAt }),
      });
      return { ok: true, updatedAt: data.updatedAt || null };
    } catch (err) {
      return { ok: false, conflict: err.status === 409 };
    }
  }

  explain(err) {
    if (err.message === 'BACKEND_UNAVAILABLE') {
      return 'Cloud accounts are unavailable on this static host. Play as a guest — your progress is still saved in this browser.';
    }
    if (err.status === 429) return 'Too many attempts. Wait a minute and try again.';
    return err.message || 'Something went wrong.';
  }
}
