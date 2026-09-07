import { describe, expect, it } from 'vitest';
import { calculateAccuracy, calculateHitScore, calculateRank } from '../src/systems/ScoringSystem';
import { BALANCE } from '../src/config/balance';

describe('calculateHitScore', () => {
  const baseCtx = {
    baseScore: 100,
    speedFactor: 1,
    depthFactor: 1,
    sizeFactor: 1,
    precision01: 0,
    comboMultiplier: 1,
    eventMultiplier: 1,
    timeRemainingFraction: 0,
    isPerfect: false,
  };

  it('returns exactly the base score with all factors neutral', () => {
    const result = calculateHitScore(baseCtx);
    expect(result.total).toBe(100);
  });

  it('rewards higher precision with a higher score', () => {
    const low = calculateHitScore({ ...baseCtx, precision01: 0 });
    const high = calculateHitScore({ ...baseCtx, precision01: 1 });
    expect(high.total).toBeGreaterThan(low.total);
  });

  it('perfect hits score strictly more than non-perfect, all else equal', () => {
    const normal = calculateHitScore({ ...baseCtx, precision01: 1 });
    const perfect = calculateHitScore({ ...baseCtx, precision01: 1, isPerfect: true });
    expect(perfect.total).toBeGreaterThan(normal.total);
  });

  it('combo multiplier scales the final score', () => {
    const noCombo = calculateHitScore({ ...baseCtx, comboMultiplier: 1 });
    const withCombo = calculateHitScore({ ...baseCtx, comboMultiplier: 2 });
    expect(withCombo.total).toBeCloseTo(noCombo.total * 2, -1);
  });

  it('never returns a negative score', () => {
    const result = calculateHitScore({ ...baseCtx, baseScore: 0, comboMultiplier: 0, eventMultiplier: 0 });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  it('breakdown always includes a base entry', () => {
    const result = calculateHitScore(baseCtx);
    expect(result.breakdown[0]).toEqual({ label: 'base', value: 100 });
  });
});

describe('calculateRank', () => {
  it('maps a very low score to D', () => {
    expect(calculateRank(0)).toBe('D');
  });

  it('maps a score at the SSS threshold to SSS', () => {
    expect(calculateRank(BALANCE.rank.thresholds.SSS)).toBe('SSS');
  });

  it('maps a score just below a threshold to the lower rank', () => {
    expect(calculateRank(BALANCE.rank.thresholds.S - 1)).toBe('A');
  });

  it('is monotonic: higher score never yields a lower rank', () => {
    const order = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
    const scores = [0, 6000, 11000, 17000, 24000, 32000, 42000];
    const ranks = scores.map((s) => calculateRank(s));
    expect(ranks).toEqual(order);
  });
});

describe('calculateAccuracy', () => {
  it('is 0 when no shots were fired', () => {
    expect(calculateAccuracy(0, 0)).toBe(0);
  });

  it('computes hits / shots', () => {
    expect(calculateAccuracy(8, 10)).toBeCloseTo(0.8);
  });

  it('is clamped to a maximum of 1', () => {
    expect(calculateAccuracy(15, 10)).toBe(1);
  });
});
