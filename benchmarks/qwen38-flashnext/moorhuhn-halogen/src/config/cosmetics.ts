import type { AchievementDef, ChallengeDef, CrosshairDef, HudSkinDef, WeaponSkinDef } from './schema';

export const CROSSHAIRS: CrosshairDef[] = [
  { id: 'classic', style: 'cross', color: '#ffd54a' },
  { id: 'ring', style: 'ring', color: '#7fd0e8' },
  { id: 'dot', style: 'dot', color: '#ff8a5c' },
  { id: 'reticle', style: 'reticle', color: '#8ce8d0', unlockLevel: 3 },
  { id: 'feather', style: 'feather', color: '#e8c07f', unlockLevel: 6 },
  { id: 'scope', style: 'scope', color: '#ff5c7a', cost: 400 },
];

export const HUD_SKINS: HudSkinDef[] = [
  { id: 'classic', theme: 'classic' },
  { id: 'neon', theme: 'neon', unlockLevel: 4 },
  { id: 'paper', theme: 'paper', unlockLevel: 8 },
  { id: 'military', theme: 'military', cost: 600 },
];

export const WEAPON_SKINS: WeaponSkinDef[] = [
  { id: 'default', bodyColor: '#5a4230', accentColor: '#c9a06a' },
  { id: 'brass', bodyColor: '#8a6a3a', accentColor: '#e8c87f', unlockLevel: 5 },
  { id: 'hunter', bodyColor: '#3a4a34', accentColor: '#9ab87a', unlockLevel: 7 },
  { id: 'night', bodyColor: '#2a2e3a', accentColor: '#8ca0c0', cost: 500 },
];

export const CHALLENGES: ChallengeDef[] = [
  { id: 'ch_no_miss_20', goal: 20, rewardCoins: 120, metric: 'hits_without_miss' },
  { id: 'ch_perfect_5', goal: 5, rewardCoins: 150, metric: 'perfect_streak' },
  { id: 'ch_swarm_3s', goal: 1, rewardCoins: 200, metric: 'swarm_clear_time' },
  { id: 'ch_boss_clean', goal: 1, rewardCoins: 250, metric: 'boss_no_miss' },
  { id: 'ch_hidden_nebelmoor', goal: 3, rewardCoins: 300, metric: 'hidden_found_map', map: 'nebelmoor' },
  { id: 'ch_acc_80', goal: 1, rewardCoins: 180, metric: 'accuracy' },
  { id: 'ch_chain_5', goal: 5, rewardCoins: 220, metric: 'chain_steps' },
  { id: 'ch_gold_storm', goal: 1, rewardCoins: 260, metric: 'gold_during_storm' },
];

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'shots_1000', goal: 1000, metric: 'totalShots' },
  { id: 'hits_5000', goal: 5000, metric: 'totalHits' },
  { id: 'perfect_250', goal: 250, metric: 'perfectHits' },
  { id: 'combo_30', goal: 30, metric: 'bestCombo' },
  { id: 'score_50k', goal: 50000, metric: 'bestRoundScore' },
  { id: 'boss_3', goal: 3, metric: 'bossKills' },
  { id: 'runs_25', goal: 25, metric: 'totalRuns' },
  { id: 'chains_10', goal: 10, metric: 'chainReactions' },
];

const allCosmetics: Record<string, { id: string; unlockLevel?: number; cost?: number }> = {
  ...Object.fromEntries(CROSSHAIRS.map((c) => [c.id, c])),
  ...Object.fromEntries(HUD_SKINS.map((c) => [c.id, c])),
  ...Object.fromEntries(WEAPON_SKINS.map((c) => [c.id, c])),
};

export function getCosmeticCost(
  _kind: 'crosshairs' | 'hudSkins' | 'weaponSkins',
  id: string,
): { level: number; cost: number } {
  const def = allCosmetics[id];
  return { level: def?.unlockLevel ?? 1, cost: def?.cost ?? 0 };
}

export const COSMETIC_LISTS = {
  crosshairs: CROSSHAIRS.map((c) => c.id),
  hudSkins: HUD_SKINS.map((c) => c.id),
  weaponSkins: WEAPON_SKINS.map((c) => c.id),
} as const;
