export interface ChallengeConfig {
  id: string;
  nameKey: string;
  descriptionKey: string;
  flag: string;
  currencyReward: number;
  xpReward: number;
}

/** Round-end flags a challenge completes on, set by GameScene/systems into RunStats. */
export const CHALLENGE_FLAGS = {
  NO_MISS_20: 'noMiss20',
  PERFECT_STREAK_5: 'perfectStreak5',
  SWARM_IN_3S: 'swarmIn3s',
  BOSS_NO_MISS: 'bossNoMiss',
  ALL_HIDDEN_FOUND: 'allHiddenFound',
  ACCURACY_80: 'accuracy80',
  CHAIN_5: 'chain5',
  GOLD_DURING_STORM: 'goldDuringStorm',
} as const;

export const CHALLENGE_CONFIGS: ChallengeConfig[] = [
  {
    id: 'challenge_no_miss_20',
    nameKey: 'challenge.no_miss_20.name',
    descriptionKey: 'challenge.no_miss_20.desc',
    flag: CHALLENGE_FLAGS.NO_MISS_20,
    currencyReward: 40,
    xpReward: 35,
  },
  {
    id: 'challenge_perfect_5',
    nameKey: 'challenge.perfect_5.name',
    descriptionKey: 'challenge.perfect_5.desc',
    flag: CHALLENGE_FLAGS.PERFECT_STREAK_5,
    currencyReward: 40,
    xpReward: 35,
  },
  {
    id: 'challenge_swarm_3s',
    nameKey: 'challenge.swarm_3s.name',
    descriptionKey: 'challenge.swarm_3s.desc',
    flag: CHALLENGE_FLAGS.SWARM_IN_3S,
    currencyReward: 50,
    xpReward: 45,
  },
  {
    id: 'challenge_boss_flawless',
    nameKey: 'challenge.boss_flawless.name',
    descriptionKey: 'challenge.boss_flawless.desc',
    flag: CHALLENGE_FLAGS.BOSS_NO_MISS,
    currencyReward: 70,
    xpReward: 60,
  },
  {
    id: 'challenge_hidden_objects',
    nameKey: 'challenge.hidden_objects.name',
    descriptionKey: 'challenge.hidden_objects.desc',
    flag: CHALLENGE_FLAGS.ALL_HIDDEN_FOUND,
    currencyReward: 45,
    xpReward: 40,
  },
  {
    id: 'challenge_accuracy_80',
    nameKey: 'challenge.accuracy_80.name',
    descriptionKey: 'challenge.accuracy_80.desc',
    flag: CHALLENGE_FLAGS.ACCURACY_80,
    currencyReward: 45,
    xpReward: 40,
  },
  {
    id: 'challenge_chain_5',
    nameKey: 'challenge.chain_5.name',
    descriptionKey: 'challenge.chain_5.desc',
    flag: CHALLENGE_FLAGS.CHAIN_5,
    currencyReward: 55,
    xpReward: 45,
  },
  {
    id: 'challenge_gold_storm',
    nameKey: 'challenge.gold_storm.name',
    descriptionKey: 'challenge.gold_storm.desc',
    flag: CHALLENGE_FLAGS.GOLD_DURING_STORM,
    currencyReward: 65,
    xpReward: 55,
  },
];

export function getChallengeConfig(id: string): ChallengeConfig {
  const cfg = CHALLENGE_CONFIGS.find((c) => c.id === id);
  if (!cfg) throw new Error(`Unknown challenge: ${id}`);
  return cfg;
}
