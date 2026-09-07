import { BALANCE } from '../config/balance';

export interface DifficultyMetrics {
  accuracy: number; // 0..1 recent accuracy
  comboCount: number;
  avgReactionTimeMs: number;
  missStreak: number;
  timeRemainingFraction: number; // 0..1
}

/**
 * Periodically nudges a bounded difficulty factor up or down based on recent
 * player performance. Adjustments are small, clamped and evaluated on a
 * fixed interval so the response is gradual and never punishes a single
 * lucky/unlucky moment, and never runs away in either direction.
 */
export class DifficultyDirector {
  private factor = 1.0;
  private lastEvalAt = 0;
  private readonly cfg = BALANCE.difficultyDirector;

  getFactor(): number {
    return this.factor;
  }

  reset(): void {
    this.factor = 1.0;
    this.lastEvalAt = 0;
  }

  /** Re-evaluates the difficulty factor if the evaluation interval has elapsed; returns current factor. */
  update(now: number, metrics: DifficultyMetrics): number {
    if (now - this.lastEvalAt < this.cfg.evaluateIntervalMs) {
      return this.factor;
    }
    this.lastEvalAt = now;

    const accuracyDelta = metrics.accuracy - this.cfg.accuracyTarget;
    let step = 0;

    if (accuracyDelta > 0.08) step += this.cfg.adjustStep;
    else if (accuracyDelta < -0.08) step -= this.cfg.adjustStep;

    if (metrics.comboCount >= 15) step += this.cfg.adjustStep * 0.5;
    if (metrics.missStreak >= 2) step -= this.cfg.adjustStep * 0.5;

    // Ease off slightly in the final stretch of a round so the finale reads as
    // a deliberate spike (events/bosses) rather than the director alone.
    if (metrics.timeRemainingFraction < 0.15) step *= 0.5;

    this.factor = clamp(this.factor + step, this.cfg.minFactor, this.cfg.maxFactor);
    return this.factor;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
