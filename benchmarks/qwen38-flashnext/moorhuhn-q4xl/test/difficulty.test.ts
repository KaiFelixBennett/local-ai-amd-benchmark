import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, DifficultyDirector, type DirectorInput } from '../src/game/DifficultyDirector';

function input(overrides: Partial<DirectorInput> = {}): DirectorInput {
  return {
    accuracy: 0.55,
    shots: 0,
    combo: 0,
    bestCombo: 0,
    avgReaction: -1,
    escapesRecent: 0,
    elapsed: 0,
    duration: 120,
    zen: false,
    ...overrides,
  };
}

describe('DifficultyDirector', () => {
  it('exposes derived knobs from the factor', () => {
    const d = new DifficultyDirector({}, 1); // fixed factor = 1
    expect(d.spawnRate).toBeCloseTo(0.75 + 0.45);
    expect(d.speedScale).toBeCloseTo(0.8 + 0.25);
    expect(d.maxConcurrent).toBe(5); // round(2 + 3.2) = 5
  });

  it('fixed difficulty is returned verbatim (within clamp) forever', () => {
    const d = new DifficultyDirector({}, 1.1);
    for (let i = 0; i < 20; i++) {
      expect(d.update(input({ elapsed: i * 10, accuracy: 0.1, zen: true }))).toBeCloseTo(1.1);
    }
  });

  it('fixed difficulty outside the clamp range is clamped, not honored blindly', () => {
    expect(new DifficultyDirector({}, 9).update(input())).toBe(DEFAULT_TUNING.max);
    expect(new DifficultyDirector({}, -9).update(input())).toBe(DEFAULT_TUNING.min);
  });

  it('ramps with elapsed time towards base + rate * minutes', () => {
    const d = new DifficultyDirector();
    const first = d.update(input({ elapsed: 0 }));
    // target 1.0 == factor 1.0 => smoothing keeps it at baseline
    expect(first).toBeCloseTo(1);
    let value = first;
    for (let i = 0; i < 400; i++) value = d.update(input({ elapsed: 300 }));
    // 5 minutes * 0.12/min => target 1.6
    expect(value).toBeCloseTo(1.6, 2);
  });

  it('hard-clamps at the tuning bounds', () => {
    const d = new DifficultyDirector({ base: 1.5, ratePerMinute: 1 });
    let value = 1.5;
    for (let i = 0; i < 100; i++) {
      value = d.update(input({ elapsed: 600, accuracy: 1, shots: 100, combo: 30, avgReaction: 0.1 }));
    }
    expect(value).toBe(DEFAULT_TUNING.max);

    const low = new DifficultyDirector({ base: 0.7 });
    let lv = 0.7;
    for (let i = 0; i < 100; i++) {
      lv = low.update(input({ elapsed: 0, accuracy: 0, shots: 50, combo: 0, avgReaction: 5, escapesRecent: 20 }));
    }
    expect(lv).toBe(DEFAULT_TUNING.min);
  });

  it('zen pressure sits clearly below normal pressure', () => {
    const normal = new DifficultyDirector();
    const zen = new DifficultyDirector();
    let vn = 1;
    let vz = 1;
    for (let i = 0; i < 50; i++) {
      vn = normal.update(input({ elapsed: 60, shots: 30, accuracy: 0.55 }));
      vz = zen.update(input({ elapsed: 60, shots: 30, accuracy: 0.55, zen: true }));
    }
    expect(vz).toBeLessThan(vn);
    expect(vn - vz).toBeGreaterThan(0.2);
  });

  it('good accuracy raises the target, bad accuracy lowers it', () => {
    const good = new DifficultyDirector();
    const bad = new DifficultyDirector();
    let vg = 1;
    let vb = 1;
    for (let i = 0; i < 30; i++) {
      vg = good.update(input({ shots: 40, accuracy: 0.95 }));
      vb = bad.update(input({ shots: 40, accuracy: 0.1 }));
    }
    expect(vg).toBeGreaterThan(1);
    expect(vb).toBeLessThan(1);
  });

  it('combo builds pressure, zero combo with many shots relieves it', () => {
    const combo = new DifficultyDirector();
    const stale = new DifficultyDirector();
    const up = combo.update(input({ shots: 20, combo: 15 }));
    const down = stale.update(input({ shots: 20, combo: 0 }));
    expect(up).toBeGreaterThan(1);
    expect(down).toBeLessThan(1);
  });

  it('fast reactions add, slow reactions subtract', () => {
    const fast = new DifficultyDirector();
    const slow = new DifficultyDirector();
    expect(fast.update(input({ shots: 20, avgReaction: 0.2 }))).toBeGreaterThan(1);
    expect(slow.update(input({ shots: 20, avgReaction: 3 }))).toBeLessThan(1);
  });

  it('escaping targets ease pressure, capped at 0.25', () => {
    const some = new DifficultyDirector();
    const many = new DifficultyDirector();
    const a = some.update(input({ escapesRecent: 2 }));
    let b = 1;
    for (let i = 0; i < 40; i++) b = many.update(input({ escapesRecent: 100 }));
    expect(a).toBeLessThan(1);
    expect(b).toBeCloseTo(1 - 0.25, 2); // escape relief saturates
  });

  it('smoothing is gentle: one frame never jumps to target', () => {
    const d = new DifficultyDirector();
    // target = 1 + 0.12*10 (elapsed 600s) + 0.4 (accuracy cap) + 0.3 (combo cap) = 2.9
    const v = d.update(input({ elapsed: 600, accuracy: 1, shots: 100, combo: 30 }));
    const k = 1 - Math.exp(-0.35);
    expect(v).toBeCloseTo(1 + (2.9 - 1) * k, 4);
    expect(v).toBeLessThan(1.6); // still inside the clamp, well short of target
  });
});
