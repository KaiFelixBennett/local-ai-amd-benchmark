/**
 * Runtime audio synthesis — Web Audio only, no samples anywhere.
 *
 * Signal flow:
 *   voices -> [dry gain] --------------------\
 *          -> [send gain] -> convolver ------ > master -> compressor -> out
 *
 * The convolver impulse is generated noise, the music is a step sequencer of
 * synthesized voices in D minor whose layers unmute as battle intensity rises.
 */

const MIDI_A4 = 69;

/** MIDI note number to frequency in Hz. */
function mtof(m) {
  return 440 * Math.pow(2, (m - MIDI_A4) / 12);
}

// D natural minor scale degrees as MIDI numbers, two octaves.
const D_MINOR = [50, 52, 53, 55, 57, 58, 60, 62, 64, 65, 67, 69, 70, 72, 74];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.intensity = 0.25;
    this._targetIntensity = 0.25;
    this._step = 0;
    this._nextStepTime = 0;
    this._bpm = 88;
    this._activeTelegraph = null;
    this._musicOn = false;
  }

  /** Must be called from a user gesture; safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      try {
        this.ctx = new Ctor();
      } catch (err) {
        console.warn('[audio] unavailable:', err);
        return false;
      }
      this._buildGraph();
      this.ready = true;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return true;
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.004;
    this.comp.release.value = 0.22;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.4);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.42;

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.0;
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 1.0;

    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    this.master.connect(this.reverbGain);
    this.reverbGain.connect(this.reverb);
    this.reverb.connect(this.comp);

    this.noiseBuffer = this._noise(2.0);
  }

  /** Exponentially decaying stereo noise burst used as a reverb impulse. */
  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (1 - t * 0.2);
      }
    }
    return buf;
  }

  _noise(seconds) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // -------------------------------------------------------------------------
  // Low-level voice helpers
  // -------------------------------------------------------------------------

  /** One enveloped oscillator. Returns nothing; the voice cleans itself up. */
  _tone(opts) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const {
      freq = 440, type = 'sine', t0 = ctx.currentTime, dur = 0.3, gain = 0.2,
      attack = 0.005, release = null, glideTo = null, detune = 0,
      filter = null, q = 1, bus = this.sfxBus, pan = 0,
    } = opts;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);

    const g = ctx.createGain();
    const rel = release === null ? dur * 0.8 : release;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + rel);

    let node = osc;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = typeof filter === 'string' ? filter : 'lowpass';
      f.frequency.setValueAtTime(typeof filter === 'number' ? filter : 1800, t0);
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      node.connect(p);
      node = p;
    }
    node.connect(g);
    g.connect(bus);

    osc.start(t0);
    osc.stop(t0 + attack + rel + 0.06);
    osc.onended = () => { try { g.disconnect(); } catch (e) { /* already gone */ } };
  }

  /** Filtered noise burst — impacts, cloth, breath, percussion. */
  _noiseBurst(opts) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const {
      t0 = ctx.currentTime, dur = 0.18, gain = 0.25, type = 'bandpass',
      freq = 1200, q = 1.2, sweepTo = null, bus = this.sfxBus, rate = 1,
    } = opts;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = rate;

    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    f.Q.value = q;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* already gone */ } };
  }

  /** Stacked-interval chord helper. */
  _chord(root, intervals, opts = {}) {
    intervals.forEach((iv, i) => {
      this._tone({
        freq: mtof(root + iv),
        type: opts.type || 'triangle',
        t0: (opts.t0 || (this.ctx ? this.ctx.currentTime : 0)) + i * (opts.spread || 0),
        dur: opts.dur || 0.8,
        gain: (opts.gain || 0.14) / Math.sqrt(intervals.length),
        attack: opts.attack || 0.012,
        filter: opts.filter || 2600,
        bus: opts.bus || this.sfxBus,
      });
    });
  }

  // -------------------------------------------------------------------------
  // Music bed
  // -------------------------------------------------------------------------

  startMusic() {
    if (!this.ready || this._musicOn) return;
    this._musicOn = true;
    this._nextStepTime = this.ctx.currentTime + 0.1;
    this._step = 0;
    this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicBus.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    this.musicBus.gain.linearRampToValueAtTime(0.5, this.ctx.currentTime + 2.4);
  }

  stopMusic(fade = 1.2) {
    if (!this.ready || !this._musicOn) return;
    this._musicOn = false;
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(Math.max(0.0001, this.musicBus.gain.value), now);
    this.musicBus.gain.exponentialRampToValueAtTime(0.0001, now + fade);
  }

  /** 0 = calm exploration bed, 1 = full desperate orchestration. */
  setIntensity(v) {
    this._targetIntensity = Math.max(0, Math.min(1, v));
  }

  /** Called every frame; schedules music steps a short distance ahead. */
  update(dt) {
    if (!this.ready) return;
    this.intensity += (this._targetIntensity - this.intensity) * Math.min(1, dt * 0.9);
    if (!this._musicOn) return;
    const now = this.ctx.currentTime;
    const lookahead = 0.22;
    let guard = 0;
    while (this._nextStepTime < now + lookahead && guard++ < 32) {
      this._scheduleStep(this._step, this._nextStepTime);
      this._bpm = 84 + this.intensity * 26;
      this._nextStepTime += 60 / this._bpm / 4;
      this._step = (this._step + 1) % 32;
    }
  }

  _scheduleStep(step, t) {
    const I = this.intensity;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    // Chord progression: Dm - Bb - F - A  (i - VI - III - V)
    const roots = [38, 34, 41, 45];
    const root = roots[(bar * 2 + (s >= 8 ? 1 : 0)) % 4];

    // Layer 1: sustained low drone, always present.
    if (s === 0) {
      this._tone({
        freq: mtof(root - 12), type: 'sawtooth', t0: t, dur: 2.2, gain: 0.075 + I * 0.05,
        attack: 0.35, filter: 220 + I * 260, q: 3, bus: this.musicBus,
      });
      this._tone({
        freq: mtof(root - 12) * 1.005, type: 'triangle', t0: t, dur: 2.2,
        gain: 0.06, attack: 0.4, filter: 400, bus: this.musicBus,
      });
    }

    // Layer 2: plucked harp-like arpeggio.
    if (I > 0.18 && (s % 2 === 0 || (I > 0.6 && s % 2 === 1))) {
      const deg = D_MINOR[(s * 2 + bar * 3) % D_MINOR.length];
      this._tone({
        freq: mtof(deg + 12), type: 'triangle', t0: t, dur: 0.4,
        gain: (0.035 + I * 0.05), attack: 0.003, filter: 3200, bus: this.musicBus,
        pan: Math.sin(s * 0.8) * 0.5,
      });
    }

    // Layer 3: percussion — heart-beat kick and brushed snare.
    if (I > 0.34) {
      if (s === 0 || s === 6 || s === 10) {
        this._tone({
          freq: 96, glideTo: 42, type: 'sine', t0: t, dur: 0.24,
          gain: 0.32 + I * 0.16, attack: 0.002, bus: this.musicBus,
        });
      }
      if (s === 4 || s === 12) {
        this._noiseBurst({
          t0: t, dur: 0.15, gain: 0.09 + I * 0.08, type: 'highpass',
          freq: 1600, sweepTo: 900, bus: this.musicBus,
        });
      }
      if (I > 0.62 && s % 4 === 2) {
        this._noiseBurst({
          t0: t, dur: 0.06, gain: 0.035, type: 'bandpass', freq: 6200, q: 2,
          bus: this.musicBus,
        });
      }
    }

    // Layer 4: swelling string pad on the downbeat of each half-bar.
    if (I > 0.5 && s === 0) {
      this._chord(root, [0, 7, 12, 15], {
        t0: t, dur: 2.0, gain: 0.1 + I * 0.09, attack: 0.5,
        filter: 1400 + I * 1400, type: 'sawtooth', bus: this.musicBus, spread: 0.02,
      });
    }

    // Layer 5: a lone mournful lead when things are dire.
    if (I > 0.76 && s === 8) {
      const lead = D_MINOR[(bar * 5) % 7] + 24;
      this._tone({
        freq: mtof(lead), type: 'triangle', t0: t, dur: 1.1, gain: 0.12,
        attack: 0.08, filter: 2400, bus: this.musicBus,
        glideTo: mtof(lead + (bar % 2 ? -2 : 3)),
      });
    }
  }

  // -------------------------------------------------------------------------
  // Stingers
  // -------------------------------------------------------------------------

  menuMove() {
    this._tone({ freq: 880, type: 'sine', dur: 0.09, gain: 0.1, filter: 4200 });
    this._tone({ freq: 1320, type: 'sine', dur: 0.06, gain: 0.05 });
  }

  menuConfirm() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._tone({ freq: 660, type: 'triangle', t0: t, dur: 0.14, gain: 0.14, filter: 4000 });
    this._tone({ freq: 990, type: 'triangle', t0: t + 0.045, dur: 0.2, gain: 0.11 });
  }

  menuCancel() {
    this._tone({ freq: 420, glideTo: 240, type: 'triangle', dur: 0.16, gain: 0.12, filter: 2400 });
  }

  swing(power = 1) {
    this._noiseBurst({
      dur: 0.2 + power * 0.06, gain: 0.14 * power, type: 'bandpass',
      freq: 900 * power, sweepTo: 2600, q: 0.9, rate: 1.4,
    });
  }

  /** Physical/elemental impact. `element` colours the timbre. */
  hit(element = 'physical', power = 1) {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._tone({ freq: 150 * power, glideTo: 52, type: 'sine', t0: t, dur: 0.2, gain: 0.34 * power });
    this._noiseBurst({ t0: t, dur: 0.13, gain: 0.2 * power, type: 'bandpass', freq: 1500, q: 0.8 });
    if (element === 'fire') {
      this._noiseBurst({ t0: t, dur: 0.5, gain: 0.14, type: 'lowpass', freq: 2400, sweepTo: 400 });
    } else if (element === 'ice') {
      this._tone({ freq: 2600, type: 'sine', t0: t, dur: 0.42, gain: 0.1, filter: 'highpass' });
      this._tone({ freq: 3400, type: 'sine', t0: t + 0.03, dur: 0.32, gain: 0.07 });
    } else if (element === 'lightning') {
      this._noiseBurst({ t0: t, dur: 0.24, gain: 0.2, type: 'highpass', freq: 3200, sweepTo: 7000, q: 0.6 });
    } else if (element === 'void') {
      this._tone({ freq: 70, glideTo: 30, type: 'sawtooth', t0: t, dur: 0.6, gain: 0.16, filter: 500 });
    } else if (element === 'light') {
      this._chord(74, [0, 4, 7], { t0: t, dur: 0.5, gain: 0.1, type: 'sine' });
    }
  }

  crit() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._noiseBurst({ t0: t, dur: 0.09, gain: 0.3, type: 'highpass', freq: 5000 });
    this._chord(62, [0, 7, 12, 19], { t0: t + 0.02, dur: 0.55, gain: 0.16, type: 'square', spread: 0.018 });
  }

  weakness() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._tone({ freq: mtof(74), type: 'square', t0: t, dur: 0.1, gain: 0.1, filter: 3000 });
    this._tone({ freq: mtof(81), type: 'square', t0: t + 0.06, dur: 0.14, gain: 0.1, filter: 3400 });
    this._tone({ freq: mtof(86), type: 'square', t0: t + 0.12, dur: 0.3, gain: 0.09, filter: 4000 });
  }

  /** The signature sound: cold metallic ring, then a rising confirm. */
  parry() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._noiseBurst({ t0: t, dur: 0.05, gain: 0.34, type: 'highpass', freq: 6500 });
    this._tone({ freq: 2100, type: 'square', t0: t, dur: 0.3, gain: 0.16, filter: 'bandpass', q: 9 });
    this._tone({ freq: 3150, type: 'sine', t0: t + 0.01, dur: 0.42, gain: 0.12 });
    this._chord(69, [0, 5, 12], { t0: t + 0.05, dur: 0.7, gain: 0.13, type: 'triangle', spread: 0.02 });
  }

  dodge() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._noiseBurst({ t0: t, dur: 0.26, gain: 0.16, type: 'bandpass', freq: 3000, sweepTo: 600, q: 0.7 });
    this._tone({ freq: 520, glideTo: 300, type: 'sine', t0: t, dur: 0.2, gain: 0.1 });
  }

  counter() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._noiseBurst({ t0: t, dur: 0.14, gain: 0.26, type: 'bandpass', freq: 2200, sweepTo: 5200, rate: 1.6 });
    this._chord(50, [0, 7, 12, 16, 19], { t0: t + 0.04, dur: 0.8, gain: 0.17, type: 'sawtooth', spread: 0.022, filter: 3400 });
  }

  whiff() {
    this._tone({ freq: 190, glideTo: 110, type: 'square', dur: 0.16, gain: 0.1, filter: 900 });
  }

  heal() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    [0, 4, 7, 12].forEach((iv, i) => {
      this._tone({
        freq: mtof(69 + iv), type: 'sine', t0: t + i * 0.07, dur: 0.7,
        gain: 0.1, attack: 0.05, filter: 3200,
      });
    });
  }

  buff() {
    this._tone({ freq: 300, glideTo: 900, type: 'triangle', dur: 0.5, gain: 0.12, filter: 3000 });
  }

  debuff() {
    this._tone({ freq: 700, glideTo: 180, type: 'sawtooth', dur: 0.55, gain: 0.11, filter: 1400 });
  }

  stagger() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._noiseBurst({ t0: t, dur: 0.4, gain: 0.3, type: 'lowpass', freq: 1400, sweepTo: 180 });
    this._tone({ freq: 120, glideTo: 40, type: 'square', t0: t, dur: 0.7, gain: 0.24, filter: 700 });
    this._chord(38, [0, 6, 12], { t0: t + 0.06, dur: 0.9, gain: 0.14, type: 'sawtooth' });
  }

  death() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._tone({ freq: 330, glideTo: 60, type: 'sawtooth', t0: t, dur: 1.4, gain: 0.16, filter: 1200 });
    this._noiseBurst({ t0: t + 0.05, dur: 1.1, gain: 0.14, type: 'lowpass', freq: 1800, sweepTo: 200 });
  }

  shot() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._noiseBurst({ t0: t, dur: 0.1, gain: 0.3, type: 'highpass', freq: 2200, sweepTo: 800 });
    this._tone({ freq: 240, glideTo: 60, type: 'square', t0: t, dur: 0.18, gain: 0.2, filter: 1600 });
  }

  aimLock() {
    this._tone({ freq: 1500, type: 'square', dur: 0.06, gain: 0.07, filter: 5000 });
  }

  ultimate() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    this._tone({ freq: 60, glideTo: 200, type: 'sawtooth', t0: t, dur: 1.6, gain: 0.2, attack: 0.5, filter: 900 });
    [0, 0.16, 0.32, 0.5].forEach((off, i) => {
      this._chord(50 + i * 5, [0, 7, 12, 16], {
        t0: t + off, dur: 1.0, gain: 0.13, type: 'sawtooth', filter: 3200, spread: 0.015,
      });
    });
    this._noiseBurst({ t0: t + 0.6, dur: 0.9, gain: 0.2, type: 'highpass', freq: 900, sweepTo: 6000 });
  }

  levelUp() {
    const t = this.ctx ? this.ctx.currentTime : 0;
    [62, 66, 69, 74].forEach((n, i) => {
      this._tone({ freq: mtof(n), type: 'triangle', t0: t + i * 0.1, dur: 0.5, gain: 0.13, filter: 4000 });
    });
  }

  victory() {
    this.stopMusic(0.5);
    const t = this.ctx ? this.ctx.currentTime : 0;
    const fanfare = [[62, 0], [62, 0.14], [62, 0.28], [67, 0.44], [66, 0.78], [69, 1.0], [74, 1.28]];
    for (const [n, off] of fanfare) {
      this._tone({ freq: mtof(n), type: 'sawtooth', t0: t + off, dur: 0.42, gain: 0.15, filter: 3200, attack: 0.01 });
      this._tone({ freq: mtof(n + 12), type: 'triangle', t0: t + off, dur: 0.4, gain: 0.09 });
    }
    this._chord(50, [0, 7, 12, 16, 19], { t0: t + 1.28, dur: 2.6, gain: 0.16, type: 'sawtooth', attack: 0.06, spread: 0.03 });
  }

  defeat() {
    this.stopMusic(0.9);
    const t = this.ctx ? this.ctx.currentTime : 0;
    [[57, 0], [56, 0.6], [53, 1.2], [50, 1.9]].forEach(([n, off]) => {
      this._tone({ freq: mtof(n), type: 'sawtooth', t0: t + off, dur: 1.5, gain: 0.14, attack: 0.12, filter: 900 });
      this._tone({ freq: mtof(n - 12), type: 'triangle', t0: t + off, dur: 1.8, gain: 0.1, attack: 0.2 });
    });
  }

  // -------------------------------------------------------------------------
  // Telegraph cue — a rising tension sweep that lands exactly on impact.
  // -------------------------------------------------------------------------

  /**
   * @param {number} seconds wind-up length; the cue peaks at the impact instant
   * @param {'parry'|'grab'|'magic'} kind changes the timbre so the player can
   *        tell an unblockable grab apart with their ears alone
   */
  telegraph(seconds, kind = 'parry') {
    if (!this.ready || this.muted) return;
    this.cancelTelegraph();
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const dur = Math.max(0.16, seconds);

    const osc = ctx.createOscillator();
    osc.type = kind === 'grab' ? 'sawtooth' : kind === 'magic' ? 'sine' : 'triangle';
    const startF = kind === 'grab' ? 70 : 320;
    const endF = kind === 'grab' ? 190 : kind === 'magic' ? 1500 : 980;
    osc.frequency.setValueAtTime(startF, t0);
    osc.frequency.exponentialRampToValueAtTime(endF, t0 + dur);

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t0);
    f.frequency.exponentialRampToValueAtTime(kind === 'grab' ? 900 : 5200, t0 + dur);
    f.Q.value = 4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(kind === 'grab' ? 0.17 : 0.1, t0 + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.05);

    osc.connect(f);
    f.connect(g);
    g.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.1);
    this._activeTelegraph = { osc, g };
    osc.onended = () => {
      if (this._activeTelegraph && this._activeTelegraph.osc === osc) this._activeTelegraph = null;
      try { g.disconnect(); } catch (e) { /* already gone */ }
    };

    // Metronomic ticks marking the last three beats before the strike.
    for (let i = 3; i >= 1; i--) {
      const tick = t0 + dur - (dur * i) / 4;
      if (tick <= t0) continue;
      this._tone({ freq: 1400 + (3 - i) * 380, type: 'square', t0: tick, dur: 0.05, gain: 0.06 });
    }
  }

  cancelTelegraph() {
    if (!this._activeTelegraph || !this.ready) return;
    const { osc, g } = this._activeTelegraph;
    const now = this.ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc.stop(now + 0.08);
    } catch (e) { /* already stopped */ }
    this._activeTelegraph = null;
  }

  setMuted(m) {
    this.muted = m;
    if (this.ready) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(m ? 0.0001 : 0.85, now + 0.15);
    }
  }
}
