/**
 * Difficulty Director: adapts spawn pressure to how well the player is doing.
 * Pure & deterministic so tests can assert the clamps. The view layer only
 * reads `difficulty`, `spawnRate` and `speedScale`.
 */

export interface DirectorInput {
  accuracy: number; // 0..1 over recent window (misses+hits)
  shots: number; // total shots this round (enough data?)
  combo: number; // current combo hits
  bestCombo: number;
  avgReaction: number; // seconds from target-visible to hit; -1 unknown
  escapesRecent: number; // targets that escaped in the last ~10s
  elapsed: number; // seconds since round start
  duration: number; // round length; -1 endless
  zen: boolean; // gentle mode: adaptation biased down
  fixedDifficulty?: number; // daily/tutorial: exact override, no adaptation
}

export interface DirectorTuning {
  base: number; // baseline difficulty factor
  ratePerMinute: number; // scripted ramp with elapsed time
  min: number; // hard clamp lower bound
  max: number; // hard clamp upper bound
  accuracyTarget: number; // factor rises when above, falls below
  reactTarget: number; // seconds: faster reactions => rise
}

export const DEFAULT_TUNING: DirectorTuning = {
  base: 1,
  ratePerMinute: 0.12,
  min: 0.6,
  max: 1.6,
  accuracyTarget: 0.55,
  reactTarget: 0.9,
};

export class DifficultyDirector {
  private factor: number;
  private readonly tuning: DirectorTuning;
  readonly fixed: number | undefined;

  constructor(tuning: Partial<DirectorTuning> = {}, fixed?: number) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this.fixed = fixed;
    this.factor = fixed ?? this.tuning.base;
  }

  /** Current clamped difficulty factor 0.6..1.6 (or exact fixed value). */
  get difficulty(): number {
    return this.factor;
  }

  /** Targets-per-second multiplier derived from difficulty. */
  get spawnRate(): number {
    // pressure grows a bit faster than raw factor
    return 0.75 + this.factor * 0.45;
  }

  /** Flight-speed multiplier (sub-linear so high difficulty stays fair). */
  get speedScale(): number {
    return 0.8 + this.factor * 0.25;
  }

  /** How many targets may be on screen at once (integer). */
  get maxConcurrent(): number {
    return Math.max(2, Math.round(2 + this.factor * 3.2));
  }

  /** Call once per frame with fresh player metrics. */
  update(input: DirectorInput): number {
    if (this.fixed !== undefined) {
      this.factor = clamp(this.fixed, this.tuning.min, this.tuning.max);
      return this.factor;
    }

    let target = this.tuning.base + this.tuning.ratePerMinute * (input.elapsed / 60);

    if (input.shots >= 8) {
      // accuracy pressure
      const accDelta = input.accuracy - this.tuning.accuracyTarget;
      target += clamp(accDelta * 1.6, -0.35, 0.4);
    }
    // combo pressure: sustained combos mean the player is comfortable
    if (input.combo >= 6) target += Math.min(0.3, (input.combo - 5) * 0.03);
    if (input.combo === 0 && input.shots >= 12) target -= 0.15;

    // reaction pressure: very fast hits => raise, slow => ease off
    if (input.avgReaction > 0 && input.shots >= 10) {
      if (input.avgReaction < this.tuning.reactTarget * 0.55) target += 0.2;
      else if (input.avgReaction > this.tuning.reactTarget * 1.8) target -= 0.25;
    }

    // escaping targets => ease pressure so the round still feels rewarding
    target -= Math.min(0.25, input.escapesRecent * 0.045);

    if (input.zen) target -= 0.35;

    // smooth towards target so it never jerks
    const k = 1 - Math.exp(-0.35); // gentle per-second-ish smoothing
    this.factor += (target - this.factor) * k;
    this.factor = clamp(this.factor, this.tuning.min, this.tuning.max);
    return this.factor;
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
