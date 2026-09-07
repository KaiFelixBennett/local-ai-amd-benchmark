import type { RankThresholds } from '../core/types';

/** Central, tweakable balance values. Nothing gameplay-relevant should be hard-coded elsewhere. */
export const BALANCE = {
  weapon: {
    magazineSize: 6,
    reloadDurationMs: 950,
    shotCooldownMs: 90,
    precisionModeMagazineSize: 6,
    precisionModeMaxMagazines: 12,
  },
  combo: {
    windowMs: 2600,
    blitzWindowMs: 1500,
    multiplierPerCombo: 0.08,
    maxMultiplier: 4.0,
    missDamage: 0.5, // fraction of combo lost on a miss (not full reset)
    missBreakThreshold: 3, // consecutive misses required to fully break combo
  },
  scoring: {
    perfectHitBonusMultiplier: 1.5,
    longshotDistanceThreshold: 620,
    longshotBonus: 45,
    multikillWindowMs: 450,
    multikillBonusPerExtra: 30,
    swarmBonusPerBird: 60,
    noMissStreakBonusEvery: 10,
    noMissStreakBonus: 80,
    trickshotBonus: 120,
  },
  rank: {
    thresholds: {
      SSS: 42000,
      SS: 32000,
      S: 24000,
      A: 17000,
      B: 11000,
      C: 6000,
      D: 0,
    } satisfies RankThresholds,
  },
  difficultyDirector: {
    minFactor: 0.6,
    maxFactor: 1.8,
    adjustStep: 0.05,
    evaluateIntervalMs: 3500,
    accuracyTarget: 0.62,
  },
  spawn: {
    baseSpawnIntervalMs: 1100,
    minSpawnIntervalMs: 420,
    maxConcurrentTargets: 9,
  },
  progression: {
    xpPerHit: 8,
    xpPerPerfectHit: 4,
    xpPerKill: 12,
    xpPerBossKill: 250,
    xpRoundCompletionBase: 60,
    xpToNextLevelBase: 400,
    xpToNextLevelGrowth: 1.18,
    currencyPerRank: {
      D: 20,
      C: 35,
      B: 55,
      A: 80,
      S: 120,
      SS: 170,
      SSS: 240,
    } as Record<string, number>,
  },
  roundDurations: {
    classicMs: 120_000,
    blitzMs: 60_000,
    precisionMs: 100_000,
    zenMs: 110_000,
  },
} as const;
