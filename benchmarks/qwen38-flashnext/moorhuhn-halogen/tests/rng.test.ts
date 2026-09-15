import { describe, expect, it } from 'vitest';
import { createRng, dailySeed, hashString, mixSeeds, seedLabel, todayIso } from '../src/core/rng';

describe('rng determinism', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 10 }, () => createRng(1).next());
    const b = Array.from({ length: 10 }, () => createRng(2).next());
    expect(a).not.toEqual(b);
  });

  it('maps seed 0 to seed 1 (avoid zero state)', () => {
    const a = createRng(0);
    const b = createRng(1);
    for (let i = 0; i < 10; i++) expect(a.next()).toBe(b.next());
  });

  it('emits values in [0, 1)', () => {
    const rng = createRng(999);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('rng helpers', () => {
  it('range stays within bounds', () => {
    const rng = createRng(42);
    for (let i = 0; i < 500; i++) {
      const v = rng.range(-3.5, 7.25);
      expect(v).toBeGreaterThanOrEqual(-3.5);
      expect(v).toBeLessThan(7.25);
    }
  });

  it('int stays within inclusive bounds', () => {
    const rng = createRng(4242);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = rng.int(4, 8);
      expect(v).toBeGreaterThanOrEqual(4);
      expect(v).toBeLessThanOrEqual(8);
      expect(Number.isInteger(v)).toBe(true);
      seen.add(v);
    }
    // With 500 samples across 5 values, all should show up.
    expect(seen.size).toBe(5);
  });

  it('chance roughly follows probability', () => {
    const rng = createRng(2024);
    let hits = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) if (rng.chance(0.3)) hits++;
    const p = hits / n;
    expect(p).toBeGreaterThan(0.27);
    expect(p).toBeLessThan(0.33);
  });

  it('pick throws on empty arrays', () => {
    const rng = createRng(7);
    expect(() => rng.pick([])).toThrow();
  });

  it('weighted respects weights (never picks zero-weight items)', () => {
    const rng = createRng(123456);
    const items = [
      { item: 'a', weight: 1 },
      { item: 'b', weight: 0 },
      { item: 'c', weight: 3 },
    ];
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(rng.weighted(items));
    expect(seen.has('b')).toBe(false);
    expect(seen.has('a')).toBe(true);
    expect(seen.has('c')).toBe(true);
  });

  it('weighted with all-zero weights returns first item', () => {
    const rng = createRng(5);
    const got = rng.weighted([
      { item: 'x', weight: 0 },
      { item: 'y', weight: 0 },
    ]);
    expect(got).toBe('x');
  });

  it('shuffle is deterministic and preserves elements', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = createRng(77).shuffle(input);
    const b = createRng(77).shuffle(input);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(input);
  });
});

describe('hashing and seeds', () => {
  it('hashString is stable and unsigned 32-bit', () => {
    const h1 = hashString('moorland');
    const h2 = hashString('moorland');
    expect(h1).toBe(h2);
    expect(h1).toBeGreaterThanOrEqual(0);
    expect(h1).toBeLessThanOrEqual(0xffffffff);
    expect(hashString('moorland!')).not.toBe(h1);
    expect(hashString('')).toBe(0x811c9dc5);
  });

  it('mixSeeds is stable and order-independent (hash-style)', () => {
    expect(mixSeeds(1, 2)).toBe(mixSeeds(1, 2));
    // The mixer is an XOR/ multiply hash, symmetric in its inputs by design.
    expect(mixSeeds(1, 2)).toBe(mixSeeds(2, 1));
    // Different companions produce different mixes.
    expect(mixSeeds(1, 2)).not.toBe(mixSeeds(1, 3));
  });

  it('dailySeed is equal for the same date and different across dates', () => {
    expect(dailySeed('2025-01-01')).toBe(dailySeed('2025-01-01'));
    expect(dailySeed('2025-01-01')).not.toBe(dailySeed('2025-01-02'));
  });

  it('dailySeed never returns 0', () => {
    // Even a date whose hash collides with 0 must be normalized.
    for (const d of ['2000-01-01', '2025-07-07', '1999-12-31']) {
      expect(dailySeed(d)).not.toBe(0);
    }
  });

  it('todayIso formats as yyyy-mm-dd', () => {
    const iso = todayIso(new Date(2025, 0, 5));
    expect(iso).toBe('2025-01-05');
    const iso2 = todayIso(new Date(2025, 10, 23));
    expect(iso2).toBe('2025-11-23');
  });
});

describe('seedLabel', () => {
  it('has the MMF-XXX-XXX shape', () => {
    const label = seedLabel(dailySeed('2025-01-01'));
    expect(label).toMatch(/^MMF-[A-Z0-9]{3}-[A-Z0-9]{3}$/);
  });

  it('is deterministic', () => {
    expect(seedLabel(4242)).toBe(seedLabel(4242));
  });

  it('avoids ambiguous characters (no I, O, 0, 1)', () => {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let s = 1; s < 200; s++) {
      const label = seedLabel(s * 7919);
      const body = label.replace('MMF-', '').replace(/-/g, '');
      for (const ch of body) {
        expect(alphabet).toContain(ch);
      }
    }
  });
});
