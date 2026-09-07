/**
 * Nevron definitions and their telegraphed attack patterns.
 *
 * A pattern's `hits` array feeds the reaction system directly:
 *   windup  seconds of wind-up before this hit's timing cue
 *   gap     extra pause after the previous hit resolves
 *   curve   how the telegraph ring reads: linear | accel | decel | feint | double
 *   kind    'parry' (parryable and dodgeable) or 'grab' (dodge only)
 *   splash  fraction of damage dealt to non-target allies on an unparried hit
 *
 * Every enemy has a recognisable rhythm: the Bladeling is quick and even, the
 * Hulk is slow with false starts, the Wisp stalls, the Curator escalates.
 */

export const ENEMY_DATA = {
  bladeling: {
    id: 'bladeling',
    name: 'Gestral Bladeling',
    kind: 'bladeling',
    base: { hp: 640, atk: 47, def: 24, spd: 55 },
    breakMax: 140,
    xp: 55,
    weak: ['lightning'],
    // Deliberately not physical-resistant: this is the first thing the player
    // meets, and two of the three basic attacks are physical.
    resist: ['ice'],
    palette: { body: '#c9c2ac', dark: '#28434a', metal: '#cfd6d8', accent: '#f0d060' },
    scale: 1,
    tint: '#f0d060',
    lore: 'Duellist husk. Reads your stance before it commits — its blades come in even pairs.',
    patterns: [
      {
        id: 'twin-slash', name: 'Twin Slash', weight: 3, targeting: 'single',
        hits: [
          { windup: 1.05, gap: 0, power: 1.15, element: 'physical', kind: 'parry', curve: 'linear' },
          { windup: 0.56, gap: 0.06, power: 1.15, element: 'physical', kind: 'parry', curve: 'decel' },
        ],
      },
      {
        id: 'rising-crescent', name: 'Rising Crescent', weight: 2, targeting: 'single',
        hits: [
          { windup: 0.92, gap: 0, power: 0.95, element: 'physical', kind: 'parry', curve: 'linear' },
          { windup: 0.46, gap: 0.04, power: 0.95, element: 'physical', kind: 'parry', curve: 'linear' },
          { windup: 0.52, gap: 0.04, power: 1.35, element: 'physical', kind: 'parry', curve: 'accel' },
        ],
      },
      {
        id: 'lunge-feint', name: 'Feinting Lunge', weight: 2, targeting: 'lowest',
        hits: [
          {
            windup: 1.45, gap: 0, power: 1.85, element: 'physical', kind: 'parry',
            curve: 'feint', status: { id: 'bleed', turns: 3, chance: 0.5 },
          },
        ],
      },
    ],
  },

  hulk: {
    id: 'hulk',
    name: 'Bourgeon Hulk',
    kind: 'hulk',
    base: { hp: 1180, atk: 58, def: 40, spd: 27 },
    breakMax: 230,
    xp: 95,
    weak: ['fire'],
    resist: ['physical', 'void'],
    palette: { body: '#6f7b4a', dark: '#3b3324', metal: '#8a7a4a', accent: '#e2803a' },
    scale: 1,
    tint: '#e2803a',
    lore: 'A flowering siege-beast. Its grasp cannot be parried — only stepped around.',
    patterns: [
      {
        id: 'ground-shatter', name: 'Ground Shatter', weight: 3, targeting: 'single',
        hits: [
          { windup: 1.55, gap: 0, power: 1.25, element: 'physical', kind: 'parry', curve: 'accel', splash: 0.32 },
          { windup: 0.78, gap: 0.1, power: 1.25, element: 'physical', kind: 'parry', curve: 'accel', splash: 0.32 },
          { windup: 0.66, gap: 0.08, power: 1.45, element: 'physical', kind: 'parry', curve: 'linear', splash: 0.4 },
        ],
      },
      {
        id: 'bramble-grab', name: 'Bramble Grasp', weight: 2, targeting: 'lowest',
        hits: [
          {
            windup: 1.62, gap: 0, power: 2.05, element: 'void', kind: 'grab', curve: 'decel',
            status: { id: 'bleed', turns: 3, chance: 1 },
          },
        ],
      },
      {
        id: 'double-hammer', name: 'Double Hammer', weight: 2, targeting: 'single',
        hits: [
          { windup: 1.32, gap: 0, power: 1.5, element: 'physical', kind: 'parry', curve: 'double' },
          { windup: 0.8, gap: 0.12, power: 1.6, element: 'physical', kind: 'parry', curve: 'accel' },
        ],
      },
    ],
  },

  wisp: {
    id: 'wisp',
    name: 'Chroma Wisp',
    kind: 'wisp',
    base: { hp: 560, atk: 52, def: 22, spd: 45 },
    breakMax: 115,
    xp: 65,
    weak: ['physical'],
    resist: ['fire', 'ice'],
    palette: { body: '#b8d8e0', dark: '#3a2f52', metal: '#c9a55e', accent: '#a988e0' },
    scale: 1,
    tint: '#a988e0',
    lore: 'A painted spirit. It holds its spell an extra beat to catch an eager guard.',
    patterns: [
      {
        id: 'ember-lance', name: 'Ember Lance', weight: 3, targeting: 'random',
        hits: [
          {
            windup: 1.6, gap: 0, power: 1.7, element: 'fire', kind: 'parry', curve: 'feint',
            status: { id: 'burn', turns: 3, chance: 0.8 },
          },
        ],
      },
      {
        id: 'frost-triplet', name: 'Frost Triplet', weight: 2, targeting: 'single',
        hits: [
          { windup: 1.15, gap: 0, power: 0.85, element: 'ice', kind: 'parry', curve: 'linear' },
          { windup: 0.52, gap: 0.05, power: 0.85, element: 'ice', kind: 'parry', curve: 'linear' },
          {
            windup: 0.58, gap: 0.05, power: 1.05, element: 'ice', kind: 'parry', curve: 'decel',
            status: { id: 'slow', turns: 3, chance: 0.7 },
          },
        ],
      },
      {
        id: 'void-drain', name: 'Void Drain', weight: 2, targeting: 'lowest',
        hits: [
          { windup: 1.38, gap: 0, power: 1.35, element: 'void', kind: 'parry', curve: 'decel', drain: 0.6 },
        ],
      },
    ],
  },

  curator: {
    id: 'curator',
    name: 'The Gilded Curator',
    kind: 'curator',
    base: { hp: 2900, atk: 62, def: 46, spd: 41 },
    breakMax: 430,
    xp: 340,
    boss: true,
    weak: ['light'],
    resist: ['physical', 'void'],
    palette: { body: '#e6dcc6', dark: '#1b3038', metal: '#d9b262', accent: '#d96a4a' },
    scale: 1,
    tint: '#d9b262',
    lore: 'It curates the fallen. At half its gilding it abandons restraint and the cadence doubles.',
    phaseThreshold: 0.5,
    phase2: {
      weak: ['light', 'lightning'],
      atkBonus: 1.18,
      spdBonus: 1.22,
      announce: 'THE CURATOR UNSEALS ITS HALO',
    },
    patterns: [
      {
        id: 'curator-triptych', name: 'Triptych', weight: 3, phase: 1, targeting: 'single',
        hits: [
          { windup: 1.3, gap: 0, power: 1.05, element: 'physical', kind: 'parry', curve: 'linear' },
          { windup: 0.62, gap: 0.06, power: 1.05, element: 'physical', kind: 'parry', curve: 'linear' },
          { windup: 0.58, gap: 0.06, power: 1.3, element: 'light', kind: 'parry', curve: 'accel' },
        ],
      },
      {
        id: 'gilded-sweep', name: 'Gilded Sweep', weight: 2, phase: 1, targeting: 'spread',
        hits: [
          { windup: 1.45, gap: 0, power: 1.25, element: 'light', kind: 'parry', curve: 'accel', splash: 0.35 },
          { windup: 0.74, gap: 0.1, power: 1.35, element: 'light', kind: 'parry', curve: 'decel', splash: 0.35 },
        ],
      },
      {
        id: 'judgement-grasp', name: 'Judgement Grasp', weight: 2, phase: 1, targeting: 'lowest',
        hits: [
          {
            windup: 1.72, gap: 0, power: 2.1, element: 'void', kind: 'grab', curve: 'decel',
            status: { id: 'stun', turns: 1, chance: 0.55 },
          },
        ],
      },
      {
        id: 'requiem-cascade', name: 'Requiem Cascade', weight: 3, phase: 2, targeting: 'spread',
        hits: [
          { windup: 1.12, gap: 0, power: 0.95, element: 'light', kind: 'parry', curve: 'linear' },
          { windup: 0.46, gap: 0.04, power: 0.95, element: 'light', kind: 'parry', curve: 'linear' },
          { windup: 0.44, gap: 0.04, power: 0.95, element: 'light', kind: 'parry', curve: 'linear' },
          { windup: 0.42, gap: 0.04, power: 1.05, element: 'light', kind: 'parry', curve: 'decel' },
          { windup: 0.72, gap: 0.08, power: 1.5, element: 'light', kind: 'parry', curve: 'feint' },
        ],
      },
      {
        id: 'halo-of-blades', name: 'Halo of Blades', weight: 3, phase: 2, targeting: 'spread',
        hits: [
          { windup: 1.05, gap: 0, power: 1.15, element: 'physical', kind: 'parry', curve: 'double', splash: 0.28 },
          { windup: 0.54, gap: 0.05, power: 1.15, element: 'physical', kind: 'parry', curve: 'linear', splash: 0.28 },
          { windup: 0.5, gap: 0.05, power: 1.15, element: 'physical', kind: 'parry', curve: 'accel', splash: 0.28 },
          { windup: 0.66, gap: 0.07, power: 1.45, element: 'light', kind: 'parry', curve: 'decel', splash: 0.35 },
        ],
      },
      {
        id: 'final-judgement', name: 'Final Judgement', weight: 2, phase: 2, targeting: 'lowest',
        hits: [
          {
            windup: 1.5, gap: 0, power: 2.6, element: 'void', kind: 'grab', curve: 'feint',
            status: { id: 'stun', turns: 1, chance: 0.7 }, drain: 0.35,
          },
        ],
      },
    ],
  },
};

