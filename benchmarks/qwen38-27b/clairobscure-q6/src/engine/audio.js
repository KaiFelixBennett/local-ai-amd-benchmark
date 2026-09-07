/**
 * engine/audio.js — 100% synthesized Web Audio. No samples, no files.
 *
 * Battle bed: a low detuned string drone, a slow pulse, and a sparse
 * pentatonic bell motif scheduled on a lookahead timer. The bed has
 * intensities (calm -> desperate) crossfaded by the battle as party HP
 * drops: filter opens, pulse quickens, a higher string layer fades in.
 *
 * Stingers (all procedural): menu blips, telegraph rise, parry / perfect
 * parry, dodge, hit (crit/weakness variants), counter stab, stagger clang,
 * stagger break, ultimate riser, victory fanfare, defeat drone, turn tick.
 *
 * The AudioContext is created lazily on the first user gesture (browsers
 * block audio until then) and all calls before init are safely ignored.
 */

const SCALES = {
  // D minor pentatonic, two octaves — used for motif bells
  motif: [146.83, 174.61, 196.0, 220.0, 261.63, 293.66, 349.23, 392.0, 440.0, 523.25],
};

export class Audio {
  constructor(rng) {
    this.rng = rng;
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuffer = null;
    this.intensity = 0;
    this._bedNodes = null;
    this._motifTimer = null;
    this._motifNext = 0;
    this.enabled = true;

    this._onFirstGesture = this._onFirstGesture.bind(this);
  }

  /** Create the context. Safe to call repeatedly. */
  init() {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
    } catch (err) {
      this.ctx = null;
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 6;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.8;
    this.sfxBus.connect(this.master);

    // One second of white noise, reused by every noise-based SFX.
    const len = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  _onFirstGesture() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    window.removeEventListener('pointerdown', this._onFirstGesture);
    window.removeEventListener('keydown', this._onFirstGesture);
  }

  /** Arm the one-shot gesture listener (call from game boot). */
  arm() {
    if (!this.ctx) {
      window.addEventListener('pointerdown', this._onFirstGesture, { once: true });
      window.addEventListener('keydown', this._onFirstGesture, { once: true });
    }
  }

  _now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ------------------------------------------------------------------
  // Low-level voices
  // ------------------------------------------------------------------

