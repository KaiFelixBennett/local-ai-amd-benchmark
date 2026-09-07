/**
 * Combo / streak state machine. Pure, mutable but deterministic.
 * Tracks consecutive hits, the decaying combo window, and streak bonuses.
 */

import { SCORE_PARAMS } from './scoreParams';

export interface ComboConfig {
  /** ms a combo survives without another hit before decaying to 0 */
  windowMs: number;
  /** ms the window shrinks by per consecutive hit (keeps windows tight) */
  decayPerHitMs: number;
  /** minimum window */
  minWindowMs: number;
  /** misses that break the combo outright (default 1) */
  breakOnMisses: number;
  /** score-params used for streak bonus reporting */
  score?: typeof SCORE_PARAMS;
}

export const DEFAULT_COMBO_CONFIG: ComboConfig = {
  windowMs: 4000,
  decayPerHitMs: 120,
  minWindowMs: 1600,
  breakOnMisses: 1
};

export interface ComboSnapshot {
  combo: number;
  maxCombo: number;
  perfectStreak: number;
  maxPerfectStreak: number;
  hitsSinceMiss: number;
}

export class Combo {
  private cfg: ComboConfig;
  combo = 0;
  maxCombo = 0;
  perfectStreak = 0;
  maxPerfectStreak = 0;
  hitsSinceMiss = 0;
  private missCount = 0;
  private windowMs: number;
  /** last hit timestamp (ms) or -Infinity */
  private lastHitAt = -Infinity;

  constructor(cfg: Partial<ComboConfig> = {}) {
    this.cfg = { ...DEFAULT_COMBO_CONFIG, ...cfg };
    this.windowMs = this.cfg.windowMs;
  }

  reset(): void {
    this.combo = 0;
    this.maxCombo = 0;
    this.perfectStreak = 0;
    this.maxPerfectStreak = 0;
    this.hitsSinceMiss = 0;
    this.missCount = 0;
    this.windowMs = this.cfg.windowMs;
    this.lastHitAt = -Infinity;
  }

  /**
   * Register a successful hit. If too much time passed since the last hit,
   * the combo first decays to 0. Returns the multiplier the caller should apply
   * (based on combo count BEFORE this hit).
   */
  registerHit(isPerfect: boolean, now: number): number {
    if (now - this.lastHitAt > this.windowMs) {
      this.combo = 0;
    }
    const multBase = this.combo;
    this.combo += 1;
    this.hitsSinceMiss += 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (isPerfect) {
      this.perfectStreak += 1;
      this.maxPerfectStreak = Math.max(this.maxPerfectStreak, this.perfectStreak);
    } else {
      this.perfectStreak = 0;
    }
    // tighten the window for fast players
    this.windowMs = Math.max(this.cfg.minWindowMs, this.cfg.windowMs - this.cfg.decayPerHitMs);
    this.lastHitAt = now;
    return multBase;
  }

  /**
   * Register a miss. The combo degrades rather than fully resetting so a
   * single error does not trash a whole round, but repeated misses break it.
   */
  registerMiss(now: number): void {
    void now;
    this.missCount += 1;
    this.hitsSinceMiss = 0;
    this.perfectStreak = 0;
    if (this.missCount >= this.cfg.breakOnMisses) {
      this.combo = 0;
      this.missCount = 0;
    } else {
      // halve the combo on a soft miss
      this.combo = Math.floor(this.combo / 2);
    }
    // a miss re-widens the window slightly so recovery is possible
    this.windowMs = Math.min(this.cfg.windowMs, this.windowMs + this.cfg.decayPerHitMs * 2);
    this.lastHitAt = -Infinity;
  }

  /** Advance the window: if expired, decay combo. Call each frame with now. */
  tick(now: number): void {
    if (this.combo > 0 && now - this.lastHitAt > this.windowMs) {
      this.combo = 0;
      this.perfectStreak = 0;
    }
  }

  snapshot(): ComboSnapshot {
    return {
      combo: this.combo,
      maxCombo: this.maxCombo,
      perfectStreak: this.perfectStreak,
      maxPerfectStreak: this.maxPerfectStreak,
      hitsSinceMiss: this.hitsSinceMiss
    };
  }
}
