import { describe, it, expect } from 'vitest';
import { computeDifficulty, speedFactor, spawnIntervalFactor, unlockLevel } from '../src/core/difficulty';
import { DIFFICULTY } from '../src/core/difficultyParams';
import type { DifficultyInput } from '../src/core/difficulty';

const input = (over: Partial<DifficultyInput> = {}): DifficultyInput => ({
  accuracy: 0.5,
  combo: 4,
  reaction: 0.5,
  timeRemaining: 0.5,
  misses: 4,
  score: 3000,
  scoreRef: 9000,
  ...over
});

describe('difficulty', () => {
  it('value is always within the bounded band', () => {
    const cases: DifficultyInput[] = [
      input({ accuracy: 1, combo: 99, reaction: 1, timeRemaining: 0, misses: 0, score: 99999 }),
      input({ accuracy: 0, combo: 0, reaction: 0, timeRemaining: 1, misses: 99, score: 0 }),
      input()
    ];
    for (const c of cases) {
      const d = computeDifficulty(c);
      expect(d.value).toBeGreaterThanOrEqual(DIFFICULTY.min);
      expect(d.value).toBeLessThanOrEqual(DIFFICULTY.max);
    }
  });

  it('better play raises difficulty', () => {
    const good = computeDifficulty(input({ accuracy: 0.9, combo: 12, reaction: 0.9, misses: 0, score: 8000 }));
    const bad = computeDifficulty(input({ accuracy: 0.2, combo: 0, reaction: 0.2, misses: 15, score: 500 }));
    expect(good.value).toBeGreaterThan(bad.value);
  });

  it('speedFactor grows with difficulty and is >= 1', () => {
    expect(speedFactor(0)).toBe(1);
    expect(speedFactor(0.5)).toBeGreaterThan(speedFactor(0.25));
    expect(speedFactor(DIFFICULTY.max)).toBeGreaterThan(1);
  });

  it('spawnIntervalFactor shrinks with difficulty but stays positive', () => {
    expect(spawnIntervalFactor(0)).toBe(1);
    expect(spawnIntervalFactor(0.9)).toBeLessThan(spawnIntervalFactor(0.1));
    expect(spawnIntervalFactor(DIFFICULTY.max)).toBeGreaterThan(0);
  });

  it('unlockLevel is monotonic 0..4', () => {
    expect(unlockLevel(0.05)).toBe(0);
    expect(unlockLevel(0.4)).toBeGreaterThanOrEqual(unlockLevel(0.2));
    expect(unlockLevel(0.99)).toBe(4);
  });
});
