import type { ProgressionState, RankId, RunStats } from '../core/types';
import { BALANCE } from '../config/balance';

export function xpRequiredForLevel(level: number): number {
  return Math.round(
    BALANCE.progression.xpToNextLevelBase * Math.pow(BALANCE.progression.xpToNextLevelGrowth, level - 1),
  );
}

export interface XpGainResult {
  progression: ProgressionState;
  levelsGained: number;
}

/** Applies XP gain, handling (possibly multiple) level-ups. Pure function, easy to unit test. */
export function applyXpGain(progression: ProgressionState, xpGained: number): XpGainResult {
  let { level, xp, xpToNextLevel } = progression;
  const { currency } = progression;
  xp += Math.max(0, xpGained);
  let levelsGained = 0;
  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level += 1;
    levelsGained += 1;
    xpToNextLevel = xpRequiredForLevel(level);
  }
  return { progression: { level, xp, xpToNextLevel, currency }, levelsGained };
}

export function computeRoundXp(stats: RunStats): number {
  const xp =
    stats.hits * BALANCE.progression.xpPerHit +
    stats.perfectHits * BALANCE.progression.xpPerPerfectHit +
    stats.bossesDefeated * BALANCE.progression.xpPerBossKill +
    BALANCE.progression.xpRoundCompletionBase;
  return Math.round(xp);
}

export function computeRoundCurrency(rank: RankId): number {
  return BALANCE.progression.currencyPerRank[rank] ?? 0;
}
