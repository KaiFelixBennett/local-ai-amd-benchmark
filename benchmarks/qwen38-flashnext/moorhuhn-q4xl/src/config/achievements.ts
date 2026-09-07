/** Achievement & challenge definitions. Conditions are evaluated in
 *  src/game/Achievements.ts against a finished run + global stats. */

export type AchievementCondition =
  | 'firstBlood'
  | 'noMiss20'
  | 'perfect5'
  | 'swarm3s'
  | 'bossClean'
  | 'secrets1'
  | 'acc80'
  | 'chain5'
  | 'goldStorm'
  | 'rankS'
  | 'level5'
  | 'rounds10'
  | 'chains3'
  | 'trickshot'
  | 'longshot';

export interface AchievementDef {
  id: string;
  cond: AchievementCondition;
  nameKey: string;
  descKey: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'firstBlood', cond: 'firstBlood', nameKey: 'ach.firstBlood.name', descKey: 'ach.firstBlood.desc' },
  { id: 'noMiss20', cond: 'noMiss20', nameKey: 'ach.noMiss20.name', descKey: 'ach.noMiss20.desc' },
  { id: 'perfect5', cond: 'perfect5', nameKey: 'ach.perfect5.name', descKey: 'ach.perfect5.desc' },
  { id: 'swarm3s', cond: 'swarm3s', nameKey: 'ach.swarm3s.name', descKey: 'ach.swarm3s.desc' },
  { id: 'bossClean', cond: 'bossClean', nameKey: 'ach.bossClean.name', descKey: 'ach.bossClean.desc' },
  { id: 'secrets1', cond: 'secrets1', nameKey: 'ach.secrets1.name', descKey: 'ach.secrets1.desc' },
  { id: 'acc80', cond: 'acc80', nameKey: 'ach.acc80.name', descKey: 'ach.acc80.desc' },
  { id: 'chain5', cond: 'chain5', nameKey: 'ach.chain5.name', descKey: 'ach.chain5.desc' },
  { id: 'goldStorm', cond: 'goldStorm', nameKey: 'ach.goldStorm.name', descKey: 'ach.goldStorm.desc' },
  { id: 'rankS', cond: 'rankS', nameKey: 'ach.rankS.name', descKey: 'ach.rankS.desc' },
  { id: 'level5', cond: 'level5', nameKey: 'ach.level5.name', descKey: 'ach.level5.desc' },
  { id: 'rounds10', cond: 'rounds10', nameKey: 'ach.rounds10.name', descKey: 'ach.rounds10.desc' },
  { id: 'chains3', cond: 'chains3', nameKey: 'ach.chains3.name', descKey: 'ach.chains3.desc' },
  { id: 'trickshot', cond: 'trickshot', nameKey: 'ach.trickshot.name', descKey: 'ach.trickshot.desc' },
  { id: 'longshot', cond: 'longshot', nameKey: 'ach.longshot.name', descKey: 'ach.longshot.desc' },
];

export interface ChallengeDef {
  id: string;
  nameKey: string;
  descKey: string;
  goal: number;
  reward: number; // feathers
  /** Which run stat tracks progress. */
  metric:
    | 'hitStreakNoMiss'
    | 'bestPerfectStreak'
    | 'chainStepsBest'
    | 'accuracyPercent'
    | 'swarmFastestMs'
    | 'bossCleanCount'
    | 'secretsTotal'
    | 'goldDuringThunder'
    | 'trickshots'
    | 'rankOrder';
}

export const CHALLENGES: ChallengeDef[] = [
  { id: 'noMiss20', nameKey: 'challenge.noMiss20.name', descKey: 'ach.noMiss20.desc', goal: 20, reward: 120, metric: 'hitStreakNoMiss' },
  { id: 'perfect5', nameKey: 'challenge.perfect5.name', descKey: 'ach.perfect5.desc', goal: 5, reward: 100, metric: 'bestPerfectStreak' },
  { id: 'multiChain', nameKey: 'challenge.multiChain.name', descKey: 'ach.chain5.desc', goal: 5, reward: 200, metric: 'chainStepsBest' },
  { id: 'acc70Round', nameKey: 'challenge.acc70Round.name', descKey: 'ach.acc80.desc', goal: 70, reward: 150, metric: 'accuracyPercent' },
  { id: 'swarm3s', nameKey: 'challenge.swarm3s.name', descKey: 'ach.swarm3s.desc', goal: 1, reward: 140, metric: 'swarmFastestMs' },
  { id: 'bossClean', nameKey: 'challenge.bossClean.name', descKey: 'ach.bossClean.desc', goal: 1, reward: 180, metric: 'bossCleanCount' },
  { id: 'secretsAll', nameKey: 'challenge.secretsAll.name', descKey: 'ach.secrets1.desc', goal: 3, reward: 400, metric: 'secretsTotal' },
  { id: 'goldStorm', nameKey: 'challenge.goldStorm.name', descKey: 'ach.goldStorm.desc', goal: 1, reward: 160, metric: 'goldDuringThunder' },
  { id: 'trickshotOnce', nameKey: 'challenge.trickshotOnce.name', descKey: 'ach.trickshot.desc', goal: 1, reward: 130, metric: 'trickshots' },
  { id: 'rankA', nameKey: 'challenge.rankA.name', descKey: 'ach.rankS.desc', goal: 4, reward: 220, metric: 'rankOrder' },
];
