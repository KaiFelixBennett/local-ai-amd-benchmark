/**
 * Moorland Mayhem - Featherstorm :: procedural audio engine.
 *
 * Fully standalone: no imports, no audio files. Every sound is synthesized on the
 * fly with the Web Audio API. The engine is designed to be hostile-environment
 * safe: if the browser refuses to create an AudioContext, or blocks it behind a
 * missing user gesture, every public method degrades into a silent no-op instead
 * of throwing.
 *
 * Signal graph:
 *
 *   sfx sources -------> sfxUserGain -----------------\
 *   ambient sources ---> ambientUserGain --------------)--> master -> compressor -> destination
 *   music layers ------> musicUserGain -> duck -> filter ->/
 *
 * (music has an extra theme gain so stopMusic() can fade without clobbering the
 * user's volume slider; see `MusicState`.)
 */

export type SfxName =
  | 'shot'
  | 'dry_fire'
  | 'reload_start'
  | 'reload_end'
  | 'empty_mag'
  | 'hit'
  | 'hit_armor'
  | 'perfect'
  | 'combo_milestone'
  | 'combo_broken'
  | 'rare'
  | 'gold'
  | 'swarm_bonus'
  | 'chain_step'
  | 'chain_complete'
  | 'boss_roar'
  | 'boss_hit'
  | 'boss_defeat'
  | 'explosion'
  | 'splash'
  | 'thunder'
  | 'quack'
  | 'caw'
  | 'ui_click'
  | 'ui_hover'
  | 'ui_back'
  | 'level_up'
  | 'achievement';

export interface SfxOpts {
  pitch?: number;
  vol?: number;
}

type AmbientKind = 'marsh' | 'coast' | 'night';
type ThemeName = 'menu' | 'hunt' | 'zen' | 'boss';
type LayerName = 'pad' | 'bass' | 'perc' | 'lead' | 'fx';

/* ------------------------------------------------------------------ *
 * Environment shims (typed, no `any`)
 * ------------------------------------------------------------------ */

/** Minimal timer surface: works for DOM lib, jsdom and plain Node alike. */
interface TimerScope {
  setInterval(handler: () => void, ms: number): number;
  clearInterval(id: number): void;
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

/** Legacy webkit-prefixed AudioContext constructor. */
interface AudioGlobalScope {
  AudioContext?: new () => AudioContext;
  webkitAudioContext?: new () => AudioContext;
}

const timers: TimerScope = globalThis as unknown as TimerScope;
const audioScope: AudioGlobalScope = globalThis as unknown as AudioGlobalScope;

/* ------------------------------------------------------------------ *
 * Tunables
 * ------------------------------------------------------------------ */

const MAX_SFX_VOICES = 16;
const AMBIENT_TICK_MS = 200;
const AMBIENT_AHEAD_S = 0.5;
const MUSIC_TICK_MS = 16;
const MUSIC_LOOKAHEAD_S = 0.12;
const STEPS_PER_BAR = 16;
const LOOP_STEPS = 64;

const DEFAULT_VOLUMES = { master: 0.85, music: 0.32, sfx: 0.8, ambient: 0.35 };
const DUCK_LEVEL = 0.22;
const MIN_G = 0.0001;

/** Sounds that should stay centered rather than getting a random stereo offset. */
const CENTERED_SFX: ReadonlySet<SfxName> = new Set<SfxName>([
  'ui_click',
  'ui_hover',
  'ui_back',
  'level_up',
  'achievement',
  'boss_roar',
  'boss_defeat',
  'thunder',
  'perfect',
  'chain_complete',
]);

/* ------------------------------------------------------------------ *
 * Local RNG (mulberry32) - seeded so ambient/music events are reproducible
 * ------------------------------------------------------------------ */

interface Rng {
  next(): number;
  range(min: number, max: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
}

function makeRng(seed: number): Rng {
  let s = seed >>> 0 || 0x9e3779b9;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min: number, max: number): number => min + (max - min) * next(),
    chance: (p: number): boolean => next() < p,
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(next() * arr.length)] as T;
    },
  };
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

/** Normalized 0..1 ramp between two thresholds. */
function ramp01(v: number, from: number, to: number): number {
  if (to <= from) return v >= to ? 1 : 0;
  return clamp((v - from) / (to - from), 0, 1);
}

/* ------------------------------------------------------------------ *
 * Voice bookkeeping
 * ------------------------------------------------------------------ */

function isSourceNode(node: AudioNode): node is AudioScheduledSourceNode {
  return typeof (node as AudioScheduledSourceNode).start === 'function';
}

/** Run `fn` at most once, no matter how many times the result is invoked. */
function once(fn: () => void): () => void {
  let done = false;
  return (): void => {
    if (done) return;
    done = true;
    fn();
  };
}

/**
 * Accumulates the nodes that make up a single logical voice so that, when the
 * last source node finishes, every node in the chain can be disconnected and the
 * SFX voice slot can be handed back.
 */
class VoiceTrace {
  /** Every node created for this voice (sources + filters + gains). */
  readonly nodes: AudioNode[] = [];
  /** The subset of `nodes` that can be started/stopped. */
  readonly sources: AudioScheduledSourceNode[] = [];
  lastEnd = 0;

  track(node: AudioNode, end: number): void {
    this.nodes.push(node);
    if (isSourceNode(node)) this.sources.push(node);
    if (end >= this.lastEnd) this.lastEnd = end;
  }

  /** Disconnect everything this voice created. Idempotent-ish and never throws. */
  dispose(): void {
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* already detached */
      }
    }
    this.nodes.length = 0;
    this.sources.length = 0;
  }
}

/** Attach an `onended` callback without clobbering an existing one. */
function onEnded(node: AudioScheduledSourceNode, fn: () => void): void {
  const prev = node.onended;
  node.onended = (ev: Event): void => {
    if (prev) prev.call(node, ev);
    fn();
  };
}

/* ------------------------------------------------------------------ *
 * Noise buffers (cached per AudioContext, garbage-collected with it)
 * ------------------------------------------------------------------ */

const NOISE_CACHE = new WeakMap<AudioContext, Map<string, AudioBuffer>>();
const NOISE_SECONDS = 2;

function noiseBuffer(ctx: AudioContext, color: 'white' | 'pink' | 'brown'): AudioBuffer {
  let byColor = NOISE_CACHE.get(ctx);
  if (!byColor) {
    byColor = new Map<string, AudioBuffer>();
    NOISE_CACHE.set(ctx, byColor);
  }
  const cached = byColor.get(color);
  if (cached) return cached;

  const len = Math.max(4096, Math.floor(ctx.sampleRate * NOISE_SECONDS));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  const rnd = makeRng(0xc0ffee ^ color.length);

  if (color === 'white') {
    for (let i = 0; i < len; i += 1) data[i] = rnd.range(-1, 1);
  } else if (color === 'pink') {
    // Paul Kellet's refined pink noise filter.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i += 1) {
      const w = rnd.range(-1, 1);
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const w = rnd.range(-1, 1);
      last = (last + 0.02 * w) / 1.02;
      data[i] = last * 3.5;
    }
  }

  byColor.set(color, buf);
  return buf;
}

/* ------------------------------------------------------------------ *
 * Low-level synth helpers
 * ------------------------------------------------------------------ */

interface ToneOpts {
  start: number;
  dur: number;
  peak: number;
  f0: number;
  /** Target frequency for the sweep; defaults to f0 (no sweep). */
  f1?: number;
  /** Sweep duration; defaults to `dur`. */
  sweep?: number;
  type?: OscillatorType;
  attack?: number;
  detune?: number;
  release?: number;
}

/** percussive/exponential envelope shaped oscillator */
function tone(ctx: AudioContext, dest: AudioNode, v: VoiceTrace, o: ToneOpts): OscillatorNode {
  const dur = Math.max(0.01, o.dur);
  const attack = Math.min(Math.max(0.0008, o.attack ?? 0.004), dur * 0.6);
  const peak = Math.max(MIN_G * 2, o.peak);
  const f0 = Math.max(1, o.f0);
  const f1 = Math.max(1, o.f1 ?? o.f0);
  const sweep = Math.max(0.005, o.sweep ?? dur);
  const release = o.release ?? Math.min(0.05, dur * 0.4);

  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(f0, o.start);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, o.start + sweep);
  if (o.detune) osc.detune.setValueAtTime(o.detune, o.start);

  const g = ctx.createGain();
  const holdEnd = Math.max(o.start + attack + 0.001, o.start + dur - release);
  g.gain.setValueAtTime(MIN_G, o.start);
  g.gain.linearRampToValueAtTime(peak, o.start + attack);
  g.gain.setValueAtTime(peak, holdEnd);
  g.gain.exponentialRampToValueAtTime(MIN_G, o.start + dur);

  osc.connect(g);
  g.connect(dest);
  osc.start(o.start);
  osc.stop(o.start + dur + 0.02);
  v.track(osc, o.start + dur + 0.02);
  v.track(g, o.start + dur + 0.02);
  return osc;
}

