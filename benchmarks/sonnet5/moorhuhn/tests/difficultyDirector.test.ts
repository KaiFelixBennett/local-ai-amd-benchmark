import { describe, expect, it } from 'vitest';
import { DifficultyDirector } from '../src/systems/DifficultyDirector';
import { BALANCE } from '../src/config/balance';

const baseMetrics = {
  accuracy: 0.62,
  comboCount: 0,
  avgReactionTimeMs: 500,
  missStreak: 0,
  timeRemainingFraction: 0.5,
};

describe('DifficultyDirector', () => {
  it('starts at a neutral factor of 1.0', () => {
    const director = new DifficultyDirector();
    expect(director.getFactor()).toBe(1.0);
  });

  it('does not re-evaluate before the evaluation interval has elapsed', () => {
    const director = new DifficultyDirector();
    director.update(0, { ...baseMetrics, accuracy: 0.95 });
    const factor = director.update(100, { ...baseMetrics, accuracy: 0.95 });
    expect(factor).toBe(1.0);
  });

  it('increases difficulty for a consistently high-accuracy player', () => {
    const director = new DifficultyDirector();
    let now = 0;
    let factor = 1.0;
    for (let i = 0; i < 10; i++) {
      now += BALANCE.difficultyDirector.evaluateIntervalMs + 1;
      factor = director.update(now, { ...baseMetrics, accuracy: 0.95, comboCount: 20 });
    }
    expect(factor).toBeGreaterThan(1.0);
  });

  it('decreases difficulty for a struggling player', () => {
    const director = new DifficultyDirector();
    let now = 0;
    let factor = 1.0;
    for (let i = 0; i < 10; i++) {
      now += BALANCE.difficultyDirector.evaluateIntervalMs + 1;
      factor = director.update(now, { ...baseMetrics, accuracy: 0.15, missStreak: 3 });
    }
    expect(factor).toBeLessThan(1.0);
  });

  it('never exceeds the configured maximum factor', () => {
    const director = new DifficultyDirector();
    let now = 0;
    let factor = 1.0;
    for (let i = 0; i < 200; i++) {
      now += BALANCE.difficultyDirector.evaluateIntervalMs + 1;
      factor = director.update(now, { ...baseMetrics, accuracy: 1, comboCount: 999 });
    }
    expect(factor).toBeLessThanOrEqual(BALANCE.difficultyDirector.maxFactor);
  });

  it('never drops below the configured minimum factor', () => {
    const director = new DifficultyDirector();
    let now = 0;
    let factor = 1.0;
    for (let i = 0; i < 200; i++) {
      now += BALANCE.difficultyDirector.evaluateIntervalMs + 1;
      factor = director.update(now, { ...baseMetrics, accuracy: 0, missStreak: 10 });
    }
    expect(factor).toBeGreaterThanOrEqual(BALANCE.difficultyDirector.minFactor);
  });

  it('reset() returns the factor to neutral', () => {
    const director = new DifficultyDirector();
    director.update(BALANCE.difficultyDirector.evaluateIntervalMs + 1, { ...baseMetrics, accuracy: 1 });
    director.reset();
    expect(director.getFactor()).toBe(1.0);
  });
});
