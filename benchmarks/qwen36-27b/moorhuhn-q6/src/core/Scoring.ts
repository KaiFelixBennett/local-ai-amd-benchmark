import type { TargetTypeConfig, ScoreBreakdown, ComboState, GameMode, RoundResult, Rank, TargetTypeId } from '../types';

/**
 * Calculate the score for a single hit on a target.
 */
export function calculateHitScore(params: {
  target: TargetTypeConfig;
  targetSpeed: number;
  targetDistance: number; // 0..1, 0=close, 1=far
  targetSize: number; // actual scale used
  hitOffset: number; // pixels from center (0 = bullseye)
  hitboxRadius: number;
  perfectRadius: number;
  combo: ComboState;
  timeLeft: number;
  roundDuration: number;
  eventMultiplier: number;
  streakHits: number;
  swarmBonus: number;
  trickshotBonus: number;
  mode: GameMode;
}): ScoreBreakdown {
  const {
    target,
    targetSpeed,
    targetDistance,
    targetSize,
    hitOffset,
    hitboxRadius,
    perfectRadius,
    combo,
    timeLeft,
    roundDuration,
    eventMultiplier,
    streakHits,
    swarmBonus,
    trickshotBonus,
    mode,
  } = params;

  const isPerfect = hitOffset <= perfectRadius;

  // Base score from target config
  let baseScore = target.baseScore;

  // Speed multiplier: faster targets = more points
  const speedMultiplier = 1 + targetSpeed / 500;

  // Distance multiplier: farther = harder = more points
  const distanceMultiplier = 1 + targetDistance * 0.5;

  // Size multiplier: smaller = harder = more points
  const sizeMultiplier = 1 + (1 - targetSize) * 0.3;

  // Precision bonus: closer to center = more bonus
  const precision = Math.max(0, 1 - hitOffset / hitboxRadius);
  const precisionBonus = isPerfect ? Math.round(baseScore * precision * 0.5) : Math.round(baseScore * precision * 0.15);

  // Combo multiplier
  const comboMultiplier = combo.multiplier;

  // Streak bonus
  const streakBonus = streakHits >= 10 ? Math.round(baseScore * 0.2 * (streakHits - 9)) : 0;

  // Time bonus: less time left = more pressure = more points
  const timeRatio = roundDuration > 0 ? 1 - timeLeft / roundDuration : 0.5;
  const timeBonus = Math.round(baseScore * timeRatio * 0.15);

  let total = Math.round(
    (baseScore * speedMultiplier * distanceMultiplier * sizeMultiplier + precisionBonus + streakBonus + timeBonus) *
      comboMultiplier *
      eventMultiplier
  );
  total += swarmBonus + trickshotBonus;

  // Negative scores for decoys
  if (target.isDecoy) {
    total = baseScore; // already negative
  }

  return {
    baseScore: Math.round(baseScore),
    speedMultiplier,
    distanceMultiplier,
    sizeMultiplier,
    precisionBonus,
    comboMultiplier,
    streakBonus,
    timeBonus,
    eventMultiplier,
    swarmBonus,
    trickshotBonus,
    total,
    isPerfect,
  };
}

/**
 * Calculate the rank based on total score.
 */
export function calculateRank(score: number): Rank {
  if (score >= 50000) return 'SSS';
  if (score >= 35000) return 'SS';
  if (score >= 25000) return 'S';
  if (score >= 15000) return 'A';
  if (score >= 8000) return 'B';
  if (score >= 3000) return 'C';
  return 'D';
}

/**
 * Get the XP earned from a round result.
 */
export function calculateXP(result: RoundResult): number {
  let xp = Math.round(result.totalScore / 10);
  if (result.rank === 'S') xp = Math.round(xp * 1.5);
  if (result.rank === 'SS') xp = Math.round(xp * 2.0);
  if (result.rank === 'SSS') xp = Math.round(xp * 3.0);
  if (result.newRecord) xp = Math.round(xp * 1.2);
  if (result.accuracy >= 80) xp = Math.round(xp * 1.1);
  return xp;
}

/**
 * Get the level from total XP.
 */
export function calculateLevel(totalXp: number): number {
  // Each level needs level * 200 XP
  let needed = 0;
  let level = 1;
  while (totalXp >= needed) {
    needed += level * 200;
    level++;
  }
  return level - 1;
}

/**
 * Build a complete RoundResult from game state data.
 */
export function buildRoundResult(params: {
  totalScore: number;
  hits: number;
  misses: number;
  shots: number;
  perfectHits: number;
  maxCombo: number;
  bestHit: number;
  reactionTimes: number[];
  targetTypesHit: Map<TargetTypeId, number>;
  eventBonuses: number;
  chainBonuses?: number;
  personalBest: number;
}): RoundResult {
  const {
    totalScore,
    hits,
    misses,
    shots,
    perfectHits,
    maxCombo,
    bestHit,
    reactionTimes,
    targetTypesHit,
    eventBonuses,
    chainBonuses = 0,
    personalBest,
  } = params;

  const accuracy = shots > 0 ? Math.round((hits / shots) * 1000) / 10 : 0;
  const avgReaction = reactionTimes.length > 0 ? reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length : 0;
  const newRecord = totalScore > personalBest;
  const xpEarned = calculateXP({
    totalScore,
    hits,
    misses,
    shots,
    accuracy,
    perfectHits,
    maxCombo,
    bestHit,
    reactionTime: avgReaction,
    targetTypesHit,
    eventBonuses,
    chainBonuses,
    personalBest: newRecord ? totalScore : personalBest,
    rank: calculateRank(totalScore),
    newRecord,
    xpEarned: 0,
    currencyEarned: 0,
  });

  const currencyEarned = Math.round(totalScore / 50);

  return {
    totalScore,
    hits,
    misses,
    shots,
    accuracy,
    perfectHits,
    maxCombo,
    bestHit,
    reactionTime: Math.round(avgReaction),
    targetTypesHit,
    eventBonuses,
    chainBonuses,
    personalBest: Math.max(personalBest, totalScore),
    rank: calculateRank(totalScore),
    newRecord,
    xpEarned,
    currencyEarned,
  };
}
