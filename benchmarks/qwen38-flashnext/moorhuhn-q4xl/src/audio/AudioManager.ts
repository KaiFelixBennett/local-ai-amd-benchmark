import type { Settings } from '../core/types';
import { bus } from '../core/EventBus';
import { getSettings } from '../core/Save';

/**
 * Fully procedural Web Audio engine: every sound is synthesised (noise
 * bursts, oscillators, filtered loops). No audio assets are shipped.
 * Constructed lazily; init() must run inside a user gesture.
 */

type Mood = 'calm' | 'normal' | 'tense' | 'magical';

const MOOD_CHORDS: Record<Mood, number[][]> = {
  // frequencies (Hz) of a warm triad per mood, in A-min-ish pentatonic
  calm: [[220, 261.63, 329.63], [196, 246.94, 293.66]],
  normal: [[220, 261.63, 329.63], [261.63, 329.63, 392], [196, 246.94, 293.66], [246.94, 293.66, 369.99]],
  tense: [[220, 277.18, 349.23], [207.65, 261.63, 311.13], [233.08, 293.66, 369.99], [220, 261.63, 311.13]],
  magical: [[329.63, 415.3, 493.88], [293.66, 369.99, 440], [392, 493.88, 587.33], [349.23, 440, 523.25]],
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;
  private ambientGain!: GainNode;
  private settings: Settings;
  private voices = 0;
  private maxVoices = 24;

  private musicTimer: number | null = null;
  private musicStep = 0;
  private mood: Mood = 'calm';
  private ambientNodes: AudioNode[] = [];
  private ambientKey: 'wind' | 'water' | 'night' | null = null;

  constructor(settings: Settings) {
    this.settings = settings;
    bus.on('audio:unlock', () => this.init());
    bus.on('settings:changed', () => this.applySettings(getSettings()));
  }

  /** Call from a user gesture (pointerdown). Safe to call repeatedly. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // jsdom / unsupported
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.ambientGain = this.ctx.createGain();
    this.musicGain.connect(this.master);
    this.sfxGain.connect(this.master);
    this.ambientGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.applySettings(this.settings);
    this.startMusic();
  }

  applySettings(s: Settings): void {
    this.settings = s;
    if (!this.ctx) return;
    this.master.gain.value = s.masterVolume;
    this.musicGain.gain.value = s.musicVolume * 0.5;
    this.sfxGain.gain.value = s.sfxVolume;
    this.ambientGain.gain.value = s.ambientVolume * 0.6;
  }

  // ---------------- ambience ----------------

  setAmbient(key: 'wind' | 'water' | 'night'): void {
    if (!this.ctx || this.ambientKey === key) return;
    this.stopAmbient();
    this.ambientKey = key;
    const noise = this.noiseSource(true);
    const filter = this.ctx.createBiquadFilter();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    if (key === 'wind') {
      filter.type = 'bandpass';
      filter.frequency.value = 500;
      filter.Q.value = 0.6;
      lfo.frequency.value = 0.13;
      lfoGain.gain.value = 320;
    } else if (key === 'water') {
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      lfo.frequency.value = 0.31;
      lfoGain.gain.value = 380;
    } else {
      filter.type = 'bandpass';
      filter.frequency.value = 2400;
      filter.Q.value = 4;
      lfo.frequency.value = 0.7;
      lfoGain.gain.value = 900;
    }
    lfo.connect(lfoGain).connect(filter.frequency);
    noise.connect(filter).connect(this.ambientGain);
    // NOTE: noiseSource() already started the buffer source.
    lfo.start();
    this.ambientNodes = [noise, filter, lfo, lfoGain];
  }

  stopAmbient(): void {
    for (const n of this.ambientNodes) {
      try {
        if (n instanceof AudioBufferSourceNode || n instanceof OscillatorNode) n.stop();
      } catch {
        /* already stopped */
      }
      n.disconnect();
    }
    this.ambientNodes = [];
    this.ambientKey = null;
  }

  /** Fireflies/crickets chirp for night ambience, called from scene. */
  cricket(): void {
    if (!this.ctx || this.ambientKey !== 'night') return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 4200 + this.rand() * 900;
    g.gain.setValueAtTime(0, t);
    for (let i = 0; i < 3; i++) {
      g.gain.setValueAtTime(0.02, t + i * 0.07);
      g.gain.setValueAtTime(0, t + i * 0.07 + 0.03);
    }
    osc.connect(g).connect(this.ambientGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  // ---------------- music ----------------

  setMood(mood: Mood): void {
    this.mood = mood;
  }

  private startMusic(): void {
    if (!this.ctx || this.musicTimer !== null) return;
    const stepMs = 620;
    this.musicTimer = window.setInterval(() => this.musicTick(), stepMs);
  }

  private musicTick(): void {
    if (!this.ctx) return;
    const chords = MOOD_CHORDS[this.mood];
    const chord = chords[Math.floor(this.musicStep / 8) % chords.length];
    const t = this.ctx.currentTime;
    // pad on chord change
    if (this.musicStep % 8 === 0) {
      for (const f of chord) this.pad(f, t, 4.6);
    }
    // sparse pentatonic plucks
    if (this.mood !== 'calm' || this.musicStep % 4 === 0) {
      if (this.rand() < (this.mood === 'tense' ? 0.75 : 0.4)) {
        const f = chord[Math.floor(this.rand() * chord.length)] * (this.rand() < 0.4 ? 2 : 1);
        this.pluck(f, t);
      }
    }
    if (this.mood === 'tense' && this.musicStep % 2 === 0) this.thump(t);
    this.musicStep++;
  }

  private pad(freq: number, t: number, dur: number): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o2.type = 'sine';
    o.frequency.value = freq * 0.5;
    o2.frequency.value = freq * 0.5 * 1.003;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.9);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g);
    o2.connect(g);
    g.connect(this.musicGain);
    o.start(t);
    o2.start(t);
    o.stop(t + dur);
    o2.stop(t + dur);
  }

  private pluck(freq: number, t: number): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.55);
  }

  private thump(t: number): void {
    if (!this.ctx) return;
    const like = this.noiseSource(false, 0.14);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 160;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    like.connect(f).connect(g).connect(this.musicGain);
  }

  // ---------------- sfx ----------------

  shotgun(pitch = 1): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const noise = this.noiseSource(false, 0.22);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600 * pitch, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    noise.connect(lp).connect(g).connect(this.sfxGain);
    // boom layer
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(110 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.2);
    og.gain.setValueAtTime(0.55, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(og).connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.25);
  }

  dryFire(): void {
    this.click(2400, 0.05);
  }

  reloadStart(): void {
    this.clack(520, 0.09);
  }

  reloadDone(): void {
    this.clack(340, 0.12);
    setTimeout(() => this.click(1800, 0.04), 70);
  }

  reloadCancel(): void {
    this.click(900, 0.05);
  }

  hit(perfect: boolean): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const base = perfect ? 1500 : 950;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = perfect ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(base * (0.95 + this.rand() * 0.1), t);
    o.frequency.exponentialRampToValueAtTime(base * 0.45, t + 0.14);
    g.gain.setValueAtTime(perfect ? 0.4 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.18);
    // feather poof
    const n = this.noiseSource(false, 0.09);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.18, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    n.connect(f).connect(ng).connect(this.sfxGain);
    if (perfect) this.chime(t + 0.02);
  }

  milestone(tier: number): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5].slice(0, 2 + tier);
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.07);
      g.gain.linearRampToValueAtTime(0.12, t + i * 0.07 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.18);
      o.connect(g).connect(this.sfxGain);
      o.start(t + i * 0.07);
      o.stop(t + i * 0.07 + 0.2);
    });
  }

  bossRoar(): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.linearRampToValueAtTime(42, t + 1.1);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 340;
    o.connect(f).connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + 1.35);
  }

  chainRumble(): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = this.noiseSource(false, 1.0);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(90, t);
    f.frequency.linearRampToValueAtTime(230, t + 0.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
    n.connect(f).connect(g).connect(this.sfxGain);
  }

  thunder(): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = this.noiseSource(false, 1.6);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(420, t);
    f.frequency.exponentialRampToValueAtTime(80, t + 1.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.75, t);
    g.gain.setValueAtTime(0.35, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    n.connect(f).connect(g).connect(this.sfxGain);
  }

  splat(): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = this.noiseSource(false, 0.14);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    n.connect(f).connect(g).connect(this.sfxGain);
  }

  croak(): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(150, t);
    o.frequency.linearRampToValueAtTime(95, t + 0.12);
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.18);
  }

  whoosh(): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = this.noiseSource(false, 0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    n.connect(f).connect(g).connect(this.sfxGain);
  }

  coin(): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    [987.77, 1318.51].forEach((ff, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = ff;
      g.gain.setValueAtTime(0.14, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.22);
      o.connect(g).connect(this.sfxGain);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.25);
    });
  }

  uiClick(): void {
    this.click(1200, 0.035);
  }

  uiBack(): void {
    this.click(700, 0.04);
  }

  achievement(): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.09);
      g.gain.linearRampToValueAtTime(0.18, t + i * 0.09 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.5);
      o.connect(g).connect(this.sfxGain);
      o.start(t + i * 0.09);
      o.stop(t + i * 0.09 + 0.55);
    });
  }

  // ---------------- internals ----------------

  private chime(t: number): void {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 2093;
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + 0.4);
  }

  private click(freq: number, dur: number): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private clack(freq: number, dur: number): void {
    if (!this.ready('sfx')) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const n = this.noiseSource(false, dur + 0.03);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f).connect(g).connect(this.sfxGain);
  }

  private ready(kind: 'sfx'): boolean {
    void kind;
    return !!this.ctx && this.settings.sfxVolume > 0.001 && this.settings.masterVolume > 0.001 && this.voices < this.maxVoices;
  }

  private noiseSource(loop: boolean, seconds = 0.5): AudioBufferSourceNode {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = loop;
    this.voices++;
    src.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
    };
    src.start();
    return src;
  }

  private rand(): number {
    return Math.random();
  }

  dispose(): void {
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
    this.stopAmbient();
    void this.ctx?.close();
    this.ctx = null;
  }
}
