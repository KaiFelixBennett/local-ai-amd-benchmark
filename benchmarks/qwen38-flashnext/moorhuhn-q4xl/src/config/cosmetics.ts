/** Cosmetic shop: crosshairs, HUD themes, weapon skins. Purchased with
 *  Feathers (soft currency earned by playing) or unlocked at levels. */

export interface CosmeticDef {
  id: string;
  name: { de: string; en: string };
  price: number; // feathers; 0 = unlocked from the start
  unlockLevel: number; // additional gate
}

export const CROSSHAIRS: CosmeticDef[] = [
  { id: 'ring', name: { de: 'Classic-Ring', en: 'Classic Ring' }, price: 0, unlockLevel: 1 },
  { id: 'dot', name: { de: 'Stiller Punkt', en: 'Quiet Dot' }, price: 0, unlockLevel: 1 },
  { id: 'cross', name: { de: 'Jägerkreuz', en: 'Hunter Cross' }, price: 250, unlockLevel: 2 },
  { id: 'feather', name: { de: 'Federkiel', en: 'Feather Quill' }, price: 600, unlockLevel: 4 },
  { id: 'owl', name: { de: 'Eulenauge', en: 'Owl Eye' }, price: 950, unlockLevel: 7 },
];

export const HUD_THEMES: CosmeticDef[] = [
  { id: 'parchment', name: { de: 'Pergament', en: 'Parchment' }, price: 0, unlockLevel: 1 },
  { id: 'moorglass', name: { de: 'Moorglas', en: 'Marsh Glass' }, price: 400, unlockLevel: 3 },
  { id: 'neonbog', name: { de: 'Neon-Moor', en: 'Neon Bog' }, price: 800, unlockLevel: 6 },
];

export const WEAPON_SKINS: CosmeticDef[] = [
  { id: 'oak', name: { de: 'Eichenschaft', en: 'Oak Stock' }, price: 0, unlockLevel: 1 },
  { id: 'brass', name: { de: 'Messinggravur', en: 'Brass Engraved' }, price: 500, unlockLevel: 3 },
  { id: 'moon', name: { de: 'Mondfurnier', en: 'Moon veneer' }, price: 900, unlockLevel: 5 },
  { id: 'storm', name: { de: 'Sturmesche', en: 'Storm Ash' }, price: 1400, unlockLevel: 8 },
];

export function findCosmetic(list: CosmeticDef[], id: string): CosmeticDef {
  return list.find((c) => c.id === id) ?? list[0];
}
