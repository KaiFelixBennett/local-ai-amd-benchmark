import { describe, it, expect } from 'vitest';
import { Combo, DEFAULT_COMBO_CONFIG } from '../src/core/combo';

describe('combo', () => {
  it('registers consecutive hits and tracks max', () => {
    const c = new Combo();
    c.registerHit(false, 0);
    c.registerHit(false, 200);
    c.registerHit(false, 400);
    expect(c.combo).toBe(3);
    expect(c.maxCombo).toBe(3);
    expect(c.snapshot().hitsSinceMiss).toBe(3);
  });

  it('returns the multiplier base = combo count before the hit', () => {
    const c = new Combo();
    expect(c.registerHit(false, 0)).toBe(0); // first hit
    expect(c.registerHit(false, 100)).toBe(1);
    expect(c.registerHit(false, 200)).toBe(2);
  });

  it('tracks perfect streak separately', () => {
    const c = new Combo();
    c.registerHit(true, 0);
    c.registerHit(true, 100);
    c.registerHit(false, 200); // breaks perfect streak but not combo
    expect(c.maxPerfectStreak).toBe(2);
    expect(c.perfectStreak).toBe(0);
    expect(c.combo).toBe(3);
  });

  it('decays to zero after the window expires', () => {
    const c = new Combo({ windowMs: 500, decayPerHitMs: 0, minWindowMs: 500 });
    c.registerHit(false, 0);
    c.registerHit(false, 100);
    c.tick(1000); // long after the 500ms window
    expect(c.combo).toBe(0);
  });

  it('a miss breaks the combo when breakOnMisses=1', () => {
    const c = new Combo();
    for (let i = 0; i < 5; i++) c.registerHit(false, i * 100);
    expect(c.combo).toBe(5);
    c.registerMiss(600);
    expect(c.combo).toBe(0);
  });

  it('reset clears everything', () => {
    const c = new Combo();
    c.registerHit(true, 0);
    c.registerHit(true, 100);
    c.reset();
    const s = c.snapshot();
    expect(s.combo).toBe(0);
    expect(s.maxCombo).toBe(0);
    expect(s.perfectStreak).toBe(0);
    expect(s.hitsSinceMiss).toBe(0);
    expect(DEFAULT_COMBO_CONFIG.windowMs).toBeGreaterThan(0);
  });
});
