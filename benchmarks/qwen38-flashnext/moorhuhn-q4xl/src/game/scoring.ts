import type { Rank, ScoreBreakdown, ShotHitInfo } from '../core/types';

/** Central balance knobs for the score formula (tweak here, not at call sites). */
export const SCORE_CFG = {
  maxSpeed: 700, // px/s at which the speed bonus saturates
  speedBonusRange: [1.0, 1.9] as const, // multiplier at 0 / max speed
  depthBonusRange: [1.0, 2.4] as const, // multiplier at far / near
  sizeBonusRange: [1.8, 1.0] as const, // small targets (scale 0.5) / big (scale 1.2)
  precisionBonusMax: 0.6, // perfect = up to +60%
  comboPerHit: 0.12, // +12% per combo hit
  comboMax: 4.0, // cap on the combo multiplier
  endTimeBonusRange: [1.0, 1.35] as const, // low time left / high time left
  perfectBonus: 55, // flat bonus on perfect
  longshotSpeed: 620,
  longshotBonus: 250,
  trickshotBonus: 500,
  swarmBonus: 900,
  multikillBonus: 200, // per extra kill in the same shot
} as const;

/** Is a hit "perfect" (centre of the hitbox)? */
export function isPrecision(precision: number, cfg: { perfectRatio: number }): boolean {
  return precision <= cfg.perfectRatio;
}

/**
 * Deterministic score pipeline for one hit. Pure: same input, same output.
 * All multipliers clamped so no single factor dominates absurdly.
 */
export function computeShotScore(info: ShotHitInfo, base: number): ScoreBreakdown {
  if (base <= 0) {
    return {
      base: 0,
      speed: 0,
      depth: 0,
      size: 0,
      precision: 0,
      combo: 0,
      time: 0,
      event: info.eventMultiplier,
      bonus: 0,
      total: 0,
      perfect: false,
    };
  }
  const sp = lerp(SCORE_CFG.speedBonusRange[0], SCORE_CFG.speedBonusRange[1],
    clamp01(info.speed / SCORE_CFG.maxSpeed));
  const dp =
    lerp(SCORE_CFG.depthBonusRange[0], SCORE_CFG.depthBonusRange[1], clamp01(info.depth)) *
    (1 + clampPositive(info.kindBonusDepthPoints) * clamp01(info.depth));
  const sz = lerp(SCORE_CFG.sizeBonusRange[0], SCORE_CFG.sizeBonusRange[1],
    clamp01((info.sizeScale - 0.5) / 0.7));
  const pr = isPrecision(info.precision, { perfectRatio: 1 }) ? 0 : precisionFactor(info.precision);
  const cb = clampPositive(1 + info.comboHits * SCORE_CFG.comboPerHit, 1, SCORE_CFG.comboMax);
  const tm = info.timeLeft < 0
    ? 1
    : lerp(SCORE_CFG.endTimeBonusRange[0], SCORE_CFG.endTimeBonusRange[1],
        clamp01(info.timeLeft / 120));
  let bonus = 0;
  if (info.perfect) bonus += SCORE_CFG.perfectBonus;
  if (info.longshot) bonus += SCORE_CFG.longshotBonus;
  if (info.trickshot) bonus += SCORE_CFG.trickshotBonus;
  if (info.swarmBonus) bonus += SCORE_CFG.swarmBonus;

  const total = base * sp * dp * sz * (1 + pr) * cb * tm * Math.max(0.25, info.eventMultiplier);
  return {
    base,
    speed: Math.round(base * (sp - 1)),
    depth: Math.round(base * (dp - 1)),
    size: Math.round(base * (sz - 1)),
    precision: Math.round(base * pr),
    combo: Math.round(base * (cb - 1)),
    time: Math.round(base * (tm - 1)),
    event: info.eventMultiplier,
    bonus,
    total: Math.max(1, Math.round(total + bonus)),
    perfect: info.perfect,
  };
}

/** precision 0 (centre) .. 1 (edge) -> bonus factor. */
export function precisionFactor(precision: number): number {
  const p = clamp01(precision);
  // linear falloff, perfect zone handled separately
  return SCORE_CFG.precisionBonusMax * (1 - p * 0.5);
}

export function isLongshot(speed: number, depth: number): boolean {
  return speed >= SCORE_CFG.longshotSpeed && depth < 0.55;
}

export function multikillBonus(extraKills: number): number {
  return Math.max(0, extraKills - 1) > 0
    ? Math.round(SCORE_CFG.multikillBonus * (extraKills - 1))
    : 0;
}

// ---------- rank ----------

const RANK_THRESHOLDS: { rank: Rank; min: number }[] = [
  { rank: 'SSS', min: 0.99 },
  { rank: 'SS', min: 0.86 },
  { rank: 'S', min: 0.72 },
  { rank: 'A', min: 0.56 },
  { rank: 'B', min: 0.4 },
  { rank: 'C', min: 0.24 },
];

/**
 * Rank from score normalised against a par score for the round length/lengthscale.
 * par accounts for mode and duration so short modes aren't unfairly D-ranked.
 */
export function rankFor(score: number, par: number): Rank {
  const p = Math.max(1, par);
  const r = score / p;
  for (const t of RANK_THRESHOLDS) if (r >= t.min) return t.rank;
  return 'D';
}

/** Rough expected score for a skilled round: used as par baseline. */
export function parScore(durationSec: number, scoreMult = 1): number {
  const d = durationSec < 0 ? 180 : durationSec; // endless uses a 180s yardstick
  return Math.round((d * 95 + d * d * 0.42) * Math.max(0.4, scoreMult));
}

export const RANK_ORDER: Rank[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

export function rankAtLeast(a: Rank, b: Rank): boolean {
  return RANK_ORDER.indexOf(a) >= RANK_ORDER.indexOf(b);
}

// ---------- helpers ----------

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampPositive(v: number, min = 0, max = Infinity): number {
  return v < min ? min : v > max ? max : v;
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