  _tone({ freq = 440, type = 'sine', dur = 0.2, gain = 0.2, attack = 0.004, release = 0.08, when = 0, dest = null, detune = 0, filter = null }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = this._now() + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + dur);
    let head = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq || 1000;
      f.Q.value = filter.q || 1;
      head.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(dest || this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + attack + dur + release + 0.05);
  }

  _noise({ dur = 0.2, gain = 0.2, when = 0, filter = null, sweepTo = null, sweepDur = null, dest = null }) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const t0 = this._now() + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let head = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'bandpass';
      f.frequency.setValueAtTime(filter.freq || 800, t0);
      f.Q.value = filter.q || 1;
      if (sweepTo && sweepDur) {
        f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + sweepDur);
      }
      head.connect(f);
      head = f;
    }
    head.connect(g);
    g.connect(dest || this.sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------------
  // Battle bed
  // ------------------------------------------------------------------

  startBed() {
    if (!this.ctx || this._bedNodes) return;
    const ctx = this.ctx;
    const bed = { layers: [] };
    const bus = ctx.createGain();
    bus.gain.value = 0.8;
    bus.connect(this.musicBus);
    bed.bus = bus;

    // Low drone: two detuned saws + a fifth, through a slow-breathing lowpass.
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 240;
    droneFilter.Q.value = 2;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.16;
    droneFilter.connect(droneGain);
    droneGain.connect(bus);
    for (const [f, d] of [[55, 0], [55.7, 8], [82.5, -6]]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(droneFilter);
      o.start();
      bed.layers.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 70;
    lfo.connect(lfoGain);
    lfoGain.connect(droneFilter.frequency);
    lfo.start();
    bed.layers.push(lfo);

    // Pulse: low sine throb, LFO-controlled.
    const pulseOsc = ctx.createOscillator();
    pulseOsc.type = 'sine';
    pulseOsc.frequency.value = 41.2;
    const pulseGain = ctx.createGain();
    pulseGain.gain.value = 0.0;
    pulseOsc.connect(pulseGain);
    pulseGain.connect(bus);
    pulseOsc.start();
    bed.pulseGain = pulseGain;
    const pulseLfo = ctx.createOscillator();
    pulseLfo.frequency.value = 1.0;
    const pulseLfoGain = ctx.createGain();
    pulseLfoGain.gain.value = 0.10;
    pulseLfo.connect(pulseLfoGain);
    pulseLfoGain.connect(pulseGain.gain);
    pulseLfo.start();
    bed.pulseLfo = pulseLfo;
    bed.layers.push(pulseOsc, pulseLfo);

    // High string layer (fades in as intensity rises): triangle fifth.
    const highGain = ctx.createGain();
    highGain.gain.value = 0.0;
    highGain.connect(bus);
    bed.highGain = highGain;
    for (const [f, d] of [[220, 0], [261.63, 10], [329.63, -8]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = d;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      o.connect(g);
      g.connect(highGain);
      o.start();
      bed.layers.push(o);
    }

    bed.droneFilter = droneFilter;
    bed.droneGain = droneGain;
    this._bedNodes = bed;
    this._startMotif();
  }

  _startMotif() {
    if (this._motifTimer) return;
    this._motifNext = this._now() + 0.5;
    this._motifTimer = setInterval(() => this._scheduleMotif(), 200);
  }

  _scheduleMotif() {
    if (!this.ctx) return;
    // Lookahead scheduling: fire bell notes a bit ahead of real time.
    while (this._motifNext < this._now() + 0.6) {
      const when = Math.max(0, this._motifNext - this._now());
      const gap = 0.42 + this.rng.next() * 0.5 - this.intensity * 0.22;
      this._motifNext += Math.max(0.22, gap);
      const notes = SCALES.motif;
      const f = notes[Math.floor(this.rng.next() * notes.length)];
      const gain = 0.05 + this.intensity * 0.04;
      // Bell = fundamental + two harmonics, fast decay
      this._tone({ freq: f, type: 'sine', dur: 0.9, gain, when, dest: this.musicBus });
      this._tone({ freq: f * 2.01, type: 'sine', dur: 0.5, gain: gain * 0.4, when, dest: this.musicBus });
      this._tone({ freq: f * 2.99, type: 'sine', dur: 0.3, gain: gain * 0.18, when, dest: this.musicBus });
      // Occasional low pluck underneath
      if (this.rng.chance(0.3)) {
        this._tone({ freq: f / 2, type: 'triangle', dur: 0.5, gain: gain * 0.5, when, dest: this.musicBus });
      }
    }
  }

  /** Crossfade the bed. 0 = calm, 1 = desperate. */
  setIntensity(v) {
    this.intensity = Math.min(1, Math.max(0, v));
    if (!this.ctx || !this._bedNodes) return;
    const bed = this._bedNodes;
    const t = this._now();
    const i = this.intensity;
    bed.droneFilter.frequency.setTargetAtTime(240 + i * 420, t, 0.8);
    bed.pulseGain.gain.setTargetAtTime(0.06 + i * 0.10, t, 0.5);
    bed.pulseLfo.frequency.setTargetAtTime(1.0 + i * 1.8, t, 0.8);
    bed.highGain.gain.setTargetAtTime(i * 0.12, t, 1.0);
    bed.droneGain.gain.setTargetAtTime(0.14 + i * 0.06, t, 0.8);
  }

  stopBed() {
    if (!this._bedNodes) return;
    const bed = this._bedNodes;
    const t = this._now();
    bed.bus.gain.setTargetAtTime(0.0001, t, 0.4);
    const nodes = bed;
    setTimeout(() => {
      for (const n of nodes.layers) {
        try { n.stop(); } catch (err) { /* already stopped */ }
      }
      try { nodes.bus.disconnect(); } catch (err) { /* noop */ }
    }, 1500);
    this._bedNodes = null;
    if (this._motifTimer) {
      clearInterval(this._motifTimer);
      this._motifTimer = null;
    }
  }

  // ------------------------------------------------------------------
  // Stingers
  // ------------------------------------------------------------------

  blip(hi = false) {
    this._tone({ freq: hi ? 880 : 660, type: 'triangle', dur: 0.07, gain: 0.08, release: 0.03 });
  }

  confirm() {
    this._tone({ freq: 523.25, type: 'triangle', dur: 0.09, gain: 0.1 });
    this._tone({ freq: 784, type: 'sine', dur: 0.12, gain: 0.08, when: 0.05 });
  }

  cancel() {
    this._tone({ freq: 392, type: 'triangle', dur: 0.08, gain: 0.08 });
    this._tone({ freq: 261.63, type: 'sine', dur: 0.12, gain: 0.07, when: 0.04 });
  }

  turnTick() {
    this._tone({ freq: 440, type: 'sine', dur: 0.12, gain: 0.1 });
    this._tone({ freq: 880, type: 'sine', dur: 0.18, gain: 0.05, when: 0.03 });
  }

  /** Rising tension cue during a telegraph wind-up. */
  telegraphRise(durMs) {
    if (!this.ctx || !this.enabled) return;
    const t0 = this._now();
    const dur = Math.max(0.05, durMs / 1000);
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(160, t0);
    o.frequency.exponentialRampToValueAtTime(640, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.09, t0 + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 3;
    o.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  parry(perfect = false) {
    // Bright metallic ping + tiny shimmer
    const f = perfect ? 1568 : 1175;
    this._tone({ freq: f, type: 'sine', dur: 0.16, gain: 0.16 });
    this._tone({ freq: f * 1.5, type: 'sine', dur: 0.12, gain: 0.08 });
    this._noise({ dur: 0.06, gain: 0.1, filter: { type: 'highpass', freq: 3000 } });
    if (perfect) {
      this._tone({ freq: f * 2, type: 'sine', dur: 0.3, gain: 0.1, when: 0.03 });
      this._tone({ freq: f * 3.01, type: 'sine', dur: 0.4, gain: 0.05, when: 0.06 });
    }
  }

  dodge() {
    this._noise({ dur: 0.18, gain: 0.14, filter: { type: 'bandpass', freq: 500, q: 1.5 }, sweepTo: 2400, sweepDur: 0.16 });
  }

  hit({ crit = false, weakness = false } = {}) {
    const base = crit ? 0.3 : 0.2;
    this._tone({ freq: crit ? 70 : 90, type: 'sine', dur: 0.16, gain: base, release: 0.1 });
    this._noise({ dur: 0.12, gain: base * 0.8, filter: { type: 'lowpass', freq: crit ? 1800 : 1200 } });
    if (weakness) {
      // Glassy "cr" overlay
      this._tone({ freq: 2093, type: 'sine', dur: 0.2, gain: 0.09 });
      this._tone({ freq: 2637, type: 'sine', dur: 0.28, gain: 0.06, when: 0.02 });
    }
    if (crit) {
      this._noise({ dur: 0.2, gain: 0.18, filter: { type: 'highpass', freq: 2500 }, when: 0.02 });
    }
  }

  counter() {
    // Rising stab
    this._tone({ freq: 330, type: 'sawtooth', dur: 0.14, gain: 0.14, filter: { type: 'lowpass', freq: 1400 } });
    this._tone({ freq: 660, type: 'sawtooth', dur: 0.16, gain: 0.12, when: 0.05, filter: { type: 'lowpass', freq: 2200 } });
    this._noise({ dur: 0.1, gain: 0.12, filter: { type: 'bandpass', freq: 1800, q: 2 }, when: 0.05 });
  }

  stagger() {
    // Dull metallic clang
    this._tone({ freq: 196, type: 'square', dur: 0.3, gain: 0.16, filter: { type: 'lowpass', freq: 900 } });
    this._tone({ freq: 294, type: 'square', dur: 0.22, gain: 0.1, when: 0.02, filter: { type: 'lowpass', freq: 1200 } });
    this._noise({ dur: 0.2, gain: 0.14, filter: { type: 'bandpass', freq: 700, q: 3 } });
  }

  staggerBreak() {
    // Big resonant crack
    this._tone({ freq: 98, type: 'sine', dur: 0.5, gain: 0.3, release: 0.3 });
    this._tone({ freq: 147, type: 'square', dur: 0.4, gain: 0.12, filter: { type: 'lowpass', freq: 700 } });
    this._noise({ dur: 0.4, gain: 0.2, filter: { type: 'lowpass', freq: 2400 }, sweepTo: 300, sweepDur: 0.35 });
  }

  weaknessApplied() {
    this._tone({ freq: 1046.5, type: 'sine', dur: 0.25, gain: 0.1 });
    this._tone({ freq: 1318.5, type: 'sine', dur: 0.3, gain: 0.08, when: 0.05 });
  }

  heal() {
    const notes = [523.25, 659.25, 784];
    notes.forEach((f, i) => {
      this._tone({ freq: f, type: 'sine', dur: 0.35, gain: 0.08, when: i * 0.08 });
    });
  }

  buff() {
    this._tone({ freq: 440, type: 'triangle', dur: 0.12, gain: 0.1 });
    this._tone({ freq: 554.37, type: 'triangle', dur: 0.12, gain: 0.1, when: 0.07 });
    this._tone({ freq: 659.25, type: 'triangle', dur: 0.2, gain: 0.1, when: 0.14 });
  }

  debuff() {
    this._tone({ freq: 330, type: 'triangle', dur: 0.14, gain: 0.1 });
    this._tone({ freq: 277.18, type: 'triangle', dur: 0.2, gain: 0.1, when: 0.08 });
  }

  /** Riser into the ultimate, ~900ms. */
  ultimateRiser() {
    if (!this.ctx || !this.enabled) return;
    const t0 = this._now();
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(880, t0 + 0.9);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.16, t0 + 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.0);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t0);
    f.frequency.exponentialRampToValueAtTime(4000, t0 + 0.9);
    f.Q.value = 1.2;
    o.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    o.start(t0);
    o.stop(t0 + 1.1);
  }

  ultimateImpact() {
    this._noise({ dur: 0.6, gain: 0.35, filter: { type: 'lowpass', freq: 4000 }, sweepTo: 120, sweepDur: 0.5 });
    this._tone({ freq: 55, type: 'sine', dur: 0.7, gain: 0.4, release: 0.4 });
    this._tone({ freq: 110, type: 'sine', dur: 0.5, gain: 0.2, when: 0.02 });
  }

  victory() {
    const seq = [523.25, 659.25, 784, 1046.5, 784, 1046.5];
    seq.forEach((f, i) => {
      this._tone({ freq: f, type: 'triangle', dur: i === seq.length - 1 ? 0.7 : 0.22, gain: 0.12, when: i * 0.16 });
      this._tone({ freq: f / 2, type: 'sine', dur: 0.3, gain: 0.06, when: i * 0.16 });
    });
    this._noise({ dur: 0.5, gain: 0.06, filter: { type: 'highpass', freq: 5000 }, when: 0.8 });
  }

  defeat() {
    const seq = [392, 349.23, 329.63, 261.63];
    seq.forEach((f, i) => {
      this._tone({ freq: f, type: 'sine', dur: 0.6, gain: 0.12, when: i * 0.4 });
      this._tone({ freq: f * 1.005, type: 'sine', dur: 0.6, gain: 0.08, when: i * 0.4 });
    });
  }

  weakPointHit() {
    this._tone({ freq: 1760, type: 'sine', dur: 0.1, gain: 0.1 });
    this._tone({ freq: 2349, type: 'sine', dur: 0.14, gain: 0.06, when: 0.03 });
    this._noise({ dur: 0.05, gain: 0.08, filter: { type: 'highpass', freq: 4000 } });
  }
}
