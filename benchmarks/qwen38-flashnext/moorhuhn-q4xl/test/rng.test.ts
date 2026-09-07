import { describe, expect, it } from 'vitest';
import { dailySeed, hashString, Rng, todayKey } from '../src/core/Rng';

function seq(seed: number, n: number): number[] {
  const rng = new Rng(seed);
  return Array.from({ length: n }, () => rng.next());
}

describe('Rng (mulberry32)', () => {
  it('produces the identical stream for the same seed', () => {
    expect(seq(123, 25)).toEqual(seq(123, 25));
  });

  it('produces different streams for different seeds', () => {
    expect(seq(1, 10)).not.toEqual(seq(2, 10));
  });

  it('stays inside [0,1) and never degenerates for seed 0', () => {
    for (const v of seq(0, 50)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(seq(0, 50)).size).toBeGreaterThan(40);
  });

  it('range/in respect bounds', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 200; i++) {
      const r = rng.range(2, 5);
      expect(r).toBeGreaterThanOrEqual(2);
      expect(r).toBeLessThan(5);
      const k = rng.int(-3, 4);
      expect(k).toBeGreaterThanOrEqual(-3);
      expect(k).toBeLessThan(4);
      expect(Number.isInteger(k)).toBe(true);
    }
  });

  it('chance(0) is always false and chance(1) always true', () => {
    const rng = new Rng(11);
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
  });

  it('pick covers the array and rejects nothing out of range', () => {
    const rng = new Rng(99);
    const items = ['a', 'b', 'c'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(rng.pick(items));
    expect([...seen].sort()).toEqual(['a', 'b', 'c']);
  });

  it('weighted honours zero weights and returns 0 for an empty total', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 50; i++) expect(rng.weighted([0, 1, 0])).toBe(1);
    expect(rng.weighted([0, 0, 0])).toBe(0);
  });

  it('weighted distribution roughly follows the weights', () => {
    const rng = new Rng(1234);
    const counts = [0, 0];
    for (let i = 0; i < 2000; i++) counts[rng.weighted([1, 3])]++;
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[0] / 2000).toBeCloseTo(0.25, 1);
  });

  it('shuffle permutes deterministically without losing elements', () => {
    const a = new Rng(8).shuffle([1, 2, 3, 4, 5, 6]);
    const b = new Rng(8).shuffle([1, 2, 3, 4, 5, 6]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('sign returns only -1 or +1 and both occur', () => {
    const rng = new Rng(17);
    const seen = new Set<1 | -1>();
    for (let i = 0; i < 50; i++) seen.add(rng.sign());
    expect([...seen].sort()).toEqual([-1, 1]);
  });
});

describe('hashString / dailySeed / todayKey', () => {
  it('hashString is stable FNV-1a uint32', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(hashString('a'));
    expect(hashString('a')).not.toBe(hashString('b'));
    expect(hashString('x')).toBeGreaterThan(0);
  });

  it('dailySeed is reproducible and date-specific', () => {
    const a = dailySeed('2026-09-03');
    const b = dailySeed('2026-09-03');
    const c = dailySeed('2026-09-04');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('dailySeed stays inside 1..1000000007', () => {
    for (const key of ['2020-01-01', '2026-09-03', '2038-12-31']) {
      const s = dailySeed(key);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(1000000007);
    }
  });

  it('dailySeed yields a usable rng (non-zero, streams differ per day)', () => {
    expect(new Rng(dailySeed('2026-09-03')).seedState).not.toBe(0);
    expect(seq(dailySeed('2026-09-03'), 5)).not.toEqual(seq(dailySeed('2026-09-04'), 5));
  });

  it('todayKey formats a local date with zero padding', () => {
    expect(todayKey(new Date(2026, 8, 3))).toBe('2026-09-03');
    expect(todayKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});
