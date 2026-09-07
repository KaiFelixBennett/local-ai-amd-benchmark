import { describe, expect, it } from 'vitest';
import { cumulativeXp, levelFromXp, runFeathers, runXp, xpForLevel } from '../src/core/Progress';

describe('xp curve', () => {
  it('xpForLevel is strictly increasing', () => {
    for (let l = 1; l < 10; l++) {
      expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    }
  });

  it('cumulativeXp(1) is zero and matches the sum of steps', () => {
    expect(cumulativeXp(1)).toBe(0);
    expect(cumulativeXp(4)).toBe(xpForLevel(1) + xpForLevel(2) + xpForLevel(3));
  });
});

describe('levelFromXp', () => {
  it('starts at level 1 with no progress', () => {
    const info = levelFromXp(0);
    expect(info.level).toBe(1);
    expect(info.xpIntoLevel).toBe(0);
    expect(info.xpForNext).toBe(xpForLevel(1));
    expect(info.progress).toBe(0);
  });

  it('lands exactly on level boundaries', () => {
    expect(levelFromXp(cumulativeXp(3)).level).toBe(3);
    expect(levelFromXp(cumulativeXp(3) - 1).level).toBe(2);
    expect(levelFromXp(cumulativeXp(10)).level).toBe(10);
  });

  it('progress stays inside [0, 1]', () => {
    for (const xp of [0, 1, 50, 500, 42_000, 9_999_999]) {
      const info = levelFromXp(xp);
      expect(info.progress).toBeGreaterThanOrEqual(0);
      expect(info.progress).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonic: more xp never lowers the level', () => {
    let last = 0;
    for (let xp = 0; xp <= 40_000; xp += 137) {
      const level = levelFromXp(xp).level;
      expect(level).toBeGreaterThanOrEqual(last);
      last = level;
    }
  });

  it('caps at level 99 for absurd totals', () => {
    expect(levelFromXp(50_000_000).level).toBe(99);
  });

  it('floors fractional xp', () => {
    expect(levelFromXp(10.9).xpIntoLevel).toBe(10);
  });
});

describe('run rewards', () => {
  it('runXp has a floor of 5 even for hopeless runs', () => {
    expect(runXp(0, 0, 0)).toBe(5);
  });

  it('runXp matches the published formula', () => {
    // round(1000/42)=24, round(120/10)*3=36, round(1*60)=60
    expect(runXp(1000, 1, 120)).toBe(24 + 36 + 60);
  });

  it('clamps accuracy into [0, 1]', () => {
    expect(runXp(1000, 5, 120)).toBe(runXp(1000, 1, 120));
    expect(runXp(1000, -3, 120)).toBe(runXp(1000, 0, 120));
  });

  it('runFeathers has a floor of 1', () => {
    expect(runFeathers(0, 0)).toBe(1);
  });

  it('runFeathers scores score and hits', () => {
    // round(900/900)=1 + round(40/40)=1
    expect(runFeathers(900, 40)).toBe(2);
    expect(runFeathers(9000, 400)).toBe(10 + 10);
  });
});
