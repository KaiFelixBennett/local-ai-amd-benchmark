/**
 * Seedable deterministic pseudo-random number generation.
 *
 * Every stochastic decision in the battle (enemy stat jitter, critical hits,
 * AI move selection, particle scatter) draws from an RNG instance created from
 * the encounter seed, so the same seed reproduces the same encounter exactly.
 */

/** Convert an arbitrary string into a 32-bit unsigned integer seed. */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 — small, fast, statistically decent 32-bit generator.
 * Returns a closure producing floats in [0, 1).
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.seed = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    this._next = mulberry32(this.seed);
    this._calls = 0;
  }

  /** Float in [0, 1). */
  next() {
    this._calls++;
    return this._next();
  }

  /** Float in [min, max). */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p (0..1). */
  chance(p) {
    return this.next() < p;
  }

  /** Random element of a non-empty array. */
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /**
   * Weighted pick. `items` is an array; `weightOf` maps an item to a positive
   * number. Falls back to a uniform pick when all weights are zero.
   */
  weighted(items, weightOf) {
    let total = 0;
    for (const it of items) total += Math.max(0, weightOf(it));
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (const it of items) {
      roll -= Math.max(0, weightOf(it));
      if (roll <= 0) return it;
    }
    return items[items.length - 1];
  }

  /** Fisher-Yates shuffle returning a new array. */
  shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }

  /** Signed jitter in [-amount, amount]. */
  jitter(amount) {
    return (this.next() * 2 - 1) * amount;
  }

  /** Derive an independent child stream (used so visual FX never desync logic). */
  fork(tag) {
    return new RNG((this.seed ^ hashSeed(tag)) >>> 0);
  }
}
