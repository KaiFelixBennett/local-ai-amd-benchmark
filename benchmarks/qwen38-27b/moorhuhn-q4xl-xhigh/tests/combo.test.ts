/**
 * Combo-Tracker-Tests: Fenster, Meilensteine, Fehlschuss-Bestrafung,
 * Zen-Modus, tick()-Ablauf.
 */
import { describe, it, expect } from 'vitest';
import { ComboTracker } from '../src/core/combo';

describe('ComboTracker', () => {
  it('baut die Combo durch Treffer auf', () => {
    const c = new ComboTracker({ windowMs: 4000 });
    c.reset(0);
    c.registerHit(100);
    c.registerHit(200);
    expect(c.combo).toBe(2);
    expect(c.maxCombo).toBe(2);
  });

  it('Meilensteine bei 5 und jeder zehnten Combo', () => {
    const c = new ComboTracker({ windowMs: 10000 });
    c.reset(0);
    const milestones: number[] = [];
    c.onMilestone = (n) => milestones.push(n);
    for (let i = 0; i < 21; i++) {
      c.registerHit(i * 100);
    }
    expect(milestones).toEqual([5, 10, 20]);
  });

  it('abgelaufenes Fenster setzt die Combo auf 0 (via tick)', () => {
    const c = new ComboTracker({ windowMs: 1000 });
    c.reset(0);
    let expired = 0;
    c.onWindowExpired = () => expired++;
    c.registerHit(0);
    c.registerHit(100);
    expect(c.tick(500)).toBe(false);
    expect(c.tick(2500)).toBe(true);
    expect(c.combo).toBe(0);
    expect(expired).toBe(1);
  });

  it('Treffer nach abgelaufenem Fenster startet neu', () => {
    const c = new ComboTracker({ windowMs: 1000 });
    c.reset(0);
    c.registerHit(0);
    c.registerHit(5000); // Fenster lang vorbei
    expect(c.combo).toBe(1);
  });

  it('Fehlschuss halbiert die Combo (Standard)', () => {
    const c = new ComboTracker({ windowMs: 4000, missRetainFactor: 0.5 });
    c.reset(0);
    for (let i = 0; i < 8; i++) c.registerHit(i * 100);
    expect(c.registerMiss(900)).toBe(4);
    expect(c.combo).toBe(4);
  });

  it('Fehlschuss setzt Streak zurück', () => {
    const c = new ComboTracker();
    c.reset(0);
    c.registerHit(0);
    c.registerHit(100);
    expect(c.streak).toBe(2);
    c.registerMiss(200);
    expect(c.streak).toBe(0);
  });

  it('Zen-Modus: Fehlschuss beendet die Combo nicht', () => {
    const c = new ComboTracker({ zen: true });
    c.reset(0);
    c.registerHit(0);
    c.registerHit(100);
    c.registerMiss(200);
    expect(c.combo).toBe(2);
  });

  it('windowRemaining gibt den Fenster-Anteil zurück', () => {
    const c = new ComboTracker({ windowMs: 2000 });
    c.reset(0);
    c.registerHit(0);
    expect(c.windowRemaining(1000)).toBeCloseTo(0.5, 3);
    expect(c.windowRemaining(3000)).toBe(0);
  });

  it('reset stellt alles auf null', () => {
    const c = new ComboTracker();
    c.reset(0);
    c.registerHit(0);
    c.registerHit(100);
    c.reset(5000);
    expect(c.combo).toBe(0);
    expect(c.streak).toBe(0);
    expect(c.maxCombo).toBe(0);
  });
});
