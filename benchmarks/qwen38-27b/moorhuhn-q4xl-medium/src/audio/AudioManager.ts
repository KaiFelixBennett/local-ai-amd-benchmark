/**
 * Procedural audio engine built on the Web Audio API.
 * - No external audio files required (satisfies the "no runtime downloads" rule)
 * - Safe under browser autoplay policy: AudioContext is created lazily and
 *   resumed on the first user gesture.
 * - All sounds are synthesized (oscillators + noise + filters + envelopes).
 */

export type SfxName =
  | 'shoot'
  | 'shoot_empty'
  | 'reload'
  | 'reload_done'
  | 'hit'
  | 'perfect'
  | 'combo'
  | 'rare'
  | 'boss_hit'
  | 'boss_die'
  | 'boss_introduce'
  | 'chain'
  | 'menu_open'
  | 'menu_confirm'
  | 'miss'
  | 'penalty'
  | 'countdown'
  | 'round_start'
  | 'round_end'
  | 'record';

export interface VolumeConfig {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
}

export const DEFAULT_VOLUME: VolumeConfig = {
  master: 0.8,
  music: 0.7,
  sfx: 0.85,
  ambient: 0.6
};

interface MusicState {
  intensity: number; // 0..1
  timer: number | null;
  nextBeat: number;
  step: number;
}

