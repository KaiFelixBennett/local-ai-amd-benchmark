/**
 * Deterministische Zufallsgeneratoren auf Basis von mulberry32.
 * Seed-basiert, reproduzierbar — Grundlage für Daily Challenges und
 * deterministische Spawns.
 */

export class Rng {
  private state: number;
  readonly seed: string;

  constructor(seed: number | string) {
    this.seed = String(seed);
    let s = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0;
    if (s === 0) s = 0x9e3779b9;
    this.state = s;
  }

  /** Gleichverteilte Zahl in [0, 1). */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Gleichverteilt in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Ganzzahlig in [min, max] (beide inclusive). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** Zufälliges Element aus einem Array. */
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** True mit Wahrscheinlichkeit p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** In-place Fisher-Yates-Shuffle. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /** Ableitetes, deterministisches Kind-RNG. */
  fork(suffix: string): Rng {
    return new Rng(`${this.seed}::${suffix}`);
  }
}

/** FNV-1a 32-Bit-Hash: String -> 32-Bit-Zahl. */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Seed für die Daily Challenge: gleiche Daten (lokale Zeit) -> gleiche Runde.
 */
export function dailyChallengeSeed(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `featherstorm-daily-${y}-${m}-${d}`;
}

/** Tagsschlüssel (YYYY-MM-DD) für die Daily-Bestwert-Speicherung. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
