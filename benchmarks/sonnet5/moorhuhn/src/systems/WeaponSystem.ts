import { BALANCE } from '../config/balance';

export type WeaponStatus = 'ready' | 'empty' | 'reloading';

export interface FireResult {
  fired: boolean;
  autoReloadTriggered: boolean;
}

/**
 * Pure ammo/reload state machine, decoupled from Phaser so it can be unit
 * tested directly. GameScene drives it with real timestamps and mirrors its
 * state into HUD + audio + animation.
 */
export class WeaponSystem {
  ammo: number;
  readonly magazineSize: number;
  isReloading = false;
  private reloadStartedAt = 0;
  private reloadDurationMs: number;
  private lastShotAt = -Infinity;
  private readonly shotCooldownMs: number;
  private readonly autoReload: boolean;
  private readonly limitedAmmo: boolean;
  private reserveMagazines: number;

  constructor(options?: {
    magazineSize?: number;
    reloadDurationMs?: number;
    shotCooldownMs?: number;
    autoReload?: boolean;
    limitedAmmo?: boolean;
    reserveMagazines?: number;
  }) {
    this.magazineSize = options?.magazineSize ?? BALANCE.weapon.magazineSize;
    this.ammo = this.magazineSize;
    this.reloadDurationMs = options?.reloadDurationMs ?? BALANCE.weapon.reloadDurationMs;
    this.shotCooldownMs = options?.shotCooldownMs ?? BALANCE.weapon.shotCooldownMs;
    this.autoReload = options?.autoReload ?? true;
    this.limitedAmmo = options?.limitedAmmo ?? false;
    this.reserveMagazines = options?.reserveMagazines ?? BALANCE.weapon.precisionModeMaxMagazines;
  }

  getStatus(_now: number): WeaponStatus {
    if (this.isReloading) return 'reloading';
    if (this.ammo <= 0) return 'empty';
    return 'ready';
  }

  canFire(now: number): boolean {
    if (this.isReloading || this.ammo <= 0) return false;
    return now - this.lastShotAt >= this.shotCooldownMs;
  }

  /** Attempts to fire one shot. Returns whether it actually fired and whether it triggered an auto-reload. */
  fire(now: number): FireResult {
    if (!this.canFire(now)) {
      if (this.ammo <= 0 && !this.isReloading && this.autoReload) {
        this.startReload(now);
        return { fired: false, autoReloadTriggered: true };
      }
      return { fired: false, autoReloadTriggered: false };
    }
    this.ammo -= 1;
    this.lastShotAt = now;
    let autoReloadTriggered = false;
    if (this.ammo <= 0 && this.autoReload) {
      this.startReload(now);
      autoReloadTriggered = true;
    }
    return { fired: true, autoReloadTriggered };
  }

  /** Manually triggered reload (right-click / R). No-op if already full, empty of reserves, or mid-reload. */
  startReload(now: number): boolean {
    if (this.isReloading || this.ammo >= this.magazineSize) return false;
    if (this.limitedAmmo && this.reserveMagazines <= 0) return false;
    this.isReloading = true;
    this.reloadStartedAt = now;
    return true;
  }

  /** Cancels a reload in progress (tactical cancel), keeping current ammo. */
  cancelReload(): void {
    this.isReloading = false;
  }

  /** Advances the reload timer; call every frame. Returns true the instant reload completes. */
  update(now: number): boolean {
    if (!this.isReloading) return false;
    if (now - this.reloadStartedAt >= this.reloadDurationMs) {
      this.isReloading = false;
      if (this.limitedAmmo) {
        this.reserveMagazines = Math.max(0, this.reserveMagazines - 1);
      }
      this.ammo = this.magazineSize;
      return true;
    }
    return false;
  }

  reloadProgress01(now: number): number {
    if (!this.isReloading) return this.ammo <= 0 ? 0 : 1;
    return Math.min(1, (now - this.reloadStartedAt) / this.reloadDurationMs);
  }

  getReserveMagazines(): number {
    return this.reserveMagazines;
  }

  reset(): void {
    this.ammo = this.magazineSize;
    this.isReloading = false;
    this.reloadStartedAt = 0;
    this.lastShotAt = -Infinity;
    this.reserveMagazines = BALANCE.weapon.precisionModeMaxMagazines;
  }
}
