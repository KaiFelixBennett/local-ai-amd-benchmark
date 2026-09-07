/**
 * Deterministic, seedable PRNG (mulberry32) plus string hashing.
 * Pure module — used by the spawn director, daily challenges and tests.
 */

export type Rng = {
  /** uniform float in [0,1) */
  next(): number;
  /** integer in [min,max] inclusive */
  int(min: number, max: number): number;
  /** float in [min,max) */
  range(min: number, max: number): number;
  /** true with probability p */
  chance(p: number): boolean;
  /** random element of array */
  pick<T>(arr: readonly T[]): T;
  /** weighted pick; returns index */
  weightedIndex(weights: readonly number[]): number;
  /** shuffle in place (Fisher-Yates), returns same array */
  shuffle<T>(arr: T[]): T[];
};

/** FNV-1a 32-bit string hash -> uint32 seed. */
export function hashSeed(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG factory. Deterministic for a given seed. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    range(min, max) {
      return min + next() * (max - min);
    },
    chance(p) {
      return next() < p;
    },
    pick(arr) {
      return arr[Math.floor(next() * arr.length)];
    },
    weightedIndex(weights) {
      let total = 0;
      for (const w of weights) total += w;
      if (total <= 0) return 0;
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    }
  };
}

/**
 * Daily challenge seed: stable across machines for a given UTC date.
 * Format "YYYY-MM-DD" in UTC.
 */
export function dailySeed(date: Date = new Date()): number {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return hashSeed(`moorland-mayhem::daily::${y}-${m}-${d}`);
}

export function dailyLabel(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
