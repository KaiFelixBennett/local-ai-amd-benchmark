import { describe, expect, it } from 'vitest';
import { SeededRandom, dailySeedNumber, dailySeedString, seedFromString } from '../src/core/rng';

describe('SeededRandom', () => {
  it('produces the same sequence for the same seed', () => {
    const a = new SeededRandom(12345);
    const b = new SeededRandom(12345);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    const seqA = Array.from({ length: 10 }, () => a.next());
    const seqB = Array.from({ length: 10 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('next() stays within [0, 1)', () => {
    const rng = new SeededRandom(999);
    for (let i = 0; i < 500; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('intRange is inclusive on both ends and deterministic', () => {
    const rng = new SeededRandom(42);
    const values = new Set<number>();
    for (let i = 0; i < 200; i++) values.add(rng.intRange(1, 5));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...values)).toBeLessThanOrEqual(5);
  });

  it('pick throws on empty arrays', () => {
    const rng = new SeededRandom(1);
    expect(() => rng.pick([])).toThrow();
  });

  it('pickWeighted favors higher weights over many draws', () => {
    const rng = new SeededRandom(7);
    const items = ['a', 'b'] as const;
    const counts = { a: 0, b: 0 };
    for (let i = 0; i < 2000; i++) {
      counts[rng.pickWeighted(items, [9, 1])] += 1;
    }
    expect(counts.a).toBeGreaterThan(counts.b);
  });

  it('fork derives a stable, distinct child RNG from a label', () => {
    const parentA = new SeededRandom(555);
    const parentB = new SeededRandom(555);
    const childA = parentA.fork('spawn');
    const childB = parentB.fork('spawn');
    expect(childA.next()).toBe(childB.next());
  });
});

describe('daily seed helpers', () => {
  it('seedFromString is deterministic', () => {
    expect(seedFromString('hello')).toBe(seedFromString('hello'));
    expect(seedFromString('hello')).not.toBe(seedFromString('world'));
  });

  it('dailySeedString formats as YYYY-MM-DD in UTC', () => {
    const date = new Date(Date.UTC(2026, 0, 5, 23, 59));
    expect(dailySeedString(date)).toBe('2026-01-05');
  });

  it('dailySeedNumber is reproducible for the same calendar day', () => {
    const d1 = new Date(Date.UTC(2026, 5, 1, 1, 0));
    const d2 = new Date(Date.UTC(2026, 5, 1, 22, 0));
    expect(dailySeedNumber(d1)).toBe(dailySeedNumber(d2));
  });

  it('dailySeedNumber differs across days', () => {
    const d1 = new Date(Date.UTC(2026, 5, 1));
    const d2 = new Date(Date.UTC(2026, 5, 2));
    expect(dailySeedNumber(d1)).not.toBe(dailySeedNumber(d2));
  });
});
