import type { WeaponConfig, WeaponState } from '../types';

export interface WeaponStateData {
  state: WeaponState;
  ammo: number;
  reloadStart: number;
  lastFireTime: number;
}

export function createWeapon(config: WeaponConfig): WeaponStateData {
  return {
    state: 'ready',
    ammo: config.magSize,
    reloadStart: 0,
    lastFireTime: 0,
  };
}

export function canFire(weapon: WeaponStateData, config: WeaponConfig, now: number): boolean {
  if (weapon.state === 'reloading') return false;
  if (weapon.ammo <= 0) return false;
  return now - weapon.lastFireTime >= config.fireRate;
}

export function fire(weapon: WeaponStateData, config: WeaponConfig, now: number): boolean {
  if (!canFire(weapon, config, now)) return false;
  weapon.ammo--;
  weapon.lastFireTime = now;
  if (weapon.ammo <= 0) {
    weapon.state = 'empty';
  }
  return true;
}

export function startReload(weapon: WeaponStateData, config: WeaponConfig, now: number): boolean {
  if (weapon.state === 'reloading') return false;
  if (weapon.ammo >= config.magSize) return false;
  weapon.state = 'reloading';
  weapon.reloadStart = now;
  return true;
}

export function updateReload(weapon: WeaponStateData, config: WeaponConfig, now: number): void {
  if (weapon.state !== 'reloading') return;
  if (now - weapon.reloadStart >= config.reloadTime) {
    weapon.ammo = config.magSize;
    weapon.state = 'ready';
  }
}

export function isReloadingComplete(weapon: WeaponStateData, config: WeaponConfig, now: number): boolean {
  return weapon.state === 'reloading' && now - weapon.reloadStart >= config.reloadTime;
}
