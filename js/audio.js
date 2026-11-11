import { MenuMusic } from './music.js';

// Each body style gets its own engine voice. The numbers are deliberately
// exaggerated: a muscle car should rumble at idle and a hypercar should scream.
const PROFILES = {
  hatch: { base: 54, span: 74, sub: 0.34, bright: 0.9, gain: 0.9, wave: 'sawtooth' },
  sedan: { base: 47, span: 66, sub: 0.5, bright: 0.8, gain: 0.92, wave: 'sawtooth' },
  sports: { base: 60, span: 88, sub: 0.42, bright: 1.05, gain: 1.0, wave: 'sawtooth' },
  muscle: { base: 38, span: 58, sub: 0.86, bright: 0.68, gain: 1.22, wave: 'square' },
  super: { base: 68, span: 102, sub: 0.34, bright: 1.25, gain: 1.02, wave: 'sawtooth' },
  hyper: { base: 78, span: 118, sub: 0.3, bright: 1.5, gain: 1.04, wave: 'sawtooth' },
  suv: { base: 41, span: 54, sub: 0.74, bright: 0.72, gain: 1.08, wave: 'square' },
  offroad: { base: 45, span: 60, sub: 0.68, bright: 0.76, gain: 1.08, wave: 'square' },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.master = null;
    this.noiseBuffer = null;
    this.engine = null;
    this.lastSpeed = 0;
    this.profile = PROFILES.sports;
    this.profileId = 'sports';
    this.launchPhase = 0;
    this.limiterPhase = 0;
    this.music = null;
    this.wantMusic = false;
    // Player volume settings, 0–1.
    this.volume = 1;
    this.musicVolume = 1;
  }

  /** Master and music volume (0–1), from the pause-menu settings. */
  setVolumes(master = 1, music = 1) {
    this.volume = Math.min(1, Math.max(0, master));
    this.musicVolume = Math.min(1, Math.max(0, music));
    if (this.music) {
      this.music.level = this.musicVolume;
      // Apply straight away if the menu music is already playing.
      if (this.music.playing) {
        this.music.out.gain.setTargetAtTime(0.5 * this.musicVolume, this.ctx.currentTime, 0.1);
      }
    }
    if (this.ready) this.applyVolume(0.08);
  }

  get masterLevel() {
    return this.muted ? 0.0001 : Math.max(0.0001, 0.42 * this.volume);
  }

  /**
   * Menu music on/off. Safe to call before the first user gesture: the music
   * starts once the audio context exists (browsers block audio until then).
   */
  setMusic(on) {
    this.wantMusic = !!on;
    if (!this.ready) return;
    if (on) this.music.start();
    else this.music.stop();
  }

  setProfile(category) {
    this.profileId = PROFILES[category] ? category : 'sports';
    this.profile = PROFILES[this.profileId];
    if (!this.ready) return;
    const e = this.engine;
    e.oscA.type = this.profile.wave;
    e.oscB.type = this.profile.wave === 'square' ? 'sawtooth' : 'square';
  }

  init() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // reusable noise buffer
    const length = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    // engine
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.9;
    engineGain.connect(filter);
    filter.connect(master);

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 55;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 27.5;
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 27;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.5;
    oscA.connect(engineGain);
    oscB.connect(engineGain);
    sub.connect(subGain);
    subGain.connect(engineGain);
    oscA.start();
    oscB.start();
    sub.start();

    this.engine = { engineGain, filter, oscA, oscB, sub };

    // tire screech
    const tire = ctx.createBufferSource();
    tire.buffer = buffer;
    tire.loop = true;
    const tireFilter = ctx.createBiquadFilter();
    tireFilter.type = 'bandpass';
    tireFilter.frequency.value = 1700;
    tireFilter.Q.value = 2.2;
    const tireGain = ctx.createGain();
    tireGain.gain.value = 0;
    tire.connect(tireFilter);
    tireFilter.connect(tireGain);
    tireGain.connect(master);
    tire.start();
    this.tire = { tireGain, tireFilter };

    // wind
    const wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 700;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    wind.start();
    this.wind = { windGain, windFilter };

    // nitro hiss
    const nitro = ctx.createBufferSource();
    nitro.buffer = buffer;
    nitro.loop = true;
    const nitroFilter = ctx.createBiquadFilter();
    nitroFilter.type = 'highpass';
    nitroFilter.frequency.value = 900;
    const nitroGain = ctx.createGain();
    nitroGain.gain.value = 0;
    nitro.connect(nitroFilter);
    nitroFilter.connect(nitroGain);
    nitroGain.connect(master);
    nitro.start();
    this.nitro = { nitroGain };

    this.music = new MenuMusic(ctx, master, buffer);
    this.music.level = this.musicVolume;

    this.ready = true;
    this.applyVolume(1);
    if (this.wantMusic) this.music.start();
    if (ctx.state === 'suspended') ctx.resume();
  }

  applyVolume(t) {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(this.masterLevel, this.ctx.currentTime, t);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ready) this.applyVolume(0.08);
    return this.muted;
  }

  toggleMuted() {
    return this.setMuted(!this.muted);
  }

  update(state, dt = 1 / 60) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const speedN = Math.min(1, state.speed / (state.maxSpeed || 56));
    const profile = this.profile;
    let gear = 0;
    let rpm = 0;
    if (Number.isFinite(state.rpm)) {
      rpm = Math.max(0, Math.min(1, state.rpm));
      const number = Number(state.gear);
      gear = Number.isFinite(number) && number >= 1 ? Math.min(5, number - 1) : 0;
    } else {
      const gearSpan = 5.6;
      const pos = speedN * gearSpan;
      gear = Math.min(5, Math.floor(pos));
      rpm = pos - gear;
    }
    const freq = profile.base + rpm * (profile.span * 0.82) + gear * (profile.span * 0.13);
    const throttle = state.throttle ? 1 : 0;

    // Pinned on the limiter (top speed or a drift at the redline) gets the
    // same hard, uneven stutter as launch control: ta-ta-ta-ta instead of a
    // smooth, polite engine note. A short ignition-cut crack sits on top.
    let gate = 1;
    if (state.limiter) {
      const before = this.limiterPhase;
      this.limiterPhase += dt * (8 + rpm * 3.5);
      const cycle = this.limiterPhase % 1;
      gate = cycle < 0.5 ? 1 : cycle < 0.64 ? 0.14 : 0.72;
      if (Math.floor(this.limiterPhase) !== Math.floor(before)) this.limiterPop(0.03 + rpm * 0.03);
    } else {
      this.limiterPhase = 0;
    }
    const targetGain = (0.095 + throttle * 0.055 + speedN * 0.03) * profile.gain * gate;

    const e = this.engine;
    e.oscA.frequency.setTargetAtTime(freq, t, 0.04);
    e.oscB.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
    e.sub.frequency.setTargetAtTime(freq * 0.5, t, 0.06);
    e.engineGain.gain.setTargetAtTime(targetGain, t, state.limiter ? 0.012 : 0.12);
    e.filter.frequency.setTargetAtTime(
      (240 + speedN * 1500 + throttle * 320) * profile.bright,
      t,
      0.08,
    );

    const slipAmount = Math.max(0, Math.min(1, (state.slip - 1.6) / 10));
    this.tire.tireGain.gain.setTargetAtTime(slipAmount * 0.16 + (state.handbrake ? 0.05 : 0), t, 0.06);
    this.tire.tireFilter.frequency.setTargetAtTime(1500 + slipAmount * 900, t, 0.1);

    this.wind.windGain.gain.setTargetAtTime(speedN * speedN * 0.085, t, 0.15);
    this.nitro.nitroGain.gain.setTargetAtTime(state.boosting ? 0.06 : 0, t, 0.05);

    this.master.gain.setTargetAtTime(this.masterLevel, t, 0.15);
  }

  idle() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.engine.engineGain.gain.setTargetAtTime(0, t, 0.2);
    this.tire.tireGain.gain.setTargetAtTime(0, t, 0.1);
    this.wind.windGain.gain.setTargetAtTime(0, t, 0.2);
    this.nitro.nitroGain.gain.setTargetAtTime(0, t, 0.1);
  }

  /**
   * Stationary revving for the start line. `ratio` is 0–1 on the tach; with the
   * throttle pinned the gain is gated into a hard, uneven stutter so it reads
   * as launch control rather than a smooth idle.
   */
  launch(ratio, throttle, dt = 1 / 60) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const rev = Math.max(0, Math.min(1, ratio));
    const profile = this.profile;
    this.launchPhase += dt * (5.4 + rev * 5.6);
    const cycle = this.launchPhase % 1;
    const pulsing = throttle && rev > 0.2;
    const gate = pulsing
      ? cycle < 0.5 ? 1 : cycle < 0.64 ? 0.16 : 0.78
      : 1;
    const freq = profile.base + rev * profile.span * 1.26;

    const e = this.engine;
    e.oscA.frequency.setTargetAtTime(freq, t, 0.03);
    e.oscB.frequency.setTargetAtTime(freq * 0.5, t, 0.04);
    e.sub.frequency.setTargetAtTime(freq * 0.5, t, 0.04);
    e.engineGain.gain.setTargetAtTime(
      (0.075 + rev * 0.11) * gate * profile.gain,
      t,
      pulsing ? 0.012 : 0.08,
    );
    e.filter.frequency.setTargetAtTime((320 + rev * 2200) * profile.bright, t, 0.05);

    this.tire.tireGain.gain.setTargetAtTime(pulsing ? 0.03 : 0, t, 0.08);
    this.wind.windGain.gain.setTargetAtTime(0, t, 0.15);
    this.nitro.nitroGain.gain.setTargetAtTime(0, t, 0.1);
  }

  /** Hand control back to the normal driving loop after the lights go out. */
  releaseLaunch() {
    this.launchPhase = 0;
  }

  /** Gearbox clack plus a small exhaust note when a new gear engages. */
  shift(up = true) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.tone(up ? 280 : 190, 0.05, 'square', 0.016);
    this.tone(up ? 96 : 74, 0.09, 'triangle', 0.028);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = up ? 2400 : 1600;
    filter.Q.value = 1.1;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.045, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.06);
  }

  tone(freq, duration = 0.12, type = 'sine', volume = 0.08, delay = 0) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  /** Indicator relay: a short dry tick (on) or tock (off). */
  tick(on = true) {
    this.tone(on ? 1900 : 1500, 0.035, 'square', 0.025);
  }

  beep(kind) {
    if (kind === 'go') {
      this.tone(880, 0.32, 'triangle', 0.11);
      this.tone(1320, 0.3, 'sine', 0.06, 0.02);
    } else {
      this.tone(440, 0.14, 'square', 0.055);
    }
  }

  checkpoint() {
    this.tone(740, 0.1, 'triangle', 0.05);
    this.tone(1100, 0.14, 'triangle', 0.04, 0.06);
  }

  lap(best) {
    if (best) {
      this.tone(660, 0.14, 'triangle', 0.07);
      this.tone(880, 0.14, 'triangle', 0.07, 0.1);
      this.tone(1320, 0.24, 'triangle', 0.07, 0.2);
    } else {
      this.tone(620, 0.14, 'triangle', 0.06);
      this.tone(880, 0.2, 'triangle', 0.06, 0.1);
    }
  }

  finish() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone(n, 0.3, 'triangle', 0.07, i * 0.12));
  }

  /** Short ignition-cut crack layered over the limiter stutter. */
  limiterPop(volume = 0.05) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 950;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.04);
  }

  /** Exhaust backfire: a short, low crack. */
  backfire() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [delay, vol] of [[0, 0.16], [0.07, 0.09]]) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 520;
      filter.Q.value = 0.8;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.09);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(t + delay, Math.random());
      src.stop(t + delay + 0.1);
    }
  }

  crash(intensity) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    const gain = ctx.createGain();
    const vol = Math.min(0.4, 0.08 + intensity * 0.35);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.32);
    this.tone(70, 0.22, 'sine', vol * 0.6);
  }

  pickup() {
    this.tone(980, 0.08, 'sine', 0.04);
    this.tone(1470, 0.12, 'sine', 0.035, 0.05);
  }
}
