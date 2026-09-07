/**
 * Munitions- und Nachladesystem — deterministisch, frei von Phaser.
 */

export type WeaponState = 'ready' | 'empty' | 'reloading';

export interface WeaponConfig {
  magazineSize: number;
  /** Dauer eines vollständigen Nachladens in ms. */
  reloadMs: number;
  /** Gesamte Munition (0 = unbegrenzt). */
  reserve: number;
  /** Automatisches Nachladen bei leerem Magazin. */
  autoReload: boolean;
  /** Taktisches Nachladen abrestlos ab dieser Magazinflüchtigkeit erlaubt (1 = immer). */
  tacticalReloadThreshold: number;
}

export const DEFAULT_WEAPON_CONFIG: WeaponConfig = {
  magazineSize: 6,
  reloadMs: 1400,
  reserve: 0,
  autoReload: true,
  tacticalReloadThreshold: 1,
};

export interface WeaponSnapshot {
  current: number;
  size: number;
  state: WeaponState;
  reloadProgress: number; // 0..1
  totalLeft: number; // 0 = unbegrenzt
  canTacticalReload: boolean;
}

export interface WeaponEvents {
  onStateChange?: (snap: WeaponSnapshot) => void;
  onShot?: () => void;
  onEmptyClick?: () => void;
  onReloadStart?: () => void;
  onReloadEnd?: () => void;
}

export class Weapon {
  private current: number;
  private reserve: number; // -1 = unbegrenzt
  private state: WeaponState = 'ready';
  private reloadStartedAt = 0;
  private reloadMs: number;
  private autoReload: boolean;
  private readonly size: number;
  private readonly events: WeaponEvents;
  /** Externe Uhr (ms), damit Nachladen pausierbar ist. */
  nowMs = 0;

  constructor(config: Partial<WeaponConfig> = {}, events: WeaponEvents = {}) {
    const c = { ...DEFAULT_WEAPON_CONFIG, ...config };
    this.size = c.magazineSize;
    this.current = c.magazineSize;
    this.reserve = c.reserve > 0 ? c.reserve : -1;
    this.reloadMs = c.reloadMs;
    this.autoReload = c.autoReload;
    this.events = events;
  }

  get snapshot(): WeaponSnapshot {
    let reloadProgress = 0;
    if (this.state === 'reloading') {
      reloadProgress = Math.min(1, (this.nowMs - this.reloadStartedAt) / this.reloadMs);
    }
    const canTacticalReload =
      this.state === 'ready' &&
      this.current > 0 &&
      this.current < this.size &&
      this.reserve < 0 ||
      (this.state === 'ready' && this.current > 0 && this.current < this.size);
    return {
      current: this.current,
      size: this.size,
      state: this.state,
      reloadProgress,
      totalLeft: this.reserve < 0 ? 0 : this.reserve,
      canTacticalReload,
    };
  }

  private emitChange(): void {
    this.events.onStateChange?.(this.snapshot);
  }

  /** Abfeuern. @returns true, wenn ein Schuss möglich war. */
  fire(nowMs: number): boolean {
    this.nowMs = nowMs;
    if (this.state === 'reloading') return false;
    if (this.current <= 0) {
      this.events.onEmptyClick?.();
      if (this.autoReload) this.startReload(nowMs, true);
      return false;
    }
    this.current -= 1;
    if (this.reserve > 0) this.reserve -= 0; // Reserve wird beim Nachladen gezogen
    this.events.onShot?.();
    if (this.current <= 0) {
      this.state = 'empty';
      if (this.autoReload && this.hasReserve()) {
        this.startReload(nowMs, true);
      }
      this.emitChange();
      return true;
    }
    this.emitChange();
    return true;
  }

  private hasReserve(): boolean {
    return this.reserve < 0 || this.reserve > 0;
  }

  /** Startet ein Nachladen (manuell oder automatisch). */
  startReload(nowMs: number, _auto: boolean): boolean {
    this.nowMs = nowMs;
    if (this.state === 'reloading') return false;
    if (this.current >= this.size) {
      // Voll: kein Nachladen nötig (außer Reserve nachladen in Precision).
      if (this.reserve > 0) {
        this.state = 'reloading';
        this.reloadStartedAt = nowMs;
        this.events.onReloadStart?.();
        this.emitChange();
        return true;
      }
      return false;
    }
    if (!this.hasReserve() && this.current >= this.size) return false;
    this.state = 'reloading';
    this.reloadStartedAt = nowMs;
    this.events.onReloadStart?.();
    this.emitChange();
    return true;
  }

  /** Abbrechen des Nachladens (taktisch). Munition bleibt, wo sie ist. */
  cancelReload(nowMs: number): void {
    this.nowMs = nowMs;
    if (this.state !== 'reloading') return;
    this.state = this.current >= this.size ? 'ready' : this.current > 0 ? 'ready' : 'empty';
    this.emitChange();
  }

  /** Muss im Update-Loop aufgerufen werden. */
  update(nowMs: number): void {
    this.nowMs = nowMs;
    if (this.state !== 'reloading') return;
    if (nowMs - this.reloadStartedAt < this.reloadMs) return;
    // Nachladen fertig: Magazin auffüllen.
    if (this.reserve > 0) {
      const needed = this.size - this.current;
      const take = Math.min(needed, this.reserve);
      this.current += take;
      this.reserve -= take;
      this.state = this.current > 0 ? 'ready' : 'empty';
    } else {
      this.current = this.size;
      this.state = 'ready';
    }
    this.events.onReloadEnd?.();
    this.emitChange();
  }

  /** Füllt Munition auf (z. B. Bonus, Rundenstart). */
  refill(total: number, nowMs: number): void {
    this.nowMs = nowMs;
    this.current = Math.min(this.size, total);
    if (total > this.size) this.reserve = total - this.size;
    this.state = this.current > 0 ? 'ready' : 'empty';
    this.emitChange();
  }

  /** Setzt das Magazin neu auf (Rundenstart). */
  reset(nowMs: number): void {
    this.nowMs = nowMs;
    this.current = this.size;
    if (this.reserve < 0) {
      // bleibt unbegrenzt
    }
    this.state = 'ready';
    this.emitChange();
  }
}
