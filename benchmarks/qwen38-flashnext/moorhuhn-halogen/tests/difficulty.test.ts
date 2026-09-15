import { describe, expect, it } from 'vitest';
import { DifficultyDirector, type DifficultyInputs } from '../src/logic/difficulty';
import { BALANCE } from '../src/config/balance';

function inputs(overrides: Partial<DifficultyInputs> = {}): DifficultyInputs {
  return {
    accuracy: 0.62,
    recentAccuracy: 0.62,
    combo: 0,
    missStreak: 0,
    avgReactionMs: 1000,
    progress: 0.5,
    sensitivity: 1,
    zen: false,
    ...overrides,
  };
}

describe('DifficultyDirector bounds', () => {
  it('uses BALANCE min/max by default', () => {
    const d = new DifficultyDirector();
    expect(d.min).toBe(BALANCE.difficulty.min);
    expect(d.max).toBe(BALANCE.difficulty.max);
    expect(d.factor).toBe(1);
  });

  it('set clamps into range', () => {
    const d = new DifficultyDirector();
    d.set(5);
    expect(d.factor).toBe(1.6);
    expect(d.target).toBe(1.6);
    d.set(-3);
    expect(d.factor).toBe(0.7);
    d.set(1.2);
    expect(d.factor).toBe(1.2);
  });

  it('factor never leaves [min,max] under extreme inputs', () => {
    const d = new DifficultyDirector();
    for (let i = 0; i < 100; i++) {
      const f = d.update(
        5,
        inputs({
          accuracy: 0.99,
          recentAccuracy: 0.99,
          combo: 99,
          missStreak: 0,
          avgReactionMs: 100,
          progress: 1,
          sensitivity: 3,
        }),
      );
      expect(f).toBeLessThanOrEqual(1.6);
      const g = d.update(
        5,
        inputs({
          accuracy: 0.01,
          recentAccuracy: 0.01,
          combo: 0,
          missStreak: 99,
          avgReactionMs: 5000,
          progress: 1,
          sensitivity: 3,
        }),
      );
      expect(g).toBeGreaterThanOrEqual(0.7);
    }
  });
});

describe('DifficultyDirector steering', () => {
  it('balanced play targets exactly 1', () => {
    const d = new DifficultyDirector();
    d.update(1, inputs());
    expect(d.target).toBeCloseTo(1, 9);
    expect(d.factor).toBeCloseTo(1, 9);
  });

  it('strong play pushes the target up', () => {
    const d = new DifficultyDirector();
    d.update(
      1,
      inputs({
        accuracy: 0.85,
        recentAccuracy: 0.9,
        combo: 12,
        avgReactionMs: 500,
        progress: 0.95,
      }),
    );
    // +0.112 (recentAcc) +0.06 (acc>0.75) +0.16 (combo, capped) +0.08 (reaction) +0.15 +0.105 (late) = 1.667 → clamps to 1.6
    expect(d.target).toBe(1.6);
  });

  it('struggling play eases the target down', () => {
    const d = new DifficultyDirector();
    d.update(
      1,
      inputs({
        accuracy: 0.2,
        recentAccuracy: 0.3,
        missStreak: 5,
        avgReactionMs: 2000,
      }),
    );
    // -0.128 -0.12 -0.25 -0.1 = 0.402 → clamps to 0.7
    expect(d.target).toBe(0.7);
  });

  it('zen flattens the target toward 1', () => {
    // Choose an input whose raw target is safely below the clamp so the 0.25 factor is exact.
    const moderate = { accuracy: 0.8, recentAccuracy: 0.8, combo: 4, avgReactionMs: 500, progress: 0.5 };
    const raw = new DifficultyDirector();
    raw.update(1, inputs(moderate));
    const zen = new DifficultyDirector();
    zen.update(1, inputs({ ...moderate, zen: true }));
    expect(raw.target).toBeGreaterThan(1.05);
    expect(raw.target).toBeLessThan(1.6);
    expect(zen.target).toBeCloseTo(1 + (raw.target - 1) * 0.25, 9);
  });

  it('sensitivity scales the deviation gently', () => {
    const strong = { accuracy: 0.85, recentAccuracy: 0.9, combo: 4, missStreak: 0, avgReactionMs: 600, progress: 0.5 };
    const a = new DifficultyDirector();
    a.update(1, inputs({ ...strong, sensitivity: 1 }));
    const b = new DifficultyDirector();
    b.update(1, inputs({ ...strong, sensitivity: 3 }));
    // sensitivity 3 multiplies (t-1) by 1+ (3-1)*0.5 = 2 → larger deviation above 1
    expect(b.target - 1).toBeCloseTo((a.target - 1) * 2, 9);
  });

  it('factor converges smoothly toward target', () => {
    const d = new DifficultyDirector();
    const strong = inputs({ accuracy: 0.9, recentAccuracy: 0.9, combo: 20, avgReactionMs: 400, progress: 1 });
    const first = d.update(1, strong);
    const target = d.target; // known after the update
    expect(first).toBeCloseTo(1 + (target - 1) * BALANCE.difficulty.rate, 6);
    let prev = first;
    for (let i = 0; i < 60; i++) {
      const f = d.update(1, strong);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = f;
    }
    expect(prev).toBeCloseTo(target, 2);
  });

  it('rate limits movement per second (small dt = small move)', () => {
    const d = new DifficultyDirector();
    const strong = inputs({ accuracy: 0.9, recentAccuracy: 0.9, combo: 20, progress: 1 });
    const small = d.update(0.01, strong);
    const movement = small - 1;
    expect(movement).toBeCloseTo((d.target - 1) * BALANCE.difficulty.rate * 0.01, 9);
  });
});
