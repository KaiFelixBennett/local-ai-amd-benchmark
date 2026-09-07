import { BALANCE } from '../config/balance';

export interface ComboSnapshot {
  count: number;
  multiplier: number;
  windowRemaining01: number; // 0..1, for HUD combo-timer bar
  missStreak: number;
}

/**
 * Tracks combo count / multiplier / expiry window. A miss damages the combo
 * (reduces it, doesn't necessarily zero it) unless several misses happen in a
 * row, so one mistake never wipes out an entire good round.
 */
export class ComboSystem {
  private count = 0;
  private lastActionAt = 0;
  private missStreak = 0;
  private readonly windowMs: number;
  private readonly missPenaltyMultiplier: number;

  constructor(windowMs: number = BALANCE.combo.windowMs, missPenaltyMultiplier = 1) {
    this.windowMs = windowMs;
    this.missPenaltyMultiplier = missPenaltyMultiplier;
  }

  registerHit(now: number): ComboSnapshot {
    this.expireIfNeeded(now);
    this.count += 1;
    this.missStreak = 0;
    this.lastActionAt = now;
    return this.snapshot(now);
  }

  registerMiss(now: number): ComboSnapshot {
    this.expireIfNeeded(now);
    this.missStreak += 1;
    if (this.missStreak >= BALANCE.combo.missBreakThreshold) {
      this.count = 0;
    } else {
      const damage = BALANCE.combo.missDamage * this.missPenaltyMultiplier;
      this.count = Math.max(0, Math.floor(this.count * (1 - damage)));
    }
    this.lastActionAt = now;
    return this.snapshot(now);
  }

  /** Call every frame to allow the combo to time out visually/logically. */
  tick(now: number): ComboSnapshot {
    this.expireIfNeeded(now);
    return this.snapshot(now);
  }

  reset(): void {
    this.count = 0;
    this.missStreak = 0;
    this.lastActionAt = 0;
  }

  getMultiplier(): number {
    return this.multiplierFor(this.count);
  }

  getCount(): number {
    return this.count;
  }

  private expireIfNeeded(now: number): void {
    if (this.count > 0 && this.lastActionAt > 0 && now - this.lastActionAt > this.windowMs) {
      this.count = 0;
      this.missStreak = 0;
    }
  }

  private multiplierFor(count: number): number {
    return Math.min(BALANCE.combo.maxMultiplier, 1 + count * BALANCE.combo.multiplierPerCombo);
  }

  private snapshot(now: number): ComboSnapshot {
    const elapsed = this.lastActionAt > 0 ? now - this.lastActionAt : this.windowMs;
    const windowRemaining01 = this.count > 0 ? Math.max(0, 1 - elapsed / this.windowMs) : 0;
    return {
      count: this.count,
      multiplier: this.multiplierFor(this.count),
      windowRemaining01,
      missStreak: this.missStreak,
    };
  }
}