/**
 * Encounter waves. Each entry positions its enemies on the right-hand side of
 * the arena; `banner` is shown as the wave title card.
 */
export const WAVES = [
  {
    id: 1,
    banner: 'FIRST APPROACH',
    subtitle: 'Gestral Outriders',
    enemies: [
      { type: 'bladeling', x: 5.4, z: -2.2, scale: 1.0 },
      { type: 'bladeling', x: 6.3, z: 1.6, scale: 0.94 },
    ],
  },
  {
    id: 2,
    banner: 'SECOND APPROACH',
    subtitle: 'The Bourgeon Line',
    enemies: [
      { type: 'hulk', x: 6.2, z: -0.4, scale: 1.0 },
      { type: 'wisp', x: 8.0, z: -3.4, scale: 0.98 },
      { type: 'bladeling', x: 5.2, z: 3.4, scale: 0.96 },
    ],
  },
  {
    id: 3,
    banner: 'FINAL APPROACH',
    subtitle: 'The Gilded Curator',
    enemies: [
      { type: 'curator', x: 6.4, z: 0.0, scale: 1.0 },
      { type: 'wisp', x: 8.6, z: 3.6, scale: 0.9 },
    ],
  },
];

export function enemyData(type) {
  return ENEMY_DATA[type] || ENEMY_DATA.bladeling;
}
