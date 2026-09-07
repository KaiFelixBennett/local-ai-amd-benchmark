import type { WeaponState } from '../core/types';

export interface WeaponConfig {
  magazine: number;
  fireCooldown: number; // seconds
  reloadTime: number; // seconds
  autoReload: boolean;
  totalAmmo: number; // -1 unlimited (reserve)
}

export type WeaponEvent =
  | { type: 'fire'; ammoLeft: number }
  | { type: 'dryFire' }
  | { type: 'reloadStart' }
  | { type: 'reloadCancel' }
  | { type: 'reloadDone' }
  | { type: 'empty' };

/**
 * Six-shot shotgun model: ready / firing / reloading / empty. Reloading can be
 * started manually (tactical), cancels on movement of the crosshair? – no, it
 * cancels only by explicit cancel (right-click again) for tactical play, and is
 * auto-triggered when the magazine empties (unless the mode disables auto).
 */
export class Weapon {
  private cfg: WeaponConfig;
  private ammo: number;
  private reserve: number;
  private fireTimer = 0;
  private reloadTimer = 0;
  private status: WeaponState['status'] = 'ready';

  constructor(cfg: WeaponConfig) {
    this.cfg = cfg;
    this.ammo = cfg.magazine;
    this.reserve = cfg.totalAmmo >= 0 ? Math.max(0, cfg.totalAmmo - cfg.magazine) : -1;
  }

  get state(): WeaponState {
    return {
      status: this.status,
      ammo: this.ammo,
      reserve: this.reserve,
      reloadLeft: this.reloadTimer,
      fireLeft: this.fireTimer,
    };
  }

  update(dt: number): WeaponEvent[] {
    const events: WeaponEvent[] = [];
    if (this.fireTimer > 0) this.fireTimer = Math.max(0, this.fireTimer - dt);
    if (this.fireTimer === 0 && this.status === 'firing') {
      this.status = this.ammo > 0 ? 'ready' : 'empty';
    }
    if (this.status === 'reloading') {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.finishReload();
        events.push({ type: 'reloadDone' });
        if (this.ammo === 0) {
          this.status = 'empty';
          events.push({ type: 'empty' });
        } else {
          this.status = 'ready';
        }
      }
    }
    return events;
  }

  /** Attempt to fire one shell. Returns resulting events (may auto-reload). */
  tryFire(): WeaponEvent[] {
    const ev: WeaponEvent[] = [];
    if (this.status === 'reloading' || this.fireTimer > 0) return ev;
    if (this.ammo <= 0) {
      ev.push({ type: 'dryFire' });
      if (this.cfg.autoReload && this.canReload()) {
        ev.push(...this.reload());
      } else {
        this.status = 'empty';
        ev.push({ type: 'empty' });
      }
      return ev;
    }
    this.ammo -= 1;
    this.fireTimer = this.cfg.fireCooldown;
    this.status = 'firing';
    ev.push({ type: 'fire', ammoLeft: this.ammo });
    if (this.ammo === 0) {
      ev.push({ type: 'empty' });
      if (this.cfg.autoReload && this.canReload()) ev.push(...this.reload());
    }
    return ev;
  }

  /** Manual reload. While reloading, calling again cancels (tactical interrupt). */
  reload(): WeaponEvent[] {
    if (this.status === 'reloading') {
      this.status = this.ammo > 0 ? 'ready' : 'empty';
      this.reloadTimer = 0;
      return [{ type: 'reloadCancel' }];
    }
    if (!this.canReload()) {
      if (this.ammo === 0) {
        this.status = 'empty';
        return [{ type: 'empty' }];
      }
      return [];
    }
    this.status = 'reloading';
    this.reloadTimer = this.cfg.reloadTime;
    return [{ type: 'reloadStart' }];
  }

  private canReload(): boolean {
    if (this.ammo >= this.cfg.magazine) return false;
    return this.reserve !== 0; // -1 unlimited passes
  }

  /** Refill from reserve up to magazine. */
  private finishReload(): void {
    if (this.reserve < 0) {
      this.ammo = this.cfg.magazine; // unlimited reserve
      return;
    }
    const want = this.cfg.magazine - this.ammo;
    const give = Math.min(want, this.reserve);
    this.ammo += give;
    this.reserve -= give;
  }

  /** Debug/tutorial helper. */
  setAmmo(n: number): void {
    this.ammo = Math.max(0, Math.min(this.cfg.magazine, n));
    if (this.ammo === 0 && this.status === 'ready' && !this.canReload()) this.status = 'empty';
  }
}
