import type { AchievementProgress, ChallengeProgress } from '../core/types';
import { ACHIEVEMENT_CONFIGS, type AchievementConfig } from '../config/achievements';
import { CHALLENGE_CONFIGS } from '../config/challenges';

export interface CumulativeStatsSnapshot {
  cumulativeHits: number;
  cumulativeShots: number;
  bestCombo: number;
  bossesDefeated: number;
  chainReactionsTriggered: number;
  roundsPlayed: number;
  playerLevel: number;
  roundFlags: ReadonlySet<string>;
}

function valueFor(config: AchievementConfig, snapshot: CumulativeStatsSnapshot): number {
  switch (config.condition.type) {
    case 'cumulativeHits':
      return snapshot.cumulativeHits;
    case 'cumulativeShots':
      return snapshot.cumulativeShots;
    case 'bestCombo':
      return snapshot.bestCombo;
    case 'bossesDefeated':
      return snapshot.bossesDefeated;
    case 'chainReactionsTriggered':
      return snapshot.chainReactionsTriggered;
    case 'roundsPlayed':
      return snapshot.roundsPlayed;
    case 'playerLevel':
      return snapshot.playerLevel;
    case 'roundEventFlag':
      return config.condition.flag && snapshot.roundFlags.has(config.condition.flag) ? 1 : 0;
    default:
      return 0;
  }
}

export interface AchievementEvaluationResult {
  updated: AchievementProgress[];
  newlyUnlocked: AchievementConfig[];
}

/** Evaluates achievement conditions against current cumulative stats; pure and idempotent. */
export function evaluateAchievements(
  existing: AchievementProgress[],
  snapshot: CumulativeStatsSnapshot,
): AchievementEvaluationResult {
  const byId = new Map(existing.map((a) => [a.id, a]));
  const newlyUnlocked: AchievementConfig[] = [];

  const updated: AchievementProgress[] = ACHIEVEMENT_CONFIGS.map((config) => {
    const prior = byId.get(config.id) ?? { id: config.id, unlocked: false, progress: 0 };
    if (prior.unlocked) return prior;

    const value = valueFor(config, snapshot);
    const progress = Math.min(1, value / config.condition.target);
    if (value >= config.condition.target) {
      newlyUnlocked.push(config);
      return { id: config.id, unlocked: true, unlockedAt: Date.now(), progress: 1 };
    }
    return { id: config.id, unlocked: false, progress };
  });

  return { updated, newlyUnlocked };
}

export interface ChallengeEvaluationResult {
  updated: ChallengeProgress[];
  newlyCompleted: string[];
}

/** Marks challenges complete when their flag was set during the just-finished round. */
export function evaluateChallenges(
  existing: ChallengeProgress[],
  roundFlags: ReadonlySet<string>,
): ChallengeEvaluationResult {
  const byId = new Map(existing.map((c) => [c.id, c]));
  const newlyCompleted: string[] = [];

  const updated: ChallengeProgress[] = CHALLENGE_CONFIGS.map((config) => {
    const prior = byId.get(config.id) ?? { id: config.id, progress: 0, completed: false };
    if (prior.completed) return prior;
    if (roundFlags.has(config.flag)) {
      newlyCompleted.push(config.id);
      return { id: config.id, progress: 1, completed: true, completedAt: Date.now() };
    }
    return prior;
  });

  return { updated, newlyCompleted };
}
