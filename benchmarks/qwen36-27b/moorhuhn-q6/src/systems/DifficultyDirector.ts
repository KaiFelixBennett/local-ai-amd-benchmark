/**
 * Difficulty Director - dynamically adjusts difficulty based on player performance.
 * Keeps good players challenged without overwhelming newcomers.
 */

export interface DifficultyStats {
  hitRate: number; // 0..1
  currentCombo: number;
  misses: number;
  score: number;
  timeRemaining: number;
  roundDuration: number;
}

export class DifficultyDirector {
  private factor: number = 1.0;
  private minFactor: number;
  private maxFactor: number;
  private adjustmentRate: number; // How fast difficulty can change per evaluation
  private lastEvaluation: number = 0;
  private evaluationInterval: number = 5000; // ms between evaluations

  constructor(minFactor = 0.6, maxFactor = 2.0, adjustmentRate = 0.05) {
    this.minFactor = minFactor;
    this.maxFactor = maxFactor;
    this.adjustmentRate = adjustmentRate;
  }

  /** Evaluate and adjust difficulty based on current stats. */
  evaluate(stats: DifficultyStats, now: number): number {
    if (now - this.lastEvaluation < this.evaluationInterval) {
      return this.factor;
    }
    this.lastEvaluation = now;

    const { hitRate, currentCombo, misses, score, timeRemaining, roundDuration } = stats;

    // Time progression: difficulty naturally increases over time
    const timeRatio = roundDuration > 0 ? 1 - timeRemaining / roundDuration : 0.5;
    const timePressure = timeRatio * 0.3; // Max +0.3 from time alone

    // Hit rate: high hit rate = player is doing well, increase difficulty
    let hitAdjustment = 0;
    if (hitRate > 0.7) hitAdjustment = (hitRate - 0.7) * 0.5;
    if (hitRate < 0.3) hitAdjustment = (hitRate - 0.3) * 0.3;

    // Combo: high combo = player is in flow, slight increase
    const comboAdjustment = Math.min(0.2, currentCombo / 50);

    // Misses: too many misses = decrease difficulty
    const missAdjustment = -Math.min(0.15, misses * 0.01);

    // Score-based: high score = increase slightly
    const scorePerSecond = roundDuration > 0 ? score / (roundDuration - timeRemaining + 1) : 0;
    const scoreAdjustment = Math.min(0.1, Math.max(-0.05, (scorePerSecond - 100) / 2000));

    const totalAdjustment = timePressure + hitAdjustment + comboAdjustment + missAdjustment + scoreAdjustment;

    // Apply adjustment with rate limiting
    this.factor += totalAdjustment * this.adjustmentRate;
    this.factor = Math.max(this.minFactor, Math.min(this.maxFactor, this.factor));

    return this.factor;
  }

  getFactor(): number {
    return this.factor;
  }

  setFactor(factor: number): void {
    this.factor = Math.max(this.minFactor, Math.min(this.maxFactor, factor));
  }

  reset(): void {
    this.factor = 1.0;
    this.lastEvaluation = 0;
  }
}
