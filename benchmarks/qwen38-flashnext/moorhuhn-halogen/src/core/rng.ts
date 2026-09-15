import type { Rng } from '../types';

/**
 * Deterministic, seedable PRNG (mulberry32).
 * Small state (one uint32) so a round can be fully reproduced from a seed.
 */
class Mulberry32 implements Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
    if (this.s === 0) this.s = 0x9e3779b9;
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('rng.pick called with empty array');
    return arr[Math.floor(this.next() * arr.length)] as T;
  }

  weighted<T>(items: readonly { item: T; weight: number }[]): T {
    if (items.length === 0) throw new Error('rng.weighted called with empty list');
    let total = 0;
    for (const it of items) total += Math.max(0, it.weight);
    if (total <= 0) return items[0]!.item;
    let r = this.next() * total;
    for (const it of items) {
      r -= Math.max(0, it.weight);
      if (r <= 0) return it.item;
    }
    return items[items.length - 1]!.item;
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  state(): number {
    return this.s >>> 0;
  }
}

export function createRng(seed: number): Rng {
  return new Mulberry32(seed >>> 0 || 1);
}

/** FNV-1a string hash -> uint32 seed. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Combine two 32-bit seeds deterministically. */
export function mixSeeds(a: number, b: number): number {
  let h = (a >>> 0) ^ 0x51ed270b;
  h = Math.imul(h ^ (b >>> 0), 0x0165667b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return h >>> 0;
}

export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The daily challenge seed. Deterministic from the calendar date so every player on
 * the same day gets identical spawns.
 */
export function dailySeed(dateIso: string = todayIso()): number {
  const base = hashString(`mmf:daily:${dateIso}`);
  return base >>> 0 || 1;
}

/** Pretty, readable seed label, e.g. "MMF-4K9-ZQ3". */
export function seedLabel(seed: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = seed >>> 0;
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[s % alphabet.length];
    s = Math.floor(s / alphabet.length) ^ mixSeeds(seed, i + 1);
    s >>>= 0;
  }
  return `MMF-${out.slice(0, 3)}-${out.slice(3, 6)}`;
}
