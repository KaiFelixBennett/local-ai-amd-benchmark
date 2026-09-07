import type { RankId, RankThresholds, ScoreBreakdownEntry } from '../core/types';
import { BALANCE } from '../config/balance';

export interface HitContext {
  baseScore: number;
  /** 1.0 = nominal speed; >1 rewards faster targets, <1 for slower ones. */
  speedFactor: number;
  /** 1.0 = nominal depth; >1 rewards targets that appeared further away / smaller on screen. */
  depthFactor: number;
  /** 1.0 = nominal size; >1 rewards smaller, harder-to-hit targets. */
  sizeFactor: number;
  /** 0..1, how close to the exact center of the hitbox the shot landed. */
  precision01: number;
  comboMultiplier: number;
  eventMultiplier: number;
  /** 0..1, fraction of round time remaining at the moment of the hit. */
  timeRemainingFraction: number;
  isPerfect: boolean;
}

export interface HitScoreResult {
  total: number;
  breakdown: ScoreBreakdownEntry[];
}

/** Pure, deterministic score calculation for a single hit. */
export function calculateHitScore(ctx: HitContext): HitScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [{ label: 'base', value: Math.round(ctx.baseScore) }];

  const speedBonus = Math.round(ctx.baseScore * (ctx.speedFactor - 1) * 0.5);
  if (speedBonus !== 0) breakdown.push({ label: 'speed', value: speedBonus });

  const depthBonus = Math.round(ctx.baseScore * (ctx.depthFactor - 1) * 0.3);
  if (depthBonus !== 0) breakdown.push({ label: 'depth', value: depthBonus });

  const sizeBonus = Math.round(ctx.baseScore * (ctx.sizeFactor - 1) * 0.3);
  if (sizeBonus !== 0) breakdown.push({ label: 'size', value: sizeBonus });

  const precisionBonus = Math.round(ctx.baseScore * Math.max(0, ctx.precision01) * 0.2);
  if (precisionBonus !== 0) breakdown.push({ label: 'precision', value: precisionBonus });

  const timeBonus = Math.round(ctx.baseScore * Math.max(0, ctx.timeRemainingFraction) * 0.1);
  if (timeBonus !== 0) breakdown.push({ label: 'time', value: timeBonus });

  let preMultiplier = ctx.baseScore + speedBonus + depthBonus + sizeBonus + precisionBonus + timeBonus;

  if (ctx.isPerfect) {
    const perfectBonus = Math.round(preMultiplier * (BALANCE.scoring.perfectHitBonusMultiplier - 1));
    preMultiplier += perfectBonus;
    breakdown.push({ label: 'perfect', value: perfectBonus });
  }

  const totalMultiplier = Math.max(0, ctx.comboMultiplier) * Math.max(0, ctx.eventMultiplier);
  const total = Math.max(0, Math.round(preMultiplier * totalMultiplier));

  if (ctx.comboMultiplier > 1.001) {
    breakdown.push({
      label: 'combo',
      value: Math.round(preMultiplier * ctx.comboMultiplier) - Math.round(preMultiplier),
    });
  }
  if (ctx.eventMultiplier > 1.001) {
    breakdown.push({
      label: 'event',
      value: total - Math.round(preMultiplier * ctx.comboMultiplier),
    });
  }

  return { total, breakdown };
}

const RANK_ORDER: RankId[] = ['SSS', 'SS', 'S', 'A', 'B', 'C', 'D'];

/** Determines the rank for a final score given a set of thresholds (highest match wins). */
export function calculateRank(score: number, thresholds: RankThresholds = BALANCE.rank.thresholds): RankId {
  for (const rank of RANK_ORDER) {
    if (score >= thresholds[rank]) return rank;
  }
  return 'D';
}

export function calculateAccuracy(hits: number, shotsFired: number): number {
  if (shotsFired <= 0) return 0;
  return Math.min(1, hits / shotsFired);
}
