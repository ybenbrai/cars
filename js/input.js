const KEY_ACTIONS = {
  KeyR: 'reset',
  KeyC: 'camera',
  Escape: 'pause',
  KeyM: 'mute',
  KeyP: 'pause',
};

// Driving controls. Each action has a primary and an optional secondary
// key; players can remap the primary (Profile → Controls).
export const DRIVE_ACTIONS = [
  { id: 'gas', label: 'ACCELERATE' },
  { id: 'brake', label: 'BRAKE / REVERSE' },
  { id: 'left', label: 'STEER LEFT' },
  { id: 'right', label: 'STEER RIGHT' },
  { id: 'handbrake', label: 'HANDBRAKE' },
  { id: 'boost', label: 'NITRO' },
  { id: 'lookBack', label: 'LOOK BACK' },
];

export const DEFAULT_BINDINGS = {
  gas: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  handbrake: ['Space'],
  boost: ['ShiftLeft', 'ShiftRight'],
  lookBack: ['KeyB'],
};

/** Readable name for a KeyboardEvent.code. */
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const named = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'SPACE',
    ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT', AltRight: 'R-ALT', Enter: 'ENTER', Tab: 'TAB',
  };
  return named[code] || code.toUpperCase();
}

/** Merge saved primary keys over the defaults (secondaries stay). */
export function resolveBindings(saved = {}) {
  const out = {};
  for (const [action, keys] of Object.entries(DEFAULT_BINDINGS)) {
    const primary = typeof saved?.[action] === 'string' ? saved[action] : keys[0];
    out[action] = [primary, ...keys.slice(1).filter((k) => k !== primary)];
  }
  return out;
}

function isTextTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export class Input {
  constructor() {
    this.held = new Set();
    this.touch = { left: false, right: false, gas: false, brake: false, handbrake: false, boost: false };
    this.pad = { steer: 0, gas: false, brake: false, handbrake: false, boost: false };
    this.padPrev = {};
    this.onAction = null;
    this.enabled = true;
    this.touchCapable = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.setBindings();
    this.capture = null;

    window.addEventListener('keydown', (e) => {
      // Never swallow keys while the player is typing a name, email or password.
      if (isTextTarget(e.target)) {
        if (e.code === 'Escape') e.target.blur();
        return;
      }
      // Remapping: the next key press is the new binding (Escape cancels).
      if (this.capture) {
        e.preventDefault();
        const done = this.capture;
        this.capture = null;
        done(e.code === 'Escape' ? null : e.code);
        return;
      }
      if (!this.enabled) return;
      if (this.boundCodes.has(e.code)) e.preventDefault();
      if (e.repeat) {
        if (e.code === 'Space') e.preventDefault();
        return;
      }
      this.held.add(e.code);
      const action = KEY_ACTIONS[e.code];
      if (action) this.onAction?.(action);
    });

    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.held.clear();
      this.resetTouch();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.held.clear();
        this.resetTouch();
      }
    });

    this.bindTouch();
  }

  resetTouch() {
    this.touch = { left: false, right: false, gas: false, brake: false, handbrake: false, boost: false };
    document.querySelectorAll('.tbtn.active').forEach((el) => el.classList.remove('active'));
  }

  bindTouch() {
    document.querySelectorAll('.tbtn').forEach((button) => {
      const action = button.dataset.action;
      // Camera and pause are one-shot taps owned by the UI, not held pedals.
      if (!action) return;
      const press = (e) => {
        e.preventDefault();
        this.touch[action] = true;
        button.classList.add('active');
        button.setPointerCapture?.(e.pointerId);
      };
      const release = (e) => {
        e.preventDefault();
        this.touch[action] = false;
        button.classList.remove('active');
      };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse') release(e);
      });
      button.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  pollGamepad() {
    if (!this.enabled) return;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) {
      if (p && p.connected) { pad = p; break; }
    }
    if (!pad) {
      this.pad.steer = 0;
      this.pad.gas = this.pad.brake = this.pad.handbrake = this.pad.boost = false;
      return;
    }
    const axis = pad.axes[0] || 0;
    this.pad.steer = Math.abs(axis) > 0.14 ? axis : 0;
    this.pad.gas = !!(pad.buttons[7]?.pressed || pad.buttons[0]?.pressed);
    this.pad.brake = !!(pad.buttons[6]?.pressed || pad.buttons[2]?.pressed);
    this.pad.handbrake = !!(pad.buttons[4]?.pressed || pad.buttons[5]?.pressed);
    this.pad.boost = !!pad.buttons[1]?.pressed;

    const edge = (index, action) => {
      const pressed = !!pad.buttons[index]?.pressed;
      if (pressed && !this.padPrev[index]) this.onAction?.(action);
      this.padPrev[index] = pressed;
    };
    edge(3, 'camera');
    edge(9, 'pause');
  }

  update() {
    this.pollGamepad();
  }

  /** Apply saved bindings ({ action: code }) over the defaults. */
  setBindings(saved) {
    this.bindings = resolveBindings(saved);
    this.boundCodes = new Set(Object.values(this.bindings).flat());
  }

  /** Call back with the next key pressed (null if cancelled). */
  captureNext(callback) {
    this.held.clear();
    this.capture = callback;
  }

  isDown(action) {
    return this.bindings[action].some((code) => this.held.has(code));
  }

  get gas() {
    // On touch the nitro circle doubles as throttle: one thumb can hold both,
    // since a phone cannot reliably press two buttons at once.
    return this.enabled && (
      this.isDown('gas')
      || this.touch.gas || this.touch.boost || this.pad.gas
    );
  }

  get brake() {
    return this.enabled && (this.isDown('brake') || this.touch.brake || this.pad.brake);
  }

  get steer() {
    if (!this.enabled) return 0;
    let value = 0;
    if (this.isDown('left') || this.touch.left) value -= 1;
    if (this.isDown('right') || this.touch.right) value += 1;
    if (!value && this.pad.steer) value = -this.pad.steer;
    return Math.max(-1, Math.min(1, value));
  }

  get handbrake() {
    return this.enabled && (this.isDown('handbrake') || this.touch.handbrake || this.pad.handbrake);
  }

  get boost() {
    return this.enabled && (this.isDown('boost') || this.touch.boost || this.pad.boost);
  }

  /** Hold B for a rear-view look over the shoulder. */
  get lookBack() {
    return this.enabled && this.isDown('lookBack');
  }

  releaseAll() {
    this.held.clear();
    this.resetTouch();
  }
}
