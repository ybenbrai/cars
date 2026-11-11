// Graphics quality: HIGH / MEDIUM / LOW, chosen by the player or (AUTO) by
// watching real frame times during a race and stepping down when the game
// cannot hold its frame rate. It never steps back up on its own, so the
// picture does not flicker between levels.

export const QUALITY_LEVELS = [
  { id: 'low', label: 'LOW', pixelRatio: 1, composerRatio: 1, shadows: false, bloom: false },
  { id: 'medium', label: 'MEDIUM', pixelRatio: 1.25, composerRatio: 1.25, shadows: true, bloom: true },
  { id: 'high', label: 'HIGH', pixelRatio: 2, composerRatio: 1.75, shadows: true, bloom: true },
];
export const QUALITY_MODES = ['auto', 'high', 'medium', 'low'];

// Auto mode: step down when the average frame over WINDOW seconds is slower
// than SLOW_MS (about 42 fps), after a short settle time.
const WINDOW = 3;
const SLOW_MS = 24;
const SETTLE = 2;

export class QualityManager {
  constructor({ renderer, composer, bloom, scene, dpr }) {
    this.renderer = renderer;
    this.composer = composer;
    this.bloom = bloom;
    this.scene = scene;
    this.dpr = dpr;
    this.mode = 'auto';
    // Touch devices start one step down; desktops start at the top.
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    this.autoLevel = coarse ? 1 : 2;
    this.level = -1;
    this.reset();
    this.apply();
  }

  reset() {
    this.acc = 0;
    this.frames = 0;
    this.settle = SETTLE;
  }

  setMode(mode) {
    this.mode = QUALITY_MODES.includes(mode) ? mode : 'auto';
    this.reset();
    this.apply();
  }

  get current() {
    return QUALITY_LEVELS[this.level];
  }

  targetLevel() {
    if (this.mode === 'auto') return this.autoLevel;
    return QUALITY_LEVELS.findIndex((q) => q.id === this.mode);
  }

  apply() {
    const level = this.targetLevel();
    if (level === this.level) return;
    const shadowsChanged = this.level < 0 || QUALITY_LEVELS[this.level].shadows !== QUALITY_LEVELS[level].shadows;
    this.level = level;
    const q = QUALITY_LEVELS[level];
    this.renderer.setPixelRatio(Math.min(this.dpr, q.pixelRatio));
    this.composer.setPixelRatio(Math.min(this.dpr, q.composerRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloom.enabled = q.bloom;
    this.renderer.shadowMap.enabled = q.shadows;
    if (shadowsChanged) {
      // Materials compile shadow support in; they must rebuild to drop it.
      this.scene.traverse((obj) => {
        const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
        for (const m of mats) m.needsUpdate = true;
      });
    }
    this.onChange?.(q);
  }

  /** Feed one racing frame's duration (seconds). */
  sample(dt) {
    if (this.mode !== 'auto' || this.autoLevel === 0) return;
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.acc += dt;
    this.frames++;
    if (this.acc < WINDOW) return;
    const avgMs = (this.acc / this.frames) * 1000;
    this.acc = 0;
    this.frames = 0;
    if (avgMs > SLOW_MS) {
      this.autoLevel--;
      this.settle = SETTLE;
      this.apply();
    }
  }
}
