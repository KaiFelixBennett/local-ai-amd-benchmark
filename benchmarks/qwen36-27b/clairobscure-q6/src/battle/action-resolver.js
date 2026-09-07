/**
 * Pure damage/heal/AP/crit/weakness/status math.
 * No side effects — takes data, returns results.
 */

import { clamp, RNG } from '../core/rng.js';

export const Elements = {
  PHYSICAL: 'physical',
  FIRE: 'fire',
  ICE: 'ice',
  LIGHTNING: 'lightning',
  HOLY: 'holy',
  DARK: 'dark',
};

/** Elemental weakness chart: key = weak element, value = strong against it. */
export const ElementalChart = {
  [Elements.FIRE]: Elements.ICE,
  [Elements.ICE]: Elements.LIGHTNING,
  [Elements.LIGHTNING]: Elements.FIRE,
  [Elements.HOLY]: Elements.DARK,
  [Elements.DARK]: Elements.HOLY,
};

export const StatusEffects = {
  BURN: 'burn',
  POISON: 'poison',
  STUN: 'stun',
  MARK: 'mark',
  WEAK: 'weak',
  VULN: 'vuln',
};

export function resolveAttack(attacker, defender, skill, rng) {
  const result = {
    damage: 0,
    heal: 0,
    isCrit: false,
    isWeakness: false,
    statusEffects: [],
    apGained: 0,
    apSpent: 0,
    staggerDamage: 0,
    hits: 1,
    messages: [],
  };

  if (skill.type === 'heal') {
    result.heal = resolveHeal(attacker, defender, skill, rng);
    result.messages.push(`${attacker.name} heals ${defender.name} for ${result.heal}`);
    return result;
  }

  result.apSpent = skill.apCost || 0;
  result.hits = skill.hits || 1;

  let baseDmg = skill.damage || attacker.atk;
  let element = skill.element || Elements.PHYSICAL;

  // Crit check
  const critChance = skill.critChance || attacker.critChance || 0.1;
  result.isCrit = rng.chance(critChance);
  let multiplier = result.isCrit ? (skill.critMult || 1.8) : 1;

  // Weakness check
  const defenderWeakness = defender.weakness;
  const defenderResist = defender.resist;
  if (defenderWeakness === element) {
    result.isWeakness = true;
    multiplier *= 1.5;
    result.messages.push(`${defender.name} is weak to ${element}!`);
  }
  if (defenderResist === element) {
    multiplier *= 0.5;
  }

  // Mark bonus
  if (defender.statusEffects && defender.statusEffects.some(s => s.type === StatusEffects.MARK)) {
    multiplier *= 1.3;
    result.messages.push('Marked target takes bonus damage!');
  }

  // Vulnerability debuff
  if (defender.statusEffects && defender.statusEffects.some(s => s.type === StatusEffects.VULN)) {
    multiplier *= 1.25;
  }

  // Attacker weakness debuff
  if (attacker.statusEffects && attacker.statusEffects.some(s => s.type === StatusEffects.WEAK)) {
    multiplier *= 0.75;
  }

  // Multi-hit
  let totalDamage = 0;
  for (let i = 0; i < result.hits; i++) {
    const hitDmg = Math.max(1, Math.round(
      (baseDmg * multiplier * rng.range(0.9, 1.1)) - (defender.def || 0) * 0.5
    ));
    totalDamage += hitDmg;
  }

  result.damage = totalDamage;

  // Stagger damage
  result.staggerDamage = Math.round(totalDamage * 0.4);

  // AP gain from attack
  result.apGained = skill.apGain || (result.isCrit ? 2 : 1);
  if (result.isWeakness) result.apGained += 1;

  // Status effect application
  if (skill.statusEffect && rng.chance(skill.statusChance || 0.5)) {
    result.statusEffects.push({
      type: skill.statusEffect,
      duration: skill.statusDuration || 2,
      value: skill.statusValue || 0,
    });
  }

  result.messages.push(`${attacker.name} deals ${result.damage} damage to ${defender.name}`);
  if (result.isCrit) result.messages.push('Critical hit!');

  return result;
}

function resolveHeal(attacker, defender, skill, rng) {
  const baseHeal = skill.damage || 30;
  const heal = Math.round(baseHeal * rng.range(0.9, 1.1) * (1 + (attacker.mat || 0) * 0.01));
  return Math.min(heal, defender.maxHp - defender.hp);
}

export function applyStatusEffects(entity, deltaTime, rng) {
  if (!entity.statusEffects) return [];
  const ticks = [];
  for (let i = entity.statusEffects.length - 1; i >= 0; i--) {
    const se = entity.statusEffects[i];
    se.remainingTime -= deltaTime;

    // Tick damage every second
    if (se.tick && se.lastTick === undefined) se.lastTick = 0;
    if (se.tick && (se.remainingTime - deltaTime < 0 || !se.lastTick)) {
      if (se.type === StatusEffects.BURN || se.type === StatusEffects.POISON) {
        const dmg = se.value || 5;
        entity.hp = Math.max(0, entity.hp - dmg);
        ticks.push({ type: se.type, value: dmg });
      }
    }

    if (se.remainingTime <= 0) {
      entity.statusEffects.splice(i, 1);
      ticks.push({ type: se.type, value: 0, removed: true });
    }
  }
  return ticks;
}

export function addStatusEffect(entity, effect) {
  if (!entity.statusEffects) entity.statusEffects = [];
  // Replace existing same-type effect
  const existing = entity.statusEffects.findIndex(s => s.type === effect.type);
  if (existing >= 0) {
    entity.statusEffects[existing] = { ...effect };
  } else {
    entity.statusEffects.push({ ...effect });
  }
}

export function hasStatusEffect(entity, type) {
  return entity.statusEffects && entity.statusEffects.some(s => s.type === type);
}
