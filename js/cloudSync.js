// Cloud save synchronisation for signed-in players.
//
// Rules:
// - Pushes stay off until this session has successfully *read* the cloud
//   save, so a failed fetch can never overwrite newer progress on the server.
// - Every push carries the `updatedAt` of the cloud version the local copy is
//   based on; the server answers 409 when another tab or device saved since.
// - On a 409 the cloud copy is always imported. The last-synced marker lives
//   in localStorage and is shared by every tab on the account, while each tab
//   keeps its own in-memory save, so the marker cannot decide that case.
// - Only one upload runs at a time; changes made meanwhile are queued.

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

export class CloudSync {
  /**
   * @param {{
   *   auth: { isAccount: boolean, loadCloudSave: Function, pushCloudSave: Function },
   *   getStore: () => any,
   *   onImported?: (store: any) => void,
   *   storage?: Storage,
   *   delayMs?: number,
   * }} options
   */
  constructor({ auth, getStore, onImported = () => {}, storage, delayMs = 1200 }) {
    this.auth = auth;
    this.getStore = getStore;
    this.onImported = onImported;
    this.delayMs = delayMs;
    try {
      this.storage = storage || globalThis.localStorage || memoryStorage();
    } catch {
      this.storage = memoryStorage();
    }
    this.timer = null;
    this.synced = false;
    this.version = null;
    this.pushPromise = null;
    this.pushQueued = false;
  }

  get pending() { return !!this.timer; }

  reset() {
    this.cancel();
    this.synced = false;
    this.version = null;
    this.pushQueued = false;
  }

  cancel() {
    clearTimeout(this.timer);
    this.timer = null;
  }

  /** Debounced push (or re-read, when the last read failed) after a change. */
  schedule() {
    if (!this.auth.isAccount || !this.getStore()) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.synced) this.push();
      else this.reconcile();
    }, this.delayMs);
  }

  baseKey(target) {
    return `${target.keyFor}:cloud-base`;
  }

  readBase(target) {
    try { return this.storage.getItem(this.baseKey(target)) || null; } catch { return null; }
  }

  remember(target, updatedAt) {
    this.version = updatedAt || null;
    try {
      if (this.version) this.storage.setItem(this.baseKey(target), this.version);
      else this.storage.removeItem(this.baseKey(target));
    } catch { /* storage unavailable */ }
  }

  /**
   * Decide between a successfully fetched cloud save and the local copy.
   * The cloud wins when forced (after a 409), when it changed since this
   * browser last synced, or when the local copy has no profile yet.
   * Returns true when the cloud save was imported.
   */
  apply(target, cloud, { force = false } = {}) {
    const base = this.readBase(target);
    const cloudWins = !!cloud.save && (force || cloud.updatedAt !== base || !target.data.profile);
    if (cloudWins) {
      // Import without echoing the same data straight back to the server.
      const onChange = target.onChange;
      target.onChange = null;
      target.import(cloud.save);
      target.onChange = onChange;
    }
    this.remember(target, cloud.updatedAt);
    return cloudWins;
  }

  /**
   * Upload the active save. The returned promise settles once the in-flight
   * upload and anything queued behind it are done.
   */
  push() {
    if (!this.auth.isAccount || !this.getStore() || !this.synced) return Promise.resolve();
    if (this.pushPromise) {
      this.pushQueued = true;
      return this.pushPromise;
    }
    this.pushPromise = (async () => {
      try {
        do {
          this.pushQueued = false;
          const target = this.getStore();
          const result = await this.auth.pushCloudSave(target.toJSON(), this.version);
          // The player may have signed out or switched accounts meanwhile.
          if (this.getStore() !== target || !this.auth.isAccount) return;
          if (result.ok) {
            this.remember(target, result.updatedAt);
          } else if (result.conflict) {
            this.synced = false;
            this.pushQueued = false;
            await this.reconcile({ force: true, fromPush: true });
            // Loop again only if reconcile queued a push (cloud had no save).
            continue;
          }
        } while (this.pushQueued && this.synced);
      } finally {
        this.pushPromise = null;
      }
    })();
    return this.pushPromise;
  }

  /**
   * Re-read the cloud save and merge it into the active store. Returns false
   * when the cloud could not be read; pushes stay disabled until a later
   * retry succeeds.
   */
  async reconcile({ force = false, fromPush = false } = {}) {
    if (!this.auth.isAccount || !this.getStore()) return false;
    const target = this.getStore();
    const cloud = await this.auth.loadCloudSave();
    if (this.getStore() !== target || !this.auth.isAccount || !cloud.ok) return false;
    this.synced = true;
    if (this.apply(target, cloud, { force })) {
      this.onImported(target);
    } else if (target.data.profile) {
      // Called from inside push(): queue instead of starting a nested push.
      if (fromPush) this.pushQueued = true;
      else this.push();
    }
    return true;
  }

  /** Wait for any pending change to reach the server (used before logout). */
  async flush() {
    const pending = this.pending;
    this.cancel();
    if (!this.synced || !this.getStore()) return;
    if (pending) await this.push();
    else if (this.pushPromise) await this.pushPromise;
  }
}
