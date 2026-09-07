import { describe, it, expect } from 'vitest';
import { hashSeed, createRng, dailySeed, dailyLabel } from '../src/core/rng';

describe('rng', () => {
  it('hashSeed is deterministic and unsigned 32-bit', () => {
    const a = hashSeed('hello');
    const b = hashSeed('hello');
    const c = hashSeed('world');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
  });

  it('next() is uniform-ish and deterministic for a seed', () => {
    const r1 = createRng(1234);
    const r2 = createRng(1234);
    for (let i = 0; i < 50; i++) {
      expect(r1.next()).toBe(r2.next());
    }
    const r = createRng(99);
    let sum = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) sum += r.next();
    const mean = sum / n;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
  });

  it('int/range stay within bounds', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const iv = r.int(5, 10);
      expect(iv).toBeGreaterThanOrEqual(5);
      expect(iv).toBeLessThanOrEqual(10);
      const rv = r.range(0, 1);
      expect(rv).toBeGreaterThanOrEqual(0);
      expect(rv).toBeLessThan(1);
    }
  });

  it('pick returns an element and chance respects probability', () => {
    const r = createRng(42);
    for (let i = 0; i < 50; i++) {
      expect([1, 2, 3]).toContain(r.pick([1, 2, 3]));
    }
    const r2 = createRng(1);
    let trueCount = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (r2.chance(0.5)) trueCount++;
    expect(trueCount / n).toBeGreaterThan(0.45);
    expect(trueCount / n).toBeLessThan(0.55);
  });

  it('weightedIndex favours larger weights', () => {
    const r = createRng(5);
    let idx0 = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) if (r.weightedIndex([9, 1]) === 0) idx0++;
    expect(idx0 / n).toBeGreaterThan(0.8);
  });

  it('shuffle keeps the same elements', () => {
    const r = createRng(3);
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...arr];
    const out = r.shuffle(arr);
    expect(out).toBe(arr);
    expect([...arr].sort((a, b) => a - b)).toEqual(copy.sort((a, b) => a - b));
  });

  it('dailySeed is stable for a UTC date and unique across days', () => {
    const d1 = new Date(Date.UTC(2025, 0, 15));
    const d2 = new Date(Date.UTC(2025, 0, 15));
    const d3 = new Date(Date.UTC(2025, 0, 16));
    expect(dailySeed(d1)).toBe(dailySeed(d2));
    expect(dailySeed(d1)).not.toBe(dailySeed(d3));
    expect(dailyLabel(d1)).toBe('2025-01-15');
  });
});
