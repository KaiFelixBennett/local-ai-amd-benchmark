/**
 * core/rng.js — Seedable RNG + shared pure math helpers.
 *
 * Every random decision in the game (crits, AI choices, enemy stat rolls,
 * particle jitter) flows through a single mulberry32 stream so that a fixed
 * seed reproduces the exact same encounter. No THREE or DOM dependencies.
 */

/**
 * Mulberry32 PRNG. Deterministic for a given seed, full 32-bit period,
 * cheap enough to call hundreds of times per frame.
 */
export class Rng {
  constructor(seed = 1) {
    this.seed = seed >>> 0;
    this._state = this.seed || 0x9e3779b9;
  }

  /** Re-seed the stream (used on restart so a "new seed" run differs). */
  reseed(seed) {
    this.seed = seed >>> 0;
    this._state = this.seed || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  next() {
    this._state = (this._state + 0x6d2b79f5) >>> 0;
    let t = this._state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + (max - min) * this.next();
  }

  /** Int in [min, max] inclusive. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }

  /** Pick a random element from a non-empty array. */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** Pick `n` unique elements from arr (n <= arr.length). */
  sample(arr, n) {
    const pool = arr.slice();
    const out = [];
    while (out.length < n && pool.length > 0) {
      out.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]);
    }
    return out;
  }

  /** Weighted pick. entries: [{value, weight}]. Returns value. */
  weighted(entries) {
    let total = 0;
    for (const e of entries) total += e.weight;
    if (total <= 0) return entries[0] ? entries[0].value : null;
    let roll = this.next() * total;
    for (const e of entries) {
      roll -= e.weight;
      if (roll <= 0) return e.value;
    }
    return entries[entries.length - 1].value;
  }
}

// ---------------------------------------------------------------------------
// Pure math helpers
// ---------------------------------------------------------------------------

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

export const lerp = (a, b, t) => a + (b - a) * t;

export const invLerp = (a, b, v) => (b - a === 0 ? 0 : (v - a) / (b - a));

/**
 * Frame-rate independent exponential approach: moves `current` toward `target`
 * at a speed where `t` is the fraction of the remaining gap covered each
 * second (t=1 -> instant, t=0.05 -> slow). Uses exp so it is identical at any
 * frame rate.
 */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));

/**
 * Time-based spring integrator (semi-implicit Euler, substepped for stability).
 * state = { p, v } (scalars). Used for UI-ish camera wobble and character
 * squash; never for combat timing.
 */
export function stepSpring(state, target, { stiffness = 60, damping = 12, dt } = {}) {
  const maxSub = 1 / 240;
  let remaining = Math.min(Math.max(dt, 0), 0.1);
  while (remaining > 1e-6) {
    const h = Math.min(remaining, maxSub);
    const force = -stiffness * (state.p - target) - damping * state.v;
    state.v += force * h;
    state.p += state.v * h;
    remaining -= h;
  }
}

/** Shortest signed angular difference a->b in radians, in [-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Rotate point (x,z) around origin by ang (radians), returns [x, z]. */
export function rotateXZ(x, z, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [x * c - z * s, x * s + z * c];
}

/** Human-readable ms -> "1.23s". */
export const fmtSec = (ms) => (ms / 1000).toFixed(2) + 's';
