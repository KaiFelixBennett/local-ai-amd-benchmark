/**
 * Combo lifecycle: hits extend a decaying timer; the multiplier grows with the
 * combo count; misses damage (not fully reset) the streak. Pure time-stepped
 * so it can be unit tested.
 */
export interface ComboConfig {
  window: number; // seconds a hit keeps the combo warm
  decayPerSec: number; // combo hits lost per idle second
  minComboToKeep: number;
  milestoneEvery: number; // milestone pulse cadence
}

export interface ComboSnapshot {
  combo: number;
  mult: number;
  timeLeft: number;
}

export class ComboSystem {
  private combo = 0;
  private timer = 0;
  private cfg: ComboConfig;

  constructor(cfg: ComboConfig) {
    this.cfg = cfg;
  }

  get state(): ComboSnapshot {
    return { combo: this.combo, mult: this.mult, timeLeft: this.timer };
  }

  get mult(): number {
    // deterministic multiplier curve used for display (score applies its own curve)
    return 1 + Math.floor(this.combo / 5) * 0.5;
  }

  /** Register a hit. Returns true when a milestone was crossed. */
  hit(): boolean {
    const before = this.milestoneIndex();
    this.combo += 1;
    this.timer = this.cfg.window;
    const milestone = this.milestoneIndex() > before;
    return milestone;
  }

  /** A miss damages the combo but never zero-shatters a big streak outright. */
  miss(zenGentle = false): void {
    if (this.combo === 0) return;
    const penalty = zenGentle ? Math.ceil(this.combo * 0.15) : Math.max(2, Math.ceil(this.combo * 0.4));
    this.combo = Math.max(0, this.combo - penalty);
    if (this.combo === 0) this.timer = 0;
  }

  update(dt: number): void {
    if (this.combo === 0) {
      this.timer = 0;
      return;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      // idle: bleed combo gradually until floor
      const drained = Math.ceil(dt * this.cfg.decayPerSec);
      this.combo = Math.max(0, this.combo - Math.max(1, drained));
      this.timer = drained > 0 ? 0.35 : 0;
      if (this.combo < this.cfg.minComboToKeep) {
        this.combo = 0;
        this.timer = 0;
      }
    }
  }

  reset(): void {
    this.combo = 0;
    this.timer = 0;
  }

  private milestoneIndex(): number {
    const m = this.cfg.milestoneEvery;
    if (m <= 0) return 0;
    return Math.floor(this.combo / m);
  }
}
