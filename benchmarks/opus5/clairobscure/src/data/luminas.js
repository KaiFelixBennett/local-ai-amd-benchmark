/**
 * Luminas — party-wide passive modifiers chosen on the pre-battle loadout
 * screen. Three may be equipped at once.
 *
 * `aggregate()` folds a chosen set into a single flat modifier object that the
 * battle systems read; every field has a neutral default so callers never need
 * to test for existence.
 */

export const LUMINA_SLOTS = 3;

export const LUMINAS = [
  {
    id: 'energising-parry', name: 'Energising Parry', glyph: '❖',
    desc: 'Every perfect parry grants 1 additional Action Point.',
    mods: { parryApBonus: 1 },
  },
  {
    id: 'painters-guard', name: "Painter's Guard", glyph: '⬡',
    desc: 'The whole expedition gains +14% defence.',
    mods: { defMul: 1.14 },
  },
  {
    id: 'cruel-aim', name: 'Cruel Aim', glyph: '◎',
    desc: 'Free-aim weak-point hits deal +40% damage.',
    mods: { weakPointMul: 1.4 },
  },
  {
    id: 'first-stroke', name: 'First Stroke', glyph: '✦',
    desc: 'Begin every encounter with 3 extra Action Points each.',
    mods: { startApBonus: 3 },
  },
  {
    id: 'ember-heart', name: 'Ember Heart', glyph: '🜂',
    desc: 'Your attacks have a 25% chance to inflict Burn.',
    mods: { burnChance: 0.25 },
  },
  {
    id: 'gilded-flow', name: 'Gilded Flow', glyph: '⟡',
    desc: 'Flow streak bonus damage is doubled.',
    mods: { flowMul: 2 },
  },
  {
    id: 'requiem-tempo', name: 'Requiem Tempo', glyph: '⏶',
    desc: 'The expedition acts 12% faster.',
    mods: { spdMul: 1.12 },
  },
  {
    id: 'second-wind', name: 'Second Wind', glyph: '❦',
    desc: 'Recover 7% of maximum health at the start of each of your turns.',
    mods: { turnRegen: 0.07 },
  },
  {
    id: 'chromatic-greed', name: 'Chromatic Greed', glyph: '◈',
    desc: 'Gradient charge accumulates 35% faster.',
    mods: { gradientMul: 1.35 },
  },
  {
    id: 'counterweight', name: 'Counterweight', glyph: '⤣',
    desc: 'Counterattacks deal +50% damage.',
    mods: { counterMul: 1.5 },
  },
];

const DEFAULTS = {
  parryApBonus: 0,
  defMul: 1,
  weakPointMul: 1,
  startApBonus: 0,
  burnChance: 0,
  flowMul: 1,
  spdMul: 1,
  turnRegen: 0,
  gradientMul: 1,
  counterMul: 1,
};

/** @param {string[]} ids equipped lumina ids */
export function aggregate(ids) {
  const out = { ...DEFAULTS, equipped: [] };
  for (const id of ids) {
    const l = LUMINAS.find((x) => x.id === id);
    if (!l) continue;
    out.equipped.push(l);
    for (const k in l.mods) {
      if (k.endsWith('Mul')) out[k] *= l.mods[k];
      else out[k] += l.mods[k];
    }
  }
  return out;
}
