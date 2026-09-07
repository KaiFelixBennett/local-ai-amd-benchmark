export type BossId = 'armored' | 'acrobat' | 'night';

export interface BossPhaseConfig {
  /** Boss enters this phase once its remaining HP fraction drops at or below this value. */
  healthFraction01: number;
  speedMultiplier: number;
  /** Number of simultaneous illusion decoys (night boss only). */
  illusionCount: number;
}

export interface BossConfig {
  id: BossId;
  nameKey: string;
  introKey: string;
  textureKey: string;
  maxHealth: number;
  armorLayers: number;
  baseSpeed: number;
  bodyRadius: number;
  scoreReward: number;
  hitZone: { perfectRadius: number; hitRadius: number };
  phases: BossPhaseConfig[];
}

export const BOSS_CONFIGS: Record<BossId, BossConfig> = {
  armored: {
    id: 'armored',
    nameKey: 'boss.armored.name',
    introKey: 'boss.armored.intro',
    textureKey: 'boss_armored',
    maxHealth: 6,
    armorLayers: 3,
    baseSpeed: 90,
    bodyRadius: 90,
    scoreReward: 1800,
    hitZone: { perfectRadius: 0.25, hitRadius: 1.0 },
    phases: [
      { healthFraction01: 1.0, speedMultiplier: 1.0, illusionCount: 0 },
      { healthFraction01: 0.6, speedMultiplier: 1.3, illusionCount: 0 },
      { healthFraction01: 0.25, speedMultiplier: 1.7, illusionCount: 0 },
    ],
  },
  acrobat: {
    id: 'acrobat',
    nameKey: 'boss.acrobat.name',
    introKey: 'boss.acrobat.intro',
    textureKey: 'boss_acrobat',
    maxHealth: 4,
    armorLayers: 0,
    baseSpeed: 260,
    bodyRadius: 65,
    scoreReward: 1500,
    hitZone: { perfectRadius: 0.3, hitRadius: 0.9 },
    phases: [
      { healthFraction01: 1.0, speedMultiplier: 1.0, illusionCount: 0 },
      { healthFraction01: 0.5, speedMultiplier: 1.4, illusionCount: 0 },
    ],
  },
  night: {
    id: 'night',
    nameKey: 'boss.night.name',
    introKey: 'boss.night.intro',
    textureKey: 'boss_night',
    maxHealth: 5,
    armorLayers: 0,
    baseSpeed: 150,
    bodyRadius: 75,
    scoreReward: 2000,
    hitZone: { perfectRadius: 0.28, hitRadius: 0.9 },
    phases: [
      { healthFraction01: 1.0, speedMultiplier: 1.0, illusionCount: 0 },
      { healthFraction01: 0.7, speedMultiplier: 1.1, illusionCount: 1 },
      { healthFraction01: 0.35, speedMultiplier: 1.2, illusionCount: 2 },
    ],
  },
};

export const BOSS_LIST: BossConfig[] = Object.values(BOSS_CONFIGS);

export function getBossConfig(id: BossId): BossConfig {
  return BOSS_CONFIGS[id];
}

export function getPhaseForHealth(config: BossConfig, hp: number): BossPhaseConfig {
  const fraction = hp / config.maxHealth;
  let current = config.phases[0] as BossPhaseConfig;
  for (const phase of config.phases) {
    if (fraction <= phase.healthFraction01) current = phase;
  }
  return current;
}
