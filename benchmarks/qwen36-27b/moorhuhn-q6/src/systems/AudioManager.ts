/**
 * Procedural audio system using Web Audio API.
 * All sounds are generated at runtime - no external audio files needed.
 */

interface AudioChannel {
  volume: number;
  muted: boolean;
}

interface AudioManagerState {
  ctx: AudioContext | null;
  masterGain: GainNode | null;
  musicGain: GainNode | null;
  sfxGain: GainNode | null;
  ambientGain: GainNode | null;
  initialized: boolean;
  activeOscillators: OscillatorNode[];
  maxVoices: number;
}

export class AudioManager {
  private state: AudioManagerState = {
    ctx: null,
    masterGain: null,
    musicGain: null,
    sfxGain: null,
    ambientGain: null,
    initialized: false,
    activeOscillators: [],
    maxVoices: 16,
  };

  private channels: Record<string, AudioChannel> = {
    master: { volume: 0.8, muted: false },
    music: { volume: 0.6, muted: false },
    sfx: { volume: 0.8, muted: false },
    ambient: { volume: 0.5, muted: false },
  };

  get ctx(): AudioContext | null {
    return this.state.ctx;
  }

  /** Must be called from a user gesture (click/tap). */
  init(): void {
    if (this.state.initialized) return;

    this.state.ctx = new AudioContext();
    this.state.masterGain = this.state.ctx.createGain();
    this.state.masterGain.gain.value = this.channels.master.volume;
    this.state.masterGain.connect(this.state.ctx.destination);

    this.state.musicGain = this.state.ctx.createGain();
    this.state.musicGain.gain.value = this.channels.music.volume;
    this.state.musicGain.connect(this.state.masterGain!);

    this.state.sfxGain = this.state.ctx.createGain();
    this.state.sfxGain.gain.value = this.channels.sfx.volume;
    this.state.sfxGain.connect(this.state.masterGain!);

    this.state.ambientGain = this.state.ctx.createGain();
    this.state.ambientGain.gain.value = this.channels.ambient.volume;
    this.state.ambientGain.connect(this.state.masterGain!);

    this.state.initialized = true;
  }

  setActiveVoices(max: number): void {
    this.state.maxVoices = max;
  }

  // ---- Volume Controls ----

  setMasterVolume(v: number): void {
    this.channels.master.volume = v;
    if (this.state.masterGain) this.state.masterGain.gain.value = v;
  }

  setMusicVolume(v: number): void {
    this.channels.music.volume = v;
    if (this.state.musicGain) this.state.musicGain.gain.value = v;
  }

  setSfxVolume(v: number): void {
    this.channels.sfx.volume = v;
    if (this.state.sfxGain) this.state.sfxGain.gain.value = v;
  }

  setAmbientVolume(v: number): void {
    this.channels.ambient.volume = v;
    if (this.state.ambientGain) this.state.ambientGain.gain.value = v;
  }

  // ---- SFX ----

  private playSfx(duration: number, freq: number | number[], type: OscillatorType, gain: number, dest?: GainNode): void {
    if (!this.state.ctx || !this.state.sfxGain || this.channels.sfx.muted) return;
    const ctx = this.state.ctx;
    const d = ctx.currentTime + duration;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, d);
    gainNode.connect(dest ?? this.state.sfxGain);

