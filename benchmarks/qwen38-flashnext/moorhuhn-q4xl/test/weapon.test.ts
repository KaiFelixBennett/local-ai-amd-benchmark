import { describe, expect, it } from 'vitest';
import { Weapon, type WeaponConfig, type WeaponEvent } from '../src/game/Weapon';

const CFG: WeaponConfig = {
  magazine: 6,
  fireCooldown: 0.35,
  reloadTime: 1.2,
  autoReload: true,
  totalAmmo: -1,
};

function weapon(overrides: Partial<WeaponConfig> = {}): Weapon {
  return new Weapon({ ...CFG, ...overrides });
}

function types(events: WeaponEvent[]): string[] {
  return events.map((e) => e.type);
}

/** Fire one shell, cooling the pump first. */
function shell(w: Weapon): WeaponEvent[] {
  w.update(CFG.fireCooldown);
  return w.tryFire();
}

function drainMagazine(w: Weapon): void {
  for (let i = 0; i < CFG.magazine; i++) shell(w);
}

describe('Weapon (six-shot shotgun)', () => {
  it('starts full and ready; unlimited reserve is -1', () => {
    const w = weapon();
    expect(w.state).toMatchObject({ status: 'ready', ammo: 6, reserve: -1, reloadLeft: 0 });
  });

  it('finite total ammo starts with magazine deducted into reserve', () => {
    expect(weapon({ totalAmmo: 40 }).state.reserve).toBe(34);
    expect(weapon({ totalAmmo: 6 }).state.reserve).toBe(0);
    expect(weapon({ totalAmmo: 3 }).state.reserve).toBe(0);
  });

  it('empties the magazine one shell at a time and reports ammoLeft', () => {
    const w = weapon();
    const left: number[] = [];
    for (let i = 0; i < 6; i++) {
      const ev = shell(w);
      expect(types(ev)).toContain('fire');
      const fire = ev.find((e) => e.type === 'fire');
      left.push(fire && fire.type === 'fire' ? fire.ammoLeft : -1);
    }
    expect(left).toEqual([5, 4, 3, 2, 1, 0]);
    expect(w.state.ammo).toBe(0);
  });

  it('refuses to fire again inside the pump cooldown', () => {
    const w = weapon();
    expect(types(w.tryFire())).toEqual(['fire']);
    expect(w.tryFire()).toEqual([]);
    w.update(0.1);
    expect(w.tryFire()).toEqual([]);
    w.update(0.35);
    expect(types(w.tryFire())).toContain('fire');
  });

  it('the last shell reports empty and auto-reloads when allowed', () => {
    const w = weapon();
    drainMagazine(w);
    // note: auto.reload triggers on the 6th shell itself
    expect(w.state.status).toBe('reloading');
    expect(w.state.reloadLeft).toBeCloseTo(CFG.reloadTime);
  });

  it('auto-reload finishes after reloadTime and reports done + ready', () => {
    const w = weapon();
    drainMagazine(w);
    const ev = w.update(CFG.reloadTime - 0.2);
    expect(types(ev)).toEqual([]); // not finished yet
    expect(w.state.status).toBe('reloading');
    const done = w.update(0.3);
    expect(types(done)).toEqual(['reloadDone']);
    expect(w.state).toMatchObject({ status: 'ready', ammo: 6 });
  });

  it('empty magazine + autoReload disabled => dryFire and empty', () => {
    const w = weapon({ autoReload: false });
    drainMagazine(w);
    w.update(CFG.fireCooldown); // pump finishes: firing -> empty
    expect(w.state.status).toBe('empty');
    expect(types(w.tryFire())).toEqual(['dryFire', 'empty']);
  });

  it('dryFire with autoReload but no reserve does not start a reload', () => {
    const w = weapon({ totalAmmo: 6 }); // reserve 0
    drainMagazine(w);
    w.update(CFG.fireCooldown); // firing -> empty
    const ev = w.tryFire();
    expect(types(ev)).toEqual(['dryFire', 'empty']);
    expect(w.state.status).toBe('empty');
  });

  it('manual reload starts and finishes, topping up from a finite reserve', () => {
    const w = weapon({ totalAmmo: 10 }); // reserve 4
    shell(w); // ammo 5
    expect(types(w.reload())).toEqual(['reloadStart']);
    expect(w.state.status).toBe('reloading');
    expect(w.update(0.9)).toHaveLength(0); // not done yet
    expect(w.state.status).toBe('reloading');
    const done = w.update(0.31); // timer hits 0 inside this update
    expect(types(done)).toEqual(['reloadDone']);
    expect(w.state).toMatchObject({ status: 'ready', ammo: 6, reserve: 3 });
  });

  it('reloading again cancels tactically and keeps shells loaded', () => {
    const w = weapon();
    shell(w); // ammo 5
    w.reload();
    expect(w.state.status).toBe('reloading');
    expect(types(w.reload())).toEqual(['reloadCancel']);
    expect(w.state).toMatchObject({ status: 'ready', ammo: 5, reloadLeft: 0 });
    // firing works right after a cancel
    expect(types(shell(w))).toContain('fire');
  });

  it('reload attempts on an empty gun with no reserve report empty', () => {
    const w = weapon({ autoReload: false, totalAmmo: 6 });
    drainMagazine(w);
    w.update(CFG.fireCooldown); // firing -> empty
    expect(w.state.status).toBe('empty');
    expect(types(w.reload())).toEqual(['empty']);
  });

  it('setAmmo(0) on an unreloadable gun moves it to empty immediately', () => {
    // reserve 1: last shell does NOT auto-reload (autoReload off), manual reload
    // loads 1 shell; cancel mid-reload with ammo still 0 keeps status empty.
    const w = new Weapon({ magazine: 6, fireCooldown: 0.35, reloadTime: 1.2, autoReload: false, totalAmmo: 6 });
    w.setAmmo(0);
    expect(w.state.status).toBe('empty'); // setAmmo marks it when unreloadable
  });

  it('reload on a full magazine is a no-op', () => {
    const w = weapon();
    expect(w.reload()).toEqual([]);
    expect(w.state.status).toBe('ready');
  });

  it('finite reserve tops up monotonically and eventually runs dry', () => {
    const w = weapon({ totalAmmo: 14 }); // reserve 8, 14 shells total
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) shell(w); // 6th shell triggers auto-reload
    expect(types(w.update(2))).toEqual(['reloadDone']);
    seen.push(w.state.ammo); // full magazine, reserve down to 2
    for (let i = 0; i < 6; i++) shell(w); // auto-reload again
    expect(types(w.update(2))).toEqual(['reloadDone']);
    seen.push(w.state.ammo); // only the last 2 reserve shells fit
    expect(seen).toEqual([6, 2]);
    expect(types(shell(w))).toEqual(['fire']); // one spare
    expect(types(shell(w))).toEqual(['fire', 'empty']); // reserve spent: no auto-reload
    w.update(CFG.fireCooldown); // firing -> empty
    expect(w.state.status).toBe('empty');
    expect(types(w.tryFire())).toEqual(['dryFire', 'empty']);
    expect(w.state).toMatchObject({ ammo: 0, reserve: 0 });
  });

  it('unlimited reserve always refills the whole magazine', () => {
    const w = weapon();
    for (let i = 0; i < 30; i++) {
      shell(w);
      w.update(2);
    }
    expect(w.state.ammo).toBe(6);
    expect(w.state.reserve).toBe(-1);
  });

  it('setAmmo clamps and marks an unreloadable gun empty', () => {
    const w = weapon({ totalAmmo: 6 });
    w.setAmmo(0);
    expect(w.state.status).toBe('empty');
    const w2 = weapon();
    w2.setAmmo(99);
    expect(w2.state.ammo).toBe(6);
    w2.setAmmo(-5);
    expect(w2.state.ammo).toBe(0);
  });
});
