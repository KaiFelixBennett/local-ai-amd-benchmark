/**
 * RNG-Tests: Determinismus, Verteilung, fork, Shuffle.
 */
import { describe, it, expect } from 'vitest';
import { Rng, hashSeed } from '../src/core/rng';

describe('Rng', () => {
  it('ist mit gleichem Seed deterministisch', () => {
    const a = new Rng('test-seed');
    const b = new Rng('test-seed');
    for (let i = 0; i < 20; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('unterschiedliche Seeds erzeugen andere Sequenzen', () => {
    const a = new Rng('seed-a');
    const b = new Rng('seed-b');
    let diffs = 0;
    for (let i = 0; i < 20; i++) {
      if (a.next() !== b.next()) diffs++;
    }
    expect(diffs).toBeGreaterThan(10);
  });

  it('next() liegt in [0, 1)', () => {
    const r = new Rng('range');
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range() liegt in [min, max)', () => {
    const r = new Rng('range');
    for (let i = 0; i < 500; i++) {
      const v = r.range(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThan(5);
    }
  });

  it('int() liefert ganze Zahlen in [min, max]', () => {
    const r = new Rng('int');
    for (let i = 0; i < 500; i++) {
      const v = r.int(1, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
    }
  });

  it('pick() liefert nur Elemente des Arrays', () => {
    const r = new Rng('pick');
    const arr = ['a', 'b', 'c'];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(r.pick(arr));
    }
  });

  it('chance() respektiert p=0 und p=1', () => {
    const r = new Rng('chance');
    for (let i = 0; i < 50; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
  });

  it('shuffle() ist eine Permutation (deterministisch)', () => {
    const a = new Rng('shuf');
    const b = new Rng('shuf');
    const original = [1, 2, 3, 4, 5, 6, 7, 8];
    const x = [...original];
    const y = [...original];
    const sx = a.shuffle(x);
    const sy = b.shuffle(y);
    expect(sx).toEqual(sy);
    expect([...sx].sort((m, n) => m - n)).toEqual(original);
  });

  it('fork() erzeugt ein unabhängiges, aber reproduzierbares Kind-RNG', () => {
    const a = new Rng('parent');
    const b = new Rng('parent');
    a.next(); // Parent-Stream verschieben
    const ka = a.fork('child');
    const kb = b.fork('child');
    for (let i = 0; i < 10; i++) {
      expect(ka.next()).toBe(kb.next());
    }
  });

  it('hashSeed ist stabil und 32-bit', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('xyz')).not.toBe(hashSeed('abc'));
    expect(hashSeed('anything')).toBeLessThanOrEqual(0xffffffff);
  });
});
