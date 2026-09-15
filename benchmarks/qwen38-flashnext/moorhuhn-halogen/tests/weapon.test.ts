import { describe, expect, it } from 'vitest';
import { Weapon } from '../src/logic/weapon';
import { BALANCE } from '../src/config/balance';

const RELOAD = BALANCE.weapon.reloadDurationMs; // 1100
const COOLDOWN = BALANCE.weapon.fireCooldownMs; // 140

function unlimitedWeapon(magazineSize = 6, autoReload = true): Weapon {
  return new Weapon({ magazineSize, autoReload });
}

describe('Weapon firing', () => {
  it('fires while ammo remains and decrements the magazine', () => {
    const w = unlimitedWeapon(3);
    expect(w.tryFire(0)).toBe(true);
    expect(w.ammo).toBe(2);
    expect(w.tryFire(200)).toBe(true);
    expect(w.ammo).toBe(1);
  });

  it('enforces the fire cooldown', () => {
    const w = unlimitedWeapon();
    expect(w.tryFire(0)).toBe(true);
    expect(w.tryFire(COOLDOWN - 1)).toBe(false);
    expect(w.ammo).toBe(5);
    expect(w.tryFire(COOLDOWN)).toBe(true);
  });

  it('blocks firing during reload', () => {
    const w = unlimitedWeapon(1);
    w.tryFire(0); // empty + auto reload
    expect(w.stateNow).toBe('reloading');
    expect(w.tryFire(500)).toBe(false);
  });

  it('refills after the full reload duration', () => {
    const w = unlimitedWeapon(2);
    w.tryFire(0);
    w.tryFire(200); // mag empty → auto reload starts at 200
    expect(w.update(1299)).toEqual([]);
    expect(w.stateNow).toBe('reloading');
    const events = w.update(200 + RELOAD);
    expect(events.map((e) => e.kind)).toEqual(['reload_finish']);
    expect(w.ammo).toBe(2);
    expect(w.stateNow).toBe('ready');
  });
});

describe('Weapon manual reload', () => {
  it('is ignored when full or already reloading', () => {
    const w = unlimitedWeapon(2);
    expect(w.requestReload(0)).toBe(false); // full
    w.tryFire(0);
    expect(w.requestReload(200)).toBe(true);
    expect(w.requestReload(400)).toBe(false); // already reloading
  });

  it('cancels only after the grace period', () => {
    const w = unlimitedWeapon(3);
    w.tryFire(0);
    w.tryFire(200); // mag 1
    w.requestReload(400);
    expect(w.cancelReload(500)).toBe(false); // grace 180 not elapsed
    expect(w.stateNow).toBe('reloading');
    expect(w.cancelReload(400 + BALANCE.weapon.reloadCancelGraceMs)).toBe(true);
    expect(w.stateNow).toBe('ready');
    expect(w.ammo).toBe(1);
  });

  it('cancelling with an empty mag leaves the state empty', () => {
    const w = new Weapon({ magazineSize: 1, autoReload: false });
    w.tryFire(0); // mag 0, no auto reload
    w.requestReload(200);
    expect(w.cancelReload(380)).toBe(true);
    expect(w.stateNow).toBe('empty');
  });

  it('reports reload progress', () => {
    const w = unlimitedWeapon(2);
    w.tryFire(0);
    w.requestReload(200);
    w.update(550); // advances _now so progress reflects elapsed/RELOAD
    expect(w.reloadProgress).toBeCloseTo((550 - 200) / RELOAD, 1);
    w.update(200 + RELOAD);
    expect(w.reloadProgress).toBe(0); // no longer reloading
  });
});

describe('Weapon dry fire', () => {
  it('dry fire with autoReload starts a delayed auto reload', () => {
    const w = new Weapon({ magazineSize: 1, autoReload: true, totalAmmo: 5 });
    w.tryFire(0); // fires last round → immediate auto reload starts at t=0
    expect(w.stateNow).toBe('reloading');
    // Cancel right at the grace boundary (180ms) to force the 'empty' state.
    expect(w.cancelReload(179)).toBe(false);
    expect(w.cancelReload(180)).toBe(true);
    expect(w.stateNow).toBe('empty');
    // Firing an empty gun triggers the delayed dry-fire reload (+250ms).
    expect(w.tryFire(1000)).toBe(false);
    expect(w.stateNow).toBe('reloading');
    // Reload was scheduled for 1000 + emptyDelayMs → finishes at 2350.
    expect(w.update(2349)).toEqual([]);
    expect(w.update(2350)).toEqual([{ kind: 'reload_finish' }]);
    expect(w.ammo).toBe(1);
  });

  it('dry fire without autoReload stays empty', () => {
    const w = new Weapon({ magazineSize: 1, autoReload: false, totalAmmo: 1 });
    w.tryFire(0);
    expect(w.tryFire(200)).toBe(false);
    expect(w.stateNow).toBe('empty');
    expect(w.requestReload(400)).toBe(false); // no reserve left
  });
});

describe('Weapon finite ammo (precision mode)', () => {
  it('totalAmmo minus magazine becomes reserve', () => {
    const w = new Weapon({ magazineSize: 6, autoReload: false, totalAmmo: 36 });
    expect(w.snapshot().reserve).toBe(30);
  });

  it('reload consumes reserve up to the space available', () => {
    const w = new Weapon({ magazineSize: 6, autoReload: false, totalAmmo: 8 });
    for (let i = 0; i < 6; i++) w.tryFire(i * 200);
    expect(w.ammo).toBe(0);
    expect(w.reserve).toBe(2);
    w.requestReload(1500);
    const events = w.update(1500 + RELOAD);
    expect(events.map((e) => e.kind)).toEqual(['reload_finish']);
    expect(w.ammo).toBe(2);
    expect(w.reserve).toBe(0);
    expect(w.stateNow).toBe('ready');
  });

  it('running fully dry emits out_of_ammo', () => {
    const w = new Weapon({ magazineSize: 2, autoReload: true, totalAmmo: 2 });
    w.tryFire(0);
    w.tryFire(200); // auto reload starts, reserve 0
    const events = w.update(200 + RELOAD);
    expect(events.map((e) => e.kind)).toEqual(['reload_finish', 'out_of_ammo']);
    expect(w.stateNow).toBe('empty');
  });

  it('addReserve restores firing capability', () => {
    const w = new Weapon({ magazineSize: 2, autoReload: false, totalAmmo: 2 });
    w.tryFire(0);
    w.tryFire(200);
    w.requestReload(400);
    w.update(400 + RELOAD); // loads 0
    expect(w.ammo).toBe(0);
    w.addReserve(2);
    expect(w.requestReload(2000)).toBe(true);
    w.update(2000 + RELOAD);
    expect(w.ammo).toBe(2);
  });

  it('unlimited weapons report reserve -1 and ignore addReserve', () => {
    const w = unlimitedWeapon(2);
    expect(w.snapshot().reserve).toBe(-1);
    w.addReserve(10);
    expect(w.snapshot().reserve).toBe(-1);
  });
});