interface NoiseOpts {
  start: number;
  dur: number;
  peak: number;
  color?: 'white' | 'pink' | 'brown';
  filter?: BiquadFilterType;
  f0?: number;
  f1?: number;
  q?: number;
  attack?: number;
  release?: number;
  rate?: number;
  offset?: number;
}

/** Envelope-shaped noise burst, optionally swept through a biquad. */
function noise(ctx: AudioContext, dest: AudioNode, v: VoiceTrace, o: NoiseOpts): AudioBufferSourceNode {
  const dur = Math.max(0.002, o.dur);
  const attack = Math.min(Math.max(0.0008, o.attack ?? 0.002), dur * 0.6);
  const peak = Math.max(MIN_G * 2, o.peak);
  const release = o.release ?? Math.min(0.05, dur * 0.5);

  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, o.color ?? 'white');
  src.loop = true;
  if (o.rate) src.playbackRate.setValueAtTime(o.rate, o.start);

  let node: AudioNode = src;
  if (o.filter) {
    const bq = ctx.createBiquadFilter();
    bq.type = o.filter;
    bq.frequency.setValueAtTime(Math.max(20, o.f0 ?? 1000), o.start);
    if (o.f1 !== undefined && o.f1 !== o.f0) {
      bq.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), o.start + dur);
    }
    bq.Q.value = o.q ?? 1;
    src.connect(bq);
    node = bq;
  }

  const g = ctx.createGain();
  const holdEnd = Math.max(o.start + attack + 0.001, o.start + dur - release);
  g.gain.setValueAtTime(MIN_G, o.start);
  g.gain.linearRampToValueAtTime(peak, o.start + attack);
  g.gain.setValueAtTime(peak, holdEnd);
  g.gain.exponentialRampToValueAtTime(MIN_G, o.start + dur);

  node.connect(g);
  g.connect(dest);
  src.start(o.start, o.offset ?? Math.random() * NOISE_SECONDS * 0.5);
  src.stop(o.start + dur + 0.02);
  v.track(src, o.start + dur + 0.02);
  v.track(g, o.start + dur + 0.02);
  return src;
}

/** LFO wobble wired into an AudioParam (cents for detune, Hz for frequency). */
function vibrato(
  ctx: AudioContext,
  v: VoiceTrace,
  target: AudioParam,
  rate: number,
  depth: number,
  start: number,
  dur: number,
): void {
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(rate, start);
  const amt = ctx.createGain();
  amt.gain.setValueAtTime(depth, start);
  lfo.connect(amt);
  amt.connect(target);
  lfo.start(start);
  lfo.stop(start + dur + 0.02);
  v.track(lfo, start + dur + 0.02);
  v.track(amt, start + dur + 0.02);
}

interface BellOpts {
  start: number;
  base: number;
  dur: number;
  peak: number;
  ratios?: readonly number[];
  spread?: number;
  vibRate?: number;
  vibDepth?: number;
}

/** Shimmering inharmonic-ish bell cluster: detuned sines + vibrato + long tail. */
function bell(ctx: AudioContext, dest: AudioNode, v: VoiceTrace, o: BellOpts): number {
  const ratios = o.ratios ?? [1, 2.0, 3.01];
  const spread = o.spread ?? 9;
  ratios.forEach((ratio, i) => {
    const f = o.base * ratio;
    const start = o.start + i * 0.012;
    const dur = o.dur * (1 - i * 0.12);
    const osc = tone(ctx, dest, v, {
      type: 'sine',
      f0: f,
      start,
      dur,
      peak: o.peak * (1 - i * 0.22),
      attack: 0.006,
      release: dur * 0.9,
    });
    vibrato(ctx, v, osc.detune, o.vibRate ?? 5.5, spread * (1 + i * 0.4), start, dur);
  });
  // airy shimmer on top
  noise(ctx, dest, v, {
    start: o.start,
    dur: o.dur * 0.45,
    peak: o.peak * 0.12,
    color: 'white',
    filter: 'bandpass',
    f0: o.base * 4,
    f1: o.base * 6,
    q: 2.5,
    attack: 0.01,
  });
  return o.start + o.dur + 0.05;
}

interface ArpOpts {
  start: number;
  freqs: readonly number[];
  step: number;
  noteDur: number;
  type?: OscillatorType;
  peak: number;
  dest: AudioNode;
  glide?: boolean;
}

function arp(ctx: AudioContext, v: VoiceTrace, o: ArpOpts): number {
  let end = o.start;
  o.freqs.forEach((f, i) => {
    const start = o.start + i * o.step;
    tone(ctx, o.dest, v, {
      type: o.type ?? 'triangle',
      f0: f,
      f1: o.glide ? f * 1.005 : undefined,
      start,
      dur: o.noteDur,
      peak: o.peak * (1 + i * 0.04),
      attack: 0.004,
    });
    end = start + o.noteDur;
  });
  return end + 0.05;
}

/** Soft-clip curve for cartoon grit (cached by drive amount). */
const SHAPER_CACHE = new Map<number, Float32Array<ArrayBuffer>>();
function shaperCurve(drive: number): Float32Array<ArrayBuffer> {
  const key = Math.round(drive * 100);
  const cached = SHAPER_CACHE.get(key);
  if (cached) return cached;
  const n = 1024;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = drive;
  for (let i = 0; i < n; i += 1) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  SHAPER_CACHE.set(key, curve);
  return curve;
}

/* ------------------------------------------------------------------ *
 * Musical material
 * ------------------------------------------------------------------ */

const C_PENT = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
const A_MINOR_RIFF = [110.0, 110.0, 116.54, 110.0, 130.81, 123.47, 110.0, 98.0];
const MENU_CHORDS: readonly (readonly number[])[] = [
  [261.63, 329.63, 392.0], // C major
  [349.23, 440.0, 523.25], // F major
  [220.0, 261.63, 329.63], // A minor
  [196.0, 246.94, 293.66], // G major
];
const HUNT_BASS = [110.0, 110.0, 110.0, 130.81, 110.0, 110.0, 98.0, 146.83];
const HUNT_LEAD = [880.0, 0, 783.99, 880.0, 1046.5, 0, 880.0, 783.99, 659.25, 0, 783.99, 0, 880.0, 0, 1046.5, 1174.66];
const BOSS_LEAD = [
  440.0, 466.16, 440.0, 415.3, 440.0, 0, 554.37, 523.25, 440.0, 466.16, 493.88, 440.0, 0, 415.3, 440.0, 0,
];
const DEFEAT_CHORDS: readonly (readonly number[])[] = [
  [440.0, 554.37, 659.25],
  [392.0, 493.88, 587.33],
  [349.23, 440.0, 523.25],
  [261.63, 329.63, 392.0, 523.25],
];

/* ------------------------------------------------------------------ *
 * SFX renderers
 * ------------------------------------------------------------------ */

type SfxRenderer = (ctx: AudioContext, out: AudioNode, v: VoiceTrace, t: number, p: number, g: number) => number;