/**
 * The full AudioManager. Create one and attach to the game.
 * It handles a single AudioContext, a master gain + music/sfx/ambient buses,
 * and a lightweight procedural music sequencer.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private ambientGain!: GainNode;
  private noiseBuffer: AudioBuffer | null = null;
  private volume: VolumeConfig = { ...DEFAULT_VOLUME };
  private music: MusicState = { intensity: 0, timer: null, nextBeat: 0, step: 0 };
  private _ready = false;
  private muted = false;

  /** Lazily create the AudioContext + nodes. Call from a user gesture. */
  ensure(): boolean {
    if (this.ctx) return this._ready;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.masterGain = ctx.createGain();
      this.sfxGain = ctx.createGain();
      this.musicGain = ctx.createGain();
      this.ambientGain = ctx.createGain();
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.ambientGain.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
      // pre-bake a 1s noise buffer
      const len = ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      this.applyVolumes();
      this._ready = true;
      return true;
    } catch {
      this.ctx = null;
      return false;
    }
  }

  get ready(): boolean {
    return this._ready && !!this.ctx;
  }

  /** Call when the user first interacts so the browser will let us play. */
  async resume(): Promise<void> {
    if (!this.ensure()) return;
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  setVolumes(v: Partial<VolumeConfig>): void {
    this.volume = { ...this.volume, ...v };
    this.applyVolumes();
  }
  getVolume(): VolumeConfig {
    return { ...this.volume };
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.masterGain) this.masterGain.gain.value = m ? 0 : this.volume.master;
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const m = this.muted ? 0 : this.volume.master;
    this.masterGain.gain.value = m;
    this.musicGain.gain.value = this.volume.music;
    this.sfxGain.gain.value = this.volume.sfx;
    this.ambientGain.gain.value = this.volume.ambient;
  }

  // ---------------- SFX ----------------

  private now(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  playSfx(name: SfxName): void {
    if (!this.ready || !this.ctx) return;
    const t = this.now();
    switch (name) {
      case 'shoot':
        this.noiseBurst(t, 0.09, 1.1, 700);
        this.osc(t, 220, 90, 0.09, 'triangle', 0.5, 0.35);
        break;
      case 'shoot_empty':
        this.osc(t, 140, 110, 0.06, 'square', 0.2, 0.25);
        break;
      case 'reload':
        this.noiseBurst(t, 0.05, 0.6, 400);
        this.osc(t + 0.35, 320, 240, 0.08, 'square', 0.35, 0.25);
        break;
      case 'reload_done':
        this.osc(t, 480, 640, 0.07, 'triangle', 0.35, 0.3);
        break;
      case 'hit':
        this.osc(t, 520, 320, 0.09, 'square', 0.35, 0.3);
        this.noiseBurst(t, 0.05, 0.5, 900);
        break;
      case 'perfect':
        this.osc(t, 660, 880, 0.08, 'sine', 0.4, 0.4);
        this.osc(t + 0.06, 880, 1320, 0.1, 'sine', 0.3, 0.35);
        break;
      case 'combo':
        this.osc(t, 520, 780, 0.1, 'triangle', 0.35, 0.35);
        this.osc(t + 0.08, 780, 1040, 0.12, 'triangle', 0.3, 0.3);
        break;
      case 'rare':
        this.osc(t, 880, 1760, 0.14, 'sine', 0.4, 0.45);
        this.osc(t + 0.1, 1320, 2093, 0.16, 'sine', 0.3, 0.4);
        break;
      case 'boss_hit':
        this.osc(t, 200, 120, 0.12, 'sawtooth', 0.4, 0.45);
        this.noiseBurst(t, 0.08, 0.5, 300);
        break;
      case 'boss_die':
        this.osc(t, 400, 80, 0.5, 'sawtooth', 0.5, 0.5);
        this.noiseBurst(t, 0.4, 0.7, 500);
        break;
      case 'boss_introduce':
        this.osc(t, 90, 180, 0.6, 'sawtooth', 0.5, 0.5);
        this.osc(t + 0.2, 120, 240, 0.5, 'sawtooth', 0.4, 0.45);
        break;
      case 'chain':
        this.osc(t, 380, 560, 0.08, 'square', 0.35, 0.3);
        this.osc(t + 0.09, 560, 760, 0.08, 'square', 0.3, 0.3);
        break;
      case 'menu_open':
        this.osc(t, 300, 380, 0.05, 'sine', 0.25, 0.25);
        break;
      case 'menu_confirm':
        this.osc(t, 440, 620, 0.07, 'sine', 0.3, 0.3);
        break;
      case 'miss':
        this.osc(t, 220, 150, 0.07, 'sine', 0.2, 0.2);
        break;
      case 'penalty':
        this.osc(t, 180, 90, 0.2, 'sawtooth', 0.4, 0.4);
        break;
      case 'countdown':
        this.osc(t, 660, 660, 0.08, 'sine', 0.35, 0.35);
        break;
      case 'round_start':
        this.osc(t, 440, 660, 0.12, 'triangle', 0.4, 0.35);
        this.osc(t + 0.12, 660, 880, 0.16, 'triangle', 0.35, 0.35);
        break;
      case 'round_end':
        this.osc(t, 660, 440, 0.18, 'triangle', 0.4, 0.35);
        this.osc(t + 0.18, 440, 330, 0.24, 'triangle', 0.35, 0.35);
        break;
      case 'record':
        [523, 659, 784, 1046].forEach((f, i) => this.osc(t + i * 0.08, f, f, 0.1, 'sine', 0.35, 0.4));
        break;
    }
  }

  private osc(
    t: number,
    f0: number,
    f1: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    attack: number,
    bus: GainNode | null = null
  ): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus ?? this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  private noiseBurst(t: number, dur: number, gain: number, cutoff: number, bus: GainNode | null = null): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(bus ?? this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  // ---------------- Ambient bed ----------------
  startAmbient(): void {
    if (!this.ready || !this.ctx) return;
    this.stopAmbient();
    // low drone
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 55;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    o.connect(g);
    g.connect(this.ambientGain);
    o.start();
    (this as unknown as { _ambOsc?: OscillatorNode })._ambOsc = o;
    (this as unknown as { _ambGain?: GainNode })._ambGain = g;
  }

  stopAmbient(): void {
    const s = this as unknown as { _ambOsc?: OscillatorNode; _ambGain?: GainNode };
    if (s._ambOsc) {
      try {
        s._ambOsc.stop();
      } catch {
        /* ignore */
      }
      s._ambOsc.disconnect();
      s._ambOsc = undefined;
      s._ambGain?.disconnect();
      s._ambGain = undefined;
    }
  }

  // ---------------- Procedural music ----------------
  startMusic(intensity: number): void {
    if (!this.ready || !this.ctx) return;
    this.stopMusic();
    this.music.intensity = intensity;
    this.music.step = 0;
    this.music.nextBeat = this.now() + 0.1;
    const loop = () => {
      if (!this.ctx) return;
      let next = this.music.nextBeat;
      const beat = 0.32 - this.music.intensity * 0.1;
      // keep scheduling a bit ahead
      while (next < this.now() + 0.25) {
        this.scheduleBeat(next, this.music.step);
        this.music.step = (this.music.step + 1) % 16;
        next += beat;
      }
      this.music.nextBeat = next;
      this.music.timer = window.setTimeout(loop, 80);
    };
    loop();
  }

  setMusicIntensity(v: number): void {
    this.music.intensity = Math.max(0, Math.min(1, v));
  }

  private scheduleBeat(t: number, step: number): void {
    if (!this.ctx) return;
    const bus = this.musicGain;
    const scale = [130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63]; // Cm-ish
    const bassNotes = [0, 0, 3, 5, 0, 0, 3, 5, 0, 0, 3, 6, 5, 4, 3, 2];
    const step16 = step % 16;
    // bass every half-beat
    if (step16 % 2 === 0) {
      const note = scale[bassNotes[step16] % scale.length];
      this.osc(t, note, note, 0.24, 'triangle', 0.22 + this.music.intensity * 0.1, 0.02, bus);
    }
    // sparkle / lead on strong intensity
    if (this.music.intensity > 0.35 && step16 % 4 === 2) {
      const note = scale[Math.floor(step / 2) % scale.length] * 2;
      this.osc(t, note, note, 0.18, 'sine', 0.16 + this.music.intensity * 0.08, 0.02, bus);
    }
    // hat-ish noise tick
    if (this.music.intensity > 0.2 && step16 % 4 === 0) {
      this.noiseBurst(t, 0.03, 0.08 + this.music.intensity * 0.06, 6000, bus);
    }
  }

  stopMusic(): void {
    if (this.music.timer !== null) {
      clearTimeout(this.music.timer);
      this.music.timer = null;
    }
  }

  /** Tear everything down cleanly. */
  dispose(): void {
    this.stopMusic();
    this.stopAmbient();
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        /* ignore */
      }
      this.ctx = null;
    }
    this._ready = false;
  }
}
