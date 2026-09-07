/**
 * entities/enemy-data.js — Three enemy types with distinct, telegraphed,
 * parryable/dodgeable attack patterns.
 *
 * Pattern fields (consumed by ReactionSystem + Enemy AI):
 *   id, name, weight        — AI choice weight
 *   parryTol                — half-width of the clean-parry window (ms);
 *                             lower = tighter = harder enemy
 *   canCounter              — parrying every hit enables a party counter
 *   heavy                   — target-selection hint (aim at low-HP front)
 *   hits: [{ windup, mult, stagger, grab, feint, gap, label }]
 *     windup  — telegraph length before impact (ms)
 *     mult    — damage multiplier vs enemy atk
 *     stagger — added to the VICTIM's... (n/a) — actually to the enemy's own
 *               "committed" meter is unused; party members don't stagger.
 *               Kept for API symmetry.
 *     grab    — unblockable: MUST be dodged, parrying always fails
 *     feint   — full telegraph but the swing is pulled; reacting wastes
 *               the input, the real hit follows with a short wind-up
 *     gap     — ms after impact before the next hit's telegraph (rhythm)
 *
 * Phases: a pattern may declare `phase: 2` / `phase: 3`; the boss swaps its
 * move set as HP drops (see enemy.js `_patternsForPhase`).
 */

