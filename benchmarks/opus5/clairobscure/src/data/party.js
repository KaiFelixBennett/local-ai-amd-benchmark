/**
 * The expedition roster — three survivors with distinct roles, stat curves,
 * silhouettes and elemental identities.
 *
 * `base` values are level-1; action-resolver scales them on level-up.
 */

export const PARTY_DATA = [
  {
    id: 'aurel',
    name: 'Aurel Lumière',
    title: 'Duelliste',
    role: 'Frontline duellist. Trades AP for enormous single hits and shrugs off punishment.',
    base: { hp: 800, atk: 52, def: 40, spd: 46, crit: 0.12, critDmg: 1.85 },
    maxAp: 9,
    startAp: 3,
    row: 'front',
    element: 'lightning',
    resist: ['lightning'],
    weak: ['void'],
    stance: { x: -5.6, z: -1.9 },
    basic: {
      name: 'Duellist Cut', power: 1.05, element: 'physical', anim: 'slash',
      breakPower: 1.1, hits: 1, critBonus: 0.02,
    },
    aimShot: { name: 'Charged Bolt', power: 1.15, element: 'lightning', breakPower: 1.2 },
    counter: { name: 'Riposte', power: 1.5, element: 'lightning', breakPower: 1.6, critBonus: 0.14 },
    appearance: {
      key: 'aurel',
      palette: {
        coat: '#1d3d52', trim: '#5b2f2a', skin: '#c99b78', metal: '#c9a55e',
        accent: '#f0d060', hair: '#2a1c18',
      },
      build: { height: 1.02, bulk: 1.06, coatLength: 0.7 },
      features: { hat: null, cape: true, prosthetic: true, collar: true, skirt: false },
      weapon: 'rapier',
    },
  },

  {
    id: 'vionne',
    name: 'Sœur Vionne',
    title: 'Mystique',
    role: 'Support mystic. Heals, shields and dismantles enemy defences with frost and hexes.',
    base: { hp: 660, atk: 46, def: 36, spd: 42, crit: 0.07, critDmg: 1.7 },
    maxAp: 10,
    startAp: 4,
    row: 'back',
    element: 'ice',
    resist: ['ice', 'light'],
    weak: ['fire'],
    stance: { x: -7.1, z: 1.5 },
    basic: {
      name: 'Hexbolt', power: 0.9, element: 'void', anim: 'cast',
      breakPower: 0.85, hits: 1, critBonus: 0,
    },
    aimShot: { name: 'Frost Lance', power: 1.05, element: 'ice', breakPower: 1.0 },
    counter: { name: 'Reprisal Sigil', power: 1.2, element: 'ice', breakPower: 1.3 },
    appearance: {
      key: 'vionne',
      palette: {
        coat: '#243a4a', trim: '#7fa9a2', skin: '#d6b094', metal: '#d9b262',
        accent: '#8fd4e8', hair: '#4a3a52',
      },
      build: { height: 0.99, bulk: 0.94, coatLength: 0.92 },
      features: { hat: 'hood', cape: false, prosthetic: false, collar: true, skirt: true },
      weapon: 'staff',
    },
  },

  {
    id: 'corvin',
    name: 'Corvin Roux',
    title: 'Tireur',
    role: 'Fast marksman. Highest crit and speed, fragile, thrives on multi-hit and weak points.',
    base: { hp: 680, atk: 49, def: 31, spd: 58, crit: 0.2, critDmg: 1.95 },
    maxAp: 9,
    startAp: 3,
    row: 'back',
    element: 'fire',
    resist: ['fire'],
    weak: ['ice'],
    stance: { x: -6.4, z: 4.2 },
    basic: {
      name: 'Twin Report', power: 0.58, element: 'physical', anim: 'shot',
      breakPower: 0.6, hits: 2, critBonus: 0.06,
    },
    aimShot: { name: 'Marksman Round', power: 1.3, element: 'fire', breakPower: 1.15 },
    counter: { name: 'Snap Shot', power: 1.35, element: 'physical', breakPower: 1.2, critBonus: 0.2 },
    appearance: {
      key: 'corvin',
      palette: {
        coat: '#4a2f22', trim: '#22403a', skin: '#a9713f', metal: '#b8b2a4',
        accent: '#e2803a', hair: '#191412',
      },
      build: { height: 1.0, bulk: 0.98, coatLength: 0.58 },
      features: { hat: 'wide', cape: true, prosthetic: false, collar: false, skirt: false },
      weapon: 'pistol',
    },
  },
];
