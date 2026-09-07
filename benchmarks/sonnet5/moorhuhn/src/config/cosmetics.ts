export interface CrosshairConfig {
  id: string;
  nameKey: string;
  unlockLevel: number;
  color: string;
  style: 'cross' | 'dot' | 'ring' | 'feather' | 'star';
}

export interface HudThemeConfig {
  id: string;
  nameKey: string;
  unlockLevel: number;
  accentColor: string;
  panelColor: string;
}

export interface WeaponSkinConfig {
  id: string;
  nameKey: string;
  unlockLevel: number;
  barrelColor: number;
  bodyColor: number;
  trimColor: number;
}

export const CROSSHAIR_CONFIGS: CrosshairConfig[] = [
  { id: 'classic', nameKey: 'cosmetic.crosshair.classic', unlockLevel: 1, color: '#f2c14e', style: 'cross' },
  { id: 'dot', nameKey: 'cosmetic.crosshair.dot', unlockLevel: 1, color: '#ff5c5c', style: 'dot' },
  { id: 'ring', nameKey: 'cosmetic.crosshair.ring', unlockLevel: 3, color: '#5cd6ff', style: 'ring' },
  { id: 'feather', nameKey: 'cosmetic.crosshair.feather', unlockLevel: 6, color: '#ffffff', style: 'feather' },
  { id: 'star', nameKey: 'cosmetic.crosshair.star', unlockLevel: 12, color: '#d4af37', style: 'star' },
];

export const HUD_THEME_CONFIGS: HudThemeConfig[] = [
  { id: 'default', nameKey: 'cosmetic.hud.default', unlockLevel: 1, accentColor: '#f2c14e', panelColor: '#1c2b26' },
  { id: 'storm', nameKey: 'cosmetic.hud.storm', unlockLevel: 5, accentColor: '#5cd6ff', panelColor: '#16222c' },
  { id: 'moonlit', nameKey: 'cosmetic.hud.moonlit', unlockLevel: 9, accentColor: '#a06fff', panelColor: '#151233' },
];

export const WEAPON_SKIN_CONFIGS: WeaponSkinConfig[] = [
  { id: 'field', nameKey: 'cosmetic.weapon.field', unlockLevel: 1, barrelColor: 0x3a3a3a, bodyColor: 0x5a4632, trimColor: 0xd9a05b },
  { id: 'coastal', nameKey: 'cosmetic.weapon.coastal', unlockLevel: 4, barrelColor: 0x30414d, bodyColor: 0x475b68, trimColor: 0xcfe8ff },
  { id: 'moonlit', nameKey: 'cosmetic.weapon.moonlit', unlockLevel: 8, barrelColor: 0x241c40, bodyColor: 0x352a5c, trimColor: 0xa06fff },
];

export function getCrosshairConfig(id: string): CrosshairConfig {
  return CROSSHAIR_CONFIGS.find((c) => c.id === id) ?? (CROSSHAIR_CONFIGS[0] as CrosshairConfig);
}
export function getHudThemeConfig(id: string): HudThemeConfig {
  return HUD_THEME_CONFIGS.find((c) => c.id === id) ?? (HUD_THEME_CONFIGS[0] as HudThemeConfig);
}
export function getWeaponSkinConfig(id: string): WeaponSkinConfig {
  return WEAPON_SKIN_CONFIGS.find((c) => c.id === id) ?? (WEAPON_SKIN_CONFIGS[0] as WeaponSkinConfig);
}
