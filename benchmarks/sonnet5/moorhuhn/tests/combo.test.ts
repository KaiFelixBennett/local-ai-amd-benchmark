import { describe, expect, it } from 'vitest';
import { ComboSystem } from '../src/systems/ComboSystem';
import { BALANCE } from '../src/config/balance';

describe('ComboSystem', () => {
  it('starts at zero combo and 1x multiplier', () => {
    const combo = new ComboSystem();
    expect(combo.getCount()).toBe(0);
    expect(combo.getMultiplier()).toBe(1);
  });

  it('increments combo count on hits and raises the multiplier', () => {
    const combo = new ComboSystem();
    let snap = combo.registerHit(0);
    expect(snap.count).toBe(1);
    snap = combo.registerHit(100);
    snap = combo.registerHit(200);
    expect(snap.count).toBe(3);
    expect(snap.multiplier).toBeGreaterThan(1);
  });

  it('caps the multiplier at the configured maximum', () => {
    const combo = new ComboSystem();
    let now = 0;
    for (let i = 0; i < 500; i++) {
      now += 10;
      combo.registerHit(now);
    }
    expect(combo.getMultiplier()).toBeLessThanOrEqual(BALANCE.combo.maxMultiplier);
  });

  it('a single miss damages the combo but does not zero it out', () => {
    const combo = new ComboSystem();
    let now = 0;
    for (let i = 0; i < 10; i++) {
      now += 100;
      combo.registerHit(now);
    }
    const before = combo.getCount();
    const snap = combo.registerMiss(now + 100);
    expect(snap.count).toBeGreaterThan(0);
    expect(snap.count).toBeLessThan(before);
  });

  it('several consecutive misses fully break the combo', () => {
    const combo = new ComboSystem();
    let now = 0;
    for (let i = 0; i < 10; i++) {
      now += 100;
      combo.registerHit(now);
    }
    for (let i = 0; i < BALANCE.combo.missBreakThreshold; i++) {
      now += 100;
      combo.registerMiss(now);
    }
    expect(combo.getCount()).toBe(0);
  });

  it('a hit after a miss resets the miss streak', () => {
    const combo = new ComboSystem();
    combo.registerHit(0);
    combo.registerMiss(100);
    const snap = combo.registerHit(200);
    expect(snap.missStreak).toBe(0);
  });

  it('the combo window expires an idle combo back to zero', () => {
    const windowMs = 1000;
    const combo = new ComboSystem(windowMs);
    combo.registerHit(0);
    combo.registerHit(50);
    const snap = combo.tick(windowMs + 500);
    expect(snap.count).toBe(0);
  });

  it('reset() clears combo state completely', () => {
    const combo = new ComboSystem();
    combo.registerHit(0);
    combo.registerHit(100);
    combo.reset();
    expect(combo.getCount()).toBe(0);
    expect(combo.getMultiplier()).toBe(1);
  });
});