export const ENEMY_DATA = {
  nox_hound: {
    id: 'nox_hound',
    name: 'Nox Hound',
    element: 'fire',
    hp: 236, atk: 26, def: 12,
    speed: 104,
    critChance: 0.12,
    staggerMax: 100,
    xp: 34,
    look: {
      body: '#2a1a1a',
      hide: '#3a1c1c',
      accent: '#d98e32',
      eyes: '#ff9a3d',
      seed: 51,
      scale: 1.0,
    },
    weakPoints: [
      { local: [0, 0.55, 0.18], radius: 0.5, label: 'Maw' },
      { local: [0, 1.05, 0.05], radius: 0.45, label: 'Crown' },
    ],
    patterns: [
      {
        id: 'hound_bite', name: 'Lunge Bite', weight: 4, parryTol: 185, canCounter: true,
        hits: [{ windup: 620, mult: 1.0, label: 'bite' }],
      },
      {
        id: 'hound_double', name: 'Twin Snap', weight: 3, parryTol: 190, canCounter: true,
        hits: [
          { windup: 560, mult: 0.7, label: 'snap 1' },
          { windup: 520, mult: 0.9, gap: 300, label: 'snap 2' },
        ],
      },
      {
        id: 'hound_rake', name: 'Claw Rake', weight: 2, parryTol: 175, canCounter: true,
        hits: [
          { windup: 640, mult: 0.55, label: 'rake 1' },
          { windup: 480, mult: 0.55, gap: 260, label: 'rake 2' },
          { windup: 460, mult: 0.7, gap: 240, label: 'rake 3' },
        ],
      },
    ],
    patternsStaggered: [
      {
        id: 'hound_stagger_bite', name: 'Recovering Bite', weight: 1, parryTol: 210, canCounter: true,
        hits: [{ windup: 900, mult: 0.7, label: 'bite' }],
      },
    ],
  },

  cindervane_knight: {
    id: 'cindervane_knight',
    name: 'Cindervane Knight',
    element: 'gold',
    hp: 392, atk: 31, def: 21,
    speed: 72,
    critChance: 0.14,
    staggerMax: 130,
    xp: 46,
    look: {
      body: '#5a4326',
      hide: '#6e5230',
      accent: '#c9a24b',
      eyes: '#ffd76a',
      seed: 67,
      scale: 1.18,
    },
    weakPoints: [
      { local: [0, 1.35, 0.12], radius: 0.5, label: 'Visor' },
      { local: [0.34, 0.7, 0.05], radius: 0.55, label: 'Gambeson' },
    ],
    patterns: [
      {
        id: 'knight_slash', name: 'Greatsword Slash', weight: 4, parryTol: 165, canCounter: true, heavy: true,
        hits: [{ windup: 780, mult: 1.25, label: 'slash' }],
      },
      {
        id: 'knight_combo', name: 'Two-Handed Combo', weight: 3, parryTol: 160, canCounter: true, heavy: true,
        hits: [
          { windup: 700, mult: 0.6, label: 'high cut' },
          { windup: 560, mult: 1.1, gap: 340, label: 'splitter' },
        ],
      },
      {
        id: 'knight_grab', name: 'Visor Grasp', weight: 2, parryTol: 170, canCounter: false,
        // GRAB: must be DODGED — a parry on this always fails.
        hits: [
          { windup: 900, mult: 1.4, grab: true, label: 'grasp' },
        ],
      },
      {
        id: 'knight_thrice', name: 'Executioner', weight: 2, parryTol: 150, canCounter: true,
        hits: [
          { windup: 640, mult: 0.5, label: 'thrust' },
          { windup: 520, mult: 0.6, gap: 300, label: 'slash' },
          { windup: 620, mult: 1.0, gap: 320, label: 'finish' },
        ],
      },
    ],
    patternsStaggered: [
      {
        id: 'knight_stagger_slash', name: 'Winded Slash', weight: 1, parryTol: 200, canCounter: true,
        hits: [{ windup: 1000, mult: 0.8, label: 'slash' }],
      },
    ],
  },

  nameless: {
    id: 'nameless',
    name: 'The Nameless',
    element: 'arcane',
    hp: 720, atk: 33, def: 18,
    speed: 86,
    critChance: 0.16,
    staggerMax: 170,
    xp: 90,
    boss: true,
    look: {
      body: '#141826',
      hide: '#1d2334',
      accent: '#7fd8cf',
      eyes: '#bfefff',
      seed: 83,
      scale: 1.5,
    },
    weakPoints: [
      { local: [0, 1.7, 0.2], radius: 0.55, label: 'Eye' },
      { local: [-0.45, 1.0, 0.1], radius: 0.5, label: 'Shard' },
      { local: [0.45, 1.0, 0.1], radius: 0.5, label: 'Shard' },
    ],
    patterns: [
      // ---- Phase 1 (>60% HP): measured, heavy --------------------------------
      {
        id: 'nameless_wave', name: 'Void Wave', weight: 4, parryTol: 165, canCounter: true, heavy: true, phase: 1,
        hits: [{ windup: 860, mult: 1.3, label: 'wave' }],
      },
      {
        id: 'nameless_duress', name: 'Chain of Duress', weight: 3, parryTol: 158, canCounter: true, phase: 1,
        hits: [
          { windup: 680, mult: 0.55, label: 'bind 1' },
          { windup: 560, mult: 0.75, gap: 320, label: 'bind 2' },
        ],
      },
      {
        id: 'nameless_shatter', name: 'Shatterfield', weight: 3, parryTol: 162, canCounter: true, phase: 1,
        hits: [
          { windup: 700, mult: 0.5, label: 'shard 1' },
          { windup: 540, mult: 0.5, gap: 300, label: 'shard 2' },
          { windup: 520, mult: 0.8, gap: 280, label: 'shard 3' },
        ],
      },
      // ---- Phase 2 (30-60%): feints enter ------------------------------------
      {
        id: 'nameless_feint', name: 'False Shadow', weight: 3, parryTol: 150, canCounter: true, phase: 2,
        hits: [
          { windup: 760, mult: 0, feint: true, label: 'feint' },
          { windup: 520, mult: 1.2, gap: 220, label: 'true strike' },
        ],
      },
      {
        id: 'nameless_grab', name: 'Grip of the Void', weight: 2, parryTol: 165, canCounter: false, phase: 2,
        hits: [{ windup: 940, mult: 1.5, grab: true, label: 'grip' }],
      },
      {
        id: 'nameless_triple2', name: 'Triune', weight: 3, parryTol: 148, canCounter: true, phase: 2, heavy: true,
        hits: [
          { windup: 600, mult: 0.5, label: 'pulse 1' },
          { windup: 480, mult: 0.6, gap: 300, label: 'pulse 2' },
          { windup: 560, mult: 0.9, gap: 300, label: 'pulse 3' },
        ],
      },
      // ---- Phase 3 (<30%): desperate, faster windups --------------------------
      {
        id: 'nameless_frenzy', name: 'Unraveling Frenzy', weight: 4, parryTol: 140, canCounter: true, phase: 3, heavy: true,
        hits: [
          { windup: 460, mult: 0.7, label: 'slash 1' },
          { windup: 420, mult: 0.7, gap: 240, label: 'slash 2' },
          { windup: 420, mult: 0.7, gap: 240, label: 'slash 3' },
          { windup: 520, mult: 1.1, gap: 260, label: 'unravel' },
        ],
      },
      {
        id: 'nameless_feint_grab', name: 'Bait and Grip', weight: 3, parryTol: 150, canCounter: false, phase: 3,
        hits: [
          { windup: 640, mult: 0, feint: true, label: 'feint' },
          { windup: 700, mult: 1.4, grab: true, gap: 260, label: 'grip' },
        ],
      },
    ],
    patternsStaggered: [
      {
        id: 'nameless_stagger', name: 'Reeling', weight: 1, parryTol: 205, canCounter: true,
        hits: [{ windup: 1050, mult: 0.85, label: 'flail' }],
      },
    ],
  },
};

/** Wave list: what spawns, in what order. Positions assigned by game.js. */
export const WAVES = [
  [
    { data: ENEMY_DATA.nox_hound, pos: [-1.6, 0, -5.2] },
    { data: ENEMY_DATA.cindervane_knight, pos: [1.8, 0, -6.2] },
  ],
  [
    { data: ENEMY_DATA.nameless, pos: [0, 0, -6.4] },
  ],
];

export function makeEnemyData(dataId, pos) {
  const d = ENEMY_DATA[dataId];
  return {
    ...d,
    maxHp: d.hp,
    hp: d.hp,
    isParty: false,
    isEnemy: true,
    level: 1,
    xp: d.xp,
    ap: 0,
    maxAp: 0,
    shield: 0,
    stagger: 0,
    staggered: false,
    statuses: new Map(),
    dead: false,
    position: pos,
    queueIndex: 100,
  };
}
