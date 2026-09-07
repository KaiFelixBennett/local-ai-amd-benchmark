import type { PlayerSettings } from '../core/types';

type NoiseType = 'white';

/**
 * Fully procedural Web Audio sound design — no audio files. Every effect is
 * synthesized from oscillators/noise so the game needs zero binary assets
 * and never risks a missing-file error. Initialization is deferred until the
 * first user gesture to respect browser autoplay policies.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeSfxSources = 0;
  private readonly maxConcurrentSfx = 16;
  private musicNodes: { stop: () => void } | null = null;
  private musicIntensity = 0;
  private ambienceLoop: { stop: () => void } | null = null;

  private settings: PlayerSettings;

  constructor(settings: PlayerSettings) {
    this.settings = settings;
  }

  /** Must be called from within a user gesture handler (click/keydown) to satisfy autoplay policy. */
  init(): void {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.musicGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.ambienceGain = this.ctx.createGain();
    this.musicGain.connect(this.masterGain);
    this.sfxGain.connect(this.masterGain);
    this.ambienceGain.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);
    this.applyVolumes(this.settings);
    this.noiseBuffer = this.buildNoiseBuffer('white');
  }

  isInitialized(): boolean {
    return this.ctx !== null;
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  applyVolumes(settings: PlayerSettings): void {
    this.settings = settings;
    if (!this.ctx || !this.masterGain || !this.musicGain || !this.sfxGain || !this.ambienceGain) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(settings.masterVolume, now, 0.05);
    this.musicGain.gain.setTargetAtTime(settings.musicVolume, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(settings.sfxVolume, now, 0.05);
    this.ambienceGain.gain.setTargetAtTime(settings.ambienceVolume, now, 0.05);
  }

  private buildNoiseBuffer(_type: NoiseType): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    const length = ctx.sampleRate * 1.0;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private canPlaySfx(): boolean {
    return this.activeSfxSources < this.maxConcurrentSfx;
  }

  private trackSource(durationSec: number): void {
    this.activeSfxSources++;
    window.setTimeout(() => {
      this.activeSfxSources = Math.max(0, this.activeSfxSources - 1);
    }, durationSec * 1000 + 50);
  }

  // -------------------------------------------------------------------
  // Tone/noise primitives
  // -------------------------------------------------------------------
  private tone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    options?: { type?: OscillatorType; gainPeak?: number; delay?: number; pitchVariance?: number },
  ): void {
    if (!this.ctx || !this.sfxGain || !this.canPlaySfx()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + (options?.delay ?? 0);
    const variance = options?.pitchVariance ?? 0;
    const pitchMul = 1 + (Math.random() * 2 - 1) * variance;

    const osc = ctx.createOscillator();
    osc.type = options?.type ?? 'sine';
    osc.frequency.setValueAtTime(freqStart * pitchMul, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd * pitchMul), now + durationSec);

    const gain = ctx.createGain();
    const peak = options?.gainPeak ?? 0.5;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.02, durationSec * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
    this.trackSource(durationSec + (options?.delay ?? 0));
  }

  private noiseBurst(durationSec: number, options?: { gainPeak?: number; filterFreq?: number; delay?: number }): void {
    if (!this.ctx || !this.sfxGain || !this.noiseBuffer || !this.canPlaySfx()) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + (options?.delay ?? 0);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = options?.filterFreq ?? 1200;

    const gain = ctx.createGain();
    const peak = options?.gainPeak ?? 0.4;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(now);
    src.stop(now + durationSec + 0.02);
    this.trackSource(durationSec + (options?.delay ?? 0));
  }

  // -------------------------------------------------------------------
  // Weapon SFX
  // -------------------------------------------------------------------
  playShot(variant = 0): void {
    if (!this.ctx) return;
    const base = 180 + variant * 12;
    this.noiseBurst(0.09, { gainPeak: 0.55, filterFreq: 1800 });
    this.tone(base, base * 0.4, 0.12, { type: 'sawtooth', gainPeak: 0.4, pitchVariance: 0.08 });
    this.tone(base * 0.5, base * 0.2, 0.18, { type: 'triangle', gainPeak: 0.25, delay: 0.02 });
  }

  playEmptyClick(): void {
    this.tone(900, 300, 0.05, { type: 'square', gainPeak: 0.2 });
  }

  playReloadStart(): void {
    this.tone(300, 500, 0.12, { type: 'triangle', gainPeak: 0.15 });
  }

  playReloadFinish(): void {
    this.tone(500, 900, 0.1, { type: 'square', gainPeak: 0.2 });
    this.tone(300, 300, 0.05, { type: 'square', gainPeak: 0.15, delay: 0.08 });
  }

  // -------------------------------------------------------------------
  // Hit / feedback SFX
  // -------------------------------------------------------------------
  playHit(perfect: boolean): void {
    if (perfect) {
      this.tone(660, 1100, 0.16, { type: 'sine', gainPeak: 0.5, pitchVariance: 0.04 });
      this.tone(990, 1500, 0.12, { type: 'sine', gainPeak: 0.3, delay: 0.03 });
    } else {
      this.tone(440, 260, 0.14, { type: 'sine', gainPeak: 0.4, pitchVariance: 0.06 });
    }
  }

  playMiss(): void {
    this.tone(220, 120, 0.08, { type: 'sine', gainPeak: 0.15 });
  }

  playComboMilestone(level: number): void {
    for (let i = 0; i < Math.min(4, 1 + Math.floor(level / 5)); i++) {
      this.tone(500 + i * 120, 500 + i * 120, 0.1, { type: 'square', gainPeak: 0.2, delay: i * 0.05 });
    }
  }

  playRareTarget(): void {
    this.tone(880, 1760, 0.35, { type: 'sine', gainPeak: 0.35 });
    this.tone(1320, 2000, 0.3, { type: 'triangle', gainPeak: 0.2, delay: 0.08 });
  }

  playDecoy(): void {
    this.tone(300, 120, 0.25, { type: 'sawtooth', gainPeak: 0.3 });
  }

  playArmorBreak(): void {
    this.noiseBurst(0.15, { gainPeak: 0.4, filterFreq: 600 });
    this.tone(200, 100, 0.15, { type: 'square', gainPeak: 0.25 });
  }

  playChainReaction(): void {
    this.tone(400, 900, 0.4, { type: 'sine', gainPeak: 0.3 });
    this.noiseBurst(0.2, { gainPeak: 0.25, filterFreq: 900, delay: 0.1 });
  }

  playBossHit(): void {
    this.tone(150, 90, 0.2, { type: 'square', gainPeak: 0.4 });
  }

  playBossIntro(): void {
    this.tone(80, 220, 0.9, { type: 'sawtooth', gainPeak: 0.35 });
  }

  playBossDefeat(): void {
    this.tone(220, 880, 0.6, { type: 'sine', gainPeak: 0.4 });
    this.noiseBurst(0.5, { gainPeak: 0.3, filterFreq: 1500, delay: 0.1 });
  }

  playMenuClick(): void {
    this.tone(700, 700, 0.06, { type: 'triangle', gainPeak: 0.2 });
  }

  playMenuHover(): void {
    this.tone(500, 500, 0.04, { type: 'sine', gainPeak: 0.1 });
  }

  // -------------------------------------------------------------------
  // Ambience loops (per map)
  // -------------------------------------------------------------------
  startAmbience(_key: string): void {
    this.stopAmbience();
    if (!this.ctx || !this.ambienceGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 90;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 25;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0.18;
    osc.connect(gain);
    gain.connect(this.ambienceGain);
    osc.start();
    lfo.start();
    this.ambienceLoop = {
      stop: () => {
        osc.stop();
        lfo.stop();
      },
    };
  }

  stopAmbience(): void {
    this.ambienceLoop?.stop();
    this.ambienceLoop = null;
  }

  // -------------------------------------------------------------------
  // Adaptive music: layered pads that fade in/out with intensity 0..1
  // -------------------------------------------------------------------
  startMusic(): void {
    this.stopMusic();
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const layerFreqs = [110, 165, 220, 330];
    const oscillators: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    layerFreqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = idx === 0 ? 0.12 : 0;
      osc.connect(gain);
      gain.connect(this.musicGain as GainNode);
      osc.start();
      oscillators.push(osc);
      gains.push(gain);
    });
    this.musicNodes = {
      stop: () => oscillators.forEach((o) => o.stop()),
    };
    (this.musicNodes as unknown as { gains: GainNode[] }).gains = gains;
    this.setMusicIntensity(0);
  }

  setMusicIntensity(intensity01: number): void {
    this.musicIntensity = Math.min(1, Math.max(0, intensity01));
    if (!this.ctx || !this.musicNodes) return;
    const gains = (this.musicNodes as unknown as { gains: GainNode[] }).gains;
    if (!gains) return;
    const now = this.ctx.currentTime;
    gains.forEach((gain, idx) => {
      const threshold = idx / gains.length;
      const target = this.musicIntensity > threshold ? 0.1 - idx * 0.015 : 0;
      gain.gain.setTargetAtTime(Math.max(0, target), now, 0.6);
    });
  }

  getMusicIntensity(): number {
    return this.musicIntensity;
  }

  stopMusic(): void {
    this.musicNodes?.stop();
    this.musicNodes = null;
  }

  destroy(): void {
    this.stopMusic();
    this.stopAmbience();
    void this.ctx?.close();
    this.ctx = null;
  }
}
