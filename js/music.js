// Procedural menu music: a slow sunset synthwave loop built from Web Audio
// oscillators at runtime, like the rest of the game's sound (no audio files).
//
// Am – F – C – G, one bar each, at 96 BPM: a warm detuned pad, a pulsing
// bass, a delayed arpeggio and a soft kick/hat.

const BPM = 96;
const STEP = 60 / BPM / 4; // 16th note
const LOOKAHEAD = 0.3; // seconds scheduled ahead
const TICK_MS = 60;

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// Chord tones as MIDI notes (root first) — A minor, F, C, G.
const CHORDS = [
  [57, 60, 64], // Am
  [53, 57, 60], // F
  [48, 52, 55], // C
  [55, 59, 62], // G
];
const ARP = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1];
const BASS = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1];

export class MenuMusic {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} destination
   * @param {AudioBuffer} noise
   */
  constructor(ctx, destination, noise) {
    this.ctx = ctx;
    this.noise = noise;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);

    // Gentle space for the arp.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const delayTone = ctx.createBiquadFilter();
    delayTone.type = 'lowpass';
    delayTone.frequency.value = 2400;
    this.delay.connect(delayTone);
    delayTone.connect(feedback);
    feedback.connect(this.delay);
    delayTone.connect(this.out);

    this.playing = false;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
  }

  start() {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0.5, t, 0.8);
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.nextTime = t + 0.08;
    this.timer = setInterval(() => this.schedule(), TICK_MS);
    this.schedule();
  }

  stop() {
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.25);
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    // After a long stall (tab in background) skip ahead instead of bursting.
    if (this.nextTime < this.ctx.currentTime - 0.5) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < horizon) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, t) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = CHORDS[bar];
    if (s === 0) this.pad(chord, t, STEP * 16);
    if (BASS[s]) this.bass(midi(chord[0] - 12), t, s % 4 === 0 ? 0.2 : 0.13);
    this.arp(midi(chord[ARP[s]] + 12), t, s % 4 === 0 ? 0.05 : 0.032);
    if (s % 8 === 0) this.kick(t);
    if (s % 4 === 2) this.hat(t);
  }

  env(gain, t, peak, attack, hold, release) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.setValueAtTime(peak, t + attack + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return t + attack + hold + release + 0.05;
  }

  pad(chord, t, length) {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.linearRampToValueAtTime(1500, t + length * 0.5);
    filter.frequency.linearRampToValueAtTime(800, t + length);
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    const end = this.env(gain, t, 0.05, 0.9, length - 1.2, 1.1);
    filter.connect(gain);
    gain.connect(this.out);
    for (const note of chord) {
      for (const detune of [-9, 9]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midi(note);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t);
        osc.stop(end);
      }
    }
  }

  bass(freq, t, peak) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + STEP * 1.6);
    const gain = ctx.createGain();
    const end = this.env(gain, t, peak, 0.008, STEP * 0.6, STEP * 1.2);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    osc.start(t);
    osc.stop(end);
  }

  arp(freq, t, peak) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    const gain = ctx.createGain();
    const end = this.env(gain, t, peak, 0.004, 0.02, STEP * 1.4);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    gain.connect(this.delay);
    osc.start(t);
    osc.stop(end);
  }

  kick(t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const gain = ctx.createGain();
    const end = this.env(gain, t, 0.32, 0.004, 0.02, 0.28);
    osc.connect(gain);
    gain.connect(this.out);
    osc.start(t);
    osc.stop(end);
  }

  hat(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    const end = this.env(gain, t, 0.035, 0.002, 0.005, 0.06);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.out);
    src.start(t, Math.random() * 1.5);
    src.stop(end);
  }
}
