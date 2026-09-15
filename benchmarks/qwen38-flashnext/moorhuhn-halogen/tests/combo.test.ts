import { describe, expect, it } from 'vitest';
import { ComboTracker } from '../src/logic/combo';

function tracker(windowMs = 3200, drain = 0.5): ComboTracker {
  return new ComboTracker({ windowMs, drainPerMiss: drain });
}

describe('ComboTracker building', () => {
  it('starts at zero', () => {
    const c = tracker();
    expect(c.combo).toBe(0);
    expect(c.multiplier).toBe(1);
    expect(c.hitsWithoutMiss).toBe(0);
    expect(c.windowFraction).toBe(0);
  });

  it('builds combo on hits and refreshes the window', () => {
    const c = tracker();
    c.registerHit(false);
    c.registerHit(true);
    c.registerHit(false);
    expect(c.combo).toBe(3);
    expect(c.hitsWithoutMiss).toBe(3);
    expect(c.windowFraction).toBe(1);
    expect(c.bestCombo).toBe(3);
  });

  it('tracks perfect streaks, resetting on a non-perfect hit', () => {
    const c = tracker();
    c.registerHit(true);
    c.registerHit(true);
    c.registerHit(true);
    expect(c.perfectStreak).toBe(3);
    c.registerHit(false);
    expect(c.perfectStreak).toBe(0);
    expect(c.bestPerfectStreak).toBe(3);
    c.registerHit(true);
    expect(c.perfectStreak).toBe(1);
    expect(c.bestPerfectStreak).toBe(3);
  });

  it('multiplier follows comboMultiplier', () => {
    const c = tracker();
    for (let i = 0; i < 10; i++) c.registerHit(false);
    expect(c.multiplier).toBeCloseTo(2.0, 5); // 1 + 10*0.1
  });

  it('minimum window is clamped to 250ms', () => {
    const c = new ComboTracker({ windowMs: 50, drainPerMiss: 0.5 });
    c.registerHit(false);
    // With the 250ms floor, 200ms should not expire the combo yet.
    expect(c.update(200)).toEqual({});
    expect(c.combo).toBe(1);
  });
});

describe('ComboTracker misses', () => {
  it('a miss keeps half the combo at drain 0.5', () => {
    const c = tracker();
    for (let i = 0; i < 8; i++) c.registerHit(false);
    const wasBig = c.registerMiss();
    expect(wasBig).toBe(false); // wasBig requires combo >= 10
    expect(c.combo).toBe(4);
    expect(c.hitsWithoutMiss).toBe(0);
    expect(c.perfectStreak).toBe(0);
  });

  it('reports big combos (>=10) breaking', () => {
    const c = tracker();
    for (let i = 0; i < 12; i++) c.registerHit(false);
    expect(c.registerMiss()).toBe(true);
    expect(c.combo).toBe(6);
  });

  it('small combo + full drain breaks to zero with empty window', () => {
    const c = tracker(1000, 1);
    c.registerHit(false);
    c.registerMiss();
    expect(c.combo).toBe(0);
    expect(c.windowFraction).toBe(0);
  });

  it('a miss on a zero combo is a no-op returning false', () => {
    const c = tracker();
    expect(c.registerMiss()).toBe(false);
    expect(c.combo).toBe(0);
  });

  it('after a miss, the remaining combo gets a short window (35%)', () => {
    const c = tracker(1000, 0.5);
    for (let i = 0; i < 4; i++) c.registerHit(false);
    c.registerMiss(); // combo 2 kept
    expect(c.windowFraction).toBeCloseTo(0.35, 5);
  });
});

describe('ComboTracker decay', () => {
  it('expires after the window drains', () => {
    const c = tracker(1000, 0.5);
    c.registerHit(false);
    expect(c.update(500)).toEqual({});
    expect(c.combo).toBe(1);
    const tick = c.update(600);
    expect(tick.expired).toBe(true);
    expect(c.combo).toBe(0);
    expect(c.hitsWithoutMiss).toBe(0);
    expect(c.perfectStreak).toBe(0);
  });

  it('does not report expiry twice', () => {
    const c = tracker(1000, 0.5);
    c.registerHit(false);
    c.update(1100);
    const tick = c.update(500);
    expect(tick.expired).toBeFalsy();
  });

  it('update on a zero combo is inert', () => {
    const c = tracker();
    expect(c.update(5000)).toEqual({});
    expect(c.windowFraction).toBe(0);
  });

  it('windowFraction decays linearly', () => {
    const c = tracker(1000, 0.5);
    c.registerHit(false);
    c.update(250);
    expect(c.windowFraction).toBeCloseTo(0.75, 5);
  });

  it('reset clears everything but keeps the best records', () => {
    const c = tracker();
    for (let i = 0; i < 15; i++) c.registerHit(true);
    c.reset();
    expect(c.combo).toBe(0);
    expect(c.perfectStreak).toBe(0);
    expect(c.bestCombo).toBe(15);
    expect(c.bestPerfectStreak).toBe(15);
  });
});
