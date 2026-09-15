import { clamp } from '../types';
import { comboMultiplier } from './scoring';

export interface ComboOptions {
  windowMs: number;
  drainPerMiss: number; // 0..1 fraction of combo lost per miss
  minWindowMs?: number;
}

export interface ComboTick {
  expired?: boolean;
}

/**
 * Combo state machine: combo builds on hits, decays over time, and is damaged
 * (not necessarily destroyed) by misses.
 */
export class ComboTracker {
  private _combo = 0;
  private _hitsWithoutMiss = 0;
  private _perfectStreak = 0;
  private _bestCombo = 0;
  private _bestPerfectStreak = 0;
  private _timeLeftMs = 0;
  private windowMs: number;
  private drain: number;

  constructor(opts: ComboOptions) {
    this.windowMs = Math.max(250, opts.windowMs);
    this.drain = clamp(opts.drainPerMiss ?? 0.5, 0, 1);
  }

  get combo(): number {
    return this._combo;
  }

  get multiplier(): number {
    return comboMultiplier(this._combo);
  }

  get hitsWithoutMiss(): number {
    return this._hitsWithoutMiss;
  }

  get perfectStreak(): number {
    return this._perfectStreak;
  }

  get bestCombo(): number {
    return this._bestCombo;
  }

  get bestPerfectStreak(): number {
    return this._bestPerfectStreak;
  }

  /** 0..1 remaining window for HUD display */
  get windowFraction(): number {
    return clamp(this._timeLeftMs / this.windowMs, 0, 1);
  }

  registerHit(perfect: boolean): void {
    this._combo += 1;
    this._hitsWithoutMiss += 1;
    this._timeLeftMs = this.windowMs;
    if (perfect) this._perfectStreak += 1;
    else this._perfectStreak = 0;
    if (this._combo > this._bestCombo) this._bestCombo = this._combo;
    if (this._perfectStreak > this._bestPerfectStreak) this._bestPerfectStreak = this._perfectStreak;
  }

  /** A miss damages the combo but keeps a fraction so one mistake is not fatal. */
  registerMiss(): boolean {
    this._hitsWithoutMiss = 0;
    this._perfectStreak = 0;
    if (this._combo <= 0) return false;
    const wasBig = this._combo >= 10;
    const kept = Math.floor(this._combo * (1 - this.drain));
    const broke = kept < 1;
    this._combo = Math.max(0, kept);
    this._timeLeftMs = this.windowMs * (broke ? 0 : 0.35);
    return wasBig;
  }

  /** Advance decay. Returns whether the combo just fully expired. */
  update(dtMs: number): ComboTick {
    if (this._combo <= 0) {
      this._timeLeftMs = 0;
      return {};
    }
    this._timeLeftMs -= dtMs;
    if (this._timeLeftMs <= 0) {
      this._timeLeftMs = 0;
      const hadCombo = this._combo > 0;
      this._combo = 0;
      this._hitsWithoutMiss = 0;
      this._perfectStreak = 0;
      return { expired: hadCombo };
    }
    return {};
  }

  reset(): void {
    this._combo = 0;
    this._hitsWithoutMiss = 0;
    this._perfectStreak = 0;
    this._timeLeftMs = 0;
  }
}