const RENDERERS: Record<SfxName, SfxRenderer> = {
  shot: (ctx, out, v, t, p, g) => {
    noise(ctx, out, v, {
      start: t,
      dur: 0.004,
      peak: 0.34 * g,
      filter: 'bandpass',
      f0: 4200 * p,
      q: 1.2,
    });
    tone(ctx, out, v, {
      type: 'sine',
      f0: 150 * p,
      f1: 40 * p,
      start: t,
      dur: 0.13,
      peak: 0.55 * g,
      attack: 0.002,
    });
    noise(ctx, out, v, {
      start: t,
      dur: 0.09,
      peak: 0.5 * g,
      color: 'white',
      filter: 'lowpass',
      f0: 3200,
      f1: 700,
      q: 0.8,
    });
    return t + 0.16;
  },

  dry_fire: (ctx, out, v, t, p, g) => {
    noise(ctx, out, v, {
      start: t,
      dur: 0.003,
      peak: 0.55 * g,
      filter: 'bandpass',
      f0: 2600 * p,
      q: 6,
    });
    tone(ctx, out, v, {
      type: 'square',
      f0: 1800 * p,
      f1: 1500 * p,
      start: t,
      dur: 0.012,
      peak: 0.1 * g,
    });
    return t + 0.03;
  },

  reload_start: (ctx, out, v, t, p, g) => {
    for (let i = 0; i < 2; i += 1) {
      const at = t + i * 0.09;
      noise(ctx, out, v, {
        start: at,
        dur: 0.02,
        peak: (i === 0 ? 0.4 : 0.5) * g,
        color: 'white',
        filter: 'bandpass',
        f0: (i === 0 ? 1700 : 2200) * p,
        q: 7,
      });
      tone(ctx, out, v, {
        type: 'square',
        f0: (i === 0 ? 320 : 420) * p,
        f1: (i === 0 ? 240 : 300) * p,
        start: at,
        dur: 0.02,
        peak: 0.12 * g,
      });
    }
    return t + 0.13;
  },

  reload_end: (ctx, out, v, t, p, g) => {
    tone(ctx, out, v, {
      type: 'sawtooth',
      f0: 180 * p,
      f1: 520 * p,
      start: t,
      dur: 0.09,
      peak: 0.16 * g,
      attack: 0.02,
    });
    noise(ctx, out, v, {
      start: t + 0.1,
      dur: 0.03,
      peak: 0.5 * g,
      filter: 'bandpass',
      f0: 1200 * p,
      q: 4,
    });
    tone(ctx, out, v, {
      type: 'sine',
      f0: 140 * p,
      f1: 80 * p,
      start: t + 0.1,
      dur: 0.07,
      peak: 0.4 * g,
    });
    return t + 0.19;
  },

  empty_mag: (ctx, out, v, t, p, g) => {
    noise(ctx, out, v, {
      start: t,
      dur: 0.004,
      peak: 0.5 * g,
      filter: 'bandpass',
      f0: 1800 * p,
      q: 6,
    });
    tone(ctx, out, v, {
      type: 'triangle',
      f0: 1200 * p,
      f1: 900 * p,
      start: t,
      dur: 0.016,
      peak: 0.12 * g,
    });
    return t + 0.035;
  },

  hit: (ctx, out, v, t, p, g) => {
    tone(ctx, out, v, {
      type: 'triangle',
      f0: 900 * p,
      f1: 300 * p,
      start: t,
      dur: 0.06,
      peak: 0.5 * g,
    });
    noise(ctx, out, v, {
      start: t,
      dur: 0.09,
      peak: 0.18 * g,
      color: 'pink',
      filter: 'bandpass',
      f0: 2800,
      f1: 1400,
      q: 1.4,
    });
    return t + 0.11;
  },

  hit_armor: (ctx, out, v, t, p, g) => {
    noise(ctx, out, v, {
      start: t,
      dur: 0.08,
      peak: 0.4 * g,
      filter: 'bandpass',
      f0: 3200 * p,
      f1: 2000 * p,
      q: 3,
    });
    const pings = [1100, 1133, 1650];
    pings.forEach((f, i) => {
      tone(ctx, out, v, {
        type: 'square',
        f0: f * p,
        start: t + i * 0.004,
        dur: 0.18 - i * 0.02,
        peak: 0.12 * g,
        attack: 0.002,
        release: 0.15,
      });
    });
    return t + 0.22;
  },

  perfect: (ctx, out, v, t, p, g) => {
    const end = arp(ctx, v, {
      start: t,
      freqs: [880 * p, 1320 * p, 1760 * p],
      step: 0.07,
      noteDur: 0.2,
      type: 'sine',
      peak: 0.28 * g,
      dest: out,
    });
    noise(ctx, out, v, {
      start: t + 0.14,
      dur: 0.16,
      peak: 0.07 * g,
      filter: 'bandpass',
      f0: 6000,
      f1: 9000,
      q: 2,
    });
    return end;
  },

  combo_milestone: (ctx, out, v, t, p, g) => {
    const steps = [523.25, 659.25, 783.99];
    steps.forEach((f, i) => {
      tone(ctx, out, v, {
        type: 'square',
        f0: f * p,
        start: t + i * 0.05,
        dur: 0.045,
        peak: 0.2 * g,
        attack: 0.003,
      });
    });
    return t + 0.16;
  },

  combo_broken: (ctx, out, v, t, p, g) => {
    const osc = tone(ctx, out, v, {
      type: 'sawtooth',
      f0: 400 * p,
      f1: 200 * p,
      start: t,
      dur: 0.24,
      peak: 0.34 * g,
      attack: 0.006,
      release: 0.18,
    });
    vibrato(ctx, v, osc.detune, 7, 28, t, 0.24);
    return t + 0.27;
  },

  rare: (ctx, out, v, t, p, g) => bell(ctx, out, v, { start: t, base: 660 * p, dur: 0.7, peak: 0.3 * g }),

  gold: (ctx, out, v, t, p, g) =>
    bell(ctx, out, v, {
      start: t,
      base: 880 * p,
      dur: 0.75,
      peak: 0.33 * g,
      ratios: [1, 1.5, 2.01, 3.02],
      spread: 12,
    }),

  swarm_bonus: (ctx, out, v, t, p, g) =>
    arp(ctx, v, {
      start: t,
      freqs: [440, 550, 660, 880, 990, 1100].map((f) => f * p),
      step: 0.05,
      noteDur: 0.1,
      type: 'triangle',
      peak: 0.24 * g,
      dest: out,
    }),

  chain_step: (ctx, out, v, t, p, g) => {
    tone(ctx, out, v, {
      type: 'square',
      f0: 1400 * p,
      start: t,
      dur: 0.03,
      peak: 0.28 * g,
    });
    noise(ctx, out, v, {
      start: t,
      dur: 0.012,
      peak: 0.14 * g,
      filter: 'bandpass',
      f0: 5200 * p,
      q: 3,
    });
    return t + 0.05;
  },

  chain_complete: (ctx, out, v, t, p, g) => {
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((f, i) => {
      tone(ctx, out, v, {
        type: i === 3 ? 'sine' : 'triangle',
        f0: f * p,
        start: t + i * 0.008,
        dur: 0.42,
        peak: 0.16 * g,
        attack: 0.005,
        release: 0.36,
      });
    });
    noise(ctx, out, v, {
      start: t,
      dur: 0.25,
      peak: 0.08 * g,
      filter: 'bandpass',
      f0: 5000,
      f1: 8500,
      q: 2,
    });
    return t + 0.48;
  },

  boss_roar: (ctx, out, v, t, p, g) => {
    const saw = tone(ctx, out, v, {
      type: 'sawtooth',
      f0: 120 * p,
      f1: 55 * p,
      start: t,
      dur: 1.15,
      peak: 0.42 * g,
      attack: 0.12,
      release: 0.6,
    });
    vibrato(ctx, v, saw.detune, 11, 40, t, 1.15);
    tone(ctx, out, v, {
      type: 'sawtooth',
      f0: 90 * p,
      f1: 43 * p,
      start: t + 0.05,
      dur: 1.1,
      peak: 0.28 * g,
      detune: 22,
      attack: 0.15,
      release: 0.6,
    });
    const growl = noise(ctx, out, v, {
      start: t,
      dur: 1.2,
      peak: 0.3 * g,
      color: 'brown',
      filter: 'bandpass',
      f0: 320,
      q: 1.6,
      attack: 0.14,
      release: 0.7,
    });
    vibrato(ctx, v, growl.playbackRate, 6.5, 0.25, t, 1.2);
    return t + 1.28;
  },

  boss_hit: (ctx, out, v, t, p, g) => {
    tone(ctx, out, v, {
      type: 'sine',
      f0: 100 * p,
      f1: 35 * p,
      start: t,
      dur: 0.25,
      peak: 0.6 * g,
      attack: 0.003,
      release: 0.2,
    });
    noise(ctx, out, v, {
      start: t,
      dur: 0.2,
      peak: 0.22 * g,
      filter: 'bandpass',
      f0: 2500 * p,
      f1: 1500 * p,
      q: 8,
    });
    tone(ctx, out, v, {
      type: 'square',
      f0: 800 * p,
      start: t,
      dur: 0.24,
      peak: 0.09 * g,
      detune: 15,
      release: 0.2,
    });
    return t + 0.3;
  },

  boss_defeat: (ctx, out, v, t, p, g) => {
    let end = t;
    DEFEAT_CHORDS.forEach((chord, ci) => {
      const start = t + ci * 0.19;
      chord.forEach((f, i) => {
        tone(ctx, out, v, {
          type: i === 0 ? 'triangle' : 'sine',
          f0: f * p,
          start: start + i * 0.01,
          dur: 0.5,
          peak: (ci === DEFEAT_CHORDS.length - 1 ? 0.2 : 0.15) * g,
          attack: 0.006,
          release: 0.42,
        });
      });
      end = start + 0.5;
    });
    noise(ctx, out, v, {
      start: t + 0.57,
      dur: 0.4,
      peak: 0.07 * g,
      filter: 'bandpass',
      f0: 4000,
      f1: 9000,
      q: 2,
    });
    return end + 0.1;
  },

  explosion: (ctx, out, v, t, p, g) => {
    noise(ctx, out, v, {
      start: t,
      dur: 0.5,
      peak: 0.7 * g,
      color: 'white',
      filter: 'lowpass',
      f0: 4000,
      f1: 120,
      q: 1.1,
      attack: 0.004,
      release: 0.4,
    });
    tone(ctx, out, v, {
      type: 'sine',
      f0: 80 * p,
      f1: 28 * p,
      start: t,
      dur: 0.45,
      peak: 0.6 * g,
      attack: 0.005,
      release: 0.35,
    });
    noise(ctx, out, v, {
      start: t,
      dur: 0.01,
      peak: 0.35 * g,
      filter: 'bandpass',
      f0: 3000,
      q: 1,
    });
    return t + 0.56;
  },

  splash: (ctx, out, v, t, p, g) => {
    noise(ctx, out, v, {
      start: t,
      dur: 0.25,
      peak: 0.45 * g,
      color: 'white',
      filter: 'bandpass',
      f0: 900,
      f1: 2500,
      q: 2,
      attack: 0.006,
      release: 0.2,
    });
    tone(ctx, out, v, {
      type: 'sine',
      f0: 1400 * p,
      f1: 300 * p,
      start: t,
      dur: 0.22,
      peak: 0.22 * g,
      attack: 0.008,
      release: 0.16,
    });
    return t + 0.28;
  },

  thunder: (ctx, out, v, t, p, g) => {
    const rumble = noise(ctx, out, v, {
      start: t,
      dur: 1.5,
      peak: 0.75 * g,
      color: 'brown',
      filter: 'lowpass',
      f0: 150,
      q: 1.2,
      attack: 0.18,
      release: 1.1,
      offset: 0.3,
    });
    vibrato(ctx, v, rumble.playbackRate, 0.35, 0.12, t, 1.5);
    const rnd = makeRng(Math.floor(t * 1000) || 7);
    const cracks = rnd.range(1, 3);
    for (let i = 0; i < cracks; i += 1) {
      noise(ctx, out, v, {
        start: t + rnd.range(0.05, 1.1),
        dur: rnd.range(0.05, 0.14),
        peak: 0.24 * g * p,
        color: 'white',
        filter: 'bandpass',
        f0: rnd.range(900, 2200),
        q: 1.4,
        attack: 0.002,
        release: 0.1,
      });
    }
    return t + 1.65;
  },

  quack: (ctx, out, v, t, p, g) => duckCall(ctx, out, v, t, p, g, false),
  caw: (ctx, out, v, t, p, g) => duckCall(ctx, out, v, t, p, g, true),

  ui_click: (ctx, out, v, t, p, g) => {
    tone(ctx, out, v, {
      type: 'square',
      f0: 1200 * p,
      start: t,
      dur: 0.025,
      peak: 0.26 * g,
    });
    return t + 0.04;
  },

  ui_hover: (ctx, out, v, t, p, g) => {
    tone(ctx, out, v, {
      type: 'sine',
      f0: 1800 * p,
      start: t,
      dur: 0.02,
      peak: 0.11 * g,
    });
    return t + 0.035;
  },

  ui_back: (ctx, out, v, t, p, g) => {
    tone(ctx, out, v, {
      type: 'square',
      f0: 700 * p,
      f1: 520 * p,
      start: t,
      dur: 0.03,
      peak: 0.24 * g,
    });
    return t + 0.045;
  },

  level_up: (ctx, out, v, t, p, g) => {
    const triad = [523.25, 659.25, 783.99];
    triad.forEach((f, i) => {
      tone(ctx, out, v, {
        type: 'triangle',
        f0: f * p,
        start: t + i * 0.08,
        dur: 0.22,
        peak: 0.22 * g,
        attack: 0.004,
        release: 0.18,
      });
    });
    tone(ctx, out, v, {
      type: 'sine',
      f0: 1046.5 * p,
      start: t + 0.24,
      dur: 0.4,
      peak: 0.18 * g,
      attack: 0.006,
      release: 0.36,
    });
    return t + 0.46;
  },

  achievement: (ctx, out, v, t, p, g) => {
    const bellEnd = bell(ctx, out, v, {
      start: t,
      base: 880 * p,
      dur: 0.8,
      peak: 0.26 * g,
      ratios: [1, 2.02, 3.03],
    });
    const sparkEnd = arp(ctx, v, {
      start: t + 0.12,
      freqs: [1760, 2217.46, 2637.02, 3520].map((f) => f * p),
      step: 0.06,
      noteDur: 0.12,
      type: 'sine',
      peak: 0.1 * g,
      dest: out,
    });
    return Math.max(bellEnd, sparkEnd);
  },
};

