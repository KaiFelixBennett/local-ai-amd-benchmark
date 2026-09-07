/**
 * Waffensystem-Tests: Magazinfluss, Nachladen (auto + manuell),
 * unendlich vs. begrenzte Reserve, taktisches Reload.
 */
import { describe, it, expect } from 'vitest';
import { Weapon } from '../src/core/weapon';

describe('Weapon (unbegrenzt)', () => {
  it('startet mit vollem Magazin', () => {
    const w = new Weapon({ magazineSize: 6 });
    expect(w.snapshot.current).toBe(6);
    expect(w.snapshot.state).toBe('ready');
    expect(w.snapshot.totalLeft).toBe(0); // 0 = unbegrenzt
  });

  it('fire() reduziert das Magazin', () => {
    const w = new Weapon({ magazineSize: 3 });
    w.fire(0);
    w.fire(100);
    expect(w.snapshot.current).toBe(1);
  });

  it('leeres Magazin löst automatisches Nachladen aus', () => {
    const w = new Weapon({ magazineSize: 2, reloadMs: 1000, autoReload: true });
    w.fire(0);
    w.fire(100);
    w.fire(200); // Magazin leer
    expect(w.snapshot.state).toBe('reloading');
    // Nach 1000 ms voll
    w.update(1200);
    expect(w.snapshot.current).toBe(2);
    expect(w.snapshot.state).toBe('ready');
  });

  it('Reload-Progress steigt von 0 nach 1', () => {
    const w = new Weapon({ magazineSize: 2, reloadMs: 1000, autoReload: true });
    w.fire(0);
    w.fire(100);
    w.fire(200); // 2. Schuss leert Magazin -> Reload startet bei t=100
    w.update(700);
    // (700 - 100) / 1000 = 0.6
    expect(w.snapshot.reloadProgress).toBeCloseTo(0.6, 2);
  });

  it('manuelles Nachladen mit R', () => {
    const w = new Weapon({ magazineSize: 4, reloadMs: 500, autoReload: false });
    w.fire(0);
    expect(w.snapshot.current).toBe(3);
    expect(w.startReload(1000, false)).toBe(true);
    expect(w.snapshot.state).toBe('reloading');
    w.update(1600);
    expect(w.snapshot.current).toBe(4);
    expect(w.snapshot.state).toBe('ready');
  });

  it('kein Nachladen, wenn Magazin voll (unbegrenzt)', () => {
    const w = new Weapon({ magazineSize: 4 });
    expect(w.startReload(0, false)).toBe(false);
    expect(w.snapshot.state).toBe('ready');
  });

  it('taktisches Nachladen ist bei Partial-Magazin möglich', () => {
    const w = new Weapon({ magazineSize: 5 });
    w.fire(0);
    expect(w.snapshot.canTacticalReload).toBe(true);
    const w2 = new Weapon({ magazineSize: 5 });
    expect(w2.snapshot.canTacticalReload).toBe(false); // voll
  });
});

describe('Weapon (begrenzte Reserve)', () => {
  it('zieht Munition aus der Reserve beim Nachladen', () => {
    const w = new Weapon({ magazineSize: 3, reserve: 3, reloadMs: 500, autoReload: true });
    expect(w.snapshot.totalLeft).toBe(3);
    w.fire(0);
    w.fire(100);
    w.fire(200); // leer -> auto reload
    w.update(800);
    expect(w.snapshot.current).toBe(3);
    expect(w.snapshot.totalLeft).toBe(0); // Reserve aufgebraucht
  });

  it('bleibt leer, wenn Reserve aufgebraucht ist', () => {
    const w = new Weapon({ magazineSize: 2, reserve: 1, reloadMs: 500, autoReload: true });
    w.fire(0);
    w.fire(100); // leert Magazin
    w.update(700); // Reload: nimmt 1 aus Reserve
    expect(w.snapshot.current).toBe(1);
    w.fire(200); // wieder leer, keine Reserve
    w.update(2000);
    expect(w.snapshot.current).toBe(0);
    expect(w.snapshot.state).toBe('empty');
  });

  it('refill() füllt Magazin und Reserve auf', () => {
    const w = new Weapon({ magazineSize: 3, reserve: 6 });
    w.refill(9, 0);
    expect(w.snapshot.current).toBe(3);
    expect(w.snapshot.totalLeft).toBe(6);
  });

  it('reset() stellt das Magazin neu auf', () => {
    const w = new Weapon({ magazineSize: 4 });
    w.fire(0);
    w.fire(100);
    w.reset(2000);
    expect(w.snapshot.current).toBe(4);
    expect(w.snapshot.state).toBe('ready');
  });
});
