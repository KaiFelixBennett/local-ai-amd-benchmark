// ---------------------------------------------------------------------------
// Skill definitions (pure data). Targeting/apply logic lives in
// battle/action-resolver.js + battle-system.js so this file stays inspectable.
//
// cost        AP cost (0 = can't be used... base attack is NOT a skill)
// target      'enemy' | 'allEnemies' | 'ally' | 'allAllies' | 'self'
// power       damage/heal multiplier vs. atk (heal skills use `heal`)
// hits        number of sequential strikes
// element     physical | fire | ice | light | shadow
// stagger     stagger-meter damage
// effects     list of status applications { id, turns, potency, chance }
// selfEffects effects applied to the caster
// aim         true = opens the free-aim reticle (single target)
// windup      caster cast animation duration (s)
// desc        shown in the skill row of the battle menu
// ---------------------------------------------------------------------------

export const SKILLS = {
  // --- Gustave (duelist) ---
  riposte: {
    id: 'riposte', name: 'Riposte', cost: 2, target: 'enemy', power: 1.75,
    element: 'physical', stagger: 14, windup: 0.7,
    effects: [], desc: 'A precise thrust. Heavy stagger.'
  },
  lanceLight: {
    id: 'lanceLight', name: 'Lance de Lumiere', cost: 4, target: 'enemy', power: 1.45,
    element: 'light', stagger: 10, aim: true, windup: 0.9, chargeOnWeak: 6,
    effects: [{ id: 'mark', turns: 2, potency: 0, chance: 0.8 }],
    desc: 'Aim for the weak point. Marks the target.'
  },
  // --- Lune (scholar) ---
  chromaBurst: {
    id: 'chromaBurst', name: 'Eclat Chroma', cost: 3, target: 'allEnemies', power: 0.95,
    element: 'fire', stagger: 8, windup: 1.0,
    effects: [{ id: 'burn', turns: 3, potency: 6, chance: 0.75 }],
    desc: 'Paint-fire detonates across all foes. May inflict Burn.'
  },
  pigmentShield: {
    id: 'pigmentShield', name: 'Pigment Protecteur', cost: 2, target: 'allAllies', windup: 0.8,
    selfEffects: [], allyEffects: [{ id: 'defUp', turns: 3, potency: 0.25 }],
    desc: 'All allies gain +25% defence for 3 turns.'
  },
  restoreHue: {
    id: 'restoreHue', name: 'Ton Restaure', cost: 3, target: 'ally', heal: 0.52, windup: 0.8,
    desc: 'Restore one ally (60% + 52% of your atk).'
  },
  vignette: {
    id: 'vignette', name: 'Vignette', cost: 3, target: 'enemy', power: 1.1,
    element: 'shadow', stagger: 10, windup: 0.9,
    effects: [{ id: 'atkDown', turns: 3, potency: 0.22, chance: 0.9 }],
    desc: 'Shadow wash. Weakens the foe`s attack.'
  },
  // --- Maelle (blademancer) ---
  flurry: {
    id: 'flurry', name: 'Lame Danse', cost: 3, target: 'enemy', power: 0.62, hits: 3,
    element: 'physical', stagger: 7, windup: 0.8,
    desc: 'Three rapid slashes (62% atk x3).'
  },
  crimsonStep: {
    id: 'crimsonStep', name: 'Pas Cramoisi', cost: 2, target: 'self', windup: 0.6,
    selfEffects: [{ id: 'atkUp', turns: 3, potency: 0.3 }],
    desc: '+30% attack for 3 turns.'
  },
  shatterChord: {
    id: 'shatterChord', name: 'Corde Brisee', cost: 4, target: 'enemy', power: 2.35,
    element: 'physical', stagger: 26, windup: 0.95, bonusVsBroken: 0.7,
    desc: 'One devastating blow. Bonus vs. Broken foes.'
  },
  // --- Sciel (weaver) ---
  duskMark: {
    id: 'duskMark', name: 'Signe du Crepuscule', cost: 3, target: 'enemy', power: 1.2,
    element: 'shadow', stagger: 10, aim: true, windup: 0.85, chargeOnWeak: 6,
    effects: [{ id: 'defDown', turns: 3, potency: 0.2, chance: 0.85 }],
    desc: 'Aimed shadow bolt. Sunder defence.'
  },
  reaperStance: {
    id: 'reaperStance', name: 'Moisson', cost: 4, target: 'allEnemies', power: 0.72,
    element: 'physical', stagger: 6, windup: 1.0,
    lifesteal: 0.4, desc: 'Reaps all foes, healing her for 40% of damage.'
  },
  weaveSlow: {
    id: 'weaveSlow', name: 'Fil Ralenti', cost: 2, target: 'enemy', power: 0.8,
    element: 'ice', stagger: 6, windup: 0.8,
    effects: [{ id: 'slow', turns: 2, potency: 0, chance: 1 }],
    desc: 'Freeze the weave: foe acts twice per round is cancelled (Slow).'
  },
  // --- Esquie-ish support skill shared via party ultimate handled in game.js ---
  // Neutral "cleanse" fallback used by tint item logic.
  purify: {
    id: 'purify', name: 'Purification', cost: 2, target: 'ally', heal: 0.25, windup: 0.6,
    cleanse: ['burn', 'poison'], desc: 'Cleanse burn/poison and restore a little HP.'
  }
};

// The party gradient attack: charged by parries / weak-point hits in `charge`.
export const GRADIENT = {
  id: 'paletteStrike',
  name: 'Attaque Palette',
  desc: 'Party-wide luminous salvo. Massive damage + full stagger reset.',
  chargeNeeded: 100,
  perHitDamage: 2.2,        // multiplier vs. each attacker`s atk
  hitsEach: 3,
  stagger: 999              // breaks everyone
};
