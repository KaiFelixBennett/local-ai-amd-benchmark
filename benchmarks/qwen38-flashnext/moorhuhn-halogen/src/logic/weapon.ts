import { BALANCE } from '../config/balance';

export type WeaponState = 'ready' | 'empty' | 'reloading';

export interface WeaponOptions {
  magazineSize: number;
  autoReload: boolean;
  totalAmmo?: number | null; // precision mode
}

export interface WeaponEvent {
  kind: 'fire' | 'reload_start' | 'reload_finish' | 'reload_cancel' | 'dry_fire' | 'out_of_ammo';
}

/**
 * Pure weapon state machine: 6-round magazine, manual/auto reload, optional
 * total ammo pool (precision). Time-based, driven by `update(nowMs)`.
 */
export class Weapon {
  private _magazine: number;
  private _reserve: number; // Infinity when unlimited
  private state: WeaponState = 'ready';
  private reloadStartedAt = 0;
  private lastShotAt = -Infinity;
  readonly magazineSize: number;
  readonly autoReload: boolean;
  readonly unlimited: boolean;

  constructor(opts: WeaponOptions) {
    this.magazineSize = Math.max(1, opts.magazineSize);
    this.autoReload = opts.autoReload;
    this._magazine = this.magazineSize;
    this.unlimited = opts.totalAmmo == null;
    const total = opts.totalAmmo ?? Number.POSITIVE_INFINITY;
    this._reserve = this.unlimited ? Number.POSITIVE_INFINITY : Math.max(0, total - this.magazineSize);
  }

  get ammo(): number {
    return this._magazine;
  }

  get reserve(): number {
    return this._reserve;
  }

  get stateNow(): WeaponState {
    return this.state;
  }

  get canFire(): boolean {
    return this.state === 'ready' && this._magazine > 0;
  }

  get reloadProgress(): number {
    if (this.state !== 'reloading') return 0;
    return Math.min(1, (this._now - this.reloadStartedAt) / BALANCE.weapon.reloadDurationMs);
  }

  private _now = 0;

  /** Attempt to fire. Returns true when a shot went out. */
  tryFire(nowMs: number): boolean {
    this._now = nowMs;
    if (this.state === 'reloading') return false;
    if (nowMs - this.lastShotAt < BALANCE.weapon.fireCooldownMs) return false;
    if (this._magazine <= 0) {
      this.onDryFire(nowMs);
      return false;
    }
    this._magazine -= 1;
    this.lastShotAt = nowMs;
    if (this._magazine === 0 && this.autoReload) {
      this.startReload(nowMs, 'auto');
    }
    return true;
  }

  /** Manual reload request. Ignored while reloading or full. */
  requestReload(nowMs: number): boolean {
    this._now = nowMs;
    if (this.state === 'reloading') return false;
    if (this._magazine >= this.magazineSize) return false;
    if (!this.unlimited && this._reserve <= 0) return false;
    this.startReload(nowMs, 'manual');
    return true;
  }

  /** Cancel an in-progress reload (only after the grace period). */
  cancelReload(nowMs: number): boolean {
    this._now = nowMs;
    if (this.state !== 'reloading') return false;
    if (nowMs - this.reloadStartedAt < BALANCE.weapon.reloadCancelGraceMs) return false;
    this.state = this._magazine > 0 ? 'ready' : 'empty';
    return true;
  }

  private startReload(nowMs: number, _kind: 'manual' | 'auto'): void {
    this.state = 'reloading';
    this.reloadStartedAt = nowMs;
  }

  private onDryFire(nowMs: number): void {
    // empty magazine: auto-reload if allowed, else stay empty
    if (this.autoReload && (this.unlimited || this._reserve > 0)) {
      this.startReload(nowMs + BALANCE.weapon.emptyDelayMs, 'auto');
    } else {
      this.state = 'empty';
    }
  }

  /** Advance timers. Returns event kinds that happened this tick. */
  update(nowMs: number): WeaponEvent[] {
    this._now = nowMs;
    const events: WeaponEvent[] = [];
    if (this.state === 'reloading' && nowMs - this.reloadStartedAt >= BALANCE.weapon.reloadDurationMs) {
      const space = this.magazineSize - this._magazine;
      if (this.unlimited) {
        this._magazine = this.magazineSize;
      } else {
        const load = Math.min(space, this._reserve);
        this._magazine += load;
        this._reserve -= load;
      }
      this.state = this._magazine > 0 ? 'ready' : 'empty';
      events.push({ kind: 'reload_finish' });
      if (this._magazine === 0) events.push({ kind: 'out_of_ammo' });
    }
    return events;
  }

  /** Add reserve ammo (e.g. bonus pickups). */
  addReserve(amount: number): void {
    if (this.unlimited) return;
    this._reserve = Math.max(0, this._reserve + amount);
  }

  snapshot() {
    return {
      ammo: this._magazine,
      reserve: this.unlimited ? -1 : this._reserve,
      magazineSize: this.magazineSize,
      state: this.state,
      reloadProgress: this.reloadProgress,
      canFire: this.canFire,
    };
  }
}
