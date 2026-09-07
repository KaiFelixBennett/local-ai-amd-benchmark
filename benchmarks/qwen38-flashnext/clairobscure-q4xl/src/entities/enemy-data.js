// ---------------------------------------------------------------------------
// Enemy + attack-pattern data.
//
// A pattern is the complete spec of one telegraphed enemy attack:
//   name        display name in the telegraph banner
//   hits        sequential reaction windows (multi-hit combos)
//   per hit:
//     wind      seconds from telegraph start to this hit landing (wall-clock,
//               game-time scaled). The hit lands EXACTLY at this time.
//     parry     half-width of the parry window (tight), centred on the hit
//     dodge     half-width of the dodge window (more forgiving, starts earlier)
//     kind      'strike' | 'grab' (grab: parryable=true is false) | 'sweep'
//     dmg       damage multiplier vs. enemy atk
//     stagger   stagger dealt to the character if it connects
//   feint       optional: a fake wind-up beat at `t` that punishes early input
//                 inputting during the feint = FAIL judgment for that hit
//   aoe         true -> hits entire party (each member reacts individually)
//   intent      icon label for the HUD telegraph chip
//   color       telegraph colour
// ---------------------------------------------------------------------------

export const PATTERNS = {
  // -- Slime: slime slam — 1 hit, very readable, tutorial-friendly ----------
  slimeSlam: {
    id: 'slimeSlam', name: 'Slug Slam', intent: 'STRIKE', color: '#8fbcb6',
    hits: [{ wind: 1.15, parry: 0.16, dodge: 0.30, kind: 'strike', dmg: 0.9, stagger: 9 }]
  },
  slimeSplatter: {
    id: 'slimeSplatter', name: 'Paint Splatter', intent: 'SWEEP', color: '#7fc7d4', aoe: true,
    hits: [{ wind: 1.3, parry: 0.2, dodge: 0.34, kind: 'sweep', dmg: 0.55, stagger: 6 }]
  },

  // -- Sentry: 1-2-3 gearwork combo — the signature sequential rhythm -------
  sentryCombo: {
    id: 'sentryCombo', name: 'Gearwork Flurry', intent: 'COMBO x3', color: '#f4d489',
    hits: [
      { wind: 1.0, parry: 0.14, dodge: 0.26, kind: 'strike', dmg: 0.5, stagger: 5 },
      { wind: 1.36, parry: 0.14, dodge: 0.26, kind: 'strike', dmg: 0.5, stagger: 5 },
      { wind: 1.9, parry: 0.17, dodge: 0.28, kind: 'strike', dmg: 0.85, stagger: 12 }
    ]
  },
  sentryTickTock: {
    id: 'sentryTickTock', name: 'Tick… Tock', intent: 'FEINT', color: '#a12d33',
    // Fake beat at 0.55 (visual only), real hit at 1.5. Early input is punished:
    // pressing during the feint window (0.4–0.75) fails the first hit judgment.
    feint: { t: 0.55, punishFrom: 0.38, punishTo: 0.8 },
    hits: [
      { wind: 1.5, parry: 0.13, dodge: 0.26, kind: 'strike', dmg: 1.3, stagger: 16 },
      { wind: 1.88, parry: 0.13, dodge: 0.26, kind: 'strike', dmg: 0.75, stagger: 9 }
    ]
  },
  sentryGrab: {
    id: 'sentryGrab', name: 'Vise d`Acier', intent: 'GRAB', color: '#a8552f', unparryable: true,
    hits: [{ wind: 1.25, parry: 0, dodge: 0.36, kind: 'grab', dmg: 1.15, stagger: 14,
      status: { id: 'stun', turns: 1, potency: 0, chance: 1 } }]
  },

  // -- Estampe (paint wraith): whip arcs, wide telegraph --------------------
  flailWhip: {
    id: 'flailWhip', name: 'Stroke Whip', intent: 'WHIP', color: '#7b6a9a',
    hits: [
      { wind: 1.4, parry: 0.22, dodge: 0.36, kind: 'strike', dmg: 0.8, stagger: 8 },
      { wind: 1.75, parry: 0.22, dodge: 0.36, kind: 'strike', dmg: 0.65, stagger: 7 }
    ]
  },
  flailCurse: {
    id: 'flailCurse', name: 'Fresco Hex', intent: 'HEX', color: '#6b7a4a',
    hits: [{ wind: 1.6, parry: 0.18, dodge: 0.32, kind: 'strike', dmg: 0.6, stagger: 6,
      status: { id: 'poison', turns: 3, potency: 7, chance: 1 } }]
  },

  // -- Garde Noire: fast needle thrusts + delayed doubletap ------------------
  noirThrust: {
    id: 'noirThrust', name: 'Needle Lunge', intent: 'STRIKE', color: '#c9c3b0',
    hits: [{ wind: 0.95, parry: 0.12, dodge: 0.24, kind: 'strike', dmg: 1.05, stagger: 11 }]
  },
  noirDouble: {
    id: 'noirDouble', name: 'Duelist`s Echo', intent: 'COMBO x2', color: '#d8a94a',
    hits: [
      { wind: 1.0, parry: 0.11, dodge: 0.22, kind: 'strike', dmg: 0.7, stagger: 7 },
      { wind: 1.62, parry: 0.11, dodge: 0.22, kind: 'strike', dmg: 0.9, stagger: 10 }
    ]
  },

  // -- Boss: La Soeur de Givre ------------------------------------------------
  sisterFrost: {
    id: 'sisterFrost', name: 'Givre Pliant', intent: 'HEX', color: '#7fc7d4',
    hits: [{ wind: 1.35, parry: 0.15, dodge: 0.3, kind: 'strike', dmg: 0.85, stagger: 10,
      status: { id: 'slow', turns: 1, potency: 0, chance: 1 } }]
  },
  sisterBell: {
    id: 'sisterBell', name: 'Angélus', intent: 'SWEEP', color: '#f4d489', aoe: true,
    hits: [
      { wind: 1.25, parry: 0.17, dodge: 0.34, kind: 'sweep', dmg: 0.5, stagger: 6 },
      { wind: 1.7, parry: 0.17, dodge: 0.34, kind: 'sweep', dmg: 0.65, stagger: 8 }
    ]
  },
  sisterRequiem: {
    id: 'sisterRequiem', name: 'Requiem de Givre', intent: 'GRAB', color: '#5a4a7a', unparryable: true,
    feint: { t: 0.7, punishFrom: 0.5, punishTo: 1.0 },
    hits: [
      { wind: 1.7, parry: 0, dodge: 0.32, kind: 'grab', dmg: 0.9, stagger: 12 },
      { wind: 2.05, parry: 0, dodge: 0.32, kind: 'grab', dmg: 0.9, stagger: 12 },
      { wind: 2.55, parry: 0, dodge: 0.34, kind: 'grab', dmg: 1.1, stagger: 16 }
    ]
  }
};

