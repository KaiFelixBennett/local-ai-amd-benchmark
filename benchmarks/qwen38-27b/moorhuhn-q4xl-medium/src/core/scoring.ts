/**
 * Pure scoring logic. All numbers are configurable via ScoreParams.
 * No Phaser / no side effects — fully unit-testable.
 */

import type { ScoreBreakdown, TargetConfig } from './types';
import { SCORE_PARAMS } from './scoreParams';

export interface ScoreInput {
  target: TargetConfig;
  /** current combo count BEFORE this hit (0 = first hit of a streak) */
  comboBefore: number;
  /** target speed px/s */
  speed: number;
  /** apparent depth 0(back)..1(front) */
  depth: number;
  /** radius at depth (px) */
  radius: number;
  /** distance from target center in px (0 = dead center) */
  distanceFromCenter: number;
  /** active event multiplier (>=1) */
  eventMultiplier: number;
  /** true if this is part of a swarm formation */
  isSwarm: boolean;
  /** number of targets destroyed within the multikill window */
  multikills: number;
  /** true if the target travelled a long distance / from far */
  longshot: boolean;
  /** true if a trickshot combination is met */
  trick: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Combo multiplier given the number of consecutive hits already banked. */
export function comboMultiplier(comboBefore: number, params = SCORE_PARAMS): number {
  // linear-ish ramp: 1 + combo*step, capped
  const m = 1 + comboBefore * params.comboStep;
  return clamp(m, 1, params.comboMax);
}

export function perfectFactor(target: TargetConfig): number {
  return target.perfectFactor;
}

export function isPerfect(distanceFromCenter: number, radius: number, target: TargetConfig): boolean {
  return distanceFromCenter <= radius * target.perfectFactor;
}

/**
 * Compute a full, explainable score breakdown for a single successful hit.
 */
export function computeScore(input: ScoreInput, params = SCORE_PARAMS): ScoreBreakdown {
  const { target, comboBefore, speed, depth, radius, distanceFromCenter } = input;

  const base = target.baseScore;

  // Faster targets pay more (normalized against a reference speed).
  const speedBonus = Math.round(
    clamp((speed / params.speedRef) - 1, 0, params.speedMaxFactor) * params.speedPointScale
  );

  // Closer (front) targets pay a little more; far targets less.
  const depthBonus = Math.round((depth - 0.5) * 2 * params.depthPointScale);

  // Smaller targets pay more.
  const sizeBonus = Math.round(clamp((params.sizeRef - radius) / params.sizeRef, 0, 1) * params.sizePointScale);

  const perfect = isPerfect(distanceFromCenter, radius, target);
  // Precision: closer to center = more, up to the perfect threshold.
  const precisionRatio = clamp(1 - distanceFromCenter / radius, 0, 1);
  const precisionBonus = Math.round(precisionRatio * params.precisionPointScale);
  const perfectBonus = perfect ? params.perfectBonus : 0;

  const comboMult = comboMultiplier(comboBefore, params);

  // Streak bonus: bonus every N consecutive hits (flat).
  const streakBonus = comboBefore >= params.streakThreshold ? params.streakBonus : 0;

  const eventMultiplier = Math.max(1, input.eventMultiplier);

  // Swarm bonus: hitting a member of a swarm formation.
  const swarmBonus = input.isSwarm ? params.swarmBonus : 0;

  // Multikill bonus scales with count (2nd+ kill in window).
  const multikillBonus = input.multikills > 1 ? params.multikillBonus * (input.multikills - 1) : 0;

  // Longshot bonus for far / long-distance targets.
  const longshotBonus = input.longshot ? params.longshotBonus : 0;

  // Trickshot bonus for special environment combos.
  const trickBonus = input.trick ? params.trickBonus : 0;

  const subtotal =
    base + speedBonus + depthBonus + sizeBonus + precisionBonus + streakBonus + swarmBonus + multikillBonus + longshotBonus + trickBonus;

  const total = Math.round(subtotal * comboMult * eventMultiplier) + perfectBonus;

  return {
    base,
    speedBonus,
    depthBonus,
    sizeBonus,
    precisionBonus,
    comboMultiplier: comboMult,
    streakBonus,
    eventMultiplier,
    swarmBonus,
    multikillBonus,
    longshotBonus,
    trickBonus,
    perfectBonus,
    total,
    isPerfect: perfect
  };
}
