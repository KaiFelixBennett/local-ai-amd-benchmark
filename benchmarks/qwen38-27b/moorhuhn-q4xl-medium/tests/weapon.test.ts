import { describe, it, expect } from 'vitest';
import { Weapon } from '../src/core/weapon';

describe('weapon', () => {
  it('starts full and ready', () => {
    const w = new Weapon({ magazineSize: 4, autoReload: false });
    expect(w.state).toBe('ready');
    expect(w.snapshot().ammo).toBe(4);
  });

  it('decrements on fire and reports empty', () => {
    const w = new Weapon({ magazineSize: 3, autoReload: false });
    expect(w.fire(0)).toBe(true);
    expect(w.fire(1)).toBe(true);
    expect(w.fire(2)).toBe(true);
    expect(w.state).toBe('empty');
    // firing while empty with no auto-reload does nothing
    expect(w.fire(3)).toBe(false);
  });

  it('auto-reload kicks in when the last round is spent', () => {
    const w = new Weapon({ magazineSize: 2, reloadMs: 500, autoReload: true });
    w.fire(0);
    w.fire(1); // reload starts here, ends at 1 + reloadMs
    expect(w.state).toBe('reloading');
    w.tick(1 + 499); // not done
    expect(w.state).toBe('reloading');
    w.tick(1 + 500); // done
    expect(w.state).toBe('ready');
    expect(w.snapshot().ammo).toBe(2);
  });

  it('reloadProgress moves 0..1 over the reload time', () => {
    const w = new Weapon({ magazineSize: 1, reloadMs: 1000, autoReload: false });
    w.fire(0); // empty now
    w.startReload(100);
    expect(w.reloadProgress(100)).toBe(0);
    expect(w.reloadProgress(600)).toBeCloseTo(0.5);
    expect(w.reloadProgress(1100)).toBe(1);
  });

  it('infinite ammo always fires and reports Infinity', () => {
    const w = new Weapon({ infiniteAmmo: true, magazineSize: 6 });
    for (let i = 0; i < 100; i++) expect(w.fire(i)).toBe(true);
    expect(w.snapshot().ammo).toBe(Infinity);
  });

  it('cannot start a reload when already full', () => {
    const w = new Weapon({ magazineSize: 4, reloadMs: 100, autoReload: false });
    w.startReload(0);
    expect(w.state).toBe('ready'); // ignored because full
  });

  it('cancelReload aborts without refilling', () => {
    const w = new Weapon({ magazineSize: 3, reloadMs: 1000, autoReload: false });
    w.fire(0);
    w.startReload(0);
    w.cancelReload();
    expect(w.state).toBe('ready');
    expect(w.snapshot().ammo).toBe(2);
  });
});
