import { MenuMusic } from './music.js';
import {
  ENGINE_PROFILES, RIVAL_VOICE_COUNT, engineProfile, turboAmount, intakeAmount,
  squealAmount, tireChirpAmount, wheelspinSound, rivalGain, rivalPan, shiftPop, isValidWave,
} from './audioProfiles.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.master = null;
    this.noiseBuffer = null;
    this.engine = null;
    this.lastSpeed = 0;
    this.profile = engineProfile('sports');
    this.profileId = 'sports';
    this.lastRpm = 0;
    this.launchPhase = 0;
    this.limiterPhase = 0;
    this.music = null;
    this.wantMusic = false;
    this.resumePending = false;
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

  /** Choose the engine voice for a car, including the sound of its tuning. */
  setProfile(category, upgrades = null) {
    this.profileId = Object.hasOwn(ENGINE_PROFILES, category) ? category : 'sports';
    this.profile = engineProfile(this.profileId, upgrades);
    if (!this.ready) return;
    const e = this.engine;
    e.oscA.type = this.profile.wave;
    e.oscB.type = this.profile.wave === 'square' ? 'sawtooth' : 'square';
    if (isValidWave(this.profile.exhaustWave)) this.exhaust.osc.type = this.profile.exhaustWave;
  }

  init() {
    if (this.ready) {
      this.resume();
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

    // engine. shiftGain sits after the engine and exhaust voices so a gear
    // change can dip the whole drivetrain for a moment without fighting the
    // per-frame gain targets in update().
    const shiftGain = ctx.createGain();
    shiftGain.gain.value = 1;
    shiftGain.connect(master);
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 0.9;
    engineGain.connect(filter);
    filter.connect(shiftGain);

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

    this.engine = { engineGain, filter, oscA, oscB, sub, shiftGain };

    // Exhaust note: a lower-octave voice with a slow burble at idle. Its wave
    // and pitch come from the car category; upgrades brighten and deepen it.
    const exhaust = ctx.createOscillator();
    exhaust.type = isValidWave(this.profile.exhaustWave) ? this.profile.exhaustWave : 'sawtooth';
    exhaust.frequency.value = 40;
    const exhaustFilter = ctx.createBiquadFilter();
    exhaustFilter.type = 'lowpass';
    exhaustFilter.frequency.value = 260;
    const exhaustGain = ctx.createGain();
    exhaustGain.gain.value = 0;
    exhaust.connect(exhaustFilter);
    exhaustFilter.connect(exhaustGain);
    exhaustGain.connect(shiftGain);
    const burbleLfo = ctx.createOscillator();
    burbleLfo.type = 'sine';
    burbleLfo.frequency.value = 9;
    const burbleDepth = ctx.createGain();
    burbleDepth.gain.value = 0;
    burbleLfo.connect(burbleDepth);
    burbleDepth.connect(exhaustGain.gain);
    exhaust.start();
    burbleLfo.start();
    this.exhaust = { osc: exhaust, filter: exhaustFilter, gain: exhaustGain, lfo: burbleLfo, depth: burbleDepth };

    // Turbo whistle: band-passed noise is cheap and reads as a turbine spool.
    const turboSrc = ctx.createBufferSource();
    turboSrc.buffer = buffer;
    turboSrc.loop = true;
    const turboFilter = ctx.createBiquadFilter();
    turboFilter.type = 'bandpass';
    turboFilter.frequency.value = 2600;
    turboFilter.Q.value = 7;
    const turboGain = ctx.createGain();
    turboGain.gain.value = 0;
    turboSrc.connect(turboFilter);
    turboFilter.connect(turboGain);
    turboGain.connect(master);
    turboSrc.start();
    this.turbo = { gain: turboGain, filter: turboFilter };

    // Intake roar: a wider band that follows throttle and revs.
    const intakeSrc = ctx.createBufferSource();
    intakeSrc.buffer = buffer;
    intakeSrc.loop = true;
    const intakeFilter = ctx.createBiquadFilter();
    intakeFilter.type = 'bandpass';
    intakeFilter.frequency.value = 700;
    intakeFilter.Q.value = 0.8;
    const intakeGain = ctx.createGain();
    intakeGain.gain.value = 0;
    intakeSrc.connect(intakeFilter);
    intakeFilter.connect(intakeGain);
    intakeGain.connect(master);
    intakeSrc.start();
    this.intake = { gain: intakeGain, filter: intakeFilter };

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

    // High, short chirp as a tyre first breaks away, separate from the slide.
    const chirpSrc = ctx.createBufferSource();
    chirpSrc.buffer = buffer;
    chirpSrc.loop = true;
    const chirpFilter = ctx.createBiquadFilter();
    chirpFilter.type = 'bandpass';
    chirpFilter.frequency.value = 3100;
    chirpFilter.Q.value = 5;
    const chirpGain = ctx.createGain();
    chirpGain.gain.value = 0;
    chirpSrc.connect(chirpFilter);
    chirpFilter.connect(chirpGain);
    chirpGain.connect(master);
    chirpSrc.start();
    this.chirp = { gain: chirpGain, filter: chirpFilter };

    // Wheelspin: a rough, lower rubber scrub while the driven tyres spin
    // faster than the road. Wet launches get a splashier, higher layer.
    const spinSrc = ctx.createBufferSource();
    spinSrc.buffer = buffer;
    spinSrc.loop = true;
    const spinFilter = ctx.createBiquadFilter();
    spinFilter.type = 'bandpass';
    spinFilter.frequency.value = 1100;
    spinFilter.Q.value = 0.9;
    const spinGain = ctx.createGain();
    spinGain.gain.value = 0;
    spinSrc.connect(spinFilter);
    spinFilter.connect(spinGain);
    spinGain.connect(master);
    spinSrc.start();
    this.wheelspin = { gain: spinGain, filter: spinFilter };

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

    // Pooled rival engines. StereoPannerNode is widely supported; if a browser
    // lacks it the voices still play centred.
    this.rivals = [];
    for (let i = 0; i < RIVAL_VOICE_COUNT; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 70;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      let pan = null;
      if (ctx.createStereoPanner) {
        pan = ctx.createStereoPanner();
        gain.connect(pan);
        pan.connect(master);
      } else {
        gain.connect(master);
      }
      osc.start();
      this.rivals.push({ osc, gain, pan });
    }

    this.music = new MenuMusic(ctx, master, buffer);
    this.music.level = this.musicVolume;

    this.ready = true;
    this.applyVolume(1);
    if (this.wantMusic) this.music.start();
    // Some browsers leave a context suspended even when created inside a
    // gesture. Keep listening for the transition and re-apply the master/music
    // levels whenever it finally starts running.
    ctx.addEventListener?.('statechange', () => {
      if (ctx.state !== 'running') return;
      this.applyVolume(0.05);
      if (this.wantMusic) this.music.start();
    });
    // `resume()` is the only caller of init(); it finishes the unlock on return.
  }

  /**
   * Create (if needed) and resume the context from a real user gesture.
   * Resolves to whether the context is actually running, so callers can keep
   * retrying on later taps instead of assuming the first one worked.
   */
  resume() {
    if (!this.ready) this.init();
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(false);
    const onRunning = () => {
      this.applyVolume(0.05);
      if (this.wantMusic) this.music.start();
      return true;
    };
    if (ctx.state === 'running') return Promise.resolve(onRunning());
    return Promise.resolve(ctx.resume()).then(() => {
      if (ctx.state !== 'running') return false;
      return onRunning();
    }).catch(() => false);
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
    // A context can be suspended again by the OS or a tab switch. Retry once
    // at a time; the global gesture listeners in main.js do the real unlocking.
    if (this.ctx.state !== 'running' && !this.resumePending) {
      this.resumePending = true;
      Promise.resolve(this.ctx.resume()).catch(() => {}).finally(() => {
        this.resumePending = false;
      });
    }
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
    this.lastRpm = rpm;

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

    // Exhaust: an octave down for the burly cars, in-phase for the high-strung
    // ones. The LFO lopes at idle and settles as the revs climb.
    const ex = this.exhaust;
    ex.osc.frequency.setTargetAtTime(Math.max(24, freq * profile.exhaustRatio), t, 0.08);
    ex.filter.frequency.setTargetAtTime(170 + speedN * 280 + throttle * 140, t, 0.08);
    ex.gain.gain.setTargetAtTime((0.018 + profile.burble * 0.07) * (0.55 + speedN * 0.55), t, 0.1);
    ex.lfo.frequency.setTargetAtTime(7 + rpm * 12, t, 0.1);
    ex.depth.gain.setTargetAtTime(profile.burble * 0.035 * (1 - speedN * 0.75), t, 0.12);

    // Forced induction: the whistle rises with boost pressure and revs, while
    // the intake roars whenever the throttle opens.
    const spool = turboAmount({
      rpm, throttle: !!throttle, boosting: !!state.boosting, turbo: profile.turbo, speedN,
    });
    this.turbo.gain.gain.setTargetAtTime(spool * 0.038, t, 0.08);
    this.turbo.filter.frequency.setTargetAtTime(1700 + spool * 2200 + rpm * 900, t, 0.1);
    const intake = intakeAmount({ rpm, throttle: !!throttle, speedN });
    this.intake.gain.gain.setTargetAtTime(intake * 0.03, t, 0.06);
    this.intake.filter.frequency.setTargetAtTime(420 + rpm * 900 + throttle * 260, t, 0.08);

    // Two tyre layers: a low growl once fully sideways and a brief high chirp
    // when the contact patch first lets go.
    const squeal = squealAmount({ slip: state.slip ?? 0, handbrake: !!state.handbrake, speedN });
    const chirp = tireChirpAmount({ slip: state.slip ?? 0, speedN });
    this.tire.tireGain.gain.setTargetAtTime(squeal * 0.16, t, 0.06);
    this.tire.tireFilter.frequency.setTargetAtTime(1200 + squeal * 1500, t, 0.1);
    this.chirp.gain.gain.setTargetAtTime(chirp * 0.05, t, 0.05);
    this.chirp.filter.frequency.setTargetAtTime(2600 + squeal * 1200, t, 0.1);
    const spin = wheelspinSound({ wheelspin: state.wheelspin ?? 0, wet: !!state.wet, speedN });
    this.wheelspin.gain.gain.setTargetAtTime(spin * 0.16, t, 0.05);
    this.wheelspin.filter.frequency.setTargetAtTime(
      950 + (state.wet ? 550 : 0) + speedN * 250, t, 0.1,
    );

    // Nearest rivals only, loudest and most panned when alongside. main.js
    // passes already-sorted { distance, lateral, rpm } entries.
    const rivals = Array.isArray(state.rivals) ? state.rivals : [];
    for (let i = 0; i < this.rivals.length; i++) {
      const voice = this.rivals[i];
      const info = rivals[i];
      if (!info) {
        voice.gain.gain.setTargetAtTime(0, t, 0.12);
        continue;
      }
      const level = rivalGain(info.distance);
      voice.gain.gain.setTargetAtTime(level * 0.05, t, 0.12);
      const rivalRpm = Math.max(0, Math.min(1, Number(info.rpm) || 0));
      voice.osc.frequency.setTargetAtTime(58 + rivalRpm * 115, t, 0.08);
      if (voice.pan) voice.pan.pan.setTargetAtTime(rivalPan(info.lateral), t, 0.12);
    }

    this.wind.windGain.gain.setTargetAtTime(speedN * speedN * 0.085, t, 0.15);
    this.nitro.nitroGain.gain.setTargetAtTime(state.boosting ? 0.06 : 0, t, 0.05);

    this.master.gain.setTargetAtTime(this.masterLevel, t, 0.15);
  }

  idle() {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.engine.engineGain.gain.setTargetAtTime(0, t, 0.2);
    this.engine.shiftGain.gain.setTargetAtTime(1, t, 0.1);
    this.exhaust.gain.gain.setTargetAtTime(0, t, 0.2);
    this.exhaust.depth.gain.setTargetAtTime(0, t, 0.1);
    this.turbo.gain.gain.setTargetAtTime(0, t, 0.1);
    this.intake.gain.gain.setTargetAtTime(0, t, 0.1);
    this.tire.tireGain.gain.setTargetAtTime(0, t, 0.1);
    this.chirp.gain.gain.setTargetAtTime(0, t, 0.1);
    this.wheelspin.gain.gain.setTargetAtTime(0, t, 0.1);
    this.wind.windGain.gain.setTargetAtTime(0, t, 0.2);
    this.nitro.nitroGain.gain.setTargetAtTime(0, t, 0.1);
    for (const voice of this.rivals) voice.gain.gain.setTargetAtTime(0, t, 0.12);
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

    // A pinned throttle still spools the turbo and opens the intake on the
    // line, which is most of what makes launch control sound mechanical.
    this.turbo.gain.gain.setTargetAtTime(pulsing ? 0.02 : 0, t, 0.08);
    this.intake.gain.gain.setTargetAtTime(pulsing ? 0.018 : 0, t, 0.08);
    this.exhaust.gain.gain.setTargetAtTime((0.02 + this.profile.burble * 0.06) * (0.6 + rev * 0.5), t, 0.1);
    this.exhaust.depth.gain.setTargetAtTime(this.profile.burble * 0.03, t, 0.1);
    this.tire.tireGain.gain.setTargetAtTime(pulsing ? 0.03 : 0, t, 0.08);
    this.chirp.gain.gain.setTargetAtTime(0, t, 0.1);
    this.wheelspin.gain.gain.setTargetAtTime(0, t, 0.1);
    this.wind.windGain.gain.setTargetAtTime(0, t, 0.15);
    this.nitro.nitroGain.gain.setTargetAtTime(0, t, 0.1);
    for (const voice of this.rivals) voice.gain.gain.setTargetAtTime(0, t, 0.12);
  }

  /** Hand control back to the normal driving loop after the lights go out. */
  releaseLaunch() {
    this.launchPhase = 0;
  }

  /** Torque cut, gearbox clack and an exhaust crack when a gear engages. */
  shift(up = true, rpm = this.lastRpm) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // A brief cut on the shared drivetrain bus, independent of the per-frame
    // gain targets, so the engine audibly unloads between gears.
    const dip = this.engine.shiftGain.gain;
    dip.cancelScheduledValues(t);
    dip.setValueAtTime(dip.value, t);
    dip.linearRampToValueAtTime(up ? 0.42 : 0.55, t + 0.03);
    dip.linearRampToValueAtTime(1, t + (up ? 0.17 : 0.13));
    const pop = shiftPop({ up, rpm: Number.isFinite(rpm) ? Math.max(0, Math.min(1, rpm)) : 0, turbo: this.profile.turbo });
    if (pop > 0.02) this.exhaustPop(pop);
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

  /** Small, sharp crack at the tailpipe on a gear change. */
  exhaustPop(volume = 0.04) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 760;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.1, volume), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + 0.06);
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
