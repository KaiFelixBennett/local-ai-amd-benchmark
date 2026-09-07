/**
 * Deterministic seeded pseudo-random number generator (mulberry32).
 * Used for the Daily Challenge mode and for reproducible spawn/trajectory
 * decisions so that a given seed always produces the exact same round.
 */
export class SeededRandom {
  private state: number;
  public readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }

  /** Returns a float in [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns a float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] (inclusive on both ends). */
  intRange(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Returns true with the given probability (0..1). */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** Picks a random element from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('SeededRandom.pick: cannot pick from an empty array');
    }
    const idx = Math.floor(this.next() * items.length);
    return items[Math.min(idx, items.length - 1)] as T;
  }

  /** Picks a weighted-random element. `weights` must be the same length as `items`. */
  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return this.pick(items);
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i] ?? 0;
      if (roll <= 0) return items[i] as T;
    }
    return items[items.length - 1] as T;
  }

  /** Fisher-Yates shuffle, returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = arr[i] as T;
      arr[i] = arr[j] as T;
      arr[j] = tmp;
    }
    return arr;
  }

  /** Creates an independent child RNG derived from this one (stable given the label). */
  fork(label: string): SeededRandom {
    let hash = this.seed;
    for (let i = 0; i < label.length; i++) {
      hash = (Math.imul(hash ^ label.charCodeAt(i), 2654435761) | 0) >>> 0;
    }
    return new SeededRandom(hash ^ Math.floor(this.next() * 0xffffffff));
  }
}

/** Builds a deterministic 32-bit seed from a string, e.g. a date string. */
export function seedFromString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Returns today's Daily Challenge seed string in the form "YYYY-MM-DD", UTC-based. */
export function dailySeedString(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Builds the daily challenge RNG seed number from a date. */
export function dailySeedNumber(date: Date = new Date()): number {
  return seedFromString(`moorland-mayhem-daily-${dailySeedString(date)}`);
}
