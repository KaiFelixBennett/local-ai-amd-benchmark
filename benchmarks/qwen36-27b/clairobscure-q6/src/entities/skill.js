/**
 * Skill definitions (data) + apply-effect logic.
 */

import { Elements, StatusEffects } from '../battle/action-resolver.js';

export const SkillDefs = {
  // === VALERIUS (Tank) ===
  shield_bash: {
    id: 'shield_bash', name: 'Shield Bash', type: 'damage',
    damage: 25, apCost: 2, apGain: 1, hits: 1,
    element: Elements.PHYSICAL,
    statusEffect: StatusEffects.STUN, statusChance: 0.35, statusDuration: 1,
    target: 'single', description: 'Bash with shield. May stun.',
  },
  defiant_stance: {
    id: 'defiant_stance', name: 'Defiant Stance', type: 'buff',
    damage: 0, apCost: 3, apGain: 0,
    buffStat: 'def', buffValue: 15, buffDuration: 3,
    target: 'self', description: 'Raise defense for 3 turns.',
  },
  war_cry: {
    id: 'war_cry', name: 'War Cry', type: 'buff',
    damage: 0, apCost: 2, apGain: 0,
    buffStat: 'atk', buffValue: 10, buffDuration: 2, buffAllies: true,
    target: 'party', description: 'Boost party ATK for 2 turns.',
  },

  // === ELARA (Healer) ===
  healing_light: {
    id: 'healing_light', name: 'Healing Light', type: 'heal',
    damage: 35, apCost: 2, apGain: 0,
    element: Elements.HOLY,
    target: 'single', description: 'Restore HP to an ally.',
  },
  purify: {
    id: 'purify', name: 'Purify', type: 'heal',
    damage: 15, apCost: 3, apGain: 0,
    element: Elements.HOLY,
    cleanse: true,
    target: 'single', description: 'Heal and cleanse status effects.',
  },
  holy_smite: {
    id: 'holy_smite', name: 'Holy Smite', type: 'damage',
    damage: 30, apCost: 2, apGain: 1, hits: 1,
    element: Elements.HOLY,
    statusEffect: StatusEffects.BURN, statusChance: 0.4, statusDuration: 2, statusValue: 6,
    target: 'single', description: 'Holy damage. May burn.',
  },

  // === LUCIEN (DPS) ===
  thunder_strike: {
    id: 'thunder_strike', name: 'Thunder Strike', type: 'damage',
    damage: 40, apCost: 2, apGain: 1, hits: 1,
    element: Elements.LIGHTNING,
    critChance: 0.25, critMult: 2.0,
    statusEffect: StatusEffects.STUN, statusChance: 0.2, statusDuration: 1,
    target: 'single', description: 'Lightning strike. High crit.',
  },
  lightning_storm: {
    id: 'lightning_storm', name: 'Lightning Storm', type: 'damage',
    damage: 20, apCost: 4, apGain: 2, hits: 3,
    element: Elements.LIGHTNING,
    target: 'single', description: '3-hit lightning combo.',
  },
  mark_of_fate: {
    id: 'mark_of_fate', name: 'Mark of Fate', type: 'damage',
    damage: 15, apCost: 2, apGain: 1, hits: 1,
    element: Elements.DARK,
    statusEffect: StatusEffects.MARK, statusChance: 0.8, statusDuration: 3,
    target: 'single', description: 'Mark target for bonus damage.',
  },
};

export function getSkillById(id) {
  return SkillDefs[id] || null;
}
