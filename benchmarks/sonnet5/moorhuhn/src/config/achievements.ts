export type AchievementConditionType =
  | 'cumulativeHits'
  | 'cumulativeShots'
  | 'bestCombo'
  | 'bossesDefeated'
  | 'chainReactionsTriggered'
  | 'roundsPlayed'
  | 'playerLevel'
  | 'roundEventFlag';

export interface AchievementConfig {
  id: string;
  nameKey: string;
  descriptionKey: string;
  hidden: boolean;
  condition: { type: AchievementConditionType; target: number; flag?: string };
  currencyReward: number;
  xpReward: number;
}

/**
 * Round-end event flags (set into RunStats.eventFlags by GameScene / systems)
 * that some achievements key off of via the 'roundEventFlag' condition type.
 */
export const ACHIEVEMENT_FLAGS = {
  NO_MISS_20: 'noMiss20',
  PERFECT_STREAK_5: 'perfectStreak5',
  SWARM_IN_3S: 'swarmIn3s',
  BOSS_NO_MISS: 'bossNoMiss',
  ALL_HIDDEN_FOUND: 'allHiddenFound',
  ACCURACY_80: 'accuracy80',
  CHAIN_5: 'chain5',
  GOLD_DURING_STORM: 'goldDuringStorm',
} as const;

export const ACHIEVEMENT_CONFIGS: AchievementConfig[] = [
  {
    id: 'first_flight',
    nameKey: 'achievement.first_flight.name',
    descriptionKey: 'achievement.first_flight.desc',
    hidden: false,
    condition: { type: 'roundsPlayed', target: 1 },
    currencyReward: 25,
    xpReward: 20,
  },
  {
    id: 'sharpshooter_100',
    nameKey: 'achievement.sharpshooter_100.name',
    descriptionKey: 'achievement.sharpshooter_100.desc',
    hidden: false,
    condition: { type: 'cumulativeHits', target: 100 },
    currencyReward: 40,
    xpReward: 40,
  },
  {
    id: 'sharpshooter_1000',
    nameKey: 'achievement.sharpshooter_1000.name',
    descriptionKey: 'achievement.sharpshooter_1000.desc',
    hidden: false,
    condition: { type: 'cumulativeHits', target: 1000 },
    currencyReward: 200,
    xpReward: 200,
  },
  {
    id: 'combo_master',
    nameKey: 'achievement.combo_master.name',
    descriptionKey: 'achievement.combo_master.desc',
    hidden: false,
    condition: { type: 'bestCombo', target: 25 },
    currencyReward: 60,
    xpReward: 60,
  },
  {
    id: 'boss_slayer',
    nameKey: 'achievement.boss_slayer.name',
    descriptionKey: 'achievement.boss_slayer.desc',
    hidden: false,
    condition: { type: 'bossesDefeated', target: 1 },
    currencyReward: 100,
    xpReward: 120,
  },
  {
    id: 'boss_hunter',
    nameKey: 'achievement.boss_hunter.name',
    descriptionKey: 'achievement.boss_hunter.desc',
    hidden: false,
    condition: { type: 'bossesDefeated', target: 10 },
    currencyReward: 300,
    xpReward: 300,
  },
  {
    id: 'chain_reactor',
    nameKey: 'achievement.chain_reactor.name',
    descriptionKey: 'achievement.chain_reactor.desc',
    hidden: false,
    condition: { type: 'chainReactionsTriggered', target: 5 },
    currencyReward: 50,
    xpReward: 50,
  },
  {
    id: 'veteran_hunter',
    nameKey: 'achievement.veteran_hunter.name',
    descriptionKey: 'achievement.veteran_hunter.desc',
    hidden: false,
    condition: { type: 'roundsPlayed', target: 50 },
    currencyReward: 150,
    xpReward: 150,
  },
  {
    id: 'level_10',
    nameKey: 'achievement.level_10.name',
    descriptionKey: 'achievement.level_10.desc',
    hidden: false,
    condition: { type: 'playerLevel', target: 10 },
    currencyReward: 120,
    xpReward: 0,
  },
  {
    id: 'flawless_20',
    nameKey: 'achievement.flawless_20.name',
    descriptionKey: 'achievement.flawless_20.desc',
    hidden: false,
    condition: { type: 'roundEventFlag', target: 1, flag: ACHIEVEMENT_FLAGS.NO_MISS_20 },
    currencyReward: 70,
    xpReward: 70,
  },
  {
    id: 'perfect_five',
    nameKey: 'achievement.perfect_five.name',
    descriptionKey: 'achievement.perfect_five.desc',
    hidden: false,
    condition: { type: 'roundEventFlag', target: 1, flag: ACHIEVEMENT_FLAGS.PERFECT_STREAK_5 },
    currencyReward: 70,
    xpReward: 70,
  },
  {
    id: 'swarm_breaker',
    nameKey: 'achievement.swarm_breaker.name',
    descriptionKey: 'achievement.swarm_breaker.desc',
    hidden: true,
    condition: { type: 'roundEventFlag', target: 1, flag: ACHIEVEMENT_FLAGS.SWARM_IN_3S },
    currencyReward: 80,
    xpReward: 80,
  },
  {
    id: 'untouchable_boss',
    nameKey: 'achievement.untouchable_boss.name',
    descriptionKey: 'achievement.untouchable_boss.desc',
    hidden: true,
    condition: { type: 'roundEventFlag', target: 1, flag: ACHIEVEMENT_FLAGS.BOSS_NO_MISS },
    currencyReward: 150,
    xpReward: 150,
  },
  {
    id: 'treasure_hunter',
    nameKey: 'achievement.treasure_hunter.name',
    descriptionKey: 'achievement.treasure_hunter.desc',
    hidden: true,
    condition: { type: 'roundEventFlag', target: 1, flag: ACHIEVEMENT_FLAGS.ALL_HIDDEN_FOUND },
    currencyReward: 90,
    xpReward: 90,
  },
  {
    id: 'storm_gold',
    nameKey: 'achievement.storm_gold.name',
    descriptionKey: 'achievement.storm_gold.desc',
    hidden: true,
    condition: { type: 'roundEventFlag', target: 1, flag: ACHIEVEMENT_FLAGS.GOLD_DURING_STORM },
    currencyReward: 110,
    xpReward: 110,
  },
];

export function getAchievementConfig(id: string): AchievementConfig {
  const cfg = ACHIEVEMENT_CONFIGS.find((a) => a.id === id);
  if (!cfg) throw new Error(`Unknown achievement: ${id}`);
  return cfg;
}