/** Shared duck / gull style call: pulsed sawtooth through formant bandpasses. */
function duckCall(
  ctx: AudioContext,
  out: AudioNode,
  v: VoiceTrace,
  t: number,
  p: number,
  g: number,
  caw: boolean,
): number {
  const pulses = caw ? 3 : 2;
  const pulseDur = caw ? 0.14 : 0.11;
  const gap = caw ? 0.06 : 0.09;
  const base = (caw ? 900 : 520) * p;
  const rough = (caw ? 0.5 : 0.25) * g;

  const shaper = ctx.createWaveShaper();
  shaper.curve = shaperCurve(caw ? 3.2 : 1.6).slice();
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(shaper);
  shaper.connect(out);

  // Two formant bandpasses give the "quack" vowel colour.
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = caw ? 1300 : 1000;
  f1.Q.value = 5;
  f1.connect(mix);
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = caw ? 2600 : 2300;
  f2.Q.value = 7;
  f2.connect(mix);

  let end = t;
  for (let i = 0; i < pulses; i += 1) {
    const start = t + i * (pulseDur + gap);
    const drop = 1 - i * 0.12;
    const osc = tone(ctx, f1, v, {
      type: 'sawtooth',
      f0: base * drop,
      f1: base * 1.42 * drop,
      start,
      dur: pulseDur,
      peak: 0.3 * g,
      attack: 0.008,
      release: pulseDur * 0.7,
    });
    tone(ctx, f2, v, {
      type: 'sawtooth',
      f0: base * 1.05 * drop,
      f1: base * 0.86 * drop,
      start,
      dur: pulseDur * 0.9,
      peak: 0.14 * g,
      attack: 0.01,
      release: pulseDur * 0.7,
    });
    vibrato(ctx, v, osc.detune, caw ? 22 : 16, caw ? 60 : 40, start, pulseDur);
    // rasp
    noise(ctx, f1, v, {
      start,
      dur: pulseDur,
      peak: rough,
      color: 'pink',
      filter: 'bandpass',
      f0: base * 1.6,
      q: 3,
      attack: 0.01,
      release: pulseDur * 0.7,
    });
    // downward tail on the last pulse
    if (i === pulses - 1) {
      tone(ctx, f1, v, {
        type: 'sawtooth',
        f0: base * 0.86 * drop,
        f1: base * 0.62 * drop,
        start: start + pulseDur * 0.6,
        dur: pulseDur * 0.7,
        peak: 0.12 * g,
        attack: 0.01,
        release: pulseDur * 0.6,
      });
    }
    end = start + pulseDur;
  }
  return end + 0.12;
}

/* ------------------------------------------------------------------ *
 * Music state
 * ------------------------------------------------------------------ */

interface MusicState {
  theme: ThemeName;
  /** Layer input gains (each feeds its own filtered chain into `themeGain`). */
  input: Record<LayerName, GainNode>;
  themeGain: GainNode;
  bpm: number;
  baseBpm: number;
  step: number;
  nextTime: number;
  active: Record<LayerName, boolean>;
  timer: number | null;
  lastPluckAt: number;
  barCount: number;
}

interface AmbientState {
  kind: AmbientKind;
  themeGain: GainNode;
  timer: number | null;
  events: AmbientEvent[];
}

interface AmbientEvent {
  min: number;
  max: number;
  next: number;
  fire: (at: number) => void;
}

