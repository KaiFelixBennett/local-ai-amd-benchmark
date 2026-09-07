/**
 * Weapon / magazine state machine. Pure and deterministic — fully testable.
 * States: ready, empty, reloading.
 */

export type WeaponState = 'ready' | 'empty' | 'reloading';

export interface WeaponConfig {
  magazineSize: number;
  /** ms to reload */
  reloadMs: number;
  /** true = infinite ammo (endless) */
  infiniteAmmo: boolean;
  /** auto-reload when empty */
  autoReload: boolean;
}

export const DEFAULT_WEAPON: WeaponConfig = {
  magazineSize: 6,
  reloadMs: 950,
  infiniteAmmo: false,
  autoReload: true
};

export interface WeaponSnapshot {
  state: WeaponState;
  ammo: number;
  magazineSize: number;
  reloadProgress: number; // 0..1, only meaningful while reloading
}

export class Weapon {
  cfg: WeaponConfig;
  private ammo: number;
  private reloading = false;
  private reloadEndsAt = 0;

  constructor(cfg: Partial<WeaponConfig> = {}) {
    this.cfg = { ...DEFAULT_WEAPON, ...cfg };
    this.ammo = this.cfg.magazineSize;
  }

  reset(): void {
    this.ammo = this.cfg.magazineSize;
    this.reloading = false;
    this.reloadEndsAt = 0;
  }

  get state(): WeaponState {
    if (this.reloading) return 'reloading';
    if (this.cfg.infiniteAmmo || this.ammo > 0) return 'ready';
    return 'empty';
  }

  /**
   * Try to fire one shot. Returns true if a shot was actually produced.
   * If the magazine becomes empty and autoReload is on, starts a reload.
   */
  fire(now: number): boolean {
    if (this.reloading) return false;
    if (this.cfg.infiniteAmmo) {
      return true;
    }
    if (this.ammo <= 0) {
      if (this.cfg.autoReload) this.startReload(now);
      return false;
    }
    this.ammo -= 1;
    if (this.ammo <= 0 && this.cfg.autoReload) {
      this.startReload(now);
    }
    return true;
  }

  startReload(now: number): void {
    if (this.reloading) return;
    if (this.cfg.infiniteAmmo || this.ammo >= this.cfg.magazineSize) return;
    this.reloading = true;
    this.reloadEndsAt = now + this.cfg.reloadMs;
  }

  /** Cancel reload (abort) — keeps current ammo, stops the reload timer. */
  cancelReload(): void {
    this.reloading = false;
    this.reloadEndsAt = 0;
  }

  /** Advance the weapon. Completes a reload when its time has passed. */
  tick(now: number): void {
    if (this.reloading && now >= this.reloadEndsAt) {
      this.reloading = false;
      this.ammo = this.cfg.magazineSize;
      this.reloadEndsAt = 0;
    }
  }

  /** Reload progress 0..1 at time now (0 when not reloading). */
  reloadProgress(now: number): number {
    if (!this.reloading) return 0;
    const started = this.reloadEndsAt - this.cfg.reloadMs;
    return Math.min(1, Math.max(0, (now - started) / this.cfg.reloadMs));
  }

  snapshot(now: number = 0): WeaponSnapshot {
    return {
      state: this.state,
      ammo: this.cfg.infiniteAmmo ? Infinity : this.ammo,
      magazineSize: this.cfg.magazineSize,
      reloadProgress: this.reloadProgress(now)
    };
  }
}