    const freqs = Array.isArray(freq) ? freq : [freq];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(f, ctx.currentTime);
      osc.connect(gainNode);
      osc.start(ctx.currentTime);
      osc.stop(d);
    }
  }

  shoot(pitch: number = 1.0): void {
    if (!this.state.ctx) return;
    // Layered gunshot: noise burst + low thump + click
    const ctx = this.state.ctx;
    const now = ctx.currentTime;

    // Noise burst
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.3 * pitch, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2000 * pitch;
    filter.Q.value = 2;
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.state.sfxGain!);
    noise.start(now);
    noise.stop(now + 0.08);

    // Low thump
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.4, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(thumpGain);
    thumpGain.connect(this.state.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.12);

    // High click
    this.playSfx(0.03, 3000 * pitch, 'square', 0.15);
  }

  hit(perfect: boolean = false): void {
    if (perfect) {
      this.playSfx(0.15, [523, 659, 784], 'sine', 0.25);
      this.playSfx(0.1, 1200, 'triangle', 0.15);
    } else {
      this.playSfx(0.1, [440, 660], 'sine', 0.2);
      this.playSfx(0.05, 800, 'triangle', 0.1);
    }
  }

  miss(): void {
    this.playSfx(0.08, [200, 150], 'sawtooth', 0.08);
  }

  reload(): void {
    if (!this.state.ctx) return;
    const ctx = this.state.ctx;
    const now = ctx.currentTime;

    // Slide sound
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(400, now + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g);
    g.connect(this.state.sfxGain!);
    osc.start(now);
    osc.stop(now + 0.2);

    // Click
    setTimeout(() => this.playSfx(0.03, 2000, 'square', 0.15), 400);
    // Chamber
    setTimeout(() => this.playSfx(0.05, [600, 900], 'sine', 0.12), 800);
  }

  emptyClick(): void {
    this.playSfx(0.04, [1000, 800], 'square', 0.1);
  }

  comboMilestone(count: number): void {
    const base = 400 + count * 20;
    this.playSfx(0.2, [base, base * 1.25, base * 1.5], 'sine', 0.2);
  }

  rareHit(): void {
    this.playSfx(0.3, [523, 659, 784, 1047], 'sine', 0.25);
    this.playSfx(0.2, 1500, 'triangle', 0.15);
  }

  decoyHit(): void {
    this.playSfx(0.3, [300, 250, 200, 150], 'sawtooth', 0.15);
    this.playSfx(0.2, 100, 'square', 0.1);
  }

  bossAppear(): void {
    if (!this.state.ctx) return;
    const ctx = this.state.ctx;
    const now = ctx.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100 + i * 50, now + i * 0.15);
      osc.frequency.linearRampToValueAtTime(200 + i * 80, now + i * 0.15 + 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.2, now + i * 0.15 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.15 + 0.3);
      osc.connect(g);
      g.connect(this.state.sfxGain!);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.3);
    }
  }

  bossHit(): void {
    this.playSfx(0.15, [200, 300], 'sawtooth', 0.2);
    this.playSfx(0.1, 100, 'square', 0.1);
  }

  bossDefeated(): void {
    this.playSfx(0.5, [523, 659, 784, 1047, 1319], 'sine', 0.3);
    this.playSfx(0.3, [200, 300, 400], 'triangle', 0.2);
  }

  environmentHit(): void {
    this.playSfx(0.08, [300, 500], 'triangle', 0.15);
  }

  chainReaction(): void {
    this.playSfx(0.12, [400, 600, 800], 'sine', 0.15);
  }

  menuClick(): void {
    this.playSfx(0.05, 1200, 'sine', 0.1);
  }

  menuHover(): void {
    this.playSfx(0.03, 800, 'sine', 0.05);
  }

  eventStart(): void {
    this.playSfx(0.3, [330, 440, 550], 'sine', 0.2);
  }

  featherStorm(): void {
    if (!this.state.ctx) return;
    const ctx = this.state.ctx;
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.5;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3)) * 0.3;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3000;
    filter.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    noise.connect(filter);
    filter.connect(g);
    g.connect(this.state.sfxGain!);
    noise.start(now);
    noise.stop(now + 0.5);
  }

  // ---- Ambient ----

  private ambientOsc: OscillatorNode | null = null;
  private ambientLFO: OscillatorNode | null = null;

  startAmbient(type: string): void {
    this.stopAmbient();
    if (!this.state.ctx || !this.state.ambientGain) return;
    const ctx = this.state.ctx;

    if (type === 'moor') {
      // Windy moor ambience
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.2;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 200;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);
      const g = ctx.createGain();
      g.gain.value = 0.08;
      noise.connect(filter);
      filter.connect(g);
      g.connect(this.state.ambientGain);
      noise.start();
      lfo.start();
      this.ambientOsc = lfo;
      this.ambientLFO = lfo;
      (noise as unknown as { _cleanup?: () => void })._cleanup = () => {
        try { noise.stop(); } catch {}
      };
    } else if (type === 'coast') {
      // Ocean waves
      const bufferSize = ctx.sampleRate * 3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const t = i / ctx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * (0.5 + 0.5 * Math.sin(t * 0.3));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 600;
      const g = ctx.createGain();
      g.gain.value = 0.06;
      noise.connect(filter);
      filter.connect(g);
      g.connect(this.state.ambientGain);
      noise.start();
      (noise as unknown as { _cleanup?: () => void })._cleanup = () => {
        try { noise.stop(); } catch {}
      };
    } else if (type === 'night') {
      // Crickets / fireflies
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 4000;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 8;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.05;
      lfo.connect(lfoGain);
      const gainNode = ctx.createGain();
      const gainNodeGain = gainNode.gain;
      lfoGain.connect(gainNodeGain);
      gainNodeGain.value = 0.02;
      osc.connect(gainNode);
      gainNode.connect(this.state.ambientGain);
      osc.start();
      lfo.start();
      this.ambientOsc = osc;
      this.ambientLFO = lfo;
    }
  }

  stopAmbient(): void {
    if (this.ambientOsc) {
      try { this.ambientOsc.stop(); } catch {}
      this.ambientOsc = null;
    }
    if (this.ambientLFO) {
      try { this.ambientLFO.stop(); } catch {}
      this.ambientLFO = null;
    }
  }

  // ---- Music (simple procedural melody) ----

  private musicInterval: ReturnType<typeof setInterval> | null = null;

  startMusic(intensity: number = 0.5): void {
    this.stopMusic();
    if (!this.state.ctx || !this.state.musicGain) return;

    const notes = [262, 294, 330, 349, 392, 440, 494, 523];
    const tempo = Math.max(200, 600 - intensity * 400);
    let idx = 0;

    this.musicInterval = setInterval(() => {
      if (!this.state.ctx || this.channels.music.muted) return;
      const note = notes[idx % notes.length];
      this.playSfx(0.3, note, 'sine', 0.03 * intensity, this.state.musicGain!);
      idx++;
    }, tempo);
  }

  stopMusic(): void {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  // ---- Cleanup ----

  destroy(): void {
    this.stopMusic();
    this.stopAmbient();
    if (this.state.ctx) {
      this.state.ctx.close();
      this.state.ctx = null;
    }
  }
}

// Singleton
let audioManager: AudioManager | null = null;

export function getAudioManager(): AudioManager {
  if (!audioManager) {
    audioManager = new AudioManager();
  }
  return audioManager;
}
