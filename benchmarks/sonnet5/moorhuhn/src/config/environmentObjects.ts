import type { EnvironmentObjectType } from './maps';

export type EnvironmentEffectType =
  | 'none'
  | 'slowTime'
  | 'bonusTime'
  | 'multiplier'
  | 'scareAnimals'
  | 'secretAchievement';

export interface EnvironmentObjectBehavior {
  type: EnvironmentObjectType;
  textureKey: string;
  points: number;
  /** Minimum ms between two "fresh" reward triggers on the same instance (idle re-shoots still animate). */
  cooldownMs: number;
  effect: EnvironmentEffectType;
  /** Purely cosmetic objects (fireflies, ghost lights) that mostly play a humorous animation. */
  isDecorative: boolean;
  width: number;
  height: number;
}

export const ENVIRONMENT_OBJECT_BEHAVIORS: Record<EnvironmentObjectType, EnvironmentObjectBehavior> = {
  windmill: { type: 'windmill', textureKey: 'env_windmill', points: 40, cooldownMs: 4000, effect: 'scareAnimals', isDecorative: false, width: 140, height: 200 },
  lantern: { type: 'lantern', textureKey: 'env_lantern', points: 25, cooldownMs: 3000, effect: 'none', isDecorative: false, width: 50, height: 90 },
  fenceCans: { type: 'fenceCans', textureKey: 'env_fenceCans', points: 60, cooldownMs: 5000, effect: 'none', isDecorative: false, width: 160, height: 70 },
  signpost: { type: 'signpost', textureKey: 'env_signpost', points: 20, cooldownMs: 4000, effect: 'none', isDecorative: false, width: 90, height: 130 },
  bell: { type: 'bell', textureKey: 'env_bell', points: 50, cooldownMs: 4000, effect: 'multiplier', isDecorative: false, width: 70, height: 90 },
  scarecrow: { type: 'scarecrow', textureKey: 'env_scarecrow', points: 30, cooldownMs: 4000, effect: 'scareAnimals', isDecorative: false, width: 110, height: 190 },
  pumpkin: { type: 'pumpkin', textureKey: 'env_pumpkin', points: 35, cooldownMs: 3500, effect: 'none', isDecorative: false, width: 80, height: 70 },
  mushroom: { type: 'mushroom', textureKey: 'env_mushroom', points: 30, cooldownMs: 3500, effect: 'slowTime', isDecorative: false, width: 60, height: 60 },
  waterSplash: { type: 'waterSplash', textureKey: 'env_waterSplash', points: 15, cooldownMs: 2000, effect: 'none', isDecorative: true, width: 100, height: 50 },
  bucket: { type: 'bucket', textureKey: 'env_bucket', points: 30, cooldownMs: 4000, effect: 'none', isDecorative: false, width: 46, height: 55 },
  treeHollow: { type: 'treeHollow', textureKey: 'env_treeHollow', points: 45, cooldownMs: 5000, effect: 'secretAchievement', isDecorative: false, width: 150, height: 220 },
  reedBundle: { type: 'reedBundle', textureKey: 'env_reedBundle', points: 20, cooldownMs: 3000, effect: 'none', isDecorative: false, width: 90, height: 160 },
  abandonedCart: { type: 'abandonedCart', textureKey: 'env_abandonedCart', points: 40, cooldownMs: 4500, effect: 'none', isDecorative: false, width: 170, height: 120 },
  weathervane: { type: 'weathervane', textureKey: 'env_weathervane', points: 40, cooldownMs: 4000, effect: 'none', isDecorative: false, width: 90, height: 150 },
  hiddenBottle: { type: 'hiddenBottle', textureKey: 'env_hiddenBottle', points: 90, cooldownMs: 999999, effect: 'bonusTime', isDecorative: false, width: 26, height: 46 },
  firefly: { type: 'firefly', textureKey: 'env_firefly', points: 10, cooldownMs: 2000, effect: 'none', isDecorative: true, width: 16, height: 16 },
  ghostLight: { type: 'ghostLight', textureKey: 'env_ghostLight', points: 15, cooldownMs: 2500, effect: 'secretAchievement', isDecorative: true, width: 30, height: 30 },
};

export function getEnvironmentBehavior(type: EnvironmentObjectType): EnvironmentObjectBehavior {
  return ENVIRONMENT_OBJECT_BEHAVIORS[type];
}
