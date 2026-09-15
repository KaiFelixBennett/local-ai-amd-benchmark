import { clamp } from '../types';
import { BALANCE } from '../config/balance';

export interface DifficultyInputs {
  /** 0..1 overall accuracy this run */
  accuracy: number;
  /** recent-window accuracy, more reactive */
  recentAccuracy: number;
  combo: number;
  missStreak: number;
  avgReactionMs: number;
  /** fraction of the round elapsed (0..1); 0.5 for endless */
  progress: number;
  /** mode sensitivity multiplier */
  sensitivity: number;
  /** zen mode flattens everything */
  zen: boolean;
}

/**
 * Difficulty Director: smoothly steers a single factor in a clamped range based
 * on player performance. Keeps adaptation slow and bounded so it is fair and
 * predictable (and testable).
 */
export class DifficultyDirector {
  private _factor = 1;
  private _target = 1;
  readonly min: number;
  readonly max: number;

  constructor(min = BALANCE.difficulty.min, max = BALANCE.difficulty.max) {
    this.min = min;
    this.max = max;
  }

  get factor(): number {
    return this._factor;
  }

  get target(): number {
    return this._target;
  }

  private computeTarget(inputs: DifficultyInputs): number {
    const d = BALANCE.difficulty;
    let t = 1;

    // Accuracy: above target pushes harder, below eases off.
    t += (inputs.recentAccuracy - d.accuracyTarget) * d.nudgeAccuracyHigh * 4;
    if (inputs.accuracy < 0.35) t += d.nudgeAccuracyLow;
    if (inputs.accuracy > 0.75) t += d.nudgeAccuracyHigh * 0.6;

    // Combo momentum.
    if (inputs.combo >= 8) t += d.nudgeComboHigh * Math.min(2, inputs.combo / 8);

    // Miss streak eases off hard.
    if (inputs.missStreak >= 3) t += d.nudgeMissStreak * Math.min(2, inputs.missStreak / 3);

    // Reaction time.
    if (inputs.avgReactionMs > 0 && inputs.avgReactionMs < d.reactionGoodMs) t += 0.08;
    if (inputs.avgReactionMs > d.reactionBadMs) t -= 0.1;

    // Late-game escalation.
    if (inputs.progress > 0.75) t += d.nudgeLateGame;
    if (inputs.progress > 0.9) t += d.nudgeLateGame * 0.7;

    if (inputs.sensitivity > 0) t = 1 + (t - 1) * (1 + (inputs.sensitivity - 1) * 0.5);
    if (inputs.zen) t = 1 + (t - 1) * 0.25;

    return clamp(t, this.min, this.max);
  }

  /** Recompute the target and move the live factor toward it. */
  update(dtSec: number, inputs: DifficultyInputs): number {
    this._target = this.computeTarget(inputs);
    const rate = clamp(BALANCE.difficulty.rate * dtSec, 0, 1);
    this._factor += (this._target - this._factor) * rate;
    this._factor = clamp(this._factor, this.min, this.max);
    return this._factor;
  }

  /** Instantly set the factor (used by deterministic daily seeds / tests). */
  set(v: number): void {
    this._factor = clamp(v, this.min, this.max);
    this._target = this._factor;
  }
}
