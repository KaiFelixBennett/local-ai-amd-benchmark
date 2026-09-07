/**
 * Audio-Engine auf Web Audio API.
 * - Alle Soundeffekte werden prozedural generiert (keine Audio-Dateien).
 * - Adapter Musik: Schichten (Pad, Bass, Melodie, Percussion),
 *   Intensität reagiert auf Rundenphase, Combo und Events.
 * - Ambient: Wind, Wasser, Frösche, Regen — je nach Karte/Event.
 * - Initialisiert erst nach der ersten Nutzerinteraktion (Autoplay-Regeln).
 * - Begrenzte Anzahl gleichzeitig aktiver Quellen.
 */

export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
}

export type AmbienceId = 'moor' | 'coast' | 'night' | 'rain' | 'storm' | 'frogs';

const MAX_SIMULTANEOUS_SFX = 14;

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private activeSfx = 0;
  private ambienceNodes: AudioNode[] = [];
  private currentAmbience: AmbienceId | null = null;
  private musicTimer: number | null = null;
  private musicIntensity = 0.3;
  private musicStep = 0;
  private musicNextTime = 0;
  private zen = false;
  private volumes: AudioVolumes = { master: 0.8, music: 0.6, sfx: 0.8, ambient: 0.6 };
  private destroyed = false;

  /** Init nach erster Interaktion. */
  ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return true;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.ambientBus = this.ctx.createGain();
      this.ambientBus.connect(this.master);
      this.applyVolumes();
      this.noiseBuffer = this.makeNoiseBuffer(2);
      return true;
    } catch {
      return false;
    }
  }

  setVolumes(v: AudioVolumes): void {
    this.volumes = v;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus || !this.ambientBus) return;
    this.master.gain.value = this.volumes.master;
    this.musicBus.gain.value = this.volumes.music;
    this.sfxBus.gain.value = this.volumes.sfx;
    this.ambientBus.gain.value = this.volumes.ambient;
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoiseBuffer(seconds: number): AudioBuffer {
    const len = Math.floor(this.ctx!.sampleRate * seconds);
    const buf = this.ctx!.createBuffer(1, len, this.ctx!.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private noiseSource(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    return src;
  }

  private tone(opts: {
    freq: number;
    dur: number;
    type?: OscillatorType;
    gain?: number;
    attack?: number;
    decay?: number;
    slideTo?: number;
    bus?: GainNode | null;
    when?: number;
  }): void {
    if (!this.ctx) return;
    const t0 = opts.when ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + opts.dur);
    }
    const gain = opts.gain ?? 0.2;
    const atk = opts.attack ?? 0.005;
    const dec = opts.decay ?? opts.dur * 0.8;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec);
    osc.connect(g);
    g.connect(opts.bus ?? this.sfxBus!);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.05);
  }

  private noiseBurst(opts: {
    dur: number;
    gain?: number;
    filterFreq?: number;
    filterQ?: number;
    filterType?: BiquadFilterType;
    attack?: number;
    when?: number;
    bus?: GainNode | null;
  }): void {
    if (!this.ctx) return;
    const t0 = opts.when ?? this.ctx.currentTime;
    const src = this.noiseSource();
    const filt = this.ctx.createBiquadFilter();
    filt.type = opts.filterType ?? 'lowpass';
    filt.frequency.value = opts.filterFreq ?? 1200;
    filt.Q.value = opts.filterQ ?? 0.8;
    const g = this.ctx.createGain();
    const gain = opts.gain ?? 0.25;
    const atk = opts.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(opts.bus ?? this.sfxBus!);
    src.start(t0);
    src.stop(t0 + opts.dur + 0.05);
  }

  private guardSfx(): boolean {
    if (!this.ctx || this.destroyed) return false;
    if (this.activeSfx >= MAX_SIMULTANEOUS_SFX) return false;
    this.activeSfx += 1;
    return true;
  }

  private sfxDone(): void {
    this.activeSfx = Math.max(0, this.activeSfx - 1);
  }

  // ── Soundeffekte ────────────────────────────────────────────────

  private lastShot = 0;

  shot(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const now = performance.now();
    // gegen Stakkato-Spam
    if (now - this.lastShot < 45) {
      this.sfxDone();
      return;
    }
    this.lastShot = now;
    const t = this.ctx.currentTime;
    // Knall
    this.noiseBurst({ dur: 0.14, gain: 0.5, filterFreq: 2400, filterType: 'lowpass', attack: 0.002 });
    // Knall-Kern
    this.tone({ freq: 160, dur: 0.09, type: 'square', gain: 0.18, decay: 0.08, when: t });
    // Hall
    this.noiseBurst({ dur: 0.5, gain: 0.12, filterFreq: 700, attack: 0.02, when: t + 0.01 });
    // Pitch-Variation
    this.tone({
      freq: 90 + Math.random() * 30,
      dur: 0.16,
      type: 'sawtooth',
      gain: 0.08,
      decay: 0.14,
      slideTo: 45,
      when: t,
    });
    window.setTimeout(() => this.sfxDone(), 400);
  }

  emptyClick(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 1800, dur: 0.05, type: 'square', gain: 0.12, when: t });
    this.tone({ freq: 900, dur: 0.05, type: 'square', gain: 0.1, when: t + 0.06 });
    window.setTimeout(() => this.sfxDone(), 150);
  }

  reload(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    // Magazin raus
    this.noiseBurst({ dur: 0.08, gain: 0.2, filterFreq: 2800, filterType: 'highpass', when: t });
    this.tone({ freq: 500, dur: 0.05, type: 'square', gain: 0.1, when: t });
    // Magazin rein
    window.setTimeout(() => {
      if (!this.ctx) return;
      const t2 = this.ctx.currentTime;
      this.noiseBurst({ dur: 0.08, gain: 0.25, filterFreq: 2800, filterType: 'highpass', when: t2 });
      this.tone({ freq: 700, dur: 0.05, type: 'square', gain: 0.12, when: t2 });
      this.tone({ freq: 1000, dur: 0.06, type: 'triangle', gain: 0.08, when: t2 + 0.04 });
      window.setTimeout(() => this.sfxDone(), 200);
    }, 650);
    window.setTimeout(() => this.sfxDone(), 900);
  }

  hit(perfect: boolean, combo: number): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    const base = perfect ? 880 : 660;
    const boost = Math.min(6, combo * 0.5);
    this.tone({ freq: base + boost * 20, dur: 0.09, type: 'triangle', gain: perfect ? 0.3 : 0.22, when: t });
    this.tone({ freq: (base + boost * 20) * 1.5, dur: 0.12, type: 'sine', gain: 0.14, when: t + 0.02 });
    this.noiseBurst({ dur: 0.08, gain: 0.12, filterFreq: 3000, filterType: 'highpass', when: t });
    if (perfect) {
      this.tone({ freq: base * 2, dur: 0.14, type: 'sine', gain: 0.16, when: t + 0.05 });
    }
    window.setTimeout(() => this.sfxDone(), 250);
  }

  miss(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 320, dur: 0.12, type: 'sine', gain: 0.06, slideTo: 180, when: t });
    window.setTimeout(() => this.sfxDone(), 200);
  }

  hitmarker(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 2400, dur: 0.03, type: 'square', gain: 0.05, when: t });
    window.setTimeout(() => this.sfxDone(), 80);
  }

  comboMilestone(combo: number): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    const steps = Math.min(6, combo / 5);
    for (let i = 0; i < 3; i++) {
      this.tone({
        freq: 523 * Math.pow(1.26, i + steps * 0.4),
        dur: 0.12,
        type: 'triangle',
        gain: 0.16,
        when: t + i * 0.06,
      });
    }
    window.setTimeout(() => this.sfxDone(), 400);
  }

  rareHit(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    const notes = [784, 988, 1175, 1568];
    notes.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.2, type: 'sine', gain: 0.14, when: t + i * 0.07 });
      this.tone({ freq: f / 2, dur: 0.25, type: 'triangle', gain: 0.08, when: t + i * 0.07 });
    });
    window.setTimeout(() => this.sfxDone(), 600);
  }

  trickShot(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 440, dur: 0.4, type: 'sawtooth', gain: 0.1, slideTo: 880, when: t });
    this.tone({ freq: 660, dur: 0.3, type: 'sine', gain: 0.12, slideTo: 1320, when: t + 0.1 });
    window.setTimeout(() => this.sfxDone(), 500);
  }

  multikill(n: number): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < Math.min(6, n); i++) {
      this.tone({ freq: 700 + i * 120, dur: 0.08, type: 'square', gain: 0.1, when: t + i * 0.04 });
    }
    window.setTimeout(() => this.sfxDone(), 350);
  }

  deceiverBoom(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 200, dur: 0.5, type: 'sawtooth', gain: 0.2, slideTo: 60, when: t });
    this.noiseBurst({ dur: 0.4, gain: 0.3, filterFreq: 500, when: t });
    // humorvolle Quietsche
    this.tone({ freq: 900, dur: 0.3, type: 'sine', gain: 0.15, slideTo: 300, when: t + 0.2 });
    window.setTimeout(() => this.sfxDone(), 700);
  }

  bell(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 880, dur: 0.6, type: 'sine', gain: 0.25, decay: 0.5, when: t });
    this.tone({ freq: 1320, dur: 0.4, type: 'sine', gain: 0.1, decay: 0.35, when: t });
    window.setTimeout(() => this.sfxDone(), 700);
  }

  chainClank(stage: number): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 300 + stage * 80, dur: 0.15, type: 'square', gain: 0.15, when: t });
    this.noiseBurst({ dur: 0.12, gain: 0.2, filterFreq: 2000 + stage * 500, filterType: 'bandpass', when: t });
    window.setTimeout(() => this.sfxDone(), 300);
  }

  splash(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.noiseBurst({ dur: 0.35, gain: 0.25, filterFreq: 1500, when: t });
    this.tone({ freq: 250, dur: 0.2, type: 'sine', gain: 0.08, slideTo: 120, when: t });
    window.setTimeout(() => this.sfxDone(), 450);
  }

  spore(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 8; i++) {
      this.tone({ freq: 1200 + Math.random() * 800, dur: 0.06, type: 'sine', gain: 0.04, when: t + i * 0.03 });
    }
    window.setTimeout(() => this.sfxDone(), 400);
  }

  frog(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    const f = 300 + Math.random() * 120;
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: f, dur: 0.12, type: 'square', gain: 0.05, when: t + i * 0.16 });
    }
    window.setTimeout(() => this.sfxDone(), 600);
  }

  thunder(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.noiseBurst({ dur: 1.6, gain: 0.5, filterFreq: 300, attack: 0.05, when: t });
    this.tone({ freq: 50, dur: 1.2, type: 'sine', gain: 0.25, slideTo: 30, when: t + 0.1 });
    window.setTimeout(() => this.sfxDone(), 1700);
  }

  whoosh(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.noiseBurst({ dur: 0.5, gain: 0.2, filterFreq: 900, filterType: 'bandpass', filterQ: 2, when: t });
    window.setTimeout(() => this.sfxDone(), 600);
  }

  bossRoar(intense = false): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 90, dur: 1.0, type: 'sawtooth', gain: intense ? 0.3 : 0.2, slideTo: 45, when: t });
    this.noiseBurst({ dur: 0.9, gain: 0.3, filterFreq: 400, attack: 0.05, when: t });
    this.tone({ freq: 140, dur: 0.8, type: 'square', gain: 0.12, slideTo: 70, when: t + 0.1 });
    window.setTimeout(() => this.sfxDone(), 1100);
  }

  bossDefeated(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((f, i) => {
      this.tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.18, when: t + i * 0.09 });
    });
    this.noiseBurst({ dur: 1.2, gain: 0.15, filterFreq: 3000, filterType: 'highpass', when: t + 0.2 });
    window.setTimeout(() => this.sfxDone(), 1400);
  }

  bonus(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 660, dur: 0.1, type: 'triangle', gain: 0.15, when: t });
    this.tone({ freq: 880, dur: 0.12, type: 'triangle', gain: 0.15, when: t + 0.08 });
    this.tone({ freq: 1100, dur: 0.16, type: 'triangle', gain: 0.15, when: t + 0.16 });
    window.setTimeout(() => this.sfxDone(), 400);
  }

  uiClick(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 1200, dur: 0.04, type: 'triangle', gain: 0.1, when: t });
    window.setTimeout(() => this.sfxDone(), 80);
  }

  uiHover(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    this.tone({ freq: 900, dur: 0.03, type: 'sine', gain: 0.05, when: t });
    window.setTimeout(() => this.sfxDone(), 60);
  }

  levelUp(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.16, when: t + i * 0.08 });
    });
    window.setTimeout(() => this.sfxDone(), 500);
  }

  achievement(): void {
    this.levelUp();
  }

  roundEnd(): void {
    if (!this.ctx || !this.guardSfx()) return;
    const t = this.ctx.currentTime;
    [392, 494, 587, 784].forEach((f, i) => {
      this.tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.16, when: t + i * 0.12 });
    });
    window.setTimeout(() => this.sfxDone(), 700);
  }

  // ── Ambience ────────────────────────────────────────────────────

  setAmbience(id: AmbienceId | null): void {
    if (!this.ctx || !this.ambientBus) {
      this.currentAmbience = id;
      return;
    }
    if (this.currentAmbience === id) return;
    this.stopAmbience();
    this.currentAmbience = id;
    if (!id) return;

    const bus = this.ambientBus;
    const t = this.ctx.currentTime;

    if (id === 'moor' || id === 'night' || id === 'frogs' || id === 'coast' || id === 'rain' || id === 'storm') {
      // Basis-Wind
      const wind = this.noiseSource();
      const wf = this.ctx.createBiquadFilter();
      wf.type = 'lowpass';
      wf.frequency.value = id === 'coast' || id === 'storm' ? 500 : 300;
      wf.Q.value = 0.6;
      const wg = this.ctx.createGain();
      const windLevel = id === 'coast' || id === 'storm' ? 0.16 : id === 'rain' ? 0.08 : 0.05;
      wg.gain.setValueAtTime(0.0001, t);
      wg.gain.linearRampToValueAtTime(windLevel, t + 2);
      // Wind-Flattern
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.15;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = windLevel * 0.6;
      lfo.connect(lfoGain);
      lfoGain.connect(wg.gain);
      wind.connect(wf);
      wf.connect(wg);
      wg.connect(bus);
      wind.start();
      lfo.start();
      this.ambienceNodes.push(wind, wf, wg, lfo, lfoGain);

      if (id === 'coast' || id === 'storm') {
        // Wellen: tiefes Rauschen mit Lang-LFO
        const wave = this.noiseSource();
        const wvf = this.ctx.createBiquadFilter();
        wvf.type = 'lowpass';
        wvf.frequency.value = 220;
        const wvg = this.ctx.createGain();
        const wLfo = this.ctx.createOscillator();
        wLfo.frequency.value = 0.08;
        const wLfoG = this.ctx.createGain();
        wLfoG.gain.value = 0.06;
        wLfo.connect(wLfoG);
        wLfoG.connect(wvg.gain);
        wvg.gain.value = 0.08;
        wave.connect(wvf);
        wvf.connect(wvg);
        wvg.connect(bus);
        wave.start();
        wLfo.start();
        this.ambienceNodes.push(wave, wvf, wvg, wLfo, wLfoG);
      }

      if (id === 'rain' || id === 'storm') {
        const rain = this.noiseSource();
        const rf = this.ctx.createBiquadFilter();
        rf.type = 'bandpass';
        rf.frequency.value = 4000;
        rf.Q.value = 0.4;
        const rg = this.ctx.createGain();
        rg.gain.value = id === 'storm' ? 0.12 : 0.07;
        rain.connect(rf);
        rf.connect(rg);
        rg.connect(bus);
        rain.start();
        this.ambienceNodes.push(rain, rf, rg);
      }
    }
  }

  stopAmbience(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const n of this.ambienceNodes) {
      try {
        if ('stop' in n && typeof (n as AudioBufferSourceNode).stop === 'function') {
          (n as AudioBufferSourceNode).stop(t + 1);
        }
        const gain = (n as GainNode).gain;
        if (gain) {
          gain.setValueAtTime(gain.value, t);
          gain.linearRampToValueAtTime(0.0001, t + 0.8);
        }
      } catch {
        /* ignore */
      }
    }
    window.setTimeout(() => {
      for (const n of this.ambienceNodes) {
        try {
          n.disconnect();
        } catch {
          /* ignore */
        }
      }
    }, 900);
    this.ambienceNodes = [];
    this.currentAmbience = null;
  }

  // ── Musik ───────────────────────────────────────────────────────

  /** Setzt die Musik-Intensität (0..1) und Start/Stop. */
  startMusic(zen: boolean): void {
    if (!this.ctx || this.musicTimer !== null) {
      this.musicIntensity = zen ? 0.15 : 0.3;
      this.zen = zen;
      return;
    }
    this.zen = zen;
    this.musicIntensity = zen ? 0.15 : 0.3;
    this.musicStep = 0;
    this.musicNextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 120);
  }

  stopMusic(): void {
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMusicIntensity(v: number): void {
    this.musicIntensity = Math.max(0.05, Math.min(1, v));
  }

  private scheduleMusic(): void {
    if (!this.ctx || !this.musicBus) return;
    const spb = this.zen ? 0.5 : 0.32; // Sekunden pro Achtel
    while (this.musicNextTime < this.ctx.currentTime + 0.35) {
      const t = this.musicNextTime;
      const step = this.musicStep;
      const beat = step % 8;
      const bar = Math.floor(step / 8) % 4;

      // Bass (jede 2. Achtel)
      if (beat % 2 === 0) {
        const bassNotes = this.zen ? [110, 110, 131, 147] : [98, 98, 131, 110];
        const f = bassNotes[bar];
        this.tone({ freq: f, dur: spb * 1.8, type: 'triangle', gain: 0.12 + this.musicIntensity * 0.1, decay: spb * 1.5, when: t, bus: this.musicBus });
      }

      // Pad (jeden Takt)
      if (beat === 0) {
        const chordRoots = this.zen ? [220, 262, 247, 196] : [220, 175, 208, 247];
        const root = chordRoots[bar];
        const padGain = 0.03 + this.musicIntensity * 0.035;
        [1, 1.26, 1.5].forEach((ratio, i) => {
          this.tone({
            freq: root * ratio,
            dur: spb * 8,
            type: 'sine',
            gain: padGain,
            attack: 0.4,
            decay: spb * 7,
            when: t,
            bus: this.musicBus,
          });
          void i;
        });
      }

      // Melodie (nur bei höherer Intensität, pseudo-deterministisch per Step)
      if (this.musicIntensity > 0.35 && (beat === 1 || beat === 3 || beat === 5 || beat === 6)) {
        const scale = this.zen ? [440, 494, 523, 587, 659] : [440, 523, 587, 659, 784, 880];
        // einfache deterministische Melodie: von Step abgeleitet
        const idx = (step * 7 + bar * 3) % scale.length;
        this.tone({
          freq: scale[idx],
          dur: spb * 0.9,
          type: 'triangle',
          gain: 0.06 + this.musicIntensity * 0.06,
          decay: spb * 0.8,
          when: t,
          bus: this.musicBus,
        });
      }

      // Percussion (nur bei hoher Intensität)
      if (this.musicIntensity > 0.6 && beat === 0) {
        this.noiseBurst({ dur: 0.12, gain: 0.08, filterFreq: 800, when: t, bus: this.musicBus });
      }
      if (this.musicIntensity > 0.8 && beat === 4) {
        this.noiseBurst({ dur: 0.08, gain: 0.06, filterFreq: 5000, filterType: 'highpass', when: t, bus: this.musicBus });
      }

      this.musicNextTime += spb;
      this.musicStep = (this.musicStep + 1) % 64;
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────

  destroy(): void {
    this.destroyed = true;
    this.stopMusic();
    this.stopAmbience();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }

  get isReady(): boolean {
    return this.ctx !== null;
  }
}
