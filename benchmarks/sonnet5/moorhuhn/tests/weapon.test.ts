import { describe, expect, it } from 'vitest';
import { WeaponSystem } from '../src/systems/WeaponSystem';

describe('WeaponSystem', () => {
  it('starts with a full magazine and ready status', () => {
    const weapon = new WeaponSystem({ magazineSize: 6, shotCooldownMs: 0 });
    expect(weapon.ammo).toBe(6);
    expect(weapon.getStatus(0)).toBe('ready');
  });

  it('fires and decrements ammo by one per shot', () => {
    const weapon = new WeaponSystem({ magazineSize: 6, shotCooldownMs: 0, autoReload: false });
    const result = weapon.fire(0);
    expect(result.fired).toBe(true);
    expect(weapon.ammo).toBe(5);
  });

  it('respects the shot cooldown', () => {
    const weapon = new WeaponSystem({ magazineSize: 6, shotCooldownMs: 100, autoReload: false });
    weapon.fire(0);
    const tooSoon = weapon.fire(50);
    expect(tooSoon.fired).toBe(false);
    const ok = weapon.fire(150);
    expect(ok.fired).toBe(true);
  });

  it('cannot fire when empty', () => {
    const weapon = new WeaponSystem({ magazineSize: 1, shotCooldownMs: 0, autoReload: false });
    weapon.fire(0);
    expect(weapon.ammo).toBe(0);
    const result = weapon.fire(10);
    expect(result.fired).toBe(false);
    expect(weapon.getStatus(10)).toBe('empty');
  });

  it('auto-reloads when the magazine empties, if enabled', () => {
    const weapon = new WeaponSystem({ magazineSize: 1, shotCooldownMs: 0, autoReload: true, reloadDurationMs: 500 });
    const result = weapon.fire(0);
    expect(result.autoReloadTriggered).toBe(true);
    expect(weapon.isReloading).toBe(true);
  });

  it('does not auto-reload when disabled (precision mode)', () => {
    const weapon = new WeaponSystem({ magazineSize: 1, shotCooldownMs: 0, autoReload: false });
    weapon.fire(0);
    expect(weapon.isReloading).toBe(false);
    expect(weapon.getStatus(0)).toBe('empty');
  });

  it('manual reload refills the magazine after the reload duration', () => {
    const weapon = new WeaponSystem({
      magazineSize: 6,
      shotCooldownMs: 0,
      autoReload: false,
      reloadDurationMs: 1000,
    });
    weapon.fire(0);
    weapon.fire(10);
    expect(weapon.ammo).toBe(4);
    const started = weapon.startReload(20);
    expect(started).toBe(true);
    expect(weapon.getStatus(20)).toBe('reloading');
    const completedEarly = weapon.update(500);
    expect(completedEarly).toBe(false);
    const completed = weapon.update(1050);
    expect(completed).toBe(true);
    expect(weapon.ammo).toBe(6);
    expect(weapon.getStatus(1050)).toBe('ready');
  });

  it('cannot fire while reloading', () => {
    const weapon = new WeaponSystem({ magazineSize: 6, shotCooldownMs: 0, autoReload: false });
    weapon.fire(0); // create room in the magazine so startReload actually engages
    weapon.startReload(0);
    const result = weapon.fire(10);
    expect(result.fired).toBe(false);
  });

  it('cancelReload stops an in-progress reload, keeping current ammo', () => {
    const weapon = new WeaponSystem({ magazineSize: 6, shotCooldownMs: 0, autoReload: false });
    weapon.fire(0);
    weapon.startReload(10);
    weapon.cancelReload();
    expect(weapon.isReloading).toBe(false);
    expect(weapon.ammo).toBe(5);
  });

  it('reloadProgress01 tracks 0..1 across the reload duration', () => {
    const weapon = new WeaponSystem({
      magazineSize: 6,
      shotCooldownMs: 0,
      autoReload: false,
      reloadDurationMs: 1000,
    });
    weapon.fire(0);
    weapon.startReload(0);
    expect(weapon.reloadProgress01(0)).toBe(0);
    expect(weapon.reloadProgress01(500)).toBeCloseTo(0.5);
    expect(weapon.reloadProgress01(1000)).toBe(1);
  });

  it('limited ammo mode runs out of reserve magazines', () => {
    const weapon = new WeaponSystem({
      magazineSize: 1,
      shotCooldownMs: 0,
      autoReload: false,
      limitedAmmo: true,
      reserveMagazines: 1,
      reloadDurationMs: 10,
    });
    weapon.fire(0); // empties the loaded magazine
    weapon.startReload(0);
    weapon.update(20); // consumes the one reserve magazine
    expect(weapon.getReserveMagazines()).toBe(0);
    weapon.fire(20);
    const started = weapon.startReload(30);
    expect(started).toBe(false);
  });
});