// ---------------------------------------------------------------------------
// Enemy definitions. Weak points are LOCAL offsets (x,y,z in facing frame).
// Resistances: multiplier table per element.
// ---------------------------------------------------------------------------

export const ENEMY_DEFS = [
  {
    kind: 'slime', name: 'Chromatule',
    stats: { hp: 92, atk: 11, def: 4, spd: 8, crit: 0.05 },
    stagger: 42, chargeOnDeath: 10,
    weak: { fire: 1.6, ice: 0.6 }, resist: { shadow: 0.75 },
    weakPoint: { x: 0, y: 0.85, z: 0.15, r: 0.36 }, weakLabel: 'Noyau',
    patterns: { base: ['slimeSlam', 'slimeSplatter'] },
    visual: { kind: 'slime', hue: 175, scale: 1.05, body: '#2f6b62', glow: '#7fe0a8', glowI: 2.2 }
  },
  {
    kind: 'sentry', name: 'Sentinelle a Engrenages',
    stats: { hp: 150, atk: 15, def: 9, spd: 11, crit: 0.08 },
    stagger: 64, chargeOnDeath: 16,
    weak: { fire: 1.35 }, resist: { physical: 0.7, ice: 0.8 },
    weakPoint: { x: 0, y: 1.45, z: 0.62, r: 0.24 }, weakLabel: 'Coeur d`Horloge',
    patterns: { base: ['sentryCombo', 'sentryTickTock', 'sentryGrab'] },
    visual: { kind: 'clock', hue: 205, sat: 10, light: 24, body: '#2a3b44', armor: '#1a262c', edge: '#d8a94a', glow: '#f4d489', glowI: 2.6 }
  },
  {
    kind: 'flail', name: 'Estampe Noire',
    stats: { hp: 118, atk: 14, def: 6, spd: 14, crit: 0.1 },
    stagger: 50, chargeOnDeath: 14,
    weak: { light: 1.5, physical: 1.15 }, resist: { fire: 0.7 },
    weakPoint: { x: 0, y: 2.1, z: 0.34, r: 0.26 }, weakLabel: 'Visage',
    patterns: { base: ['flailWhip', 'flailCurse'] },
    visual: { kind: 'paint', hue: 258, sat: 16, light: 26, body: '#3c3252', edge: '#a890d8', glow: '#b79cff', glowI: 2.8 }
  },
  {
    kind: 'noir', name: 'Garde Noire',
    stats: { hp: 132, atk: 17, def: 8, spd: 17, crit: 0.14 },
    stagger: 58, chargeOnDeath: 18,
    weak: { ice: 1.4 }, resist: { shadow: 0.8 },
    weakPoint: { x: 0, y: 2.34, z: 0.22, r: 0.2 }, weakLabel: 'Visiere',
    patterns: { base: ['noirThrust', 'noirDouble', 'sentryGrab'] },
    visual: { kind: 'noir', hue: 210, sat: 8, light: 16, body: '#1c2429', armor: '#141b1f', edge: '#c9c3b0', glow: '#c9c3b0', glowI: 2.2 }
  }
];

// Boss definition (wave 3). Phase 2 shifts the move set at 45% HP.
export const BOSS_DEF = {
  kind: 'sister', name: 'La Soeur de Givre', boss: true,
  stats: { hp: 520, atk: 21, def: 11, spd: 13, crit: 0.1 },
  stagger: 130, chargeOnDeath: 40,
  phase2At: 0.45,
  weak: { fire: 1.45 }, resist: { ice: 0.55, physical: 0.85 },
  weakPoint: { x: 0, y: 3.0, z: 0.32, r: 0.3 }, weakLabel: 'Aura Sacree',
  patterns: {
    base: ['sisterFrost', 'sisterBell', 'sentryCombo'],
    phase2: ['sisterRequiem', 'sisterBell', 'noirDouble', 'sisterFrost']
  },
  visual: { kind: 'sister', hue: 195, sat: 18, light: 30, body: '#27454f', armor: '#18292f', edge: '#bfe6ef', glow: '#9fdcff', glowI: 3.0, scale: 1.15 }
};

// 2/3/3-wave encounter (the "node map" compressed into consecutive waves).
export const WAVES = [
  { kind: 'slime', count: 2 },
  { kind: 'sentry', count: 1, plus: ['slime', 'flail'] },
  { kind: 'boss', count: 1 }
];