/* ------------------------------------------------------------------ *
 * AudioEngine
 * ------------------------------------------------------------------ */

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private blocked = false;
  private volumes = { ...DEFAULT_VOLUMES };
  private intensity = 0;

  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private sfxUserGain: GainNode | null = null;
  private musicUserGain: GainNode | null = null;
  private musicDuck: GainNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;
  private ambientUserGain: GainNode | null = null;

  private activeSfx = 0;
  private readonly liveSfx = new Set<AudioScheduledSourceNode>();
  private readonly liveMusic = new Set<AudioScheduledSourceNode>();
  private readonly liveAmbient = new Set<AudioScheduledSourceNode>();
  private readonly timersPending = new Set<number>();

  private music: MusicState | null = null;
  private ambient: AmbientState | null = null;
  private duckTimer: number | null = null;

  private readonly srng = makeRng((Date.now() ^ 0x1234abcd) >>> 0);
  private readonly mrng = makeRng((Date.now() * 7919) >>> 0);
  private readonly arng = makeRng((Date.now() * 104729) >>> 0);

  /** True once an AudioContext exists and has not been blocked by the browser. */
  get ready(): boolean {
    return this.ctx !== null && !this.blocked;
  }

  /** Lazily creates the AudioContext. Must first be called from a user gesture. */
  unlock(): void {
    if (this.blocked) return;
    if (this.ctx) {
      this.resumeIfNeeded();
      return;
    }
    const Ctor = audioScope.AudioContext ?? audioScope.webkitAudioContext;
    if (typeof Ctor !== 'function') {
      this.blocked = true;
      return;
    }
    try {
      const ctx = new Ctor();
      this.buildGraph(ctx);
      this.ctx = ctx;
      this.resumeIfNeeded();
      this.applyFilter(this.intensity, 0.01);
    } catch {
      // No Web Audio available, or construction refused: stay silent forever.
      this.teardownNodes();
      this.ctx = null;
      this.blocked = true;
    }
  }

  /** Set bus volumes (each 0..1). */
  setVolumes(v: { master: number; music: number; sfx: number; ambient: number }): void {
    this.volumes = {
      master: clamp(v.master, 0, 1),
      music: clamp(v.music, 0, 1),
      sfx: clamp(v.sfx, 0, 1),
      ambient: clamp(v.ambient, 0, 1),
    };
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.ramp(this.master, this.volumes.master, now);
    this.ramp(this.musicUserGain, this.volumes.music, now);
    this.ramp(this.sfxUserGain, this.volumes.sfx, now);
    this.ramp(this.ambientUserGain, this.volumes.ambient, now);
  }

  /** Fire a one-shot sound effect. Silently dropped when not ready or voice-capped. */
  play(name: SfxName, opts?: SfxOpts): void {
    if (!this.ready) {
      this.unlock();
      if (!this.ready) return;
    }
    const ctx = this.ctx;
    const out = this.sfxUserGain;
    if (!ctx || !out) return;
    if (this.activeSfx >= MAX_SFX_VOICES) return;

    this.activeSfx += 1;
    const jitter = this.srng.range(0.94, 1.06);
    const pitch = clamp(opts?.pitch ?? 1, 0.25, 4) * jitter;
    const vol = clamp(opts?.vol ?? 1, 0, 1.5);

    const v = new VoiceTrace();
    const dest = this.makePanner(out, CENTERED_SFX.has(name) ? 0 : this.srng.range(-0.3, 0.3), v);
    let end: number;
    try {
      end = RENDERERS[name](ctx, dest, v, ctx.currentTime + 0.002, pitch, vol);
    } catch {
      v.dispose();
      this.releaseVoice();
      return;
    }
    // Release the slot when the voice finishes; a timer is the safety net in case
    // the browser never fires `onended` (e.g. a suspended context).
    const release = once((): void => this.releaseVoice());
    this.register(v, this.liveSfx, release);
    this.after(Math.max(0.05, end - ctx.currentTime + 0.15), release);
  }

  private releaseVoice(): void {
    this.activeSfx = Math.max(0, this.activeSfx - 1);
  }

  /** Start a procedural ambient bed. Replaces any bed already playing. */
  startAmbient(kind: AmbientKind): void {
    this.stopAmbient();
    if (!this.ready) {
      this.unlock();
      if (!this.ready) return;
    }
    const ctx = this.ctx;
    const bus = this.ambientUserGain;
    if (!ctx || !bus) return;

    const themeGain = ctx.createGain();
    themeGain.gain.value = 0.0001;
    themeGain.connect(bus);
    const now = ctx.currentTime + 0.02;
    themeGain.gain.linearRampToValueAtTime(1, now + 0.8);

    const st: AmbientState = { kind, themeGain, timer: null, events: [] };
    this.ambient = st;

    if (kind === 'marsh') this.buildMarshBed(ctx, themeGain, now, st);
    else if (kind === 'coast') this.buildCoastBed(ctx, themeGain, now, st);
    else this.buildNightBed(ctx, themeGain, now, st);

    st.timer = timers.setInterval(() => this.tickAmbient(), AMBIENT_TICK_MS);
  }

  /** Tear the ambient bed and its scheduler down completely. */
  stopAmbient(): void {
    const st = this.ambient;
    this.ambient = null;
    if (!st) return;
    if (st.timer !== null) {
      timers.clearInterval(st.timer);
      st.timer = null;
    }
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    st.themeGain.gain.cancelScheduledValues(now);
    st.themeGain.gain.setValueAtTime(st.themeGain.gain.value, now);
    st.themeGain.gain.linearRampToValueAtTime(MIN_G, now + 0.4);
    this.fadeOutSet(this.liveAmbient, now + 0.45);
    this.after(0.55, () => {
      try {
        st.themeGain.disconnect();
      } catch {
        /* already detached */
      }
    });
  }

  /** Start a procedural music theme. Replaces any theme already playing. */
  startMusic(theme: ThemeName): void {
    this.stopMusic();
    if (!this.ready) {
      this.unlock();
      if (!this.ready) return;
    }
    const ctx = this.ctx;
    const duck = this.musicDuck;
    const filter = this.musicFilter;
    if (!ctx || !duck || !filter) return;

    const themeGain = ctx.createGain();
    themeGain.gain.value = 0.0001;
    themeGain.connect(filter);
    const now = ctx.currentTime + 0.02;
    themeGain.gain.linearRampToValueAtTime(1, now + 0.5);

    const mkLayer = (): GainNode => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(themeGain);
      return g;
    };
    const input: Record<LayerName, GainNode> = {
      pad: mkLayer(),
      bass: mkLayer(),
      perc: mkLayer(),
      lead: mkLayer(),
      fx: mkLayer(),
    };

    const baseBpm = theme === 'menu' ? 84 : theme === 'hunt' ? 126 : theme === 'zen' ? 62 : 142;
    const st: MusicState = {
      theme,
      input,
      themeGain,
      bpm: baseBpm,
      baseBpm,
      step: 0,
      nextTime: now,
      active: { pad: false, bass: false, perc: false, lead: false, fx: false },
      timer: null,
      lastPluckAt: -1,
      barCount: 0,
    };
    this.music = st;

    // Per-theme routing / sustained elements.
    if (theme === 'menu') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 950;
      lp.Q.value = 0.7;
      input.pad.disconnect();
      input.pad.connect(lp);
      lp.connect(themeGain);
    } else if (theme === 'hunt') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 340;
      lp.Q.value = 3;
      input.bass.disconnect();
      input.bass.connect(lp);
      lp.connect(themeGain);
      const shaper = ctx.createWaveShaper();
      shaper.curve = shaperCurve(2.2);
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      input.lead.disconnect();
      input.lead.connect(shaper);
      shaper.connect(wet);
      wet.connect(themeGain);
    } else if (theme === 'zen') {
      const delay = ctx.createDelay(1.5);
      delay.delayTime.value = 0.42;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const fbLp = ctx.createBiquadFilter();
      fbLp.type = 'lowpass';
      fbLp.frequency.value = 2200;
      const dry = ctx.createGain();
      dry.gain.value = 0.6;
      input.fx.disconnect();
      input.fx.connect(delay);
      delay.connect(fbLp);
      fbLp.connect(fb);
      fb.connect(delay);
      delay.connect(dry);
      dry.connect(themeGain);
      this.startZenDrone(ctx, input.pad, now, st);
    } else {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      lp.Q.value = 4;
      input.bass.disconnect();
      input.bass.connect(lp);
      lp.connect(themeGain);
      this.startBossDrone(ctx, input.pad, now, st);
    }

    this.applyIntensity(0.6);
    st.timer = timers.setInterval(() => this.tickMusic(), MUSIC_TICK_MS);
  }

  /** Tear the music theme and its look-ahead scheduler down completely. */
  stopMusic(): void {
    const st = this.music;
    this.music = null;
    if (!st) return;
    if (st.timer !== null) {
      timers.clearInterval(st.timer);
      st.timer = null;
    }
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    st.themeGain.gain.cancelScheduledValues(now);
    st.themeGain.gain.setValueAtTime(st.themeGain.gain.value, now);
    st.themeGain.gain.linearRampToValueAtTime(MIN_G, now + 0.1);
    this.fadeOutSet(this.liveMusic, now + 0.16);
    const layers = Object.values(st.input);
    this.after(0.25, () => {
      for (const l of layers) {
        try {
          l.disconnect();
        } catch {
          /* already detached */
        }
      }
      try {
        st.themeGain.disconnect();
      } catch {
        /* already detached */
      }
    });
  }

  /** 0..1 dynamic music intensity (layer mix / filter / tempo). Cheap to call. */
  setMusicIntensity(level: number): void {
    const next = clamp(level, 0, 1);
    if (Math.abs(next - this.intensity) < 0.01) return;
    this.intensity = next;
    this.applyFilter(next, 0.25);
    if (this.music) this.applyIntensity(0.25);
  }

  /** Temporarily pull the music down for a stinger / cutscene moment. */
  duckMusic(durationMs: number): void {
    const ctx = this.ctx;
    const duck = this.musicDuck;
    if (!ctx || !duck) return;
    const now = ctx.currentTime;
    const dur = Math.max(0.05, durationMs / 1000);
    if (this.duckTimer !== null) {
      timers.clearTimeout(this.duckTimer);
      this.duckTimer = null;
    }
    duck.gain.cancelScheduledValues(now);
    duck.gain.setValueAtTime(duck.gain.value, now);
    duck.gain.linearRampToValueAtTime(DUCK_LEVEL, now + 0.02);
    duck.gain.setValueAtTime(DUCK_LEVEL, now + dur * 0.7);
    duck.gain.linearRampToValueAtTime(1, now + dur);
    this.duckTimer = this.after(dur + 0.05, () => {
      this.duckTimer = null;
    });
  }

  /** Stop everything, disconnect the whole graph and close the context. */
  shutdown(): void {
    this.stopMusic();
    this.stopAmbient();
    for (const id of this.timersPending) timers.clearTimeout(id);
    this.timersPending.clear();

    const ctx = this.ctx;
    const sfx = Array.from(this.liveSfx);
    this.liveSfx.clear();
    this.activeSfx = 0;
    for (const s of sfx) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
      try {
        s.disconnect();
      } catch {
        /* already detached */
      }
    }
    this.teardownNodes();
    this.blocked = false;
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        /* already closed */
      }
    }
    this.ctx = null;
  }

  /* ---------------------------------------------------------------- *
   * Internals: graph
   * ---------------------------------------------------------------- */

  private buildGraph(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = this.volumes.master;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 24;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    master.connect(compressor);
    compressor.connect(ctx.destination);

    const sfx = ctx.createGain();
    sfx.gain.value = this.volumes.sfx;
    sfx.connect(master);

    const musicUser = ctx.createGain();
    musicUser.gain.value = this.volumes.music;
    musicUser.connect(master);

    const duck = ctx.createGain();
    duck.gain.value = 1;
    duck.connect(musicUser);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 0.6;
    filter.connect(duck);

    const ambient = ctx.createGain();
    ambient.gain.value = this.volumes.ambient;
    ambient.connect(master);

    this.master = master;
    this.compressor = compressor;
    this.sfxUserGain = sfx;
    this.musicUserGain = musicUser;
    this.musicDuck = duck;
    this.musicFilter = filter;
    this.ambientUserGain = ambient;
  }

  private teardownNodes(): void {
    const nodes = [
      this.master,
      this.compressor,
      this.sfxUserGain,
      this.musicUserGain,
      this.musicDuck,
      this.musicFilter,
      this.ambientUserGain,
    ];
    for (const n of nodes) {
      if (!n) continue;
      try {
        n.disconnect();
      } catch {
        /* already detached */
      }
    }
    this.master = null;
    this.compressor = null;
    this.sfxUserGain = null;
    this.musicUserGain = null;
    this.musicDuck = null;
    this.musicFilter = null;
    this.ambientUserGain = null;
  }

  private resumeIfNeeded(): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state === 'running') return;
    try {
      const p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch((): void => undefined);
    } catch {
      /* resume refused; stays suspended until a later gesture */
    }
  }

  private makePanner(out: AudioNode, pan: number, v: VoiceTrace): AudioNode {
    const ctx = this.ctx;
    if (!ctx || pan === 0 || typeof ctx.createStereoPanner !== 'function') return out;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    p.connect(out);
    v.track(p, 0);
    return p;
  }

  private ramp(node: GainNode | null, value: number, now: number): void {
    if (!node) return;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(value, now + 0.05);
  }

  private applyFilter(level: number, time: number): void {
    const ctx = this.ctx;
    const f = this.musicFilter;
    if (!ctx || !f) return;
    const cutoff = 500 * Math.pow(32, level); // 500Hz -> ~16kHz
    const now = ctx.currentTime;
    f.frequency.cancelScheduledValues(now);
    f.frequency.setValueAtTime(Math.max(60, f.frequency.value), now);
    f.frequency.exponentialRampToValueAtTime(cutoff, now + Math.max(0.01, time));
  }

  /** Layer gate targets for the current theme + intensity, with smooth fades. */
  private applyIntensity(fade: number): void {
    const st = this.music;
    const ctx = this.ctx;
    if (!st || !ctx) return;
    const lvl = this.intensity;
    const targets: Record<LayerName, number> = { pad: 0, bass: 0, perc: 0, lead: 0, fx: 0 };

    if (st.theme === 'menu') {
      targets.pad = 1;
      targets.fx = 0.45 + 0.55 * ramp01(lvl, 0.2, 0.9);
    } else if (st.theme === 'hunt') {
      targets.pad = 0.75;
      targets.bass = ramp01(lvl, 0.3, 0.45);
      targets.perc = ramp01(lvl, 0.6, 0.75);
      targets.lead = ramp01(lvl, 0.85, 0.95);
    } else if (st.theme === 'zen') {
      targets.fx = 1;
      targets.pad = 0.8;
    } else {
      targets.perc = 0.45 + 0.55 * ramp01(lvl, 0.05, 0.5);
      targets.bass = ramp01(lvl, 0.1, 0.45);
      targets.lead = ramp01(lvl, 0.8, 0.95);
      targets.pad = 0.5;
    }

    const now = ctx.currentTime;
    const dur = Math.max(0.02, fade);
    (Object.keys(targets) as LayerName[]).forEach((layer) => {
      const g = st.input[layer];
      const target = targets[layer];
      st.active[layer] = target > 0.01;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(target, now + dur);
    });

    st.bpm = st.baseBpm + (st.theme === 'menu' || st.theme === 'zen' ? 4 * lvl : 14 * lvl);
  }

  /* ---------------------------------------------------------------- *
   * Internals: voice / node lifecycle
   * ---------------------------------------------------------------- */

  private register(v: VoiceTrace, set: Set<AudioScheduledSourceNode>, onDone?: () => void): void {
    if (v.sources.length === 0) {
      if (onDone) onDone();
      return;
    }
    const finish = once(() => {
      v.dispose();
      if (onDone) onDone();
    });
    let remaining = v.sources.length;
    for (const s of v.sources) {
      set.add(s);
      onEnded(s, () => {
        set.delete(s);
        remaining -= 1;
        if (remaining <= 0) finish();
      });
    }
  }

  private fadeOutSet(set: Set<AudioScheduledSourceNode>, stopAt: number): void {
    for (const s of Array.from(set)) {
      try {
        s.stop(stopAt);
      } catch {
        try {
          s.stop();
        } catch {
          /* already finished */
        }
      }
    }
  }

  private after(seconds: number, fn: () => void): number {
    const id = timers.setTimeout(
      () => {
        this.timersPending.delete(id);
        fn();
      },
      Math.max(0, seconds * 1000),
    );
    this.timersPending.add(id);
    return id;
  }

  /* ---------------------------------------------------------------- *
   * Internals: ambient beds
   * ---------------------------------------------------------------- */

  private scheduleAmbient(st: AmbientState, kind: AmbientEvent['fire'], min: number, max: number, first: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    st.events.push({ min, max, next: ctx.currentTime + first, fire: kind });
  }

  private tickAmbient(): void {
    const st = this.ambient;
    const ctx = this.ctx;
    if (!st || !ctx) return;
    const horizon = ctx.currentTime + AMBIENT_AHEAD_S;
    for (const ev of st.events) {
      let guard = 0;
      while (ev.next < horizon && guard < 8) {
        const at = Math.max(ev.next, ctx.currentTime + 0.01);
        ev.fire(at);
        ev.next = at + Math.max(0.2, this.arng.range(ev.min, ev.max));
        guard += 1;
      }
    }
  }

  private ambientVoice(v: VoiceTrace): void {
    this.register(v, this.liveAmbient);
  }

  /** Sustained wind through a slowly modulated lowpass. */
  private windLayer(ctx: AudioContext, dest: AudioNode, cutoff: number): void {
    const v = new VoiceTrace();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 'pink');
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(lp);
    lp.connect(g);
    g.connect(dest);
    src.start();
    v.track(src, Number.MAX_SAFE_INTEGER);
    v.track(g, Number.MAX_SAFE_INTEGER);
    // slow gust modulation
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = cutoff * 0.4;
    lfo.connect(lfoAmt);
    lfoAmt.connect(lp.frequency);
    lfo.start();
    v.track(lfo, Number.MAX_SAFE_INTEGER);
    v.track(lfoAmt, Number.MAX_SAFE_INTEGER);
    this.ambientVoice(v);
  }

  /** Gain LFO for wave swells. */
  private swellLayer(ctx: AudioContext, dest: AudioNode): void {
    const v = new VoiceTrace();
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 'white');
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 800;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0.28;
    src.connect(bp);
    bp.connect(g);
    g.connect(dest);
    src.start();
    v.track(src, Number.MAX_SAFE_INTEGER);
    v.track(g, Number.MAX_SAFE_INTEGER);
    const lfo = ctx.createOscillator();
    lfo.type = 'triangle';
    lfo.frequency.value = 0.055;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.22;
    lfo.connect(lfoAmt);
    lfoAmt.connect(g.gain);
    lfo.start();
    v.track(lfo, Number.MAX_SAFE_INTEGER);
    v.track(lfoAmt, Number.MAX_SAFE_INTEGER);
    this.ambientVoice(v);
  }

  private frogCroak(ctx: AudioContext, dest: AudioNode, at: number): void {
    const v = new VoiceTrace();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 3.5;
    bp.connect(dest);
    const base = this.arng.range(280, 360);
    for (let i = 0; i < 2; i += 1) {
      const start = at + i * 0.13;
      tone(ctx, bp, v, {
        type: 'sawtooth',
        f0: base * (i === 0 ? 1 : 0.78),
        f1: base * (i === 0 ? 0.8 : 0.62),
        start,
        dur: 0.12,
        peak: 0.11,
        attack: 0.01,
        release: 0.09,
      });
    }
    this.ambientVoice(v);
  }

  private ambientSplash(ctx: AudioContext, dest: AudioNode, at: number): void {
    const v = new VoiceTrace();
    noise(ctx, dest, v, {
      start: at,
      dur: 0.22,
      peak: 0.12,
      color: 'white',
      filter: 'bandpass',
      f0: 800,
      f1: 2200,
      q: 2,
      attack: 0.006,
      release: 0.16,
    });
    this.ambientVoice(v);
  }

  private gullCry(ctx: AudioContext, dest: AudioNode, at: number): void {
    const v = new VoiceTrace();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 4;
    bp.connect(dest);
    const pulses = this.arng.range(2, 4) | 0;
    for (let i = 0; i < pulses; i += 1) {
      const start = at + i * 0.22;
      const osc = tone(ctx, bp, v, {
        type: 'sawtooth',
        f0: this.arng.range(850, 1050),
        f1: this.arng.range(600, 700),
        start,
        dur: 0.18,
        peak: 0.09,
        attack: 0.012,
        release: 0.14,
      });
      vibrato(ctx, v, osc.detune, 18, 55, start, 0.18);
    }
    this.ambientVoice(v);
  }

  private cricketChirp(ctx: AudioContext, dest: AudioNode, at: number): void {
    const v = new VoiceTrace();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 4200;
    bp.Q.value = 14;
    bp.connect(dest);
    const pulses = 5 + (this.arng.range(0, 4) | 0);
    const f = this.arng.range(4000, 4400);
    for (let i = 0; i < pulses; i += 1) {
      tone(ctx, bp, v, {
        type: 'square',
        f0: f,
        start: at + i * 0.024,
        dur: 0.009,
        peak: 0.05,
        attack: 0.001,
        release: 0.006,
      });
    }
    this.ambientVoice(v);
  }

  private owlHoot(ctx: AudioContext, dest: AudioNode, at: number): void {
    const v = new VoiceTrace();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    lp.Q.value = 1;
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    lp.connect(dest);
    lp.connect(wet);
    const delay = ctx.createDelay(1.2);
    delay.delayTime.value = 0.33;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    wet.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(dest);
    const base = this.arng.range(390, 430);
    for (let i = 0; i < 2; i += 1) {
      const start = at + i * 0.42;
      tone(ctx, lp, v, {
        type: 'sine',
        f0: base * (i === 0 ? 1 : 0.94),
        f1: base * (i === 0 ? 0.96 : 0.86),
        start,
        dur: i === 0 ? 0.34 : 0.5,
        peak: 0.1,
        attack: 0.03,
        release: 0.4,
      });
    }
    this.ambientVoice(v);
  }

  private buildMarshBed(ctx: AudioContext, dest: AudioNode, now: number, st: AmbientState): void {
    this.windLayer(ctx, dest, 480);
    this.scheduleAmbient(st, (at) => this.frogCroak(ctx, dest, at), 1.5, 4, this.arng.range(0.2, 1.2));
    this.scheduleAmbient(st, (at) => this.ambientSplash(ctx, dest, at), 5, 11, this.arng.range(1, 4));
    void now;
  }

  private buildCoastBed(ctx: AudioContext, dest: AudioNode, now: number, st: AmbientState): void {
    this.swellLayer(ctx, dest);
    this.scheduleAmbient(st, (at) => this.gullCry(ctx, dest, at), 4, 9, this.arng.range(1, 3));
    void now;
  }

  private buildNightBed(ctx: AudioContext, dest: AudioNode, now: number, st: AmbientState): void {
    this.windLayer(ctx, dest, 300);
    this.scheduleAmbient(st, (at) => this.cricketChirp(ctx, dest, at), 1, 3, this.arng.range(0.2, 1));
    this.scheduleAmbient(st, (at) => this.owlHoot(ctx, dest, at), 8, 15, this.arng.range(3, 7));
    void now;
  }

  /* ---------------------------------------------------------------- *
   * Internals: music scheduler
   * ---------------------------------------------------------------- */

  private tickMusic(): void {
    const st = this.music;
    const ctx = this.ctx;
    if (!st || !ctx) return;
    const horizon = ctx.currentTime + MUSIC_LOOKAHEAD_S;
    let guard = 0;
    while (st.nextTime < horizon && guard < 32) {
      const at = Math.max(st.nextTime, ctx.currentTime + 0.005);
      this.scheduleStep(st, st.step, at);
      st.nextTime = at + this.stepSeconds(st);
      st.step = (st.step + 1) % LOOP_STEPS;
      if (st.step === 0) st.barCount += 1;
      guard += 1;
    }
  }

  private stepSeconds(st: MusicState): number {
    return 60 / st.bpm / 4;
  }

  private musicVoice(v: VoiceTrace): void {
    this.register(v, this.liveMusic);
  }

  private scheduleStep(st: MusicState, step: number, t: number): void {
    if (st.theme === 'menu') this.stepMenu(st, step, t);
    else if (st.theme === 'hunt') this.stepHunt(st, step, t);
    else if (st.theme === 'zen') this.stepZen(st, step, t);
    else this.stepBoss(st, step, t);
  }

  /** Calm major pad + sparse pentatonic plucks. */
  private stepMenu(st: MusicState, step: number, t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.stepSeconds(st);
    if (st.active.pad && step % STEPS_PER_BAR === 0) {
      const chord = MENU_CHORDS[Math.floor(step / STEPS_PER_BAR) % MENU_CHORDS.length] as readonly number[];
      const dur = s * STEPS_PER_BAR * 1.1;
      const v = new VoiceTrace();
      chord.forEach((f, i) => {
        tone(ctx, st.input.pad, v, {
          type: 'triangle',
          f0: f,
          start: t + i * 0.015,
          dur,
          peak: 0.055,
          attack: dur * 0.4,
          release: dur * 0.55,
          detune: i % 2 === 0 ? 6 : -6,
        });
        tone(ctx, st.input.pad, v, {
          type: 'sine',
          f0: f / 2,
          start: t,
          dur,
          peak: 0.03,
          attack: dur * 0.45,
          release: dur * 0.5,
        });
      });
      this.musicVoice(v);
    }
    if (st.active.fx && step % 2 === 0 && this.mrng.chance(0.22 + this.intensity * 0.18)) {
      if (t - st.lastPluckAt < s * 1.5) return;
      st.lastPluckAt = t;
      const v = new VoiceTrace();
      const f = this.mrng.pick(C_PENT);
      tone(ctx, st.input.fx, v, {
        type: 'triangle',
        f0: f,
        start: t,
        dur: 0.55,
        peak: 0.1,
        attack: 0.004,
        release: 0.5,
      });
      tone(ctx, st.input.fx, v, {
        type: 'sine',
        f0: f * 2,
        start: t,
        dur: 0.35,
        peak: 0.035,
        attack: 0.003,
        release: 0.3,
      });
      this.musicVoice(v);
    }
  }

  /** Driving eighths bass, hats + stabs, lead on top at high intensity. */
  private stepHunt(st: MusicState, step: number, t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.stepSeconds(st);
    const inBar = step % STEPS_PER_BAR;

    if (st.active.bass && inBar % 2 === 0) {
      const v = new VoiceTrace();
      const f = HUNT_BASS[(inBar / 2) % HUNT_BASS.length] as number;
      tone(ctx, st.input.bass, v, {
        type: 'sawtooth',
        f0: f,
        f1: f * 0.97,
        start: t,
        dur: Math.max(0.1, s * 1.6),
        peak: 0.16,
        attack: 0.004,
        release: 0.08,
      });
      this.musicVoice(v);
    }

    if (st.active.perc) {
      const v = new VoiceTrace();
      if (inBar % 2 === 0) {
        // kick
        tone(ctx, st.input.perc, v, {
          type: 'sine',
          f0: 130,
          f1: 45,
          start: t,
          dur: 0.13,
          peak: 0.3,
          attack: 0.002,
          release: 0.1,
        });
      }
      if (inBar % 2 === 1) {
        // closed hat
        noise(ctx, st.input.perc, v, {
          start: t,
          dur: 0.03,
          peak: inBar % 4 === 3 ? 0.09 : 0.055,
          color: 'white',
          filter: 'highpass',
          f0: 6500,
          q: 1,
          attack: 0.001,
          release: 0.02,
        });
      }
      if (inBar === 4 || inBar === 12 || (inBar === 14 && this.mrng.chance(0.4))) {
        // percussive stab
        [440, 523.25, 659.25].forEach((f, i) => {
          tone(ctx, st.input.perc, v, {
            type: 'sawtooth',
            f0: f,
            start: t + i * 0.004,
            dur: 0.12,
            peak: 0.075,
            attack: 0.003,
            release: 0.09,
            detune: i * 8,
          });
        });
      }
      this.musicVoice(v);
    }

    if (st.active.lead && inBar % 2 === 0) {
      const note = HUNT_LEAD[(inBar / 2) % HUNT_LEAD.length] as number;
      if (note > 0) {
        const v = new VoiceTrace();
        tone(ctx, st.input.lead, v, {
          type: 'triangle',
          f0: note,
          start: t,
          dur: s * 1.8,
          peak: 0.1,
          attack: 0.006,
          release: s * 1.5,
        });
        this.musicVoice(v);
      }
    }
  }

  /** Slow sparse pentatonic plucks through a feedback delay. */
  private stepZen(st: MusicState, _step: number, t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.stepSeconds(st);
    if (!st.active.fx) return;
    if (!this.mrng.chance(0.1 + this.intensity * 0.12)) return;
    if (t - st.lastPluckAt < s * 3) return;
    st.lastPluckAt = t;
    const v = new VoiceTrace();
    const f = this.mrng.pick(C_PENT) * (this.mrng.chance(0.25) ? 0.5 : 1);
    tone(ctx, st.input.fx, v, {
      type: 'sine',
      f0: f,
      start: t,
      dur: 0.9,
      peak: 0.1,
      attack: 0.006,
      release: 0.85,
    });
    tone(ctx, st.input.fx, v, {
      type: 'triangle',
      f0: f * 2,
      start: t,
      dur: 0.6,
      peak: 0.03,
      attack: 0.004,
      release: 0.55,
    });
    this.musicVoice(v);
  }

  /** Tense minor loop: kick, snare, low riff, lead at high intensity. */
  private stepBoss(st: MusicState, step: number, t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = this.stepSeconds(st);
    const inBar = step % STEPS_PER_BAR;

    if (st.active.perc) {
      const v = new VoiceTrace();
      if (inBar === 0 || inBar === 8 || inBar === 11) {
        tone(ctx, st.input.perc, v, {
          type: 'sine',
          f0: 145,
          f1: 38,
          start: t,
          dur: 0.18,
          peak: 0.38,
          attack: 0.002,
          release: 0.14,
        });
      }
      if (inBar === 4 || inBar === 12) {
        noise(ctx, st.input.perc, v, {
          start: t,
          dur: 0.16,
          peak: 0.22,
          color: 'white',
          filter: 'bandpass',
          f0: 1800,
          f1: 1200,
          q: 0.8,
          attack: 0.002,
          release: 0.12,
        });
        tone(ctx, st.input.perc, v, {
          type: 'triangle',
          f0: 220,
          f1: 180,
          start: t,
          dur: 0.1,
          peak: 0.08,
          attack: 0.002,
          release: 0.08,
        });
      }
      if (inBar % 2 === 1) {
        noise(ctx, st.input.perc, v, {
          start: t,
          dur: 0.025,
          peak: 0.05,
          filter: 'highpass',
          f0: 7000,
          q: 1,
          attack: 0.001,
          release: 0.02,
        });
      }
      this.musicVoice(v);
    }

    if (st.active.bass && (inBar % 3 === 0 || inBar === 14)) {
      const v = new VoiceTrace();
      const f = A_MINOR_RIFF[(inBar / 3) % A_MINOR_RIFF.length] as number;
      tone(ctx, st.input.bass, v, {
        type: 'sawtooth',
        f0: f,
        f1: f * 0.98,
        start: t,
        dur: Math.max(0.12, s * 2.2),
        peak: 0.2,
        attack: 0.005,
        release: 0.12,
      });
      this.musicVoice(v);
    }

    if (st.active.lead) {
      const note = BOSS_LEAD[inBar % BOSS_LEAD.length] as number;
      if (note > 0) {
        const v = new VoiceTrace();
        tone(ctx, st.input.lead, v, {
          type: 'sawtooth',
          f0: note,
          start: t,
          dur: Math.max(0.1, s * 1.4),
          peak: 0.09,
          attack: 0.005,
          release: s,
          detune: 6,
        });
        this.musicVoice(v);
      }
    }
  }

  /** Sustained warm drone under the zen theme. */
  private startZenDrone(ctx: AudioContext, dest: AudioNode, now: number, st: unknown): void {
    const v = new VoiceTrace();
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN_G, now);
    g.gain.linearRampToValueAtTime(0.05, now + 3);
    g.connect(dest);
    [130.81, 196.0].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.detune.value = i === 0 ? -5 : 7;
      o.connect(g);
      o.start(now);
      v.track(o, Number.MAX_SAFE_INTEGER);
    });
    void st;
    this.musicVoice(v);
  }

  /** Sustained tension drone under the boss theme. */
  private startBossDrone(ctx: AudioContext, dest: AudioNode, now: number, st: unknown): void {
    const v = new VoiceTrace();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 260;
    lp.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN_G, now);
    g.gain.linearRampToValueAtTime(0.07, now + 2.5);
    lp.connect(g);
    g.connect(dest);
    [55, 82.41].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = i === 0 ? -8 : 9;
      o.connect(lp);
      o.start(now);
      v.track(o, Number.MAX_SAFE_INTEGER);
    });
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 60;
    lfo.connect(lfoAmt);
    lfoAmt.connect(lp.frequency);
    lfo.start(now);
    v.track(lfo, Number.MAX_SAFE_INTEGER);
    void st;
    this.musicVoice(v);
  }
}
