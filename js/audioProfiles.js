// Pure helpers for the car audio system. No WebAudio, no Three.js, no DOM, so
// Node tests can import them directly. The sound graph itself lives in
// audio.js; this module decides *what* each car should sound like.
//
// Every profile keeps the exaggerated arcade baseline from the old hardcoded
// table. The extra fields describe the exhaust note and how much forced
// induction the car has, so upgrades can change the character without changing
// the car's identity.

import { upgradeMultipliers } from './data/upgrades.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Number of pooled rival engine voices. The race loop sends only the nearest
// few rivals, so the cost stays fixed no matter how many cars are on grid.
export const RIVAL_VOICE_COUNT = 3;

export const ENGINE_PROFILES = {
  hatch: {
    base: 54, span: 74, sub: 0.34, bright: 0.9, gain: 0.9, wave: 'sawtooth',
    exhaustWave: 'triangle', exhaustRatio: 0.5, burble: 0.14, turbo: 0.28,
  },
  sedan: {
    base: 47, span: 66, sub: 0.5, bright: 0.8, gain: 0.92, wave: 'sawtooth',
    exhaustWave: 'triangle', exhaustRatio: 0.5, burble: 0.2, turbo: 0.25,
  },
  sports: {
    base: 60, span: 88, sub: 0.42, bright: 1.05, gain: 1.0, wave: 'sawtooth',
    exhaustWave: 'sawtooth', exhaustRatio: 0.5, burble: 0.22, turbo: 0.62,
  },
  muscle: {
    base: 38, span: 58, sub: 0.86, bright: 0.68, gain: 1.22, wave: 'square',
    exhaustWave: 'square', exhaustRatio: 0.5, burble: 0.5, turbo: 0.08,
  },
  super: {
    base: 68, span: 102, sub: 0.34, bright: 1.25, gain: 1.02, wave: 'sawtooth',
    exhaustWave: 'sawtooth', exhaustRatio: 1, burble: 0.12, turbo: 0.85,
  },
  hyper: {
    base: 78, span: 118, sub: 0.3, bright: 1.5, gain: 1.04, wave: 'sawtooth',
    exhaustWave: 'sawtooth', exhaustRatio: 1, burble: 0.1, turbo: 1.0,
  },
  suv: {
    base: 41, span: 54, sub: 0.74, bright: 0.72, gain: 1.08, wave: 'square',
    exhaustWave: 'square', exhaustRatio: 0.5, burble: 0.42, turbo: 0.12,
  },
  offroad: {
    base: 45, span: 60, sub: 0.68, bright: 0.76, gain: 1.08, wave: 'square',
    exhaustWave: 'square', exhaustRatio: 0.5, burble: 0.38, turbo: 0.15,
  },
};

const WAVES = new Set(['sine', 'square', 'sawtooth', 'triangle']);

/** Resolve a car category and its tuning into a concrete audio profile. */
export function engineProfile(category, upgrades = null) {
  const spec = ENGINE_PROFILES[category] || ENGINE_PROFILES.sports;
  const m = upgradeMultipliers(upgrades);
  // Power parts (engine, turbo, intake, exhaust-adjacent bolt-ons) sharpen the
  // note and add whistle/lope. Grip and brake parts leave the voice alone.
  const power = (m.accel - 1) + (m.boost - 1) * 0.6;
  return {
    ...spec,
    bright: spec.bright * (1 + power * 0.22),
    gain: spec.gain * (1 + power * 0.1),
    turbo: clamp(spec.turbo + power * 0.55, 0, 1.5),
    burble: clamp(spec.burble + power * 0.14, 0, 0.8),
  };
}

/** Turbo whistle spools with revs and load; nitro pushes it into overboost. */
export function turboAmount({ rpm = 0, throttle = false, boosting = false, turbo = 0, speedN = 0 } = {}) {
  if (turbo <= 0) return 0;
  const spool = clamp(0.25 + rpm * 0.9 + speedN * 0.25, 0, 1);
  const load = throttle ? 1 : 0.28;
  return clamp(turbo * spool * load * (boosting ? 1.35 : 1), 0, 1);
}

/** Induction roar follows the throttle opening and revs, not road speed. */
export function intakeAmount({ rpm = 0, throttle = false, speedN = 0 } = {}) {
  return clamp((throttle ? 0.55 : 0.08) + rpm * 0.35 + speedN * 0.15, 0, 1);
}

/** Low, rough scrub of the driven tyres spinning up off the line. */
export function wheelspinSound({ wheelspin = 0, wet = false, speedN = 0 } = {}) {
  const spin = clamp(Number.isFinite(wheelspin) ? wheelspin : 0, 0, 1);
  if (spin <= 0) return 0;
  // Wet launches spin more easily and make a softer, splashier noise; once the
  // car is moving the regular slide layers take over.
  const range = clamp(1 - speedN * 0.8, 0.2, 1);
  return clamp(spin * range * (wet ? 1.15 : 1), 0, 1);
}

/** Sustained tyre squeal once the car is properly sliding. */
export function squealAmount({ slip = 0, handbrake = false, speedN = 0 } = {}) {
  if (speedN < 0.05) return 0;
  const slide = clamp((slip - 1.6) / 10, 0, 1);
  const early = clamp((slip - 0.8) / 4, 0, 1) * 0.2;
  return clamp(Math.max(slide, early) + (handbrake ? 0.12 : 0), 0, 1) * clamp(speedN * 3, 0, 1);
}

/** Short chirp as the tyres first break away, fading once fully sideways. */
export function tireChirpAmount({ slip = 0, speedN = 0 } = {}) {
  if (speedN < 0.12) return 0;
  const onset = clamp((slip - 0.8) / 2.2, 0, 1);
  const fade = clamp(1 - (slip - 4) / 6, 0, 1);
  return onset * fade * clamp(speedN * 2, 0, 1);
}

/** Distance falloff for a rival engine. Silent beyond the listening radius. */
export function rivalGain(distance, maxDistance = 48) {
  if (!Number.isFinite(distance) || distance >= maxDistance) return 0;
  const near = clamp(1 - Math.max(0, distance) / maxDistance, 0, 1);
  return near * near * 0.9;
}

/** Stereo position from a rival's lateral offset in the player's frame. */
export function rivalPan(lateral, reach = 18) {
  if (!Number.isFinite(lateral)) return 0;
  return clamp(lateral / reach, -1, 1);
}

/** Volume of the little exhaust crack on a gear change. */
export function shiftPop({ up = true, rpm = 0, turbo = 0 } = {}) {
  return clamp((up ? 0.018 : 0.008) + rpm * 0.028 + turbo * 0.018, 0, 0.09);
}

export function isValidWave(wave) {
  return WAVES.has(wave);
}
