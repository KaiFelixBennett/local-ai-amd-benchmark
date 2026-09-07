/**
 * Achievement definitions + pure evaluation against a snapshot of stats.
 */

import type { Achievement, PlayerStats } from './types';
import type { Rank } from './types';

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'streak_20',
    nameKey: 'ach.streak20',
    descKey: 'ach.streak20.desc',
    target: 20,
    stat: 'longestCombo',
    icon: '🔥',
    reward: 40
  },
  {
    id: 'perfect_5',
    nameKey: 'ach.perfect5',
    descKey: 'ach.perfect5.desc',
    target: 5,
    stat: 'totalPerfect',
    icon: '🎯',
    reward: 50
  },
  {
    id: 'boss_kill',
    nameKey: 'ach.boss',
    descKey: 'ach.boss.desc',
    target: 1,
    stat: 'bossKills',
    icon: '👑',
    reward: 80
  },
  {
    id: 'chain_react',
    nameKey: 'ach.chain',
    descKey: 'ach.chain.desc',
    target: 3,
    stat: 'chainReactions',
    icon: '⚡',
    reward: 60
  },
  {
    id: 'sharpshooter',
    nameKey: 'ach.sharp',
    descKey: 'ach.sharp.desc',
    target: 500,
    stat: 'totalHits',
    icon: '🏹',
    reward: 60
  },
  {
    id: 'high_scorer',
    nameKey: 'ach.score',
    descKey: 'ach.score.desc',
    target: 20000,
    stat: 'bestScore',
    icon: '💰',
    reward: 90
  },
  {
    id: 'explorer',
    nameKey: 'ach.explorer',
    descKey: 'ach.explorer.desc',
    target: 50,
    stat: 'totalScore',
    icon: '🗺️',
    reward: 70
  },
  {
    id: 'veteran',
    nameKey: 'ach.veteran',
    descKey: 'ach.veteran.desc',
    target: 30,
    stat: 'totalRounds',
    icon: '🎖️',
    reward: 70
  }
];

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}

/** Resolve the numeric value of an achievement's tracked stat. */
export function statValue(stats: PlayerStats, stat: Achievement['stat']): number {
  if (stat === 'bestRank') return rankScore(stats.bestRank);
  return (stats[stat as keyof PlayerStats] as number) ?? 0;
}

function rankScore(rank: Rank): number {
  const order: Rank[] = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
  return order.indexOf(rank) + 1;
}

export interface AchievementResult {
  id: string;
  unlocked: boolean;
  progress: number;
  target: number;
  done: boolean;
}

/** Check which achievements are newly unlocked given the current stats. */
export function evaluateAchievements(
  stats: PlayerStats,
  alreadyUnlocked: string[]
): AchievementResult[] {
  const set = new Set(alreadyUnlocked);
  return ACHIEVEMENTS.map((a) => {
    const value = statValue(stats, a.stat);
    const done = value >= a.target;
    return {
      id: a.id,
      unlocked: set.has(a.id) || done,
      progress: Math.min(value, a.target),
      target: a.target,
      done
    };
  });
}
