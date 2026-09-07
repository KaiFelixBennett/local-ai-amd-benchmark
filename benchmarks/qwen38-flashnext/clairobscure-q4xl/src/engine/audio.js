import { EV } from '../core/events.js';

// ---------------------------------------------------------------------------
// Fully synthesized battle audio — no samples, no files.
// Layers a pad + pulse + arpeggio battle bed that intensifies with danger,
// plus one-shot stingers for hits, parries, counters, crits, telegraphs.
// The AudioContext is created lazily on the first user gesture (autoplay rules).
// ---------------------------------------------------------------------------

export class AudioEngine {
  constructor(bus) {
    this.bus = bus;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.started = false;
    this.muted = false;
    this.layers = []; // active loop layers {gain, stop()}
    this.intensity = 1; // 1 calm -> 0 desperate
    this._noiseBuf = null;
    this._scheduleAhead = 0;
    this._nextNote = 0;
    this._step = 0;
    this._arpOn = false;

    this._bindEvents();
  }

  // Call from a pointerdown/keydown once.
  ensureStarted() {
    if (this.started) { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.85;
      this.sfxGain.connect(this.master);
      // Pre-render noise buffer for percussion / whooshes.
      const len = this.ctx.sampleRate * 1.5;
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.started = true;
      this._startBed();
    } catch (err) {
      console.warn('[audio] unavailable:', err);
      this.started = false;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
    return this.muted;
  }

  // -- tiny synth helpers ----------------------------------------------------

  _env(gain, t0, peak, attack, decay, sustain = 0, susTime = 0) {
    const g = gain.gain;
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
    if (sustain > 0) {
      g.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t0 + attack + decay);
      g.setValueAtTime(Math.max(0.0001, sustain), t0 + attack + decay + susTime);
      g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + susTime + 0.25);
    } else {
      g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
    }
  }

  _tone(freq, type, t0, dur, peak = 0.2, destination = this.sfxGain, detune = 0) {
    if (!this.started || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(g); g.connect(destination);
    this._env(g, t0, peak, 0.012, dur);
    o.start(t0);
    o.stop(t0 + dur + 0.3);
  }

  _noise(t0, dur, peak, filterFreq, q = 1, destination = this.sfxGain, type = 'lowpass') {
    if (!this.started || this.muted) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
    const g = this.ctx.createGain();
    src.connect(f); f.connect(g); g.connect(destination);
    this._env(g, t0, peak, 0.006, dur);
    src.start(t0);
    src.stop(t0 + dur + 0.3);
  }

  _now() { return this.ctx ? this.ctx.currentTime : 0; }

  // -- battle bed (layered loops scheduled on the audio clock) ---------------

  _startBed() {
    const ctx = this.ctx;
    // Deep drone pad — minor 9 feel in A.
    const padNotes = [55, 82.41, 110, 164.81, 246.94];
    const padGain = ctx.createGain();
    padGain.gain.value = 0.0;
    padGain.connect(this.musicGain);
    const lfos = [];
    for (const f of padNotes) {
      const o = ctx.createOscillator();
      o.type = f < 100 ? 'triangle' : 'sine';
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = f < 100 ? 0.16 : 0.06;
      o.connect(og); og.connect(padGain);
      // slow tremolo
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07 + Math.random() * 0.09;
      const lg = ctx.createGain();
      lg.gain.value = og.gain.value * 0.4;
      lfo.connect(lg); lg.connect(og.gain);
      lfo.start();
      lfos.push(lfo);
      o.start();
    }
    padGain.gain.setTargetAtTime(0.5, ctx.currentTime, 2.2);
    this.layers.push({ gain: padGain, lfos });

    // Percussion pulse: soft taiko-like thump on beats, scheduled ahead.
    this._nextNote = ctx.currentTime + 0.1;
    this._arpOn = true;
    this._pulseTimer = setInterval(() => this._schedulePulse(), 90);
  }

  _schedulePulse() {
    if (!this.started || this.muted) return;
    const ctx = this.ctx;
    const ahead = ctx.currentTime + 0.25;
    const bpm = this.intensity < 0.4 ? 118 : 96;
    const spb = 60 / bpm;
    const danger = this.intensity < 0.45;
    while (this._nextNote < ahead) {
      const t = this._nextNote;
      const s = this._step % 8;
      if (s === 0 || s === 3 || (danger && s === 5)) {
        // thump
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(danger ? 110 : 82, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
        const g = ctx.createGain();
        o.connect(g); g.connect(this.musicGain);
        this._env(g, t, 0.34, 0.005, 0.22);
        o.start(t); o.stop(t + 0.4);
        this._noise(t, 0.05, 0.05, 2500, 1, this.musicGain, 'bandpass');
      }
      if (danger && s % 2 === 1) {
        this._noise(t, 0.03, 0.05, 6000, 2, this.musicGain, 'bandpass'); // ticking hi-hat
      }
      // Tension arpeggio in the desperate phase.
      if (this._arpOn && danger) {
        const arp = [220, 261.63, 329.63, 415.30, 329.63, 261.63][s % 6];
        this._tone(arp, 'triangle', t, 0.14, 0.045, this.musicGain);
      }
      this._nextNote += spb / 2;
      this._step++;
    }
  }

  // intensity 0..1 (0 = party nearly wiped -> darker/faster bed)
  setIntensity(v) {
    this.intensity = v;
    if (!this.started) return;
    const target = 0.32 + 0.25 * v;
    this.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 1.0);
  }

  // -- one-shot stingers -------------------------------------------------------

  blip() { if (this.started) { const t = this._now(); this._tone(880, 'triangle', t, 0.07, 0.06); this._tone(1320, 'sine', t + 0.02, 0.06, 0.04); } }
  confirm() { if (this.started) { const t = this._now(); this._tone(523.25, 'triangle', t, 0.1, 0.09); this._tone(784, 'triangle', t + 0.05, 0.14, 0.07); } }
  cancel() { if (this.started) this._tone(311, 'triangle', this._now(), 0.09, 0.07); }

  swing() { if (this.started) this._noise(this._now(), 0.14, 0.22, 1800, 0.8, this.sfxGain, 'bandpass'); }

  hit(magnitude = 1, crit = false) {
    if (!this.started) return;
    const t = this._now();
    this._noise(t, 0.1, 0.3 * magnitude, 900, 1);
    this._tone(crit ? 140 : 95, 'square', t, 0.12, 0.22 * magnitude);
    if (crit) {
      this._tone(1046, 'triangle', t + 0.02, 0.25, 0.12);
      this._tone(1568, 'sine', t + 0.06, 0.3, 0.09);
      this._noise(t + 0.02, 0.25, 0.12, 5000, 3, this.sfxGain, 'bandpass');
    }
  }

  telegraph() { if (this.started) { const t = this._now(); const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(560, t + 0.5); o.connect(g); g.connect(this.sfxGain); this._env(g, t, 0.05, 0.4, 0.1); o.start(t); o.stop(t + 0.7); } }

  parryCue() { if (this.started) { const t = this._now(); this._tone(1568, 'sine', t, 0.1, 0.05); this._tone(2093, 'sine', t + 0.05, 0.12, 0.05); } }

  perfect() {
    if (!this.started) return;
    const t = this._now();
    // Metallic bell + reverse-ish swell.
    [2093, 2637, 3136].forEach((f, i) => this._tone(f, 'sine', t + i * 0.015, 0.7, 0.12 / (i + 1)));
    this._noise(t, 0.06, 0.3, 7000, 6, this.sfxGain, 'bandpass');
    this._tone(660, 'triangle', t, 0.15, 0.15);
  }

  parry() {
    if (!this.started) return;
    const t = this._now();
    this._noise(t, 0.05, 0.26, 5500, 5, this.sfxGain, 'bandpass'); // sword clang
    this._tone(1760, 'square', t, 0.05, 0.1);
    this._tone(880, 'triangle', t + 0.01, 0.09, 0.12);
  }

  dodge() { if (this.started) this._noise(this._now(), 0.12, 0.12, 2400, 0.7, this.sfxGain, 'bandpass'); }

  fail() { if (this.started) { const t = this._now(); this._tone(220, 'sawtooth', t, 0.2, 0.12); } }

  counter() {
    if (!this.started) return;
    const t = this._now();
    this._tone(392, 'sawtooth', t, 0.08, 0.14);
    this._tone(587, 'sawtooth', t + 0.04, 0.09, 0.15);
    this._tone(784, 'triangle', t + 0.08, 0.22, 0.18);
  }

  heal() { if (this.started) { const t = this._now(); [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 'sine', t + i * 0.06, 0.4, 0.09)); } }
  buff() { if (this.started) { const t = this._now(); [440, 554, 659].forEach((f, i) => this._tone(f, 'triangle', t + i * 0.07, 0.25, 0.08)); } }
  debuff() { if (this.started) this._tone(330, 'sawtooth', this._now(), 0.3, 0.08); }

  charge() { if (this.started) { const t = this._now(); this._tone(440, 'sine', t, 0.3, 0.08); this._tone(880, 'sine', t + 0.06, 0.35, 0.07); } }

  gradientReady() {
    if (!this.started) return;
    const t = this._now();
    [523, 659, 784, 1046, 1318].forEach((f, i) => this._tone(f, 'sine', t + i * 0.09, 0.6, 0.1));
  }

  gradientFire() {
    if (!this.started) return;
    const t = this._now();
    this._noise(t, 1.1, 0.35, 1200, 0.8, this.sfxGain, 'lowpass');
    [110, 220, 330, 440].forEach((f, i) => this._tone(f, 'sawtooth', t + i * 0.12, 1.0, 0.12));
    this._tone(880, 'sine', t + 0.5, 1.2, 0.12);
  }

  enemyDeath() {
    if (!this.started) return;
    const t = this._now();
    this._noise(t, 0.7, 0.3, 14000, 0.7, this.sfxGain, 'highpass');
    this._tone(300, 'sawtooth', t, 0.7, 0.1);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(400, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.8);
    o.connect(g); g.connect(this.sfxGain);
    this._env(g, t, 0.2, 0.02, 0.8);
    o.start(t); o.stop(t + 1.1);
  }

  victory() {
    if (!this.started) return;
    const t = this._now();
    const fan = [523, 523, 659, 784, 1046];
    fan.forEach((f, i) => {
      this._tone(f, 'triangle', t + i * 0.16, 0.5, 0.13);
      this._tone(f / 2, 'sine', t + i * 0.16, 0.5, 0.08);
    });
  }

  defeat() {
    if (!this.started) return;
    const t = this._now();
    [392, 370, 349, 294].forEach((f, i) => { this._tone(f, 'sawtooth', t + i * 0.3, 0.8, 0.08); this._tone(f / 2, 'sine', t + i * 0.3, 0.9, 0.08); });
  }

  breakSound() {
    if (!this.started) return;
    const t = this._now();
    this._noise(t, 0.3, 0.35, 800, 2);
    this._tone(150, 'square', t, 0.3, 0.2);
    this._tone(1200, 'sine', t + 0.05, 0.5, 0.12);
  }

  _bindEvents() {
    const b = this.bus;
    b.on(EV.ATTACK_START, (p) => { if (p && p.swing !== false) this.swing(); });
    b.on(EV.DAMAGE, (p) => { if (!p) return; this.hit(p.kind === 'break' ? 1.2 : 0.9 + Math.min(0.5, p.amount / 80), !!p.crit); });
    b.on(EV.PERFECT, () => this.perfect());
    b.on(EV.PARRY, () => this.parry());
    b.on(EV.DODGE, () => this.dodge());
    b.on(EV.FAIL, () => this.fail());
    b.on(EV.COUNTER, () => this.counter());
    b.on(EV.HEAL, () => this.heal());
    b.on(EV.CHARGE, () => this.charge());
    b.on(EV.BREAK, () => this.breakSound());
    b.on(EV.TELEGRAPH, () => this.telegraph());
    b.on(EV.GRADIENT_READY, () => this.gradientReady());
    b.on(EV.GRADIENT_FIRE, () => this.gradientFire());
    b.on(EV.DEATH, (p) => { if (p && p.side === 'enemy') this.enemyDeath(); });
    b.on(EV.VICTORY, () => this.victory());
    b.on(EV.DEFEAT, () => this.defeat());
    b.on(EV.MENU_OPEN, () => this.blip());
    b.on(EV.MENU_CHOICE, () => this.confirm());
  }

  dispose() {
    if (this._pulseTimer) clearInterval(this._pulseTimer);
    if (this.ctx) this.ctx.close().catch(() => {});
  }
}
