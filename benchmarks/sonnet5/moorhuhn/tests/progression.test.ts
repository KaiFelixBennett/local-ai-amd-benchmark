import { describe, expect, it } from 'vitest';
import { applyXpGain, computeRoundCurrency, computeRoundXp, xpRequiredForLevel } from '../src/systems/ProgressionManager';
import type { ProgressionState, RunStats } from '../src/core/types';

describe('xpRequiredForLevel', () => {
  it('increases with level', () => {
    expect(xpRequiredForLevel(2)).toBeGreaterThan(xpRequiredForLevel(1));
    expect(xpRequiredForLevel(10)).toBeGreaterThan(xpRequiredForLevel(5));
  });
});

describe('applyXpGain', () => {
  const start: ProgressionState = { level: 1, xp: 0, xpToNextLevel: 400, currency: 0 };

  it('accumulates xp without leveling up when below the threshold', () => {
    const result = applyXpGain(start, 100);
    expect(result.progression.level).toBe(1);
    expect(result.progression.xp).toBe(100);
    expect(result.levelsGained).toBe(0);
  });

  it('levels up exactly once when xp crosses the threshold', () => {
    const result = applyXpGain(start, 450);
    expect(result.levelsGained).toBe(1);
    expect(result.progression.level).toBe(2);
    expect(result.progression.xp).toBe(50);
  });

  it('handles multiple level-ups from one large xp gain', () => {
    const result = applyXpGain(start, 5000);
    expect(result.levelsGained).toBeGreaterThan(1);
    expect(result.progression.xp).toBeLessThan(result.progression.xpToNextLevel);
  });

  it('never applies negative xp', () => {
    const result = applyXpGain(start, -100);
    expect(result.progression.xp).toBe(0);
  });

  it('preserves currency untouched', () => {
    const result = applyXpGain({ ...start, currency: 250 }, 50);
    expect(result.progression.currency).toBe(250);
  });
});

describe('computeRoundXp', () => {
  it('is always at least the base completion xp', () => {
    const stats: RunStats = {
      score: 0,
      hits: 0,
      misses: 0,
      shotsFired: 0,
      perfectHits: 0,
      highestCombo: 0,
      mostValuableHit: 0,
      reactionTimesMs: [],
      targetTypesHit: {},
      eventBonusPoints: 0,
      chainReactionsTriggered: 0,
      bossesDefeated: 0,
      startedAt: 0,
      durationMs: 0,
    };
    expect(computeRoundXp(stats)).toBeGreaterThan(0);
  });

  it('increases with more hits and perfect hits', () => {
    const base: RunStats = {
      score: 0,
      hits: 0,
      misses: 0,
      shotsFired: 0,
      perfectHits: 0,
      highestCombo: 0,
      mostValuableHit: 0,
      reactionTimesMs: [],
      targetTypesHit: {},
      eventBonusPoints: 0,
      chainReactionsTriggered: 0,
      bossesDefeated: 0,
      startedAt: 0,
      durationMs: 0,
    };
    const withHits = computeRoundXp({ ...base, hits: 20, perfectHits: 5 });
    expect(withHits).toBeGreaterThan(computeRoundXp(base));
  });
});

describe('computeRoundCurrency', () => {
  it('awards more currency for higher ranks', () => {
    expect(computeRoundCurrency('SSS')).toBeGreaterThan(computeRoundCurrency('S'));
    expect(computeRoundCurrency('S')).toBeGreaterThan(computeRoundCurrency('D'));
  });
});
